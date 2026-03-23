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
exports.realign = void 0;
const https_1 = require("firebase-functions/v2/https");
const openai_1 = __importStar(require("openai"));
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
if (admin.apps.length === 0)
    admin.initializeApp();
const openaiApiKey = (0, params_1.defineSecret)("OPENAI_API_KEY");
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
exports.realign = (0, https_1.onCall)({ memory: "512MiB", timeoutSeconds: 120, secrets: [openaiApiKey] }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "인증이 필요합니다");
    }
    const { audioBase64, filename } = request.data;
    // Decode base64 audio
    const audioBuffer = Buffer.from(audioBase64, "base64");
    if (audioBuffer.length > MAX_FILE_SIZE) {
        throw new https_1.HttpsError("invalid-argument", "파일 크기가 25MB를 초과합니다");
    }
    try {
        const client = new openai_1.default({ apiKey: openaiApiKey.value() });
        // Use OpenAI toFile helper for Node.js compatibility
        const file = await (0, openai_1.toFile)(audioBuffer, filename || "tts_audio.mp3");
        const response = await client.audio.transcriptions.create({
            model: "whisper-1",
            file,
            response_format: "verbose_json",
            timestamp_granularities: ["word"],
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawWords = response.words || [];
        if (rawWords.length === 0) {
            return { words: [], duration: 0 };
        }
        // Filter empty words and build typed array
        const words = rawWords
            .filter((w) => w.word.trim())
            .map((w) => ({
            word: w.word.trim(),
            start: w.start,
            end: w.end,
        }));
        // Duration: use last word's end time (more reliable than response.duration
        // for short clips where Whisper may pad silence)
        const duration = words.length > 0 ? words[words.length - 1].end : 0;
        // Usage logging
        await admin
            .firestore()
            .collection("usage_logs")
            .add({
            uid: request.auth.uid,
            service: "whisper-realign",
            units: Math.floor(duration),
            unit_type: "seconds",
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { words, duration };
    }
    catch (err) {
        if (err instanceof https_1.HttpsError)
            throw err;
        const e = err;
        throw new https_1.HttpsError("internal", `자막 정렬에 실패했습니다: ${e.name}: ${e.message}`);
    }
});
//# sourceMappingURL=realign.js.map