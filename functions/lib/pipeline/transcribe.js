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
Object.defineProperty(exports, "__esModule", { value: true });
exports.transcribe = void 0;
const https_1 = require("firebase-functions/v2/https");
const openai_1 = __importStar(require("openai"));
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
if (admin.apps.length === 0)
    admin.initializeApp();
const openaiApiKey = (0, params_1.defineSecret)("OPENAI_API_KEY");
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const NO_SPEECH_THRESHOLD = 0.6; // Segments above this are likely non-speech
const MIN_SEGMENT_DURATION = 0.5; // Seconds — merge shorter segments with neighbors
// Whisper returns full language names; translate expects ISO codes.
const WHISPER_LANG_MAP = {
    korean: "ko",
    english: "en",
    japanese: "ja",
    chinese: "zh",
    spanish: "es",
};
exports.transcribe = (0, https_1.onCall)({ cors: true, invoker: "public", memory: "1GiB", timeoutSeconds: 300, secrets: [openaiApiKey] }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "인증이 필요합니다");
    }
    const { audioBase64, filename, language } = request.data;
    // Decode base64 audio
    const audioBuffer = Buffer.from(audioBase64, "base64");
    if (audioBuffer.length > MAX_FILE_SIZE) {
        throw new https_1.HttpsError("invalid-argument", "파일 크기가 25MB를 초과합니다");
    }
    try {
        const client = new openai_1.default({ apiKey: openaiApiKey.value() });
        // Use OpenAI toFile helper for Node.js compatibility
        const file = await (0, openai_1.toFile)(audioBuffer, filename || "audio.mp3");
        // Build params with optional language
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const params = {
            model: "whisper-1",
            file,
            response_format: "verbose_json",
            timestamp_granularities: ["segment"],
        };
        if (language) {
            params.language = language;
        }
        const response = await client.audio.transcriptions.create(params);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawSegments = response.segments || [];
        if (rawSegments.length === 0) {
            throw new https_1.HttpsError("failed-precondition", "음성이 감지되지 않았습니다. 오디오가 비어있거나 음악만 포함되어 있습니다.");
        }
        // Check if ALL segments are non-speech
        const noSpeechCount = rawSegments.filter((seg) => (seg.no_speech_prob ?? 0) > NO_SPEECH_THRESHOLD).length;
        if (noSpeechCount === rawSegments.length) {
            throw new https_1.HttpsError("failed-precondition", "음성이 감지되지 않았습니다. 오디오에 인식 가능한 음성이 없습니다.");
        }
        // Filter out non-speech segments
        const preSegments = rawSegments
            .filter((seg) => (seg.no_speech_prob ?? 0) <= NO_SPEECH_THRESHOLD)
            .map((seg) => ({
            id: String(seg.id),
            start_time: seg.start,
            end_time: seg.end,
            text: seg.text,
        }));
        // Merge short segments (< 0.5s) with previous neighbor
        const segments = [];
        for (const seg of preSegments) {
            const dur = seg.end_time - seg.start_time;
            if (dur < MIN_SEGMENT_DURATION && segments.length > 0) {
                const prev = segments[segments.length - 1];
                segments[segments.length - 1] = {
                    id: prev.id,
                    start_time: prev.start_time,
                    end_time: seg.end_time,
                    text: prev.text + " " + seg.text,
                };
            }
            else {
                segments.push({ ...seg });
            }
        }
        // Re-assign sequential IDs after merge
        for (let idx = 0; idx < segments.length; idx++) {
            segments[idx].id = String(idx);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawLanguage = response.language || "unknown";
        const detectedLanguage = WHISPER_LANG_MAP[rawLanguage] || rawLanguage;
        // Usage logging
        const duration = segments.length > 0
            ? Math.floor(segments[segments.length - 1].end_time)
            : 0;
        await admin
            .firestore()
            .collection("usage_logs")
            .add({
            uid: request.auth.uid,
            service: "whisper",
            units: duration,
            unit_type: "seconds",
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        return {
            segments,
            detected_language: detectedLanguage,
        };
    }
    catch (err) {
        if (err instanceof https_1.HttpsError)
            throw err;
        const e = err;
        throw new https_1.HttpsError("internal", `음성 변환에 실패했습니다: ${e.name}: ${e.message}`);
    }
});
//# sourceMappingURL=transcribe.js.map