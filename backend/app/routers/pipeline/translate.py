import asyncio
import json
import logging
import re

from fastapi import APIRouter, Depends, HTTPException

from app.deps.auth import get_current_user
from app.schemas.pipeline import (
    TranslateRequest,
    TranslateResponse,
    TranslatedSegment,
)
from app.services.openai_client import client as openai_client
from app.services.usage_logger import log_usage

logger = logging.getLogger(__name__)

router = APIRouter()

SUPPORTED_LANGUAGES = {"ko", "en", "ja", "zh", "es"}

# Max segments per GPT call to prevent token overflow
MAX_BATCH_SIZE = 20


# ── Helpers ──────────────────────────────────────────────────────────────────

_NUMBERING_RE = re.compile(r'^\s*\[\d+\]\s*')


def _strip_numbering(text: str) -> str:
    """Remove leading [N] numbering that GPT sometimes includes in translations."""
    return _NUMBERING_RE.sub('', text)


# ── OpenAI helpers ───────────────────────────────────────────────────────────

def _build_batch_prompt(texts: list[str], source_lang: str, target_lang: str) -> str:
    """Build a numbered prompt so GPT returns exactly len(texts) translations."""
    numbered = "\n".join(f"[{i+1}] {t}" for i, t in enumerate(texts))
    return (
        f"Translate the following {len(texts)} numbered texts "
        f"from {source_lang} to {target_lang}.\n"
        f"CRITICAL RULES:\n"
        f"- Return EXACTLY {len(texts)} translations.\n"
        f"- Do NOT include [N] numbering in the translations.\n"
        f"- Do NOT merge, split, reorder, or skip any items.\n"
        f"- Each numbered input MUST produce exactly one output.\n"
        f'Return a JSON object: {{"translations": ["...", "..."]}}\n\n'
        f"{numbered}"
    )


def _build_single_prompt(text: str, source_lang: str, target_lang: str) -> str:
    """Build a prompt for translating a single text."""
    return (
        f"Translate the following text from {source_lang} to {target_lang}.\n"
        f'Return a JSON object: {{"translation": "..."}}\n\n'
        f"{text}"
    )


def _call_openai(prompt: str, system: str | None = None):
    """Synchronous OpenAI call — runs in a thread via asyncio.to_thread.

    Timeout is handled by the OpenAI client (60s total, 10s connect).
    """
    sys_msg = system or (
        "You are a professional translator. Output valid JSON only. "
        "Always return exactly the same number of translations as the input texts."
    )
    return openai_client.chat.completions.create(
        model="gpt-4o",
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": sys_msg},
            {"role": "user", "content": prompt},
        ],
    )


def _parse_batch_response(raw: str | None, expected_count: int) -> list[str] | None:
    """Parse GPT batch response. Returns list on success, None on failure.

    Unlike before, does NOT raise on count mismatch — returns partial result
    so callers can salvage what they can.
    """
    if raw is None:
        return None
    try:
        parsed = json.loads(raw)
        translations = parsed.get("translations")
        if not isinstance(translations, list):
            return None
        # Ensure every element is a string, strip [N] prefix if GPT included it
        return [_strip_numbering(str(t)) for t in translations]
    except (json.JSONDecodeError, KeyError, TypeError):
        return None


def _parse_single_response(raw: str | None) -> str | None:
    """Parse GPT single-text response. Returns translated string or None."""
    if raw is None:
        return None
    try:
        parsed = json.loads(raw)
        # Accept either {"translation": "..."} or {"translations": ["..."]}
        if "translation" in parsed:
            return _strip_numbering(str(parsed["translation"]))
        if "translations" in parsed and isinstance(parsed["translations"], list):
            return _strip_numbering(str(parsed["translations"][0]))
        # Last resort: take first string value
        for v in parsed.values():
            if isinstance(v, str):
                return _strip_numbering(v)
        return None
    except (json.JSONDecodeError, KeyError, TypeError, IndexError):
        return None


# ── Core translation logic ───────────────────────────────────────────────────


async def _translate_single(
    text: str, source_lang: str, target_lang: str,
) -> tuple[str, int]:
    """Translate ONE text. Guaranteed to return exactly 1 result.

    Falls back to original text on total failure (never raises for mismatch).
    """
    prompt = _build_single_prompt(text, source_lang, target_lang)
    try:
        completion = await asyncio.to_thread(
            _call_openai,
            prompt,
            "You are a professional translator. Output valid JSON only.",
        )
        tokens = completion.usage.total_tokens if completion.usage else 0
        result = _parse_single_response(completion.choices[0].message.content)
        if result:
            return result, tokens
        logger.warning("Single translation parse failed, returning original: %.50s", text)
        return text, tokens
    except Exception as e:
        logger.error("Single translation API failed: %s — returning original", e)
        return text, 0


async def _translate_batch(
    texts: list[str], source_lang: str, target_lang: str,
) -> tuple[list[str], int]:
    """Translate a batch of texts with bulletproof count guarantee.

    Strategy:
      1. Try full batch with numbered prompt.
      2. If count matches → done.
      3. If count mismatches → salvage matched items, translate gaps individually.
      4. If parse fails entirely → translate all individually (1:1 guaranteed).
    """
    n = len(texts)

    # ── Single text: use dedicated single path ──────────────────────────────
    if n == 1:
        t, tok = await _translate_single(texts[0], source_lang, target_lang)
        return [t], tok

    # ── Batch attempt ───────────────────────────────────────────────────────
    prompt = _build_batch_prompt(texts, source_lang, target_lang)
    total_tokens = 0

    try:
        completion = await asyncio.to_thread(_call_openai, prompt)
        total_tokens += completion.usage.total_tokens if completion.usage else 0
    except Exception as e:
        logger.exception("Batch OpenAI call failed for %d texts — falling back to individual", n)
        return await _translate_all_individually(texts, source_lang, target_lang)

    raw = completion.choices[0].message.content
    batch_result = _parse_batch_response(raw, n)

    # ── Case 1: Parse failed entirely → translate all individually ──────────
    if batch_result is None:
        logger.warning("Batch parse failed for %d texts — falling back to individual", n)
        indiv_results, indiv_tokens = await _translate_all_individually(
            texts, source_lang, target_lang,
        )
        return indiv_results, total_tokens + indiv_tokens

    # ── Case 2: Perfect count match → done ──────────────────────────────────
    if len(batch_result) == n:
        return batch_result, total_tokens

    # ── Case 3: Count mismatch → post-process to guarantee N results ────────
    got = len(batch_result)
    logger.warning(
        "Count mismatch: expected %d, got %d — post-processing to fix", n, got,
    )

    if got > n:
        # GPT returned MORE than expected → truncate
        logger.info("Truncating %d → %d translations", got, n)
        return batch_result[:n], total_tokens

    # got < n: GPT returned FEWER than expected
    # Strategy: use what we got for the first `got` items,
    # translate remaining individually
    results: list[str] = list(batch_result)  # first `got` items
    missing_texts = texts[got:]
    logger.info(
        "Translating %d missing segments individually (had %d/%d)",
        len(missing_texts), got, n,
    )
    for text in missing_texts:
        t, tok = await _translate_single(text, source_lang, target_lang)
        results.append(t)
        total_tokens += tok

    return results, total_tokens


async def _translate_all_individually(
    texts: list[str], source_lang: str, target_lang: str,
) -> tuple[list[str], int]:
    """Translate every text one-by-one. Slow but guaranteed 1:1 mapping."""
    logger.info("Translating %d texts individually (fallback)", len(texts))
    results: list[str] = []
    total_tokens = 0
    for i, text in enumerate(texts):
        t, tok = await _translate_single(text, source_lang, target_lang)
        results.append(t)
        total_tokens += tok
        if (i + 1) % 5 == 0:
            logger.info("  Individual progress: %d/%d", i + 1, len(texts))
    return results, total_tokens


# ── Router ───────────────────────────────────────────────────────────────────


@router.post("/translate", response_model=TranslateResponse)
async def translate_segments(
    body: TranslateRequest,
    current_user: dict = Depends(get_current_user),
):
    """Translate segments using GPT-4o with batching and bulletproof count guarantee."""
    logger.info(
        "Translate request: %d segments, %s → %s",
        len(body.segments), body.source_language, body.target_language,
    )
    for i, seg in enumerate(body.segments):
        logger.debug(
            "  seg[%d] id=%s [%.1f-%.1fs] %s",
            i, seg.id, seg.start_time, seg.end_time, seg.text[:60],
        )

    # Validate segments not empty
    if not body.segments:
        raise HTTPException(status_code=422, detail="segments must not be empty")

    # Validate language codes
    if body.source_language not in SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported source_language: {body.source_language}. "
            f"Supported: {sorted(SUPPORTED_LANGUAGES)}",
        )
    if body.target_language not in SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported target_language: {body.target_language}. "
            f"Supported: {sorted(SUPPORTED_LANGUAGES)}",
        )

    if openai_client is None:
        raise HTTPException(status_code=503, detail="OpenAI API key not configured")

    # Process in batches to prevent token overflow
    all_translations: list[str] = []
    total_tokens = 0

    for batch_start in range(0, len(body.segments), MAX_BATCH_SIZE):
        batch = body.segments[batch_start:batch_start + MAX_BATCH_SIZE]
        texts = [seg.text for seg in batch]
        logger.info(
            "Translating batch %d-%d of %d segments",
            batch_start, batch_start + len(batch), len(body.segments),
        )
        translations, tokens = await _translate_batch(
            texts, body.source_language, body.target_language,
        )

        # FINAL SAFETY: assert count matches (should never fail after post-processing)
        assert len(translations) == len(texts), (
            f"BUG: post-processing failed to guarantee count: "
            f"expected {len(texts)}, got {len(translations)}"
        )

        all_translations.extend(translations)
        total_tokens += tokens

    # Build translated segments preserving original timestamps
    translated_segments = [
        TranslatedSegment(
            id=seg.id,
            start_time=seg.start_time,
            end_time=seg.end_time,
            original_text=seg.text,
            translated_text=all_translations[i],
        )
        for i, seg in enumerate(body.segments)
    ]

    # Log usage
    await log_usage(current_user["uid"], "gpt-translate", total_tokens, "tokens")

    logger.info(
        "Translation complete: %d segments, %d tokens",
        len(translated_segments), total_tokens,
    )
    return TranslateResponse(
        segments=translated_segments,
        source_language=body.source_language,
        target_language=body.target_language,
    )
