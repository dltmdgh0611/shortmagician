export interface PipelineSegment {
  id: string;
  startTime: number;
  endTime: number;
  originalText: string;
  translatedText: string;
  ttsAudioUrl?: string;
  ttsAudioPath?: string;
  voiceId: string;
  voiceName: string;
}

export interface SubtitleSegment {
  id: string;
  startTime: number;
  endTime: number;
  originalText: string;
  translatedText: string;
}

export interface SubtitleStyle {
  // Position (percentage 0-100 of video container)
  x: number;
  y: number;
  width: number;
  height: number;
  // Font
  fontFamily: string;
  fontSize: number;      // Canvas units at 1920p height
  fontColor: string;     // Hex color
  bold: boolean;
  italic: boolean;
  // Outline
  outlineColor: string;  // Hex color
  outlineWidth: number;  // Canvas units
  // Shadow
  shadowColor: string;   // CSS color
  shadowBlur: number;    // Canvas units
  // Background
  backgroundColor: string; // 'transparent' or CSS color
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  x: 5,
  y: 72,
  width: 90,
  height: 18,
  fontFamily: 'Noto Sans CJK KR',
  fontSize: 80,
  fontColor: '#FFFFFF',
  bold: true,
  italic: false,
  outlineColor: '#000000',
  outlineWidth: 4,
  shadowColor: 'rgba(0,0,0,0.5)',
  shadowBlur: 2,
  backgroundColor: 'transparent',
};


export interface PipelineResult {
  projectId: string;
  sourceLanguage: string;
  targetLanguage: string;
  segments: PipelineSegment[];
  originalVideoPath: string;
  composedVideoPath?: string;
  mergedTtsPath?: string;
  subtitlePath?: string;
  subtitleSegments?: SubtitleSegment[];
  status: 'idle' | 'transcribing' | 'translating' | 'synthesizing' | 'composing' | 'done' | 'error';
  error?: string;
}

export interface VoiceOption {
  voiceId: string;
  name: string;
  language: string;
  gender: 'male' | 'female';
  previewUrl?: string;
}

export type SupportedLanguage = 'ko' | 'en' | 'ja' | 'zh' | 'es';


// ── Realignment (Post-TTS Whisper) ────────────────────────────────────────

export interface WordTimestamp {
  word: string;
  start: number;  // seconds relative to TTS audio start
  end: number;    // seconds relative to TTS audio start
}
