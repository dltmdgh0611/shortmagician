import React from "react";
import { renderHook, act } from "@testing-library/react";
import { PipelineProvider, usePipeline } from "../contexts/PipelineContext";
import { runPipeline } from "../lib/pipeline/pipelineService";
import { segmentToScene, sceneToSegment } from "../lib/pipeline/sceneAdapter";
import type { PipelineResult, PipelineSegment } from "../lib/types/pipeline";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../lib/pipeline/pipelineService", () => ({
  runPipeline: vi.fn(),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockSegment: PipelineSegment = {
  id: "seg-1",
  startTime: 0,
  endTime: 3,
  originalText: "안녕하세요",
  translatedText: "Hello",
  voiceId: "john",
  voiceName: "John",
};

const mockResult: PipelineResult = {
  projectId: "proj-1",
  sourceLanguage: "ko",
  targetLanguage: "en",
  segments: [mockSegment],
  originalVideoPath: "/tmp/video.mp4",
  status: "done",
};

// ── Helper ────────────────────────────────────────────────────────────────────

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PipelineProvider>{children}</PipelineProvider>
);

// ── PipelineContext tests ─────────────────────────────────────────────────────

describe("PipelineContext", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── Test 1 ───────────────────────────────────────────────────────────────────
  it("initial state: all fields null/false", () => {
    const { result } = renderHook(() => usePipeline(), { wrapper });

    expect(result.current.result).toBeNull();
    expect(result.current.isProcessing).toBe(false);
    expect(result.current.currentStep).toBeNull();
    expect(result.current.progress).toBeNull();
    expect(result.current.error).toBeNull();
  });

  // ── Test 2 ───────────────────────────────────────────────────────────────────
  it("startPipeline: isProcessing true while running, false after", async () => {
    let resolvePromise!: (value: PipelineResult) => void;
    vi.mocked(runPipeline).mockImplementation(
      () => new Promise((resolve) => { resolvePromise = resolve; }),
    );

    const { result } = renderHook(() => usePipeline(), { wrapper });

    act(() => {
      result.current.startPipeline("/video.mp4", "en");
    });

    expect(result.current.isProcessing).toBe(true);

    await act(async () => {
      resolvePromise(mockResult);
    });

    expect(result.current.isProcessing).toBe(false);
    expect(result.current.result).toEqual(mockResult);
  });

  // ── Test 3 ───────────────────────────────────────────────────────────────────
  it("clearPipeline: resets all state back to initial", async () => {
    vi.mocked(runPipeline).mockResolvedValue(mockResult);

    const { result } = renderHook(() => usePipeline(), { wrapper });

    await act(async () => {
      await result.current.startPipeline("/video.mp4", "en");
    });

    expect(result.current.result).not.toBeNull();

    act(() => {
      result.current.clearPipeline();
    });

    expect(result.current.result).toBeNull();
    expect(result.current.isProcessing).toBe(false);
    expect(result.current.currentStep).toBeNull();
    expect(result.current.progress).toBeNull();
    expect(result.current.error).toBeNull();
  });

  // ── Test 4 ───────────────────────────────────────────────────────────────────
  it("updateSegment: modifies translatedText of matching segment", async () => {
    vi.mocked(runPipeline).mockResolvedValue(mockResult);

    const { result } = renderHook(() => usePipeline(), { wrapper });

    await act(async () => {
      await result.current.startPipeline("/video.mp4", "en");
    });

    act(() => {
      result.current.updateSegment("seg-1", { translatedText: "Updated text" });
    });

    expect(result.current.result?.segments[0].translatedText).toBe("Updated text");
    expect(result.current.result?.segments[0].id).toBe("seg-1");
  });

  // ── Test 5 ───────────────────────────────────────────────────────────────────
  it("updateSegment: does nothing when result is null", () => {
    const { result } = renderHook(() => usePipeline(), { wrapper });

    act(() => {
      result.current.updateSegment("seg-1", { translatedText: "Should not throw" });
    });

    expect(result.current.result).toBeNull();
  });

  // ── Test 6 ───────────────────────────────────────────────────────────────────
  it("startPipeline: onProgress callback updates currentStep and progress", async () => {
    vi.mocked(runPipeline).mockImplementation((_videoPath, _targetLang, onProgress) => {
      onProgress({ step: "transcribing", stepIndex: 1, totalSteps: 6, message: "인식 중..." });
      return Promise.resolve(mockResult);
    });

    const { result } = renderHook(() => usePipeline(), { wrapper });

    await act(async () => {
      await result.current.startPipeline("/video.mp4", "en");
    });

    expect(result.current.currentStep).toBe("transcribing");
    expect(result.current.progress).toEqual({
      step: "transcribing",
      stepIndex: 1,
      totalSteps: 6,
      message: "인식 중...",
    });
  });

  // ── Test 7 ───────────────────────────────────────────────────────────────────
  it("startPipeline: error status in result sets error field", async () => {
    const errorResult: PipelineResult = {
      ...mockResult,
      status: "error",
      error: "파이프라인 오류",
    };
    vi.mocked(runPipeline).mockResolvedValue(errorResult);

    const { result } = renderHook(() => usePipeline(), { wrapper });

    await act(async () => {
      await result.current.startPipeline("/video.mp4", "en");
    });

    expect(result.current.error).toBe("파이프라인 오류");
    expect(result.current.isProcessing).toBe(false);
  });

  // ── Test 8 ───────────────────────────────────────────────────────────────────
  it("startPipeline: thrown exception sets error and clears isProcessing", async () => {
    vi.mocked(runPipeline).mockRejectedValue(new Error("Network failure"));

    const { result } = renderHook(() => usePipeline(), { wrapper });

    await act(async () => {
      await result.current.startPipeline("/video.mp4", "en");
    });

    expect(result.current.error).toBe("Network failure");
    expect(result.current.isProcessing).toBe(false);
  });

  // ── Test 9 ───────────────────────────────────────────────────────────────────
  it("usePipeline outside PipelineProvider throws descriptive error", () => {
    expect(() => {
      renderHook(() => usePipeline());
    }).toThrow("usePipeline must be used within PipelineProvider");
  });
});

// ── sceneAdapter tests ────────────────────────────────────────────────────────

describe("sceneAdapter", () => {
  // ── Test 1 ───────────────────────────────────────────────────────────────────
  it("segmentToScene: id equals provided index", () => {
    const scene = segmentToScene(mockSegment, 5);
    expect(scene.id).toBe(5);
  });

  // ── Test 2 ───────────────────────────────────────────────────────────────────
  it("segmentToScene: text equals translatedText", () => {
    const scene = segmentToScene(mockSegment, 0);
    expect(scene.text).toBe("Hello");
  });

  // ── Test 3 ───────────────────────────────────────────────────────────────────
  it("segmentToScene: duration is Math.round(endTime - startTime)", () => {
    const seg: PipelineSegment = { ...mockSegment, startTime: 1.2, endTime: 4.9 };
    const scene = segmentToScene(seg, 0);
    expect(scene.duration).toBe(4); // Math.round(3.7)
  });

  // ── Test 4 ───────────────────────────────────────────────────────────────────
  it("segmentToScene: integer times produce exact duration", () => {
    const scene = segmentToScene(mockSegment, 0); // endTime=3, startTime=0
    expect(scene.duration).toBe(3);
  });

  // ── Test 5 ───────────────────────────────────────────────────────────────────
  it("sceneToSegment: translatedText updated from scene.text", () => {
    const scene = { id: 0, text: "Modified text", duration: 3 };
    const updated = sceneToSegment(scene, mockSegment);
    expect(updated.translatedText).toBe("Modified text");
  });

  // ── Test 6 ───────────────────────────────────────────────────────────────────
  it("sceneToSegment: all other segment fields preserved", () => {
    const scene = { id: 0, text: "New text", duration: 3 };
    const updated = sceneToSegment(scene, mockSegment);
    expect(updated.id).toBe("seg-1");
    expect(updated.originalText).toBe("안녕하세요");
    expect(updated.voiceId).toBe("john");
    expect(updated.voiceName).toBe("John");
    expect(updated.startTime).toBe(0);
    expect(updated.endTime).toBe(3);
  });

  // ── Test 7 ───────────────────────────────────────────────────────────────────
  it("sceneToSegment: does not mutate original segment", () => {
    const scene = { id: 0, text: "Changed", duration: 3 };
    const original = { ...mockSegment };
    sceneToSegment(scene, mockSegment);
    expect(mockSegment.translatedText).toBe(original.translatedText);
  });
});
