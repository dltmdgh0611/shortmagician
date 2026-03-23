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
exports.synthesize = void 0;
const https_1 = require("firebase-functions/v2/https");
const tts = __importStar(require("@google-cloud/text-to-speech"));
// Language code mapping: short code → BCP-47
const LANGUAGE_MAP = {
    ko: "ko-KR",
    en: "en-US",
    ja: "ja-JP",
    zh: "cmn-CN",
    es: "es-ES",
};
const MAX_TEXT_LENGTH = 5000;
// Shared singleton client (cold-start reuse)
let client = null;
function getClient() {
    if (!client) {
        client = new tts.TextToSpeechClient();
    }
    return client;
}
/**
 * Wrap plain text in SSML with prosody rate control.
 */
function buildSsml(text, speed = 1.0) {
    const escaped = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
    // Clamp speed to Google TTS supported range (0.25 – 4.0)
    const clamped = Math.max(0.25, Math.min(4.0, speed));
    const ratePct = `${Math.round(clamped * 100)}%`;
    return `<speak><prosody rate="${ratePct}">${escaped}</prosody></speak>`;
}
exports.synthesize = (0, https_1.onCall)({ memory: "512MiB", timeoutSeconds: 60 }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "인증이 필요합니다");
    }
    const { text, voice_id: voiceId, language, speed = 1.0 } = request.data;
    // Validate text
    if (!text || !text.trim()) {
        throw new https_1.HttpsError("invalid-argument", "텍스트가 비어 있습니다.");
    }
    if (text.length > MAX_TEXT_LENGTH) {
        throw new https_1.HttpsError("invalid-argument", `텍스트가 너무 깁니다. 최대 ${MAX_TEXT_LENGTH}자까지 가능합니다.`);
    }
    // Map short language code to BCP-47
    const languageCode = LANGUAGE_MAP[language];
    if (!languageCode) {
        throw new https_1.HttpsError("invalid-argument", `지원하지 않는 언어입니다: ${language}. ` +
            `지원 언어: ${Object.keys(LANGUAGE_MAP).join(", ")}`);
    }
    try {
        const ssml = buildSsml(text, speed);
        const [response] = await getClient().synthesizeSpeech({
            input: { ssml },
            voice: {
                languageCode,
                name: voiceId,
            },
            audioConfig: {
                audioEncoding: "MP3",
            },
        });
        const audioBase64 = Buffer.from(response.audioContent).toString("base64");
        return { audioBase64 };
    }
    catch (err) {
        if (err instanceof https_1.HttpsError)
            throw err;
        const e = err;
        throw new https_1.HttpsError("internal", `TTS 합성에 실패했습니다: ${e.name}: ${e.message}`);
    }
});
//# sourceMappingURL=synthesize.js.map