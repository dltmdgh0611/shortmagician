import { useState, useEffect, useRef, useCallback } from "react";
import { X, Loader2, CheckCircle2, Video } from "lucide-react";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExportComplete: () => void;
  languages: string[];
}

const languageData: Record<string, { name: string; flag: string }> = {
  ko: { name: "한국어", flag: "🇰🇷" },
  en: { name: "English", flag: "🇺🇸" },
  ja: { name: "日本語", flag: "🇯🇵" },
  zh: { name: "中文", flag: "🇨🇳" },
  es: { name: "Español", flag: "🇪🇸" },
  vi: { name: "Tiếng Việt", flag: "🇻🇳" },
  th: { name: "ภาษาไทย", flag: "🇹🇭" },
  id: { name: "Bahasa Indonesia", flag: "🇮🇩" },
};

type ExportStatus = "pending" | "processing" | "completed";

interface LanguageExportState {
  status: ExportStatus;
  progress: number;
}

// 역동적인 진행률 시뮬레이션
function useRealisticSingleProgress(
  duration: number,
  isActive: boolean,
  onComplete: () => void,
  resetKey: number // 언어가 바뀔 때 리셋하기 위한 키
) {
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<number | null>(null);
  const currentProgressRef = useRef(0);
  const hasCompletedRef = useRef(false);

  // resetKey가 바뀌면 progress 초기화
  useEffect(() => {
    setProgress(0);
    currentProgressRef.current = 0;
    hasCompletedRef.current = false;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [resetKey]);

  useEffect(() => {
    if (!isActive) {
      setProgress(0);
      currentProgressRef.current = 0;
      hasCompletedRef.current = false;
      return;
    }

    // 새로 시작할 때 초기화
    setProgress(0);
    currentProgressRef.current = 0;
    hasCompletedRef.current = false;

    const intervalMs = 80;
    const baseIncrement = 100 / (duration / intervalMs);

    intervalRef.current = window.setInterval(() => {
      const rand = Math.random();
      let speedFactor: number;

      if (rand < 0.08) {
        speedFactor = 0;
      } else if (rand < 0.18) {
        speedFactor = 0.05 + Math.random() * 0.15;
      } else if (rand < 0.35) {
        speedFactor = 0.2 + Math.random() * 0.4;
      } else if (rand < 0.75) {
        speedFactor = 0.6 + Math.random() * 0.8;
      } else if (rand < 0.92) {
        speedFactor = 1.4 + Math.random() * 1.0;
      } else {
        speedFactor = 2.5 + Math.random() * 1.5;
      }

      currentProgressRef.current += baseIncrement * speedFactor;

      if (currentProgressRef.current >= 100 && !hasCompletedRef.current) {
        hasCompletedRef.current = true;
        setProgress(100);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        setTimeout(onComplete, 150);
      } else if (!hasCompletedRef.current) {
        setProgress(Math.round(currentProgressRef.current));
      }
    }, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive, duration, onComplete, resetKey]);

  return progress;
}

export function ExportModal({
  isOpen,
  onClose,
  onExportComplete,
  languages,
}: ExportModalProps) {
  const [exportStates, setExportStates] = useState<Record<string, LanguageExportState>>({});
  const [allCompleted, setAllCompleted] = useState(false);
  const [currentLangIndex, setCurrentLangIndex] = useState(-1);
  const isExportingRef = useRef(false);

  const currentLang = languages[currentLangIndex];
  const isProcessing = currentLangIndex >= 0 && currentLangIndex < languages.length;

  const handleSingleComplete = useCallback(() => {
    if (currentLangIndex >= 0 && currentLangIndex < languages.length) {
      const lang = languages[currentLangIndex];
      setExportStates((prev) => ({
        ...prev,
        [lang]: { status: "completed", progress: 100 },
      }));

      const nextIndex = currentLangIndex + 1;
      if (nextIndex < languages.length) {
        setExportStates((prev) => ({
          ...prev,
          [languages[nextIndex]]: { status: "processing", progress: 0 },
        }));
        setCurrentLangIndex(nextIndex);
      } else {
        setAllCompleted(true);
        isExportingRef.current = false;
      }
    }
  }, [currentLangIndex, languages]);

  const currentProgress = useRealisticSingleProgress(
    5000, // 언어당 약 5초
    isProcessing && currentLang !== undefined,
    handleSingleComplete,
    currentLangIndex // 언어가 바뀔 때 리셋
  );

  // 현재 진행 중인 언어의 progress 업데이트
  useEffect(() => {
    if (isProcessing && currentLang) {
      setExportStates((prev) => ({
        ...prev,
        [currentLang]: { status: "processing", progress: currentProgress },
      }));
    }
  }, [currentProgress, isProcessing, currentLang]);

  // Initialize export states when modal opens
  useEffect(() => {
    if (isOpen && !isExportingRef.current) {
      const initial: Record<string, LanguageExportState> = {};
      languages.forEach((lang) => {
        initial[lang] = { status: "pending", progress: 0 };
      });
      setExportStates(initial);
      setAllCompleted(false);
      setCurrentLangIndex(-1);
      isExportingRef.current = true;

      // Auto-start export
      setTimeout(() => {
        if (languages.length > 0) {
          setExportStates((prev) => ({
            ...prev,
            [languages[0]]: { status: "processing", progress: 0 },
          }));
          setCurrentLangIndex(0);
        }
      }, 500);
    }
  }, [isOpen, languages]);

  // Reset when modal closes
  useEffect(() => {
    if (!isOpen) {
      isExportingRef.current = false;
      setCurrentLangIndex(-1);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleComplete = () => {
    onExportComplete();
  };

  const completedCount = Object.values(exportStates).filter(
    (s) => s.status === "completed"
  ).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fadeIn">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={allCompleted ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-3xl w-full max-w-lg mx-4 shadow-2xl animate-slideUp">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900">비디오 생성 중</h2>
            <p className="text-sm text-gray-500">
              {allCompleted
                ? "모든 비디오가 생성되었습니다!"
                : `${languages.length}개 언어 비디오 생성 중...`}
            </p>
          </div>
          {allCompleted && (
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Progress Summary */}
          <div className="flex items-center justify-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
              {allCompleted ? (
                <CheckCircle2 size={32} className="text-emerald-500" />
              ) : (
                <Loader2 size={32} className="text-blue-500 animate-spin" />
              )}
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {completedCount} / {languages.length}
              </p>
              <p className="text-sm text-gray-500">비디오 완료</p>
            </div>
          </div>

          {/* Language Progress List */}
          <div className="space-y-3">
            {languages.map((lang) => {
              const state = exportStates[lang] || { status: "pending", progress: 0 };
              const langInfo = languageData[lang];

              return (
                <div
                  key={lang}
                  className="bg-gray-50 rounded-xl p-4 border border-gray-100"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{langInfo?.flag}</span>
                      <span className="font-medium text-gray-900">
                        {langInfo?.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {state.status === "pending" && (
                        <span className="text-xs text-gray-400">대기 중</span>
                      )}
                      {state.status === "processing" && (
                        <div className="flex items-center gap-2 text-blue-600">
                          <Loader2 size={14} className="animate-spin" />
                          <span className="text-xs font-medium">
                            {state.progress}%
                          </span>
                        </div>
                      )}
                      {state.status === "completed" && (
                        <div className="flex items-center gap-1 text-emerald-600">
                          <CheckCircle2 size={16} />
                          <span className="text-xs font-medium">완료</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-150 ${
                        state.status === "completed"
                          ? "bg-emerald-500"
                          : "bg-blue-500"
                      }`}
                      style={{ width: `${state.progress}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        {allCompleted && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              닫기
            </button>
            <button
              onClick={handleComplete}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-500/20"
            >
              <Video size={16} />
              <span>YouTube에 업로드</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
