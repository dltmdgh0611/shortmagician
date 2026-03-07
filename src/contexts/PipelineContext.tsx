import React, { createContext, useContext, useRef, useState } from "react";
import { runPipeline } from "../lib/pipeline/pipelineService";
import type {
  PipelineResult,
  PipelineSegment,
  SubtitleSegment,
  SupportedLanguage,
} from "../lib/types/pipeline";
import type {
  PipelineStep,
  PipelineProgress,
  PipelineLogEntry,
} from "../lib/pipeline/pipelineService";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PipelineContextType {
  result: PipelineResult | null;
  isProcessing: boolean;
  currentStep: PipelineStep | null;
  progress: PipelineProgress | null;
  error: string | null;
  logs: PipelineLogEntry[];
  startPipeline: (videoPath: string, targetLang: SupportedLanguage) => Promise<void>;
  updateSegment: (segmentId: string, updates: Partial<PipelineSegment>) => void;
  updateSubtitleSegment: (parentSegId: string, subtitleIndex: number, updates: Partial<SubtitleSegment>) => void;
  clearPipeline: () => void;
  cancelPipeline: () => void;
  loadPipelineResult: (result: PipelineResult) => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const PipelineContext = createContext<PipelineContextType | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export const PipelineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState<PipelineStep | null>(null);
  const [progress, setProgress] = useState<PipelineProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<PipelineLogEntry[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const startPipeline = async (
    videoPath: string,
    targetLang: SupportedLanguage,
  ): Promise<void> => {
    console.log("%c[PipelineCtx] \uD83D\uDE80 Starting", "color: #4F46E5; font-weight: bold;", { videoPath, targetLang });
    setIsProcessing(true);
    setError(null);
    setCurrentStep(null);
    setProgress(null);
    setLogs([]);

    try {
      const controller = new AbortController();
      abortRef.current = controller;
      const pipelineResult = await runPipeline(videoPath, targetLang, (p) => {
        console.log("%c[PipelineCtx] \uD83D\uDCCA Progress", "color: #6366F1;", p.step, p.stepIndex + 1 + "/" + p.totalSteps);
        setCurrentStep(p.step);
        setProgress(p);
      }, controller.signal, (entry) => {
        setLogs((prev) => [...prev, entry]);
      });
      abortRef.current = null;
      setResult(pipelineResult);
      console.log("%c[PipelineCtx] \uD83D\uDCCB Result", "color: #059669; font-weight: bold;", pipelineResult.status);
      if (pipelineResult.status === "error") {
        setError(pipelineResult.error ?? "파이프라인 실행 중 오류가 발생했습니다.");
      }
    } catch (err: any) {
      setError(err.message ?? "파이프라인 실행 중 오류가 발생했습니다.");
      console.log("%c[PipelineCtx] \u274C Error", "color: #DC2626; font-weight: bold;", err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const updateSegment = (
    segmentId: string,
    updates: Partial<PipelineSegment>,
  ): void => {
    setResult((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        segments: prev.segments.map((seg) =>
          seg.id === segmentId ? { ...seg, ...updates } : seg,
        ),
      };
    });
  };

  const updateSubtitleSegment = (
    parentSegId: string,
    subtitleIndex: number,
    updates: Partial<SubtitleSegment>,
  ): void => {
    setResult((prev) => {
      if (!prev || !prev.subtitleSegments) return prev;
      let indexInGroup = 0;
      return {
        ...prev,
        subtitleSegments: prev.subtitleSegments.map((sub) => {
          if (sub.id === parentSegId) {
            if (indexInGroup === subtitleIndex) {
              indexInGroup++;
              return { ...sub, ...updates };
            }
            indexInGroup++;
          }
          return sub;
        }),
      };
    });
  };

  const clearPipeline = (): void => {
    setResult(null);
    setIsProcessing(false);
    setCurrentStep(null);
    setProgress(null);
    setError(null);
    setLogs([]);
  };

  const cancelPipeline = (): void => {
    console.log("%c[PipelineCtx] \uD83D\uDED1 Cancelled", "color: #F59E0B; font-weight: bold;");
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsProcessing(false);
    setError("파이프라인이 취소되었습니다.");
  };

  const loadPipelineResult = (loaded: PipelineResult): void => {
    setResult(loaded);
  };

  return (
    <PipelineContext.Provider
      value={{ result, isProcessing, currentStep, progress, error, logs, startPipeline, updateSegment, updateSubtitleSegment, clearPipeline, cancelPipeline, loadPipelineResult }}
    >
      {children}
    </PipelineContext.Provider>
  );
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export const usePipeline = (): PipelineContextType => {
  const context = useContext(PipelineContext);
  if (context === null) {
    throw new Error("usePipeline must be used within PipelineProvider");
  }
  return context;
};
