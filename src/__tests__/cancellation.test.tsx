import React from "react";
import { renderHook, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { PipelineProvider, usePipeline } from "../contexts/PipelineContext";
import { runPipeline } from "../lib/pipeline/pipelineService";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../lib/pipeline/pipelineService", () => ({
  runPipeline: vi.fn(),
}));

const mockRunPipeline = vi.mocked(runPipeline);

// ── Helper ───────────────────────────────────────────────────────────────────

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PipelineProvider>{children}</PipelineProvider>
);

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Pipeline cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cancelPipeline sets error message to cancellation text", () => {
    const { result } = renderHook(() => usePipeline(), { wrapper });

    act(() => {
      result.current.cancelPipeline();
    });

    expect(result.current.error).toBe("파이프라인이 취소되었습니다.");
    expect(result.current.isProcessing).toBe(false);
  });

  it("cancelPipeline aborts running pipeline via AbortController", async () => {
    let capturedSignal: AbortSignal | undefined;

    // Make runPipeline capture the signal and hang until aborted
    mockRunPipeline.mockImplementation(
      async (_videoPath, _targetLang, _onProgress, signal) => {
        capturedSignal = signal;
        // Simulate a long-running pipeline by returning a promise that resolves
        // only after abort
        return new Promise((resolve) => {
          signal?.addEventListener("abort", () => {
            resolve({
              projectId: "test",
              sourceLanguage: "ko",
              targetLanguage: "en",
              segments: [],
              originalVideoPath: "/tmp/video.mp4",
              status: "error" as const,
              error: "파이프라인이 취소되었습니다.",
            });
          });
        });
      },
    );

    const { result } = renderHook(() => usePipeline(), { wrapper });

    // Start the pipeline (don't await — it'll hang)
    let pipelinePromise: Promise<void>;
    await act(async () => {
      pipelinePromise = result.current.startPipeline("/tmp/video.mp4", "en");
    });

    // Pipeline should be processing
    expect(result.current.isProcessing).toBe(true);

    // Cancel it
    act(() => {
      result.current.cancelPipeline();
    });

    // The signal should have been aborted
    expect(capturedSignal?.aborted).toBe(true);

    // Wait for the pipeline promise to settle
    await act(async () => {
      await pipelinePromise!;
    });

    expect(result.current.isProcessing).toBe(false);
  });

  it("cancelPipeline when not processing is safe (no-op on abort)", () => {
    const { result } = renderHook(() => usePipeline(), { wrapper });

    // Should not throw even when no pipeline is running
    act(() => {
      result.current.cancelPipeline();
    });

    expect(result.current.error).toBe("파이프라인이 취소되었습니다.");
    expect(result.current.isProcessing).toBe(false);
  });

  it("startPipeline passes AbortSignal to runPipeline", async () => {
    mockRunPipeline.mockResolvedValue({
      projectId: "test",
      sourceLanguage: "ko",
      targetLanguage: "en",
      segments: [],
      originalVideoPath: "/tmp/video.mp4",
      status: "done",
    });

    const { result } = renderHook(() => usePipeline(), { wrapper });

    await act(async () => {
      await result.current.startPipeline("/tmp/video.mp4", "en");
    });

    // runPipeline should have been called with 5 args
    expect(mockRunPipeline).toHaveBeenCalledWith(
      "/tmp/video.mp4",
      "en",
      expect.any(Function),
      expect.any(AbortSignal),
      expect.any(Function),
    );
  });

  it("clearPipeline resets error after cancellation", () => {
    const { result } = renderHook(() => usePipeline(), { wrapper });

    act(() => {
      result.current.cancelPipeline();
    });
    expect(result.current.error).toBe("파이프라인이 취소되었습니다.");

    act(() => {
      result.current.clearPipeline();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.isProcessing).toBe(false);
  });
});
