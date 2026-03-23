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
exports.youtubeGenerateMetadata = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
const openai_1 = __importDefault(require("openai"));
if (admin.apps.length === 0)
    admin.initializeApp();
const openaiApiKey = (0, params_1.defineSecret)("OPENAI_API_KEY");
const LANGUAGE_MAP = {
    ko: "Korean",
    en: "English",
    ja: "Japanese",
    zh: "Chinese",
    es: "Spanish",
};
exports.youtubeGenerateMetadata = (0, https_1.onCall)({ secrets: [openaiApiKey], timeoutSeconds: 60 }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "인증이 필요합니다");
    }
    const { subtitle_text, language } = request.data;
    if (!subtitle_text) {
        throw new https_1.HttpsError("invalid-argument", "subtitle_text가 필요합니다");
    }
    const langName = LANGUAGE_MAP[language] || language;
    const subtitleTrimmed = subtitle_text.slice(0, 3000);
    const systemPrompt = `You are a YouTube Shorts metadata generator. Generate a catchy title, description, and hashtags based on the provided subtitle content.\n\n` +
        `Rules:\n` +
        `- Title: Must be in ${langName} language, maximum 100 characters, engaging and click-worthy for YouTube Shorts\n` +
        `- Description: Must be in ${langName} language, 2-3 sentences summarizing the content, include relevant context\n` +
        `- Hashtags: 5-8 hashtags in ${langName} language, each prefixed with #, relevant to the content\n\n` +
        `Respond in JSON format:\n{"title": "...", "description": "...", "hashtags": ["#tag1", "#tag2", ...]}`;
    try {
        const client = new openai_1.default({ apiKey: openaiApiKey.value() });
        const completion = await client.chat.completions.create({
            model: "gpt-4o",
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: subtitleTrimmed },
            ],
        });
        const raw = completion.choices[0].message.content || "{}";
        const data = JSON.parse(raw);
        const title = (data.title || "").slice(0, 100);
        const description = data.description || "";
        let hashtags = data.hashtags || [];
        if (hashtags.length > 8) {
            hashtags = hashtags.slice(0, 8);
        }
        // Usage logging
        await admin
            .firestore()
            .collection("usage_logs")
            .add({
            uid: request.auth.uid,
            service: "gpt-4o",
            units: 1,
            unit_type: "metadata_generation",
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { title, description, hashtags };
    }
    catch (err) {
        if (err instanceof https_1.HttpsError)
            throw err;
        // Return empty on failure (matches Python behavior)
        return { title: "", description: "", hashtags: [] };
    }
});
//# sourceMappingURL=generateMetadata.js.map