"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.translate = void 0;
const https_1 = require("firebase-functions/v2/https");
const openai_1 = __importDefault(require("openai"));
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
if (admin.apps.length === 0)
    admin.initializeApp();
const openaiApiKey = (0, params_1.defineSecret)("OPENAI_API_KEY");
// ── Constants ──────────────────────────────────────────────────────────────
const SUPPORTED_LANGUAGES = new Set(["ko", "en", "ja", "zh", "es"]);
const MAX_BATCH_SIZE = 20;
// ── Helpers ────────────────────────────────────────────────────────────────
const NUMBERING_RE = /^\s*\[\d+\]\s*/;
function stripNumbering(text) {
    return text.replace(NUMBERING_RE, "");
}
// ── OpenAI helpers ─────────────────────────────────────────────────────────
function buildBatchPrompt(texts, srcLang, tgtLang) {
    const numbered = texts.map((t, i) => `[${i + 1}] ${t}`).join("\n");
    return (`Translate the following ${texts.length} numbered texts ` +
        `from ${srcLang} to ${tgtLang}.\n` +
        `CRITICAL RULES:\n` +
        `- Return EXACTLY ${texts.length} translations.\n` +
        `- Do NOT include [N] numbering in the translations.\n` +
        `- Do NOT merge, split, reorder, or skip any items.\n` +
        `- Each numbered input MUST produce exactly one output.\n` +
        `Return a JSON object: {"translations": ["...", "..."]}\n\n` +
        numbered);
}
function buildSinglePrompt(text, srcLang, tgtLang) {
    return (`Translate the following text from ${srcLang} to ${tgtLang}.\n` +
        `Return a JSON object: {"translation": "..."}\n\n` +
        text);
}
function getOpenAIClient() {
    return new openai_1.default({ apiKey: openaiApiKey.value() });
}
async function callOpenAI(prompt, system) {
    const client = getOpenAIClient();
    const sysMsg = system ??
        "You are a professional translator. Output valid JSON only. " +
            "Always return exactly the same number of translations as the input texts.";
    return client.chat.completions.create({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
            { role: "system", content: sysMsg },
            { role: "user", content: prompt },
        ],
    });
}
// ── Response parsers ───────────────────────────────────────────────────────
function parseBatchResponse(raw) {
    if (!raw)
        return null;
    try {
        const parsed = JSON.parse(raw);
        const translations = parsed.translations;
        if (!Array.isArray(translations))
            return null;
        return translations.map((t) => stripNumbering(String(t)));
    }
    catch {
        return null;
    }
}
function parseSingleResponse(raw) {
    if (!raw)
        return null;
    try {
        const parsed = JSON.parse(raw);
        if ("translation" in parsed) {
            return stripNumbering(String(parsed.translation));
        }
        if ("translations" in parsed &&
            Array.isArray(parsed.translations) &&
            parsed.translations.length > 0) {
            return stripNumbering(String(parsed.translations[0]));
        }
        // Last resort: take first string value
        for (const v of Object.values(parsed)) {
            if (typeof v === "string") {
                return stripNumbering(v);
            }
        }
        return null;
    }
    catch {
        return null;
    }
}
// ── Core translation logic ─────────────────────────────────────────────────
async function translateSingle(text, srcLang, tgtLang) {
    const prompt = buildSinglePrompt(text, srcLang, tgtLang);
    try {
        const completion = await callOpenAI(prompt, "You are a professional translator. Output valid JSON only.");
        const tokens = completion.usage?.total_tokens ?? 0;
        const result = parseSingleResponse(completion.choices[0]?.message?.content);
        if (result) {
            return { text: result, tokens };
        }
        console.warn("Single translation parse failed, returning original:", text.slice(0, 50));
        return { text, tokens };
    }
    catch (e) {
        console.error("Single translation API failed:", e, "— returning original");
        return { text, tokens: 0 };
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
async function translateBatch(texts, srcLang, tgtLang) {
    const n = texts.length;
    // Single text: use dedicated single path
    if (n === 1) {
        const r = await translateSingle(texts[0], srcLang, tgtLang);
        return { translations: [r.text], tokens: r.tokens };
    }
    // Batch attempt
    const prompt = buildBatchPrompt(texts, srcLang, tgtLang);
    let totalTokens = 0;
    let completion;
    try {
        completion = await callOpenAI(prompt);
        totalTokens += completion.usage?.total_tokens ?? 0;
    }
    catch (e) {
        console.error(`Batch OpenAI call failed for ${n} texts — falling back to individual`, e);
        return translateAllIndividually(texts, srcLang, tgtLang);
    }
    const raw = completion.choices[0]?.message?.content;
    const batchResult = parseBatchResponse(raw);
    // Case 1: Parse failed entirely → translate all individually
    if (batchResult === null) {
        console.warn(`Batch parse failed for ${n} texts — falling back to individual`);
        const indiv = await translateAllIndividually(texts, srcLang, tgtLang);
        return {
            translations: indiv.translations,
            tokens: totalTokens + indiv.tokens,
        };
    }
    // Case 2: Perfect count match → done
    if (batchResult.length === n) {
        return { translations: batchResult, tokens: totalTokens };
    }
    // Case 3: Count mismatch → post-process to guarantee N results
    const got = batchResult.length;
    console.warn(`Count mismatch: expected ${n}, got ${got} — post-processing to fix`);
    if (got > n) {
        // GPT returned MORE than expected → truncate
        console.info(`Truncating ${got} → ${n} translations`);
        return { translations: batchResult.slice(0, n), tokens: totalTokens };
    }
    // got < n: GPT returned FEWER than expected
    // Use what we got for the first `got` items, translate remaining individually
    const results = [...batchResult];
    const missingTexts = texts.slice(got);
    console.info(`Translating ${missingTexts.length} missing segments individually (had ${got}/${n})`);
    for (const t of missingTexts) {
        const r = await translateSingle(t, srcLang, tgtLang);
        results.push(r.text);
        totalTokens += r.tokens;
    }
    return { translations: results, tokens: totalTokens };
}
async function translateAllIndividually(texts, srcLang, tgtLang) {
    console.info(`Translating ${texts.length} texts individually (fallback)`);
    const results = [];
    let totalTokens = 0;
    for (let i = 0; i < texts.length; i++) {
        const r = await translateSingle(texts[i], srcLang, tgtLang);
        results.push(r.text);
        totalTokens += r.tokens;
        if ((i + 1) % 5 === 0) {
            console.info(`  Individual progress: ${i + 1}/${texts.length}`);
        }
    }
    return { translations: results, tokens: totalTokens };
}
// ── Cloud Function ─────────────────────────────────────────────────────────
exports.translate = (0, https_1.onCall)({ cors: true, invoker: "public", memory: "512MiB", timeoutSeconds: 300, secrets: [openaiApiKey] }, async (request) => {
    const body = request.data;
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "Authentication required");
    }
    const segments = body.segments ?? [];
    const srcLang = body.source_language;
    const tgtLang = body.target_language;
    console.info(`Translate request: ${segments.length} segments, ${srcLang} → ${tgtLang}`);
    // Validate segments not empty
    if (segments.length === 0) {
        throw new https_1.HttpsError("invalid-argument", "segments must not be empty");
    }
    // Validate language codes
    if (!SUPPORTED_LANGUAGES.has(srcLang)) {
        throw new https_1.HttpsError("invalid-argument", `Unsupported source_language: ${srcLang}. ` +
            `Supported: ${[...SUPPORTED_LANGUAGES].sort().join(", ")}`);
    }
    if (!SUPPORTED_LANGUAGES.has(tgtLang)) {
        throw new https_1.HttpsError("invalid-argument", `Unsupported target_language: ${tgtLang}. ` +
            `Supported: ${[...SUPPORTED_LANGUAGES].sort().join(", ")}`);
    }
    // Process in batches to prevent token overflow
    const allTranslations = [];
    let totalTokens = 0;
    for (let batchStart = 0; batchStart < segments.length; batchStart += MAX_BATCH_SIZE) {
        const batch = segments.slice(batchStart, batchStart + MAX_BATCH_SIZE);
        const texts = batch.map((seg) => seg.text);
        console.info(`Translating batch ${batchStart}-${batchStart + batch.length} of ${segments.length} segments`);
        const { translations, tokens } = await translateBatch(texts, srcLang, tgtLang);
        // FINAL SAFETY: assert count matches
        if (translations.length !== texts.length) {
            throw new https_1.HttpsError("internal", `BUG: post-processing failed to guarantee count: ` +
                `expected ${texts.length}, got ${translations.length}`);
        }
        allTranslations.push(...translations);
        totalTokens += tokens;
    }
    // Build translated segments preserving original timestamps
    const translatedSegments = segments.map((seg, i) => ({
        id: seg.id,
        start_time: seg.start_time,
        end_time: seg.end_time,
        original_text: seg.text,
        translated_text: allTranslations[i],
    }));
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
    console.info(`Translation complete: ${translatedSegments.length} segments, ${totalTokens} tokens`);
    return {
        segments: translatedSegments,
        source_language: srcLang,
        target_language: tgtLang,
    };
});
//# sourceMappingURL=translate.js.map