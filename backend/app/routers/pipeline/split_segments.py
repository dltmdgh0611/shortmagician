import asyncio
import json
import logging
import math
import re

from fastapi import APIRouter, Depends, HTTPException

from app.deps.auth import get_current_user
from app.schemas.pipeline import (
    SplitSegmentsRequest,
    SplitSegmentsResponse,
    TranslatedSegment,
)
from app.services.openai_client import client as openai_client
from app.services.usage_logger import log_usage

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_LINE_WIDTH = 20  # Must match frontend & Rust subtitle renderer (font size 80)


# ── Display-width helpers (match frontend/Rust logic) ────────────────────────


def _is_wide_char(cp: int) -> bool:
    return (
        (0x4E00 <= cp <= 0x9FFF)    # CJK Unified Ideographs
        or (0x3400 <= cp <= 0x4DBF) # CJK Extension A
        or (0xAC00 <= cp <= 0xD7AF) # Hangul Syllables
        or (0x3040 <= cp <= 0x309F) # Hiragana
        or (0x30A0 <= cp <= 0x30FF) # Katakana
        or (0xFF00 <= cp <= 0xFFEF) # Fullwidth Forms
    )


def _display_width(text: str) -> int:
    width = 0
    for ch in text:
        cp = ord(ch)
        if cp <= 0x20:
            continue
        width += 2 if _is_wide_char(cp) else 1
    return width


def _is_cjk_dominant(text: str) -> bool:
    """Check if text is predominantly CJK (no word-separating spaces).

    Returns True when >30% of non-space characters are wide CJK characters.
    Japanese and Chinese text (which lack word-separating spaces) will
    return True, while Korean (which uses spaces) typically won't unless
    it contains many Hanja.
    """
    if not text:
        return False
    cjk_count = sum(1 for ch in text if _is_wide_char(ord(ch)))
    total = sum(1 for ch in text if not ch.isspace())
    return total > 0 and cjk_count / total > 0.3


# ── GPT splitting ────────────────────────────────────────────────────────────


def _build_split_prompt(text: str, n: int, language: str) -> str:
    cjk = _is_cjk_dominant(text)
    join_instruction = (
        "Concatenating all segments (WITHOUT spaces between them) must reproduce the original text."
        if cjk else
        "Concatenating all segments (with a single space between them) must reproduce the original text."
    )

    return (
        f"You are inserting {n - 1} line break(s) into subtitle text, creating {n} segments.\n"
        f"Think of each segment as one subtitle card shown on screen for ~2 seconds.\n"
        f"Break at natural READING PAUSE POINTS — where a viewer would naturally pause while reading.\n"
        f"Language: {language}\n\n"
        f"ABSOLUTE RULES:\n"
        f"1. PRESERVE every single character exactly. {join_instruction}\n"
        f"2. Return EXACTLY {n} segments.\n"
        f"3. Break AFTER completed grammatical units:\n"
        f"   ✓ After a complete sentence (. ! ? 。)\n"
        f"   ✓ After a comma or conjunction (, and/but/so/because/when/that)\n"
        f"   ✓ After a complete verb phrase (\"We've gathered four\" ✓)\n"
        f"   ✓ After a prepositional phrase (\"from Japan\" ✓)\n"
        f"   ✓ After an adverbial clause (\"before returning to Korea\" ✓)\n"
        f"   ✓ Korean: After verbal endings (-습니다, -요, -고, -는데, -면서, -지만)\n"
        f"   ✓ Japanese: After particles (は、が、を、に、で、と、も、の、へ、から、まで)\n"
        f"   ✓ Japanese: After clause endings (-て、-で、-ば、-たら、-ので、-けど、-から)\n"
        f"   ✓ Japanese: After sentence endings (-ます、-です、-た、-だ、-ない、-ません)\n"
        f"   ✓ Chinese: After clause markers (的、了、在、但、而、或)\n"
        f"4. NEVER break between:\n"
        f"   ✗ article + noun (\"the / best\" ✗ → \"the best\" together)\n"
        f"   ✗ adjective + noun (\"convenience / store\" ✗ → \"convenience store\" together)\n"
        f"   ✗ verb + direct object (\"try / it\" ✗ → \"try it\" together)\n"
        f"   ✗ preposition + object (\"of / the\" ✗ → \"of the\" together)\n"
        f"   ✗ Korean: particle + word (조사 분리 금지)\n"
        f"   ✗ Japanese: NEVER split inside kanji compounds or between kanji+okurigana (送り仮名)\n"
        f"   ✗ Chinese: NEVER split inside compound words (成语/词组)\n"
        f"5. Segments should be roughly balanced in length.\n\n"
        f"EXAMPLES:\n"
        f"  ✓ GOOD: [\"We've gathered the best combinations\", \"from Japan that travelers\", \"always regret not trying.\"]\n"
        f"  ✗ BAD:  [\"We've gathered the\", \"best combinations from\", \"Japan that travelers regret not trying.\"]\n"
        f"  (BAD splits \"the/best\" and \"from/Japan\" — breaks inside noun & prepositional phrases)\n\n"
        f"  ✓ GOOD: [\"The ramen is tasty,\", \"but the tender beef jangjorim\", \"is truly amazing.\"]\n"
        f"  ✗ BAD:  [\"The ramen is\", \"tasty, but the tender\", \"beef jangjorim is truly amazing.\"]\n"
        f"  (BAD splits \"is/tasty\" and \"tender/beef jangjorim\" — breaks verb phrase & adjective+noun)\n\n"
        f'Text: \"{text}\"\n\n'
        f'Return ONLY valid JSON: {{\"parts\": [\"...\", \"...\"]}}\n'
    )


def _call_openai_split(prompt: str):
    """Synchronous OpenAI call — runs in a thread via asyncio.to_thread.

    Timeout is handled by the OpenAI client (60s total, 10s connect).
    """
    return openai_client.chat.completions.create(
        model="gpt-4o-mini",
        temperature=0,  # 최대 결정론: 항상 동일한 분할 결과
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a subtitle line-break specialist. You decide WHERE to insert "
                    "line breaks in subtitle text. Each break creates a new subtitle card "
                    "shown on screen. Break at natural reading pause points — after "
                    "completed phrases, clauses, or sentences. Think like a professional "
                    "subtitle translator: each segment must be a coherent visual unit. "
                    "CRITICAL: Never lose any characters. For languages with word spaces "
                    "(English, Korean, etc.) all segments concatenated with spaces must "
                    "exactly reproduce the original. For languages WITHOUT word spaces "
                    "(Japanese, Chinese, etc.) all segments concatenated WITHOUT spaces "
                    "must exactly reproduce the original. Output valid JSON only."
                ),
            },
            {"role": "user", "content": prompt},
        ],
    )


def _parse_split_response(raw: str | None, expected: int) -> list[str] | None:
    """Parse GPT split response. Returns list of parts or None on failure."""
    if raw is None:
        return None
    try:
        parsed = json.loads(raw)
        parts = parsed.get("parts")
        if not isinstance(parts, list) or len(parts) == 0:
            return None
        parts = [str(p).strip() for p in parts if str(p).strip()]
        return parts if parts else None
    except (json.JSONDecodeError, KeyError, TypeError):
        return None


# ── Fallback: grammar-aware algorithmic split ─────────────────────────────────

# Boundary patterns for natural splitting (space-separated languages)
_SENTENCE_BOUNDARY = re.compile(r'(?<=[.!?\u3002\uff01\uff1f\u2026])\s+')
_CLAUSE_BOUNDARY = re.compile(
    r'(?<=[,;:\uff0c\uff1b\uff1a\u3001])\s+'
    r'|\s+(?=(?:and|but|so|or|yet|because|although|however|while|when|if|since|after|before|unless|until|though|whereas)\s)',
    re.IGNORECASE,
)

# Boundary patterns for CJK text (no word spaces — split at punctuation)
_CJK_SENTENCE_BOUNDARY = re.compile(r'(?<=[。！？\uff01\uff1f])')
_CJK_CLAUSE_BOUNDARY = re.compile(r'(?<=[、，；\u3001\uff0c\uff1b])')


def _merge_to_n(parts: list[str], n: int, sep: str = " ") -> list[str]:
    """Merge a list of parts down to exactly n groups by merging shortest adjacent pairs."""
    result = list(parts)
    while len(result) > n:
        best_i = 0
        best_len = float('inf')
        for i in range(len(result) - 1):
            combined = len(result[i]) + len(result[i + 1])
            if combined < best_len:
                best_len = combined
                best_i = i
        result[best_i] = result[best_i] + sep + result[best_i + 1]
        result.pop(best_i + 1)
    return result


def _split_cjk_fallback(text: str, n: int) -> list[str]:
    """Split CJK text (no word spaces) into n parts at punctuation boundaries.

    Tries boundaries in order: sentence punctuation → clause punctuation → even char split.
    Used for Japanese, Chinese, and other languages without word-separating spaces.
    """
    text = text.strip()
    if not text or n <= 1:
        return [text] if text else []

    # 1. Try sentence boundaries (。！？)
    parts = [s for s in _CJK_SENTENCE_BOUNDARY.split(text) if s.strip()]
    if len(parts) >= n:
        return _merge_to_n(parts, n, sep="")

    # 2. Try clause boundaries (、，；)
    parts = [s for s in _CJK_CLAUSE_BOUNDARY.split(text) if s.strip()]
    if len(parts) >= n:
        return _merge_to_n(parts, n, sep="")

    # 3. Even character distribution (last resort)
    chars = list(text)
    total = len(chars)
    if total <= n:
        return [text]

    result: list[str] = []
    start = 0
    for i in range(n):
        remaining_groups = n - i
        size = math.ceil((total - start) / remaining_groups)
        end = min(start + size, total)
        result.append(''.join(chars[start:end]))
        start = end

    return [p for p in result if p]


def _split_text_fallback(text: str, n: int) -> list[str]:
    """Grammar-aware text split as fallback when GPT fails.

    Tries boundaries in order: sentences → clauses/conjunctions → even word split.
    For CJK-dominant text (Japanese, Chinese), uses character-based splitting.
    Guarantees all content is preserved.
    """
    # CJK-dominant text: use character-based splitting (no word spaces)
    if _is_cjk_dominant(text):
        return _split_cjk_fallback(text, n)

    words = text.split()
    if len(words) <= n:
        return [text] if not words else words

    # 1. Try sentence boundaries (. ! ? etc.)
    parts = [s.strip() for s in _SENTENCE_BOUNDARY.split(text) if s.strip()]
    if len(parts) >= n:
        return _merge_to_n(parts, n)

    # 2. Try clause / conjunction boundaries (, ; : and but so ...)
    parts = [s.strip() for s in _CLAUSE_BOUNDARY.split(text) if s.strip()]
    if len(parts) >= n:
        return _merge_to_n(parts, n)

    # 3. Even word distribution (last resort)
    total = len(words)
    result: list[str] = []
    start = 0
    for i in range(n):
        remaining = n - i
        size = math.ceil((total - start) / remaining)
        end = min(start + size, total)
        result.append(" ".join(words[start:end]))
        start = end

    return [p for p in result if p]


# ── Post-validation helper ────────────────────────────────────────────────


def _ensure_max_width(text: str, max_width: int, out: list[str], depth: int = 0) -> None:
    """Recursively sub-split text until every part fits within max_width.

    Appends guaranteed-fitting parts to `out`. Stops recursing when:
    - part fits within max_width, OR
    - part is unsplittable (single word / single char for CJK), OR
    - recursion depth exceeds 5 (safety valve).
    """
    pw = _display_width(text)
    if pw <= max_width:
        out.append(text)
        return

    cjk = _is_cjk_dominant(text)

    if depth >= 5:
        logger.warning("  max_width sub-split depth exceeded for: %s...", text[:40])
        out.append(text)
        return

    # Check if further splitting is possible
    if cjk:
        if len(text.strip()) <= 1:
            out.append(text)
            return
    else:
        if len(text.split()) <= 1:
            out.append(text)
            return

    sub_n = max(2, math.ceil(pw / max_width))
    logger.warning(
        "  Part too wide (%d > %d), sub-splitting into %d (depth=%d)",
        pw, max_width, sub_n, depth,
    )
    sub_parts = _split_text_fallback(text, sub_n)
    for sp in sub_parts:
        _ensure_max_width(sp, max_width, out, depth + 1)


def _normalize_text(text: str) -> str:
    """Normalize text for comparison: strip and collapse whitespace."""
    return " ".join(text.split())


# ── Core split logic ────────────────────────────────────────────────────────


async def _split_text_with_gpt(
    text: str, target_chunks: int, language: str,
) -> tuple[list[str], int]:
    """Split text into target_chunks parts using GPT.

    Falls back to algorithmic split on failure.
    Validates that GPT output preserves ALL original content.
    """
    cjk = _is_cjk_dominant(text)

    # Skip GPT for very short texts
    if cjk:
        # CJK: no word spaces — use character count instead of word count
        char_count = len(text.replace(" ", ""))
        if char_count <= target_chunks:
            return _split_text_fallback(text, target_chunks), 0
    else:
        word_count = len(text.split())
        if word_count <= target_chunks:
            return _split_text_fallback(text, target_chunks), 0

    prompt = _build_split_prompt(text, target_chunks, language)

    try:
        completion = await asyncio.to_thread(_call_openai_split, prompt)
        tokens = completion.usage.total_tokens if completion.usage else 0
        parts = _parse_split_response(
            completion.choices[0].message.content, target_chunks,
        )

        if parts:
            # Count adjustment
            merge_sep = "" if cjk else " "
            if len(parts) > target_chunks:
                # Too many: merge last parts
                merged = parts[:target_chunks - 1]
                merged.append(merge_sep.join(parts[target_chunks - 1:]))
                logger.warning(
                    "GPT returned %d parts instead of %d — merged tail",
                    len(parts), target_chunks,
                )
                parts = merged
            elif len(parts) < target_chunks:
                # Too few: use what we got (fewer but natural)
                logger.warning(
                    "GPT returned %d parts instead of %d — using as-is",
                    len(parts), target_chunks,
                )

            # ★ Content completeness validation — NEVER allow dropped content
            if cjk:
                # CJK: strip all whitespace before comparing (no word spaces)
                original_norm = re.sub(r'\s+', '', text)
                joined_norm = re.sub(r'\s+', '', ''.join(parts))
            else:
                original_norm = _normalize_text(text)
                joined_norm = _normalize_text(" ".join(parts))

            if original_norm == joined_norm:
                return parts, tokens
            else:
                logger.warning(
                    "GPT split dropped/altered content — falling back to algorithmic split\n"
                    "  Original (%d chars): %s\n"
                    "  Joined   (%d chars): %s",
                    len(original_norm), original_norm[:200],
                    len(joined_norm), joined_norm[:200],
                )
                return _split_text_fallback(text, target_chunks), tokens

        # Parse failed entirely
        logger.warning("GPT split parse failed — using fallback")
        return _split_text_fallback(text, target_chunks), tokens

    except Exception as e:
        logger.error("GPT split failed: %s — using fallback", e)
        return _split_text_fallback(text, target_chunks), 0


# ── Router ───────────────────────────────────────────────────────────────────


@router.post("/split-segments", response_model=SplitSegmentsResponse)
async def split_segments(
    body: SplitSegmentsRequest,
    current_user: dict = Depends(get_current_user),
):
    """Split translated segments into subtitle-sized chunks using GPT."""
    max_width = body.max_lines * MAX_LINE_WIDTH
    max_dur = body.max_duration

    logger.info(
        "Split request: %d segments (max_duration=%.1fs, max_lines=%d)",
        len(body.segments), max_dur, body.max_lines,
    )

    if not body.segments:
        return SplitSegmentsResponse(segments=[])

    if openai_client is None:
        raise HTTPException(status_code=503, detail="OpenAI API key not configured")

    result_segments: list[TranslatedSegment] = []
    total_tokens = 0

    for seg in body.segments:
        text = seg.translated_text
        duration = seg.end_time - seg.start_time
        width = _display_width(text)

        # Pass through if both constraints satisfied
        if width <= max_width and duration <= max_dur:
            result_segments.append(seg)
            continue

        # Calculate target chunks
        chunks_by_width = math.ceil(width / max_width) if width > max_width else 1
        chunks_by_duration = (
            math.ceil(duration / max_dur) if duration > max_dur else 1
        )
        target_chunks = max(chunks_by_width, chunks_by_duration)

        logger.info(
            "  Splitting seg id=%s: %.1fs, width=%d → %d chunks",
            seg.id, duration, width, target_chunks,
        )

        # Split text via GPT
        parts, tokens = await _split_text_with_gpt(
            text, target_chunks, body.target_language,
        )
        total_tokens += tokens

        # Post-validate: guarantee every part fits within max_width
        validated_parts: list[str] = []
        for part in parts:
            _ensure_max_width(part, max_width, validated_parts)
        parts = validated_parts

        # Distribute timing proportionally by display width
        part_widths = [_display_width(p) for p in parts]
        total_width = sum(part_widths)
        current_time = seg.start_time

        for i, part in enumerate(parts):
            p_width = part_widths[i]
            p_duration = (
                (p_width / total_width * duration)
                if total_width > 0
                else (duration / len(parts))
            )
            is_last = i == len(parts) - 1
            end_time = seg.end_time if is_last else current_time + p_duration

            result_segments.append(
                TranslatedSegment(
                    id=seg.id,
                    start_time=round(current_time, 3),
                    end_time=round(end_time, 3),
                    original_text=seg.original_text,
                    translated_text=part,
                )
            )
            current_time = end_time

    # Log usage
    if total_tokens > 0:
        await log_usage(
            current_user["uid"], "gpt-split-segments", total_tokens, "tokens",
        )

    logger.info(
        "Split complete: %d → %d segments, %d tokens",
        len(body.segments), len(result_segments), total_tokens,
    )
    return SplitSegmentsResponse(segments=result_segments)
