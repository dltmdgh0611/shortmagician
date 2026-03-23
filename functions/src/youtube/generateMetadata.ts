import {onCall, HttpsError} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import * as admin from "firebase-admin";
import OpenAI from "openai";
import type {
  YouTubeMetadataRequest,
  YouTubeMetadataResponse,
} from "../types/youtube";

if (admin.apps.length === 0) admin.initializeApp();

const openaiApiKey = defineSecret("OPENAI_API_KEY");

const LANGUAGE_MAP: Record<string, string> = {
  ko: "Korean",
  en: "English",
  ja: "Japanese",
  zh: "Chinese",
  es: "Spanish",
};

export const youtubeGenerateMetadata = onCall(
  {cors: true, invoker: "public", secrets: [openaiApiKey], timeoutSeconds: 60},
  async (request): Promise<YouTubeMetadataResponse> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "인증이 필요합니다");
    }

    const {subtitle_text, language} = request.data as YouTubeMetadataRequest;

    if (!subtitle_text) {
      throw new HttpsError("invalid-argument", "subtitle_text가 필요합니다");
    }

    const langName = LANGUAGE_MAP[language] || language;
    const subtitleTrimmed = subtitle_text.slice(0, 3000);

    const systemPrompt =
      `You are a YouTube Shorts metadata generator. Generate a catchy title, description, and hashtags based on the provided subtitle content.\n\n` +
      `Rules:\n` +
      `- Title: Must be in ${langName} language, maximum 100 characters, engaging and click-worthy for YouTube Shorts\n` +
      `- Description: Must be in ${langName} language, 2-3 sentences summarizing the content, include relevant context\n` +
      `- Hashtags: 5-8 hashtags in ${langName} language, each prefixed with #, relevant to the content\n\n` +
      `Respond in JSON format:\n{"title": "...", "description": "...", "hashtags": ["#tag1", "#tag2", ...]}`;

    try {
      const client = new OpenAI({apiKey: openaiApiKey.value()});

      const completion = await client.chat.completions.create({
        model: "gpt-4o",
        response_format: {type: "json_object"},
        messages: [
          {role: "system", content: systemPrompt},
          {role: "user", content: subtitleTrimmed},
        ],
      });

      const raw = completion.choices[0].message.content || "{}";
      const data = JSON.parse(raw);

      const title: string = (data.title || "").slice(0, 100);
      const description: string = data.description || "";
      let hashtags: string[] = data.hashtags || [];

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

      return {title, description, hashtags};
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      // Return empty on failure (matches Python behavior)
      return {title: "", description: "", hashtags: []};
    }
  }
);
