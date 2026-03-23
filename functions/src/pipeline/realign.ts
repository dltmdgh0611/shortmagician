import {onCall, HttpsError} from "firebase-functions/v2/https";
import OpenAI, {toFile} from "openai";
import {defineSecret} from "firebase-functions/params";
import * as admin from "firebase-admin";
import type {
  RealignRequest,
  RealignResponse,
  WordTimestamp,
} from "../types/pipeline";

if (admin.apps.length === 0) admin.initializeApp();

const openaiApiKey = defineSecret("OPENAI_API_KEY");

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

export const realign = onCall(
  {memory: "512MiB", timeoutSeconds: 120, secrets: [openaiApiKey]},
  async (request): Promise<RealignResponse> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "인증이 필요합니다");
    }

    const {audioBase64, filename} = request.data as RealignRequest;

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
      const file = await toFile(audioBuffer, filename || "tts_audio.mp3");

      const response = await client.audio.transcriptions.create({
        model: "whisper-1",
        file,
        response_format: "verbose_json" as const,
        timestamp_granularities: ["word"],
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawWords: WhisperWord[] = (response as any).words || [];

      if (rawWords.length === 0) {
        return {words: [], duration: 0};
      }

      // Filter empty words and build typed array
      const words: WordTimestamp[] = rawWords
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

      return {words, duration};
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      const e = err as Error;
      throw new HttpsError(
        "internal",
        `자막 정렬에 실패했습니다: ${e.name}: ${e.message}`
      );
    }
  }
);
