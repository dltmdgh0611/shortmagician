import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../lib/pipeline/audioExtractor", () => ({
  extractAudio: vi.fn(),
}));

vi.mock("../lib/pipeline/subtitleGenerator", () => ({
  generateSubtitles: vi.fn(),
}));

vi.mock("../lib/pipeline/videoComposer", () => ({
  composeVideo: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  api: { post: vi.fn(), get: vi.fn() },
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
  import { api } from "../lib/api";
    import { extractAudio } from "../lib/pipeline/audioExtractor";
  import { generateSubtitles } from "../lib/pipeline/subtitleGenerator";
import { composeVideo } from "../lib/pipeline/videoComposer";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const AUDIO_PATH =
  "C:\\Users\\test\\AppData\\Local\\com.hvnsoft.shortmagician\\pipeline\\audio.mp3";

  const TRANSCRIBE_RESPONSE = {
  data: {
    segments: [{ id: "1", start_time: 0, end_time: 1.5, text: "안녕하세요" }],
    detected_language: "ko",
  },
    };

const TRANSLATE_RESPONSE = {
  data: {
    segments: [
      {
        id: "1",
        start_time: 0,
        end_time: 1.5,
        original_text: "안녕하세요",
        translated_text: "Hello",
      },
    ],
  },
    };

// realign returns word-level timestamps for subtitle alignment
const REALIGN_RESPONSE = {
  data: {
    words: [
      { word: "Hello", start: 0.0, end: 0.5 },
    ],
    duration: 0.5,
  },
};

const SYNTHESIZE_RESPONSE = {
  data: new ArrayBuffer(100),
};

const VOICES_RESPONSE = {
  data: {
    voices: [
      {
        voice_id: "voice_1",
        name: "Default",
        language: "en",
        gender: "female",
      },
    ],
  },
    };

const SUBTITLE_PATH =
  "C:\\Users\\test\\AppData\\Local\\com.hvnsoft.shortmagician\\pipeline\\subtitles.ass";
const COMPOSED_PATH =
  "C:\\Users\\test\\AppData\\Local\\com.hvnsoft.shortmagician\\pipeline\\composed.mp4";

  // ── Tests ────────────────────────────────────────────────────────────────────

describe("runPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(extractAudio).mockResolvedValue(AUDIO_PATH);

    vi.mocked(api.post)
      .mockResolvedValueOnce(TRANSCRIBE_RESPONSE)  // POST /transcribe
      .mockResolvedValueOnce(TRANSLATE_RESPONSE)   // POST /translate
      .mockResolvedValueOnce(SYNTHESIZE_RESPONSE)  // POST /synthesize
      .mockResolvedValueOnce(REALIGN_RESPONSE);    // POST /realign

    vi.mocked(api.get).mockResolvedValue(VOICES_RESPONSE);

    vi.mocked(generateSubtitles).mockResolvedValue(SUBTITLE_PATH);
    vi.mocked(composeVideo).mockResolvedValue(COMPOSED_PATH);
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
      "composing",
    ]);
  });

  it("returns PipelineResult with done status on success", async () => {
    const result = await runPipeline("C:\\videos\\test.mp4", "en", vi.fn());

    expect(result.status).toBe("done");
    expect(result.composedVideoPath).toBe(COMPOSED_PATH);
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
    vi.mocked(api.post).mockReset();
    vi.mocked(api.post)
      .mockResolvedValueOnce(TRANSCRIBE_RESPONSE)
      .mockRejectedValueOnce(Object.assign(new Error("Translation API error"), { response: { status: 500, data: { detail: "Translation API error" } } }));

    const result = await runPipeline("C:\\videos\\test.mp4", "en", vi.fn());

    expect(result.status).toBe("error");
    expect(result.sourceLanguage).toBe("ko");
    expect(result.targetLanguage).toBe("en");
    expect(result.originalVideoPath).toBe("C:\\videos\\test.mp4");
    expect(result.segments).toEqual([]);
    expect(result.error).toBe("[500] Translation API error");
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
      { step: "composing", message: "영상을 합성하는 중..." },
    ]);
  });
});
