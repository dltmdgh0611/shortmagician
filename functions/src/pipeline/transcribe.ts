import {onCall, HttpsError} from "firebase-functions/v2/https";
import OpenAI, {toFile} from "openai";
import {defineSecret} from "firebase-functions/params";
import * as admin from "firebase-admin";
import type {
  TranscribeRequest,
  TranscribeResponse,
  TranscribeSegment,
} from "../types/pipeline";

if (admin.apps.length === 0) admin.initializeApp();

const openaiApiKey = defineSecret("OPENAI_API_KEY");

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const NO_SPEECH_THRESHOLD = 0.6; // Segments above this are likely non-speech
const MIN_SEGMENT_DURATION = 0.5; // Seconds — merge shorter segments with neighbors

// Whisper returns full language names; translate expects ISO codes.
const WHISPER_LANG_MAP: Record<string, string> = {
  korean: "ko",
  english: "en",
  japanese: "ja",
  chinese: "zh",
  spanish: "es",
};

interface WhisperSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  no_speech_prob?: number;
}

export const transcribe = onCall(
  {memory: "1GiB", timeoutSeconds: 300, secrets: [openaiApiKey]},
  async (request): Promise<TranscribeResponse> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "인증이 필요합니다");
    }

    const {audioBase64, filename, language} =
      request.data as TranscribeRequest;

    // Decode base64 audio
    const audioBuffer = Buffer.from(audioBase64, "base64");
    if (audioBuffer.length > MAX_FILE_SIZE) {
      throw new HttpsError(
        "invalid-argument",
        "파일 크기가 25MB를 초과합니다"
      );
    }

    try {
      const client = new OpenAI({apiKey: openaiApiKey.value()});

      // Use OpenAI toFile helper for Node.js compatibility
      const file = await toFile(audioBuffer, filename || "audio.mp3");

      // Build params with optional language
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const params: any = {
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
      const rawSegments: WhisperSegment[] = (response as any).segments || [];

      if (rawSegments.length === 0) {
        throw new HttpsError(
          "failed-precondition",
          "음성이 감지되지 않았습니다. 오디오가 비어있거나 음악만 포함되어 있습니다."
        );
      }

      // Check if ALL segments are non-speech
      const noSpeechCount = rawSegments.filter(
        (seg) => (seg.no_speech_prob ?? 0) > NO_SPEECH_THRESHOLD
      ).length;

      if (noSpeechCount === rawSegments.length) {
        throw new HttpsError(
          "failed-precondition",
          "음성이 감지되지 않았습니다. 오디오에 인식 가능한 음성이 없습니다."
        );
      }

      // Filter out non-speech segments
      const preSegments: TranscribeSegment[] = rawSegments
        .filter((seg) => (seg.no_speech_prob ?? 0) <= NO_SPEECH_THRESHOLD)
        .map((seg) => ({
          id: String(seg.id),
          start_time: seg.start,
          end_time: seg.end,
          text: seg.text,
        }));

      // Merge short segments (< 0.5s) with previous neighbor
      const segments: TranscribeSegment[] = [];
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
        } else {
          segments.push({...seg});
        }
      }

      // Re-assign sequential IDs after merge
      for (let idx = 0; idx < segments.length; idx++) {
        segments[idx].id = String(idx);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawLanguage: string = (response as any).language || "unknown";
      const detectedLanguage =
        WHISPER_LANG_MAP[rawLanguage] || rawLanguage;

      // Usage logging
      const duration =
        segments.length > 0
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
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      const e = err as Error;
      throw new HttpsError(
        "internal",
        `음성 변환에 실패했습니다: ${e.name}: ${e.message}`
      );
    }
  }
);
