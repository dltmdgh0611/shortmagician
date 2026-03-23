import {onCall, HttpsError} from "firebase-functions/v2/https";
import type {VoiceOption, VoiceListResponse} from "../types/pipeline";

// Language code mapping: short code → BCP-47
const LANGUAGE_MAP: Record<string, string> = {
  ko: "ko-KR",
  en: "en-US",
  ja: "ja-JP",
  zh: "cmn-CN",
  es: "es-ES",
};

interface VoiceInfo {
  name: string;
  gender: string;
}

// Chirp 3 HD voices per language (5 voices × 5 languages = 25 total)
const CHIRP3_HD_VOICES: Record<string, VoiceInfo[]> = {
  ko: [
    {name: "Achernar", gender: "FEMALE"},
    {name: "Achird", gender: "MALE"},
    {name: "Aoede", gender: "FEMALE"},
    {name: "Algenib", gender: "MALE"},
    {name: "Autonoe", gender: "FEMALE"},
  ],
  en: [
    {name: "Achernar", gender: "FEMALE"},
    {name: "Achird", gender: "MALE"},
    {name: "Aoede", gender: "FEMALE"},
    {name: "Algenib", gender: "MALE"},
    {name: "Autonoe", gender: "FEMALE"},
  ],
  ja: [
    {name: "Achernar", gender: "FEMALE"},
    {name: "Achird", gender: "MALE"},
    {name: "Aoede", gender: "FEMALE"},
    {name: "Algenib", gender: "MALE"},
    {name: "Autonoe", gender: "FEMALE"},
  ],
  zh: [
    {name: "Achernar", gender: "FEMALE"},
    {name: "Achird", gender: "MALE"},
    {name: "Aoede", gender: "FEMALE"},
    {name: "Algenib", gender: "MALE"},
    {name: "Autonoe", gender: "FEMALE"},
  ],
  es: [
    {name: "Achernar", gender: "FEMALE"},
    {name: "Achird", gender: "MALE"},
    {name: "Aoede", gender: "FEMALE"},
    {name: "Algenib", gender: "MALE"},
    {name: "Autonoe", gender: "FEMALE"},
  ],
};

export const voices = onCall(
  {memory: "256MiB", timeoutSeconds: 30},
  async (request): Promise<VoiceListResponse> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "인증이 필요합니다");
    }

    const {language} = (request.data || {}) as {language?: string};

    let languages: string[];

    if (language) {
      if (!CHIRP3_HD_VOICES[language]) {
        throw new HttpsError(
          "invalid-argument",
          `지원하지 않는 언어입니다: ${language}. ` +
            `지원 언어: ${Object.keys(CHIRP3_HD_VOICES).join(", ")}`
        );
      }
      languages = [language];
    } else {
      languages = Object.keys(CHIRP3_HD_VOICES);
    }

    const voiceList: VoiceOption[] = [];

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

    return {voices: voiceList};
  }
);
