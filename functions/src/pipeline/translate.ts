import {onCall, HttpsError} from "firebase-functions/v2/https";
import OpenAI from "openai";
import {defineSecret} from "firebase-functions/params";
import * as admin from "firebase-admin";
import type {
  TranslateRequest,
  TranslateResponse,
  TranslatedSegment,
  TranscribeSegment,
} from "../types/pipeline";

if (admin.apps.length === 0) admin.initializeApp();
const openaiApiKey = defineSecret("OPENAI_API_KEY");

// ── Constants ──────────────────────────────────────────────────────────────

const SUPPORTED_LANGUAGES = new Set(["ko", "en", "ja", "zh", "es"]);
const MAX_BATCH_SIZE = 20;

// ── Helpers ────────────────────────────────────────────────────────────────

const NUMBERING_RE = /^\s*\[\d+\]\s*/;

function stripNumbering(text: string): string {
  return text.replace(NUMBERING_RE, "");
}

// ── OpenAI helpers ─────────────────────────────────────────────────────────

function buildBatchPrompt(
  texts: string[],
  srcLang: string,
  tgtLang: string,
): string {
  const numbered = texts.map((t, i) => `[${i + 1}] ${t}`).join("\n");
  return (
    `Translate the following ${texts.length} numbered texts ` +
    `from ${srcLang} to ${tgtLang}.\n` +
    `CRITICAL RULES:\n` +
    `- Return EXACTLY ${texts.length} translations.\n` +
    `- Do NOT include [N] numbering in the translations.\n` +
    `- Do NOT merge, split, reorder, or skip any items.\n` +
    `- Each numbered input MUST produce exactly one output.\n` +
    `Return a JSON object: {"translations": ["...", "..."]}\n\n` +
    numbered
  );
}

function buildSinglePrompt(
  text: string,
  srcLang: string,
  tgtLang: string,
): string {
  return (
    `Translate the following text from ${srcLang} to ${tgtLang}.\n` +
    `Return a JSON object: {"translation": "..."}\n\n` +
    text
  );
}

function getOpenAIClient(): OpenAI {
  return new OpenAI({apiKey: openaiApiKey.value()});
}

async function callOpenAI(
  prompt: string,
  system?: string,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const client = getOpenAIClient();
  const sysMsg =
    system ??
    "You are a professional translator. Output valid JSON only. " +
      "Always return exactly the same number of translations as the input texts.";
  return client.chat.completions.create({
    model: "gpt-4o",
    response_format: {type: "json_object"},
    messages: [
      {role: "system", content: sysMsg},
      {role: "user", content: prompt},
    ],
  });
}

// ── Response parsers ───────────────────────────────────────────────────────

function parseBatchResponse(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const translations = parsed.translations;
    if (!Array.isArray(translations)) return null;
    return translations.map((t: unknown) => stripNumbering(String(t)));
  } catch {
    return null;
  }
}

function parseSingleResponse(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if ("translation" in parsed) {
      return stripNumbering(String(parsed.translation));
    }
    if (
      "translations" in parsed &&
      Array.isArray(parsed.translations) &&
      parsed.translations.length > 0
    ) {
      return stripNumbering(String(parsed.translations[0]));
    }
    // Last resort: take first string value
    for (const v of Object.values(parsed)) {
      if (typeof v === "string") {
        return stripNumbering(v);
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ── Core translation logic ─────────────────────────────────────────────────

async function translateSingle(
  text: string,
  srcLang: string,
  tgtLang: string,
): Promise<{text: string; tokens: number}> {
  const prompt = buildSinglePrompt(text, srcLang, tgtLang);
  try {
    const completion = await callOpenAI(
      prompt,
      "You are a professional translator. Output valid JSON only.",
    );
    const tokens = completion.usage?.total_tokens ?? 0;
    const result = parseSingleResponse(
      completion.choices[0]?.message?.content,
    );
    if (result) {
      return {text: result, tokens};
    }
    console.warn(
      "Single translation parse failed, returning original:",
      text.slice(0, 50),
    );
    return {text, tokens};
  } catch (e) {
    console.error("Single translation API failed:", e, "— returning original");
    return {text, tokens: 0};
  }
}

/**
 * Translate a batch of texts with bulletproof count guarantee.
 *
 * Strategy:
 *   1. Try full batch with numbered prompt.
 *   2. If count matches → done.
 *   3. If count mismatches → salvage matched items, translate gaps individually.
 *   4. If parse fails entirely → translate all individually (1:1 guaranteed).
 */
async function translateBatch(
  texts: string[],
  srcLang: string,
  tgtLang: string,
): Promise<{translations: string[]; tokens: number}> {
  const n = texts.length;

  // Single text: use dedicated single path
  if (n === 1) {
    const r = await translateSingle(texts[0], srcLang, tgtLang);
    return {translations: [r.text], tokens: r.tokens};
  }

  // Batch attempt
  const prompt = buildBatchPrompt(texts, srcLang, tgtLang);
  let totalTokens = 0;

  let completion: OpenAI.Chat.Completions.ChatCompletion;
  try {
    completion = await callOpenAI(prompt);
    totalTokens += completion.usage?.total_tokens ?? 0;
  } catch (e) {
    console.error(
      `Batch OpenAI call failed for ${n} texts — falling back to individual`,
      e,
    );
    return translateAllIndividually(texts, srcLang, tgtLang);
  }

  const raw = completion.choices[0]?.message?.content;
  const batchResult = parseBatchResponse(raw);

  // Case 1: Parse failed entirely → translate all individually
  if (batchResult === null) {
    console.warn(
      `Batch parse failed for ${n} texts — falling back to individual`,
    );
    const indiv = await translateAllIndividually(texts, srcLang, tgtLang);
    return {
      translations: indiv.translations,
      tokens: totalTokens + indiv.tokens,
    };
  }

  // Case 2: Perfect count match → done
  if (batchResult.length === n) {
    return {translations: batchResult, tokens: totalTokens};
  }

  // Case 3: Count mismatch → post-process to guarantee N results
  const got = batchResult.length;
  console.warn(
    `Count mismatch: expected ${n}, got ${got} — post-processing to fix`,
  );

  if (got > n) {
    // GPT returned MORE than expected → truncate
    console.info(`Truncating ${got} → ${n} translations`);
    return {translations: batchResult.slice(0, n), tokens: totalTokens};
  }

  // got < n: GPT returned FEWER than expected
  // Use what we got for the first `got` items, translate remaining individually
  const results: string[] = [...batchResult];
  const missingTexts = texts.slice(got);
  console.info(
    `Translating ${missingTexts.length} missing segments individually (had ${got}/${n})`,
  );
  for (const t of missingTexts) {
    const r = await translateSingle(t, srcLang, tgtLang);
    results.push(r.text);
    totalTokens += r.tokens;
  }

  return {translations: results, tokens: totalTokens};
}

async function translateAllIndividually(
  texts: string[],
  srcLang: string,
  tgtLang: string,
): Promise<{translations: string[]; tokens: number}> {
  console.info(`Translating ${texts.length} texts individually (fallback)`);
  const results: string[] = [];
  let totalTokens = 0;
  for (let i = 0; i < texts.length; i++) {
    const r = await translateSingle(texts[i], srcLang, tgtLang);
    results.push(r.text);
    totalTokens += r.tokens;
    if ((i + 1) % 5 === 0) {
      console.info(`  Individual progress: ${i + 1}/${texts.length}`);
    }
  }
  return {translations: results, tokens: totalTokens};
}

// ── Cloud Function ─────────────────────────────────────────────────────────

export const translate = onCall(
  {memory: "512MiB", timeoutSeconds: 300, secrets: [openaiApiKey]},
  async (request): Promise<TranslateResponse> => {
    const body = request.data as TranslateRequest;
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    const segments: TranscribeSegment[] = body.segments ?? [];
    const srcLang = body.source_language;
    const tgtLang = body.target_language;

    console.info(
      `Translate request: ${segments.length} segments, ${srcLang} → ${tgtLang}`,
    );

    // Validate segments not empty
    if (segments.length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "segments must not be empty",
      );
    }

    // Validate language codes
    if (!SUPPORTED_LANGUAGES.has(srcLang)) {
      throw new HttpsError(
        "invalid-argument",
        `Unsupported source_language: ${srcLang}. ` +
          `Supported: ${[...SUPPORTED_LANGUAGES].sort().join(", ")}`,
      );
    }
    if (!SUPPORTED_LANGUAGES.has(tgtLang)) {
      throw new HttpsError(
        "invalid-argument",
        `Unsupported target_language: ${tgtLang}. ` +
          `Supported: ${[...SUPPORTED_LANGUAGES].sort().join(", ")}`,
      );
    }

    // Process in batches to prevent token overflow
    const allTranslations: string[] = [];
    let totalTokens = 0;

    for (
      let batchStart = 0;
      batchStart < segments.length;
      batchStart += MAX_BATCH_SIZE
    ) {
      const batch = segments.slice(batchStart, batchStart + MAX_BATCH_SIZE);
      const texts = batch.map((seg) => seg.text);
      console.info(
        `Translating batch ${batchStart}-${batchStart + batch.length} of ${segments.length} segments`,
      );

      const {translations, tokens} = await translateBatch(
        texts,
        srcLang,
        tgtLang,
      );

      // FINAL SAFETY: assert count matches
      if (translations.length !== texts.length) {
        throw new HttpsError(
          "internal",
          `BUG: post-processing failed to guarantee count: ` +
            `expected ${texts.length}, got ${translations.length}`,
        );
      }

      allTranslations.push(...translations);
      totalTokens += tokens;
    }

    // Build translated segments preserving original timestamps
    const translatedSegments: TranslatedSegment[] = segments.map(
      (seg, i) => ({
        id: seg.id,
        start_time: seg.start_time,
        end_time: seg.end_time,
        original_text: seg.text,
        translated_text: allTranslations[i],
      }),
    );

    // Log usage
    await admin
      .firestore()
      .collection("usage_logs")
      .add({
        uid,
        service: "gpt-translate",
        units: totalTokens,
        unit_type: "tokens",
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });

    console.info(
      `Translation complete: ${translatedSegments.length} segments, ${totalTokens} tokens`,
    );

    return {
      segments: translatedSegments,
      source_language: srcLang,
      target_language: tgtLang,
    };
  },
);
