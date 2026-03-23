import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../lib/pipeline/audioExtractor", () => ({
  extractAudio: vi.fn(),
}));

vi.mock("../lib/pipeline/videoComposer", () => ({
  mergeTtsAudio: vi.fn(),
}));

vi.mock("../lib/pipeline/cleanup", () => ({
  cleanupPipeline: vi.fn(() => Promise.resolve()),
}));

vi.mock("../lib/pipeline/segmentSplitter", () => ({
  splitLongSegments: vi.fn(() => []),
  createSubtitlesFromWords: vi.fn(),
}));

vi.mock("../lib/cloudFunctions", () => ({
  callTranscribe: vi.fn(),
  callTranslate: vi.fn(),
  callSynthesize: vi.fn(),
  callVoices: vi.fn(),
  callRealign: vi.fn(),
  callSplitSegments: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  readFile: vi.fn(() => Promise.resolve(new Uint8Array([1, 2, 3]))),
  writeFile: vi.fn(() => Promise.resolve()),
  exists: vi.fn(() => Promise.resolve(true)),
  mkdir: vi.fn(() => Promise.resolve()),
  BaseDirectory: { AppLocalData: 26 },
}));

vi.mock("@tauri-apps/api/path", () => ({
  appLocalDataDir: vi.fn(() =>
    Promise.resolve(
      "C:\\Users\\test\\AppData\\Local\\com.hvnsoft.shortmagician",
    ),
  ),
  join: vi.fn((...parts: string[]) => Promise.resolve(parts.join("\\"))),
  resolveResource: vi.fn(() =>
    Promise.resolve("C:\\Program Files\\shortmagician\\resources\\fonts"),
  ),
}));

import { runPipeline } from "../lib/pipeline/pipelineService";
import { extractAudio } from "../lib/pipeline/audioExtractor";
import { mergeTtsAudio } from "../lib/pipeline/videoComposer";
import { createSubtitlesFromWords } from "../lib/pipeline/segmentSplitter";
import {
  callTranscribe,
  callTranslate,
  callSynthesize,
  callVoices,
  callRealign,
} from "../lib/cloudFunctions";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const AUDIO_PATH =
  "C:\\Users\\test\\AppData\\Local\\com.hvnsoft.shortmagician\\pipeline\\audio.mp3";

const TRANSCRIBE_RESPONSE = {
  segments: [{ id: "1", start_time: 0, end_time: 1.5, text: "안녕하세요" }],
  detected_language: "ko",
};

const TRANSLATE_RESPONSE = {
  segments: [
    {
      id: "1",
      start_time: 0,
      end_time: 1.5,
      original_text: "안녕하세요",
      translated_text: "Hello",
    },
  ],
  source_language: "ko",
  target_language: "en",
};

const VOICES_RESPONSE = {
  voices: [
    {
      voice_id: "voice_1",
      name: "Default",
      language: "en",
      gender: "female",
    },
  ],
};

const SYNTHESIZE_RESPONSE = {
  audioBase64: "AQID",
};

const REALIGN_RESPONSE = {
  words: [{ word: "Hello", start: 0.0, end: 0.5 }],
  duration: 0.5,
};

const SUBTITLE_SEGMENTS = [
  {
    id: "1-0",
    startTime: 0,
    endTime: 0.5,
    originalText: "안녕하세요",
    translatedText: "Hello",
  },
];

const MERGED_PATH =
  "C:\\Users\\test\\AppData\\Local\\com.hvnsoft.shortmagician\\pipeline\\merged_tts.mp3";

// ── Tests ────────────────────────────────────────────────────────────────────

describe("runPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(extractAudio).mockResolvedValue(AUDIO_PATH);
    vi.mocked(callTranscribe).mockResolvedValue(TRANSCRIBE_RESPONSE);
    vi.mocked(callTranslate).mockResolvedValue(TRANSLATE_RESPONSE);
    vi.mocked(callVoices).mockResolvedValue(VOICES_RESPONSE);
    vi.mocked(callSynthesize).mockResolvedValue(SYNTHESIZE_RESPONSE);
    vi.mocked(callRealign).mockResolvedValue(REALIGN_RESPONSE);
    vi.mocked(createSubtitlesFromWords).mockReturnValue(SUBTITLE_SEGMENTS);
    vi.mocked(mergeTtsAudio).mockResolvedValue(MERGED_PATH);
  });

  it("executes all 6 steps in order", async () => {
    const steps: string[] = [];
    await runPipeline("C:\\videos\\test.mp4", "en", (p) => {
      steps.push(p.step);
    });

    expect(steps).toEqual([
      "extracting",
      "transcribing",
      "translating",
      "synthesizing",
      "realigning",
      "merging_tts",
    ]);
  });

  it("returns PipelineResult with done status on success", async () => {
    const result = await runPipeline("C:\\videos\\test.mp4", "en", vi.fn());

    expect(result.status).toBe("done");
    expect(result.mergedTtsPath).toBe(MERGED_PATH);
    expect(result.subtitleSegments).toBeDefined();
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].translatedText).toBe("Hello");
    expect(result.segments[0].voiceId).toBe("voice_1");
    expect(result.sourceLanguage).toBe("ko");
    expect(result.targetLanguage).toBe("en");
    expect(result.originalVideoPath).toBe("C:\\videos\\test.mp4");
  });

  it("returns error status on failure", async () => {
    vi.mocked(extractAudio).mockRejectedValueOnce(
      new Error("FFmpeg not found"),
    );

    const result = await runPipeline("C:\\videos\\test.mp4", "en", vi.fn());

    expect(result.status).toBe("error");
    expect(result.error).toBe("FFmpeg not found");
  });

  it("preserves partial results on mid-pipeline failure", async () => {
    // Use non-retryable error code to avoid retry delays
    vi.mocked(callTranslate).mockRejectedValue(
      Object.assign(new Error("Translation API error"), {
        code: "invalid-argument",
      }),
    );

    const result = await runPipeline("C:\\videos\\test.mp4", "en", vi.fn());

    expect(result.status).toBe("error");
    expect(result.sourceLanguage).toBe("ko");
    expect(result.targetLanguage).toBe("en");
    expect(result.originalVideoPath).toBe("C:\\videos\\test.mp4");
    expect(result.segments).toEqual([]);
    expect(result.error).toContain("Translation API error");
  });

  it("progress callback receives correct step names and messages", async () => {
    const progressCalls: { step: string; message: string }[] = [];
    await runPipeline("C:\\videos\\test.mp4", "en", (p) => {
      progressCalls.push({ step: p.step, message: p.message });
    });

    expect(progressCalls).toEqual([
      { step: "extracting", message: "음성을 추출하는 중..." },
      { step: "transcribing", message: "음성을 인식하는 중..." },
      { step: "translating", message: "번역하는 중..." },
      { step: "synthesizing", message: "AI 음성을 생성하는 중..." },
      { step: "realigning", message: "자막을 음성에 정렬하는 중..." },
      { step: "merging_tts", message: "음성 트랙을 병합하는 중..." },
    ]);
  });
});
