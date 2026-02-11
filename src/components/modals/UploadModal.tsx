import { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  Youtube,
  Check,
  Loader2,
  Plus,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  exportedLanguages: string[];
}

interface Channel {
  id: string;
  name: string;
  language: string;
  thumbnail: string;
  subscribers: string;
}

const dummyChannels: Channel[] = [
  {
    id: "1",
    name: "6090건강",
    language: "ko",
    thumbnail: "🇰🇷",
    subscribers: "1만",
  },
  {
    id: "2",
    name: "6090 Health",
    language: "en",
    thumbnail: "🇺🇸",
    subscribers: "5.6천",
  },
  {
    id: "3",
    name: "6090健康",
    language: "ja",
    thumbnail: "🇯🇵",
    subscribers: "5.6천",
  },
  {
    id: "4",
    name: "6090健康频道",
    language: "zh",
    thumbnail: "🇨🇳",
    subscribers: "5.6천",
  },
  {
    id: "5",
    name: "6090 Salud",
    language: "es",
    thumbnail: "🇪🇸",
    subscribers: "5.6천",
  },
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

const languageFlags: Record<string, string> = {
  ko: "🇰🇷",
  en: "🇺🇸",
  ja: "🇯🇵",
  zh: "🇨🇳",
  es: "🇪🇸",
  vi: "🇻🇳",
  th: "🇹🇭",
  id: "🇮🇩",
};

type UploadStatus = "idle" | "uploading" | "success" | "error";

interface UploadState {
  [langCode: string]: {
    channelId: string | null;
    status: UploadStatus;
    progress: number;
  };
}

// 역동적인 진행률 시뮬레이션 훅
function useRealisticUploadProgress(
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

export function UploadModal({
  isOpen,
  onClose,
  exportedLanguages,
}: UploadModalProps) {
  const [uploadState, setUploadState] = useState<UploadState>(() => {
    const initial: UploadState = {};
    exportedLanguages.forEach((lang) => {
      const defaultChannel = dummyChannels.find((c) => c.language === lang);
      initial[lang] = {
        channelId: defaultChannel?.id || null,
        status: "idle",
        progress: 0,
      };
    });
    return initial;
  });
  const [isUploading, setIsUploading] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [currentLangIndex, setCurrentLangIndex] = useState(-1);

  const currentLang = exportedLanguages[currentLangIndex];
  const isProcessingCurrent = currentLangIndex >= 0 && currentLangIndex < exportedLanguages.length;

  const handleSingleComplete = useCallback(() => {
    if (currentLangIndex >= 0 && currentLangIndex < exportedLanguages.length) {
      const lang = exportedLanguages[currentLangIndex];
      setUploadState((prev) => ({
        ...prev,
        [lang]: { ...prev[lang], status: "success", progress: 100 },
      }));

      const nextIndex = currentLangIndex + 1;
      if (nextIndex < exportedLanguages.length) {
        // 다음 언어가 채널이 선택되어 있는지 확인
        const nextLang = exportedLanguages[nextIndex];
        setUploadState((prev) => {
          if (prev[nextLang]?.channelId) {
            return {
              ...prev,
              [nextLang]: { ...prev[nextLang], status: "uploading", progress: 0 },
            };
          }
          return prev;
        });
        setCurrentLangIndex(nextIndex);
      } else {
        setIsUploading(false);
        setUploadComplete(true);
      }
    }
  }, [currentLangIndex, exportedLanguages]);

  const currentProgress = useRealisticUploadProgress(
    6000, // 언어당 약 6초
    isProcessingCurrent && uploadState[currentLang]?.channelId !== null,
    handleSingleComplete,
    currentLangIndex // 언어가 바뀔 때 리셋
  );

  // 현재 진행 중인 언어의 progress 업데이트
  useEffect(() => {
    if (isProcessingCurrent && currentLang && uploadState[currentLang]?.status === "uploading") {
      setUploadState((prev) => ({
        ...prev,
        [currentLang]: { ...prev[currentLang], progress: currentProgress },
      }));
    }
  }, [currentProgress, isProcessingCurrent, currentLang]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      const initial: UploadState = {};
      exportedLanguages.forEach((lang) => {
        const defaultChannel = dummyChannels.find((c) => c.language === lang);
        initial[lang] = {
          channelId: defaultChannel?.id || null,
          status: "idle",
          progress: 0,
        };
      });
      setUploadState(initial);
      setIsUploading(false);
      setUploadComplete(false);
      setCurrentLangIndex(-1);
    }
  }, [isOpen, exportedLanguages]);

  if (!isOpen) return null;

  const setChannelForLanguage = (langCode: string, channelId: string) => {
    setUploadState((prev) => ({
      ...prev,
      [langCode]: { ...prev[langCode], channelId },
    }));
  };

  const handleUpload = () => {
    setIsUploading(true);

    // 첫 번째 채널이 선택된 언어 찾기
    const firstLangWithChannel = exportedLanguages.findIndex(
      (lang) => uploadState[lang]?.channelId
    );

    if (firstLangWithChannel >= 0) {
      const lang = exportedLanguages[firstLangWithChannel];
      setUploadState((prev) => ({
        ...prev,
        [lang]: { ...prev[lang], status: "uploading", progress: 0 },
      }));
      setCurrentLangIndex(firstLangWithChannel);
    }
  };

  const allChannelsSelected = exportedLanguages.every(
    (lang) => uploadState[lang]?.channelId
  );

  const getChannelForLanguage = (langCode: string) => {
    const channelId = uploadState[langCode]?.channelId;
    return dummyChannels.find((c) => c.id === channelId);
  };

  const getAvailableChannels = (langCode: string) => {
    return dummyChannels.filter((c) => c.language === langCode);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fadeIn">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-3xl w-full max-w-2xl mx-4 shadow-2xl animate-slideUp max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="font-bold text-gray-900">YouTube 업로드</h2>
            <p className="text-sm text-gray-500">
              각 언어별로 채널을 선택하세요
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {!uploadComplete ? (
            <div className="space-y-4">
              {exportedLanguages.map((langCode) => {
                const channel = getChannelForLanguage(langCode);
                const availableChannels = getAvailableChannels(langCode);
                const state = uploadState[langCode];

                return (
                  <div
                    key={langCode}
                    className="bg-gray-50 rounded-2xl p-4 border border-gray-100"
                  >
                    {/* Language Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">
                          {languageFlags[langCode] || "🌐"}
                        </span>
                        <span className="font-semibold text-gray-900">
                          {languageNames[langCode]}
                        </span>
                      </div>

                      {/* Status */}
                      {state?.status === "uploading" && (
                        <div className="flex items-center gap-2 text-amber-600">
                          <Loader2 size={16} className="animate-spin" />
                          <span className="text-sm">{state.progress}%</span>
                        </div>
                      )}
                      {state?.status === "success" && (
                        <div className="flex items-center gap-1 text-emerald-600">
                          <CheckCircle2 size={16} />
                          <span className="text-sm font-medium">완료</span>
                        </div>
                      )}
                    </div>

                    {/* Channel Selection */}
                    {availableChannels.length > 0 ? (
                      <div className="space-y-2">
                        {availableChannels.map((ch) => (
                          <button
                            key={ch.id}
                            onClick={() =>
                              !isUploading &&
                              setChannelForLanguage(langCode, ch.id)
                            }
                            disabled={isUploading}
                            className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                              channel?.id === ch.id
                                ? "bg-red-50 border-red-500 text-gray-900"
                                : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                            } ${
                              isUploading ? "opacity-50 cursor-not-allowed" : ""
                            }`}
                          >
                            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xl">
                              {ch.thumbnail}
                            </div>
                            <div className="flex-1 text-left">
                              <p className="font-medium text-sm">{ch.name}</p>
                              <p className="text-xs text-gray-500">
                                구독자 {ch.subscribers}
                              </p>
                            </div>
                            {channel?.id === ch.id && (
                              <Check size={18} className="text-red-500" />
                            )}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <button className="w-full flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors">
                        <Plus size={18} />
                        <span>채널 연결하기</span>
                      </button>
                    )}

                    {/* Progress Bar */}
                    {state?.status === "uploading" && (
                      <div className="mt-3">
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className="bg-gradient-to-r from-red-500 to-orange-500 h-1.5 rounded-full transition-all duration-150"
                            style={{ width: `${state.progress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Upload Complete */
            <div className="py-8 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={32} className="text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                업로드 완료!
              </h3>
              <p className="text-gray-500 mb-6">
                {exportedLanguages.length}개 언어 버전이 성공적으로
                업로드되었습니다
              </p>

              <div className="space-y-3">
                {exportedLanguages.map((langCode) => {
                  const channel = getChannelForLanguage(langCode);
                  if (!channel) return null;

                  return (
                    <div
                      key={langCode}
                      className="flex items-center justify-between bg-gray-50 rounded-xl p-3 border border-gray-100"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{channel.thumbnail}</span>
                        <span className="text-gray-700 font-medium text-sm">
                          {channel.name}
                        </span>
                      </div>
                      <button className="flex items-center gap-1 text-sm text-blue-500 hover:text-blue-600 font-medium">
                        <span>YouTube에서 보기</span>
                        <ExternalLink size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          {!uploadComplete ? (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleUpload}
                disabled={!allChannelsSelected || isUploading}
                className={`flex items-center gap-2 px-5 py-2.5 font-semibold rounded-xl transition-all shadow-lg ${
                  allChannelsSelected && !isUploading
                    ? "bg-red-500 hover:bg-red-600 text-white shadow-red-500/20"
                    : "bg-gray-100 text-gray-400 cursor-not-allowed shadow-none"
                }`}
              >
                {isUploading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>업로드 중...</span>
                  </>
                ) : (
                  <>
                    <Youtube size={16} />
                    <span>업로드 시작</span>
                  </>
                )}
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl transition-all"
            >
              완료
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
