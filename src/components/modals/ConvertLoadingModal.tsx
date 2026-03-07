import { useState, useRef, useEffect } from "react";
import { Check, Loader2, RefreshCw, X } from "lucide-react";
import { SUPPORTED_LANGUAGES } from "../../lib/constants/languages";
import { useMultiStepProgress } from "../../lib/useRealisticProgress";
import type {
  PipelineProgress,
  PipelineStep,
  PipelineLogEntry,
} from "../../lib/pipeline/pipelineService";

// ── Step label map ────────────────────────────────────────────────────────────

const STEP_LABELS: Record<PipelineStep, string> = {
  extracting: "음성을 추출하는 중...",
  transcribing: "음성을 인식하는 중...",
  translating: "번역하는 중...",
  synthesizing: "AI 음성을 생성하는 중...",
  realigning: "자막을 음성에 정렬하는 중...",
  merging_tts: "음성 트랙을 병합하는 중...",
};

const PIPELINE_STEPS: PipelineStep[] = [
  "extracting",
  "transcribing",
  "translating",
  "synthesizing",
  "realigning",
  "merging_tts",
];

// ── Fake steps for fallback (no pipelineProgress) ────────────────────────────

const FAKE_STEPS = PIPELINE_STEPS.map((step, idx) => ({
  label: STEP_LABELS[step],
  duration: [3000, 3800, 2700, 4000, 2500, 2500][idx],
}));

// ── Language name lookup ──────────────────────────────────────────────────────

const languageNames: Record<string, string> = {};
SUPPORTED_LANGUAGES.forEach((lang) => {
  languageNames[lang.code] = lang.name;
});

// ── Props ─────────────────────────────────────────────────────────────────────

interface ConvertLoadingModalProps {
  isOpen: boolean;
  onComplete: () => void;
  onCancel?: () => void;
  languages: string[];
  pipelineProgress?: PipelineProgress;
  error?: string;
  logs?: PipelineLogEntry[];
  onRetry?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ConvertLoadingModal({
  isOpen,
  onComplete: _onComplete,
  onCancel,
  languages,
  pipelineProgress,
  error,
  onRetry,
  logs,
}: ConvertLoadingModalProps) {
  const [showLogs, setShowLogs] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showLogs && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, showLogs]);
  const isRealProgress = pipelineProgress !== undefined;

  const {
    currentStepIndex: fakeStepIndex,
    stepProgress,
    totalProgress: fakeTotalProgress,
  } = useMultiStepProgress({
    steps: FAKE_STEPS,
  // onAllComplete intentionally omitted: navigation is handled by Home.tsx useEffect
    autoStart: isOpen && !isRealProgress,
  });

  // Resolve values: real pipeline progress takes priority over fake animation
  const currentStepIndex = isRealProgress
    ? pipelineProgress.stepIndex
    : fakeStepIndex;

  const totalSteps = isRealProgress
    ? pipelineProgress.totalSteps
    : PIPELINE_STEPS.length;

  const totalProgress = isRealProgress
    ? Math.round((pipelineProgress.stepIndex / pipelineProgress.totalSteps) * 100)
    : fakeTotalProgress;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fadeIn">
      {/* Backdrop - No click to close during loading */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative bg-white rounded-3xl w-full max-w-md mx-4 shadow-2xl animate-slideUp overflow-hidden">
        {/* Animated Background Gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 opacity-50" />

        {/* Content */}
        <div className="relative p-8">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                <RefreshCw size={36} className="text-white animate-spin" style={{ animationDuration: '2s' }} />
              </div>
            </div>
          </div>

          {/* Title */}
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              쇼츠 변환 중
            </h2>
            <p className="text-sm text-gray-500">
              {languages.map((l) => languageNames[l] || l).join(", ")} 버전을 생성하고 있습니다
            </p>
            <p className="text-xs text-gray-400 mt-1">
              단계 {currentStepIndex + 1} / {totalSteps}
            </p>
          </div>

          {/* Error state */}
          {error ? (
            <div className="mb-6 p-4 bg-red-50 rounded-xl border border-red-100">
              <p className="text-sm text-red-600 text-center mb-3">{error}</p>
              {onRetry && (
                <div className="flex justify-center">
                  <button
                    onClick={onRetry}
                    className="px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-xl hover:bg-red-600 transition-colors"
                  >
                    다시 시도
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Progress Bar */}
              <div className="mb-6">
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-150"
                    style={{ width: `${totalProgress}%` }}
                  />
                </div>
                <div className="flex justify-between mt-2">
                  <span className="text-xs text-gray-400">진행률</span>
                  <span className="text-xs font-semibold text-gray-600">
                    {totalProgress}%
                  </span>
                </div>
              </div>

              {/* Steps */}
              <div className="space-y-2">
                {PIPELINE_STEPS.map((stepKey, idx) => {
                  const isCompleted = idx < currentStepIndex;
                  const isCurrent = idx === currentStepIndex;

                  return (
                    <div
                      key={stepKey}
                      className={`flex items-center gap-3 py-2.5 px-3 rounded-xl transition-all ${
                        isCompleted
                          ? "bg-green-50"
                          : isCurrent
                          ? "bg-blue-50"
                          : "bg-gray-50"
                      }`}
                    >
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all ${
                          isCompleted
                            ? "bg-green-500"
                            : isCurrent
                            ? "bg-blue-500"
                            : "bg-gray-200"
                        }`}
                      >
                        {isCompleted ? (
                          <Check size={14} className="text-white" />
                        ) : isCurrent ? (
                          <Loader2 size={14} className="text-white animate-spin" />
                        ) : (
                          <span className="text-xs text-gray-400">{idx + 1}</span>
                        )}
                      </div>
                      <div className="flex-1">
                        <span
                          className={`text-sm font-medium transition-colors ${
                            isCompleted
                              ? "text-green-700"
                              : isCurrent
                              ? "text-blue-700"
                              : "text-gray-400"
                          }`}
                        >
                          {STEP_LABELS[stepKey]}
                        </span>
                        {/* 현재 단계 진행바 (fake mode only) */}
                        {isCurrent && !isRealProgress && (
                          <div className="mt-1.5 h-1 bg-blue-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-400 transition-all duration-150"
                              style={{ width: `${stepProgress}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}


          {/* Log Panel */}
          {logs && logs.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setShowLogs(!showLogs)}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors font-medium"
              >
                {showLogs ? "로그 숨기기 ▲" : "로그 보기 ▼"}
              </button>
              {showLogs && (
                <div className="mt-2 bg-gray-900 rounded-xl p-3 max-h-40 overflow-y-auto font-mono text-xs">
                  {logs.map((entry, idx) => (
                    <div key={idx} className="flex gap-2 py-0.5">
                      <span className="text-gray-500 shrink-0">
                        {new Date(entry.timestamp).toLocaleTimeString("ko-KR")}
                      </span>
                      <span
                        className={
                          entry.level === "success"
                            ? "text-green-400"
                            : entry.level === "error"
                            ? "text-red-400"
                            : entry.level === "detail"
                            ? "text-gray-400"
                            : "text-gray-300"
                        }
                      >
                        {entry.message}
                      </span>
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              )}
            </div>
          )}

          {/* Tip + Cancel */}
          <div className="mt-6 flex items-center justify-between gap-3">
            <p className="text-xs text-gray-400 flex-1">
              변환이 완료되면 자동으로 에디터로 이동합니다
            </p>
            {onCancel && !error && (
              <button
                onClick={onCancel}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              >
                <X size={14} />
                <span>취소</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
