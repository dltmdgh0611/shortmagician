import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase';  // Firebase app instance

// Initialize Functions (app이 없으면 null)
const functions = app ? getFunctions(app) : null;

// Generic typed wrapper
function callFunction<TReq, TRes>(name: string) {
  return async (data: TReq): Promise<TRes> => {
    if (!functions) throw new Error('Firebase Functions를 사용할 수 없습니다');
    const callable = httpsCallable<TReq, TRes>(functions, name);
    const result = await callable(data);
    return result.data;
  };
}

// Pipeline functions
export const callTranscribe = callFunction<
  { audioBase64: string; filename: string; language?: string },
  { segments: any[]; detected_language: string }
>('transcribe');

export const callTranslate = callFunction<
  { segments: any[]; source_language: string; target_language: string },
  { segments: any[]; source_language: string; target_language: string }
>('translate');

export const callSynthesize = callFunction<
  { text: string; voice_id: string; language: string; speed?: number },
  { audioBase64: string }
>('synthesize');

export const callVoices = callFunction<
  { language?: string },
  { voices: any[] }
>('voices');

export const callRealign = callFunction<
  { audioBase64: string; filename?: string },
  { words: any[]; duration: number }
>('realign');

export const callSplitSegments = callFunction<
  { segments: any[]; max_duration?: number; max_lines?: number; target_language: string },
  { segments: any[] }
>('splitSegments');

// YouTube functions
export const callYoutubeAuthUrl = callFunction<
  Record<string, never>,
  { auth_url: string }
>('youtubeAuthUrl');

export const callGenerateMetadata = callFunction<
  { subtitle_text: string; language: string },
  { title: string; description: string; hashtags: string[] }
>('youtubeGenerateMetadata');

export const callRefreshToken = callFunction<
  { channel_id: string },
  { success: boolean; message: string }
>('youtubeRefreshToken');
