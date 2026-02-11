import { Check, Loader2, RefreshCw } from "lucide-react";
import { useMultiStepProgress } from "../../lib/useRealisticProgress";

interface ConvertLoadingModalProps {
  isOpen: boolean;
  onComplete: () => void;
  languages: string[];
}

const steps = [
  { label: "음성 인식중...", duration: 3000 },
  { label: "다국어로 변환중...", duration: 3800 },
  { label: "다국어 자막 생성중...", duration: 2700 },
];

const languageNames: Record<string, string> = {
  ko: "한국어",
  en: "English",
  ja: "日本語",
  zh: "中文",
  es: "Español",
  vi: "Tiếng Việt",
  th: "ภาษาไทย",
  id: "Bahasa Indonesia",
};

export function ConvertLoadingModal({
  isOpen,
  onComplete,
  languages,
}: ConvertLoadingModalProps) {
  const {
    currentStepIndex,
    stepProgress,
    totalProgress,
  } = useMultiStepProgress({
    steps,
    onAllComplete: onComplete,
    autoStart: isOpen,
  });

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
          </div>

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
            {steps.map((step, idx) => {
              const isCompleted = idx < currentStepIndex;
              const isCurrent = idx === currentStepIndex;

              return (
                <div
                  key={idx}
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
                      {step.label}
                    </span>
                    {/* 현재 단계 진행바 */}
                    {isCurrent && (
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

          {/* Tip */}
          <div className="mt-6 p-3 bg-gray-50 rounded-xl border border-gray-100">
            <p className="text-xs text-gray-500 text-center">
              변환이 완료되면 자동으로 에디터로 이동합니다
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
