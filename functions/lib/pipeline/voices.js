"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.voices = void 0;
const https_1 = require("firebase-functions/v2/https");
// Language code mapping: short code → BCP-47
const LANGUAGE_MAP = {
    ko: "ko-KR",
    en: "en-US",
    ja: "ja-JP",
    zh: "cmn-CN",
    es: "es-ES",
};
// Chirp 3 HD voices per language (5 voices × 5 languages = 25 total)
const CHIRP3_HD_VOICES = {
    ko: [
        { name: "Achernar", gender: "FEMALE" },
        { name: "Achird", gender: "MALE" },
        { name: "Aoede", gender: "FEMALE" },
        { name: "Algenib", gender: "MALE" },
        { name: "Autonoe", gender: "FEMALE" },
    ],
    en: [
        { name: "Achernar", gender: "FEMALE" },
        { name: "Achird", gender: "MALE" },
        { name: "Aoede", gender: "FEMALE" },
        { name: "Algenib", gender: "MALE" },
        { name: "Autonoe", gender: "FEMALE" },
    ],
    ja: [
        { name: "Achernar", gender: "FEMALE" },
        { name: "Achird", gender: "MALE" },
        { name: "Aoede", gender: "FEMALE" },
        { name: "Algenib", gender: "MALE" },
        { name: "Autonoe", gender: "FEMALE" },
    ],
    zh: [
        { name: "Achernar", gender: "FEMALE" },
        { name: "Achird", gender: "MALE" },
        { name: "Aoede", gender: "FEMALE" },
        { name: "Algenib", gender: "MALE" },
        { name: "Autonoe", gender: "FEMALE" },
    ],
    es: [
        { name: "Achernar", gender: "FEMALE" },
        { name: "Achird", gender: "MALE" },
        { name: "Aoede", gender: "FEMALE" },
        { name: "Algenib", gender: "MALE" },
        { name: "Autonoe", gender: "FEMALE" },
    ],
};
exports.voices = (0, https_1.onCall)({ memory: "256MiB", timeoutSeconds: 30 }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "인증이 필요합니다");
    }
    const { language } = (request.data || {});
    let languages;
    if (language) {
        if (!CHIRP3_HD_VOICES[language]) {
            throw new https_1.HttpsError("invalid-argument", `지원하지 않는 언어입니다: ${language}. ` +
                `지원 언어: ${Object.keys(CHIRP3_HD_VOICES).join(", ")}`);
        }
        languages = [language];
    }
    else {
        languages = Object.keys(CHIRP3_HD_VOICES);
    }
    const voiceList = [];
    for (const lang of languages) {
        const bcp47 = LANGUAGE_MAP[lang];
        for (const voiceInfo of CHIRP3_HD_VOICES[lang]) {
            voiceList.push({
                voice_id: `${bcp47}-Chirp3-HD-${voiceInfo.name}`,
                name: voiceInfo.name,
                language: lang,
                gender: voiceInfo.gender,
            });
        }
    }
    return { voices: voiceList };
});
//# sourceMappingURL=voices.js.map