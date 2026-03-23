import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as tts from "@google-cloud/text-to-speech";
import type {
  SynthesizeRequest,
  SynthesizeResponse,
} from "../types/pipeline";

// Language code mapping: short code → BCP-47
const LANGUAGE_MAP: Record<string, string> = {
  ko: "ko-KR",
  en: "en-US",
  ja: "ja-JP",
  zh: "cmn-CN",
  es: "es-ES",
};

const MAX_TEXT_LENGTH = 5000;

// Shared singleton client (cold-start reuse)
let client: tts.TextToSpeechClient | null = null;

function getClient(): tts.TextToSpeechClient {
  if (!client) {
    client = new tts.TextToSpeechClient();
  }
  return client;
}

/**
 * Wrap plain text in SSML with prosody rate control.
 */
function buildSsml(text: string, speed: number = 1.0): string {
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

export const synthesize = onCall(
  {memory: "512MiB", timeoutSeconds: 60},
  async (request): Promise<SynthesizeResponse> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "인증이 필요합니다");
    }

    const {text, voice_id: voiceId, language, speed = 1.0} =
      request.data as SynthesizeRequest;

    // Validate text
    if (!text || !text.trim()) {
      throw new HttpsError("invalid-argument", "텍스트가 비어 있습니다.");
    }

    if (text.length > MAX_TEXT_LENGTH) {
      throw new HttpsError(
        "invalid-argument",
        `텍스트가 너무 깁니다. 최대 ${MAX_TEXT_LENGTH}자까지 가능합니다.`
      );
    }

    // Map short language code to BCP-47
    const languageCode = LANGUAGE_MAP[language];
    if (!languageCode) {
      throw new HttpsError(
        "invalid-argument",
        `지원하지 않는 언어입니다: ${language}. ` +
          `지원 언어: ${Object.keys(LANGUAGE_MAP).join(", ")}`
      );
    }

    try {
      const ssml = buildSsml(text, speed);

      const [response] = await getClient().synthesizeSpeech({
        input: {ssml},
        voice: {
          languageCode,
          name: voiceId,
        },
        audioConfig: {
          audioEncoding: "MP3",
        },
      });

      const audioBase64 = Buffer.from(
        response.audioContent as Uint8Array
      ).toString("base64");

      return {audioBase64};
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      const e = err as Error;
      throw new HttpsError(
        "internal",
        `TTS 합성에 실패했습니다: ${e.name}: ${e.message}`
      );
    }
  }
);
