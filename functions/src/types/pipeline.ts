export interface TranscribeSegment {
  id: string;
  start_time: number;
  end_time: number;
  text: string;
}

export interface TranscribeResponse {
  segments: TranscribeSegment[];
  detected_language: string;
}

export interface TranslateRequest {
  segments: TranscribeSegment[];
  source_language: string;
  target_language: string;
}

export interface TranslatedSegment {
  id: string;
  start_time: number;
  end_time: number;
  original_text: string;
  translated_text: string;
}

export interface TranslateResponse {
  segments: TranslatedSegment[];
  source_language: string;
  target_language: string;
}

export interface SynthesizeRequest {
  text: string;
  voice_id: string;
  language: string;
  speed?: number; // default 1.0
}

// NOTE: SynthesizeResponse is { audioBase64: string } — NOT raw binary
// This is different from Python backend which returned raw bytes
export interface SynthesizeResponse {
  audioBase64: string;
}

export interface VoiceOption {
  voice_id: string;
  name: string;
  language: string;
  gender: string;
}

export interface VoiceListResponse {
  voices: VoiceOption[];
}

export interface SplitSegmentsRequest {
  segments: TranslatedSegment[];
  max_duration?: number; // default 2.0
  max_lines?: number; // default 3
  target_language: string;
}

export interface SplitSegmentsResponse {
  segments: TranslatedSegment[];
}

export interface WordTimestamp {
  word: string;
  start: number; // seconds
  end: number;   // seconds
}

export interface RealignResponse {
  words: WordTimestamp[];
  duration: number; // total audio duration
}

// For Cloud Function calls (base64 audio input)
export interface TranscribeRequest {
  audioBase64: string;
  filename: string;
  language?: string;
}

export interface RealignRequest {
  audioBase64: string;
  filename?: string;
}
