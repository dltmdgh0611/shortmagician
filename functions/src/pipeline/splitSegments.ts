import {onCall, HttpsError} from "firebase-functions/v2/https";
import OpenAI from "openai";
import {defineSecret} from "firebase-functions/params";
import * as admin from "firebase-admin";
import type {
  SplitSegmentsRequest,
  SplitSegmentsResponse,
  TranslatedSegment,
} from "../types/pipeline";

if (admin.apps.length === 0) admin.initializeApp();
const openaiApiKey = defineSecret("OPENAI_API_KEY");

const MAX_LINE_WIDTH = 20; // Must match frontend & Rust subtitle renderer

// ── Display-width helpers (match frontend/Rust logic) ──────────────────────

function isWideChar(cp: number): boolean {
  return (
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK Unified Ideographs
    (cp >= 0x3400 && cp <= 0x4dbf) || // CJK Extension A
    (cp >= 0xac00 && cp <= 0xd7af) || // Hangul Syllables
    (cp >= 0x3040 && cp <= 0x309f) || // Hiragana
    (cp >= 0x30a0 && cp <= 0x30ff) || // Katakana
    (cp >= 0xff00 && cp <= 0xffef) // Fullwidth Forms
  );
}

function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp <= 0x20) continue;
    width += isWideChar(cp) ? 2 : 1;
  }
  return width;
}

function isCjkDominant(text: string): boolean {
  if (!text) return false;
  let cjkCount = 0;
  let total = 0;
  for (const ch of text) {
    if (/\s/.test(ch)) continue;
    total++;
    if (isWideChar(ch.codePointAt(0)!)) cjkCount++;
  }
  return total > 0 && cjkCount / total > 0.3;
}

// ── GPT splitting ──────────────────────────────────────────────────────────

function buildSplitPrompt(
  text: string,
  n: number,
  language: string,
): string {
  const cjk = isCjkDominant(text);
  const joinInstruction = cjk
    ? "Concatenating all segments (WITHOUT spaces between them) must reproduce the original text."
    : "Concatenating all segments (with a single space between them) must reproduce the original text.";

  return (
    `You are inserting ${n - 1} line break(s) into subtitle text, creating ${n} segments.\n` +
    `Think of each segment as one subtitle card shown on screen for ~2 seconds.\n` +
    `Break at natural READING PAUSE POINTS — where a viewer would naturally pause while reading.\n` +
    `Language: ${language}\n\n` +
    `ABSOLUTE RULES:\n` +
    `1. PRESERVE every single character exactly. ${joinInstruction}\n` +
    `2. Return EXACTLY ${n} segments.\n` +
    `3. Break AFTER completed grammatical units:\n` +
    `   ✓ After a complete sentence (. ! ? 。)\n` +
    `   ✓ After a comma or conjunction (, and/but/so/because/when/that)\n` +
    `   ✓ After a complete verb phrase ("We've gathered four" ✓)\n` +
    `   ✓ After a prepositional phrase ("from Japan" ✓)\n` +
    `   ✓ After an adverbial clause ("before returning to Korea" ✓)\n` +
    `   ✓ Korean: After verbal endings (-습니다, -요, -고, -는데, -면서, -지만)\n` +
    `   ✓ Japanese: After particles (は、が、を、に、で、と、も、の、へ、から、まで)\n` +
    `   ✓ Japanese: After clause endings (-て、-で、-ば、-たら、-ので、-けど、-から)\n` +
    `   ✓ Japanese: After sentence endings (-ます、-です、-た、-だ、-ない、-ません)\n` +
    `   ✓ Chinese: After clause markers (的、了、在、但、而、或)\n` +
    `4. NEVER break between:\n` +
    `   ✗ article + noun ("the / best" ✗ → "the best" together)\n` +
    `   ✗ adjective + noun ("convenience / store" ✗ → "convenience store" together)\n` +
    `   ✗ verb + direct object ("try / it" ✗ → "try it" together)\n` +
    `   ✗ preposition + object ("of / the" ✗ → "of the" together)\n` +
    `   ✗ Korean: particle + word (조사 분리 금지)\n` +
    `   ✗ Japanese: NEVER split inside kanji compounds or between kanji+okurigana (送り仮名)\n` +
    `   ✗ Chinese: NEVER split inside compound words (成语/词组)\n` +
    `5. Segments should be roughly balanced in length.\n\n` +
    `EXAMPLES:\n` +
    `  ✓ GOOD: ["We've gathered the best combinations", "from Japan that travelers", "always regret not trying."]\n` +
    `  ✗ BAD:  ["We've gathered the", "best combinations from", "Japan that travelers regret not trying."]\n` +
    `  (BAD splits "the/best" and "from/Japan" — breaks inside noun & prepositional phrases)\n\n` +
    `  ✓ GOOD: ["The ramen is tasty,", "but the tender beef jangjorim", "is truly amazing."]\n` +
    `  ✗ BAD:  ["The ramen is", "tasty, but the tender", "beef jangjorim is truly amazing."]\n` +
    `  (BAD splits "is/tasty" and "tender/beef jangjorim" — breaks verb phrase & adjective+noun)\n\n` +
    `Text: "${text}"\n\n` +
    `Return ONLY valid JSON: {"parts": ["...", "..."]}\n`
  );
}

function getOpenAIClient(): OpenAI {
  return new OpenAI({apiKey: openaiApiKey.value()});
}

async function callOpenAISplit(
  prompt: string,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const client = getOpenAIClient();
  return client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    response_format: {type: "json_object"},
    messages: [
      {
        role: "system",
        content:
          "You are a subtitle line-break specialist. You decide WHERE to insert " +
          "line breaks in subtitle text. Each break creates a new subtitle card " +
          "shown on screen. Break at natural reading pause points — after " +
          "completed phrases, clauses, or sentences. Think like a professional " +
          "subtitle translator: each segment must be a coherent visual unit. " +
          "CRITICAL: Never lose any characters. For languages with word spaces " +
          "(English, Korean, etc.) all segments concatenated with spaces must " +
          "exactly reproduce the original. For languages WITHOUT word spaces " +
          "(Japanese, Chinese, etc.) all segments concatenated WITHOUT spaces " +
          "must exactly reproduce the original. Output valid JSON only.",
      },
      {role: "user", content: prompt},
    ],
  });
}

function parseSplitResponse(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const parts = parsed.parts;
    if (!Array.isArray(parts) || parts.length === 0) return null;
    const cleaned = parts
      .map((p: unknown) => String(p).trim())
      .filter((p: string) => p.length > 0);
    return cleaned.length > 0 ? cleaned : null;
  } catch {
    return null;
  }
}

// ── Fallback: grammar-aware algorithmic split ──────────────────────────────

const SENTENCE_BOUNDARY = /(?<=[.!?\u3002\uff01\uff1f\u2026])\s+/;
const CLAUSE_BOUNDARY =
  /(?<=[,;:\uff0c\uff1b\uff1a\u3001])\s+|\s+(?=(?:and|but|so|or|yet|because|although|however|while|when|if|since|after|before|unless|until|though|whereas)\s)/i;

const CJK_SENTENCE_BOUNDARY = /(?<=[。！？\uff01\uff1f])/;
const CJK_CLAUSE_BOUNDARY = /(?<=[、，；\u3001\uff0c\uff1b])/;

function mergeToN(parts: string[], n: number, sep = " "): string[] {
  const result = [...parts];
  while (result.length > n) {
    let bestI = 0;
    let bestLen = Infinity;
    for (let i = 0; i < result.length - 1; i++) {
      const combined = result[i].length + result[i + 1].length;
      if (combined < bestLen) {
        bestLen = combined;
        bestI = i;
      }
    }
    result[bestI] = result[bestI] + sep + result[bestI + 1];
    result.splice(bestI + 1, 1);
  }
  return result;
}

function splitCjkFallback(text: string, n: number): string[] {
  const trimmed = text.trim();
  if (!trimmed || n <= 1) return trimmed ? [trimmed] : [];

  // 1. Try sentence boundaries
  let parts = trimmed.split(CJK_SENTENCE_BOUNDARY).filter((s) => s.trim());
  if (parts.length >= n) return mergeToN(parts, n, "");

  // 2. Try clause boundaries
  parts = trimmed.split(CJK_CLAUSE_BOUNDARY).filter((s) => s.trim());
  if (parts.length >= n) return mergeToN(parts, n, "");

  // 3. Even character distribution (last resort)
  const chars = [...trimmed];
  const total = chars.length;
  if (total <= n) return [trimmed];

  const result: string[] = [];
  let start = 0;
  for (let i = 0; i < n; i++) {
    const remainingGroups = n - i;
    const size = Math.ceil((total - start) / remainingGroups);
    const end = Math.min(start + size, total);
    result.push(chars.slice(start, end).join(""));
    start = end;
  }
  return result.filter((p) => p);
}

function splitTextFallback(text: string, n: number): string[] {
  // CJK-dominant text: use character-based splitting
  if (isCjkDominant(text)) {
    return splitCjkFallback(text, n);
  }

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= n) return words.length === 0 ? [text] : words;

  // 1. Try sentence boundaries
  let parts = text.split(SENTENCE_BOUNDARY).map((s) => s.trim()).filter(Boolean);
  if (parts.length >= n) return mergeToN(parts, n);

  // 2. Try clause/conjunction boundaries
  parts = text.split(CLAUSE_BOUNDARY).map((s) => s.trim()).filter(Boolean);
  if (parts.length >= n) return mergeToN(parts, n);

  // 3. Even word distribution (last resort)
  const total = words.length;
  const result: string[] = [];
  let start = 0;
  for (let i = 0; i < n; i++) {
    const remaining = n - i;
    const size = Math.ceil((total - start) / remaining);
    const end = Math.min(start + size, total);
    result.push(words.slice(start, end).join(" "));
    start = end;
  }
  return result.filter((p) => p);
}

// ── Post-validation helper ─────────────────────────────────────────────────

function ensureMaxWidth(
  text: string,
  maxWidth: number,
  out: string[],
  depth = 0,
): void {
  const pw = displayWidth(text);
  if (pw <= maxWidth) {
    out.push(text);
    return;
  }

  const cjk = isCjkDominant(text);

  if (depth >= 5) {
    console.warn(
      `  max_width sub-split depth exceeded for: ${text.slice(0, 40)}...`,
    );
    out.push(text);
    return;
  }

  // Check if further splitting is possible
  if (cjk) {
    if (text.trim().length <= 1) {
      out.push(text);
      return;
    }
  } else {
    if (text.split(/\s+/).length <= 1) {
      out.push(text);
      return;
    }
  }

  const subN = Math.max(2, Math.ceil(pw / maxWidth));
  console.warn(
    `  Part too wide (${pw} > ${maxWidth}), sub-splitting into ${subN} (depth=${depth})`,
  );
  const subParts = splitTextFallback(text, subN);
  for (const sp of subParts) {
    ensureMaxWidth(sp, maxWidth, out, depth + 1);
  }
}

function normalizeText(text: string): string {
  return text.split(/\s+/).filter(Boolean).join(" ");
}

// ── Core split logic ───────────────────────────────────────────────────────

async function splitTextWithGpt(
  text: string,
  targetChunks: number,
  language: string,
): Promise<{parts: string[]; tokens: number}> {
  const cjk = isCjkDominant(text);

  // Skip GPT for very short texts
  if (cjk) {
    const charCount = text.replace(/\s/g, "").length;
    if (charCount <= targetChunks) {
      return {parts: splitTextFallback(text, targetChunks), tokens: 0};
    }
  } else {
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    if (wordCount <= targetChunks) {
      return {parts: splitTextFallback(text, targetChunks), tokens: 0};
    }
  }

  const prompt = buildSplitPrompt(text, targetChunks, language);

  try {
    const completion = await callOpenAISplit(prompt);
    const tokens = completion.usage?.total_tokens ?? 0;
    let parts = parseSplitResponse(completion.choices[0]?.message?.content);

    if (parts) {
      const mergeSep = cjk ? "" : " ";

      // Count adjustment
      if (parts.length > targetChunks) {
        const merged = parts.slice(0, targetChunks - 1);
        merged.push(parts.slice(targetChunks - 1).join(mergeSep));
        console.warn(
          `GPT returned ${parts.length} parts instead of ${targetChunks} — merged tail`,
        );
        parts = merged;
      } else if (parts.length < targetChunks) {
        console.warn(
          `GPT returned ${parts.length} parts instead of ${targetChunks} — using as-is`,
        );
      }

      // Content completeness validation
      let originalNorm: string;
      let joinedNorm: string;
      if (cjk) {
        originalNorm = text.replace(/\s+/g, "");
        joinedNorm = parts.join("").replace(/\s+/g, "");
      } else {
        originalNorm = normalizeText(text);
        joinedNorm = normalizeText(parts.join(" "));
      }

      if (originalNorm === joinedNorm) {
        return {parts, tokens};
      } else {
        console.warn(
          "GPT split dropped/altered content — falling back to algorithmic split\n" +
            `  Original (${originalNorm.length} chars): ${originalNorm.slice(0, 200)}\n` +
            `  Joined   (${joinedNorm.length} chars): ${joinedNorm.slice(0, 200)}`,
        );
        return {parts: splitTextFallback(text, targetChunks), tokens};
      }
    }

    console.warn("GPT split parse failed — using fallback");
    return {parts: splitTextFallback(text, targetChunks), tokens};
  } catch (e) {
    console.error("GPT split failed:", e, "— using fallback");
    return {parts: splitTextFallback(text, targetChunks), tokens: 0};
  }
}

// ── Cloud Function ─────────────────────────────────────────────────────────

export const splitSegments = onCall(
  {memory: "512MiB", timeoutSeconds: 120, secrets: [openaiApiKey]},
  async (request): Promise<SplitSegmentsResponse> => {
    const body = request.data as SplitSegmentsRequest;
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    const segments: TranslatedSegment[] = body.segments ?? [];
    const maxDur = body.max_duration ?? 2.0;
    const maxLines = body.max_lines ?? 3;
    const maxWidth = maxLines * MAX_LINE_WIDTH;

    console.info(
      `Split request: ${segments.length} segments (max_duration=${maxDur}s, max_lines=${maxLines})`,
    );

    if (segments.length === 0) {
      return {segments: []};
    }

    const resultSegments: TranslatedSegment[] = [];
    let totalTokens = 0;

    for (const seg of segments) {
      const text = seg.translated_text;
      const duration = seg.end_time - seg.start_time;
      const width = displayWidth(text);

      // Pass through if both constraints satisfied
      if (width <= maxWidth && duration <= maxDur) {
        resultSegments.push(seg);
        continue;
      }

      // Calculate target chunks
      const chunksByWidth =
        width > maxWidth ? Math.ceil(width / maxWidth) : 1;
      const chunksByDuration =
        duration > maxDur ? Math.ceil(duration / maxDur) : 1;
      const targetChunks = Math.max(chunksByWidth, chunksByDuration);

      console.info(
        `  Splitting seg id=${seg.id}: ${duration.toFixed(1)}s, width=${width} → ${targetChunks} chunks`,
      );

      // Split text via GPT
      const {parts: rawParts, tokens} = await splitTextWithGpt(
        text,
        targetChunks,
        body.target_language,
      );
      totalTokens += tokens;

      // Post-validate: guarantee every part fits within maxWidth
      const validatedParts: string[] = [];
      for (const part of rawParts) {
        ensureMaxWidth(part, maxWidth, validatedParts);
      }
      const parts = validatedParts;

      // Distribute timing proportionally by display width
      const partWidths = parts.map((p) => displayWidth(p));
      const totalWidth = partWidths.reduce((a, b) => a + b, 0);
      let currentTime = seg.start_time;

      for (let i = 0; i < parts.length; i++) {
        const pWidth = partWidths[i];
        const pDuration =
          totalWidth > 0
            ? (pWidth / totalWidth) * duration
            : duration / parts.length;
        const isLast = i === parts.length - 1;
        const endTime = isLast ? seg.end_time : currentTime + pDuration;

        resultSegments.push({
          id: seg.id,
          start_time: Math.round(currentTime * 1000) / 1000,
          end_time: Math.round(endTime * 1000) / 1000,
          original_text: seg.original_text,
          translated_text: parts[i],
        });
        currentTime = endTime;
      }
    }

    // Log usage
    if (totalTokens > 0) {
      await admin
        .firestore()
        .collection("usage_logs")
        .add({
          uid,
          service: "gpt-split-segments",
          units: totalTokens,
          unit_type: "tokens",
          created_at: admin.firestore.FieldValue.serverTimestamp(),
        });
    }

    console.info(
      `Split complete: ${segments.length} → ${resultSegments.length} segments, ${totalTokens} tokens`,
    );

    return {segments: resultSegments};
  },
);
