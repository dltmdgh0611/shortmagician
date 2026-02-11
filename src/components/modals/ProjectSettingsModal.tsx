import { useState, useEffect } from "react";
import { X, Clock, Globe, ArrowRight, Check } from "lucide-react";

interface ProjectSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (settings: { duration: number; languages: string[] }) => void;
}

interface Scene {
  id: number;
  text: string;
  duration: number;
}

const languages = [
  { code: "ko", name: "한국어", flag: "🇰🇷", default: true },
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "ja", name: "日本語", flag: "🇯🇵" },
  { code: "zh", name: "中文", flag: "🇨🇳" },
  { code: "es", name: "Español", flag: "🇪🇸" },
  { code: "vi", name: "Tiếng Việt", flag: "🇻🇳" },
  { code: "th", name: "ภาษาไทย", flag: "🇹🇭" },
  { code: "id", name: "Bahasa Indonesia", flag: "🇮🇩" },
];

export function ProjectSettingsModal({
  isOpen,
  onClose,
  onComplete,
}: ProjectSettingsModalProps) {
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(["ko"]);
  const [estimatedDuration, setEstimatedDuration] = useState(0);

  // Load scenes and calculate duration
  useEffect(() => {
    if (isOpen) {
      const savedScenes = sessionStorage.getItem("currentScenes");
      if (savedScenes) {
        const scenes: Scene[] = JSON.parse(savedScenes);
        const totalDuration = scenes.reduce((acc, s) => acc + s.duration, 0);
        setEstimatedDuration(totalDuration);
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleLanguage = (code: string) => {
    if (code === "ko") return; // 한국어는 필수
    setSelectedLanguages((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleComplete = () => {
    onComplete({
      duration: estimatedDuration,
      languages: selectedLanguages,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fadeIn">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-3xl w-full max-w-lg mx-4 shadow-2xl animate-slideUp">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900">프로젝트 설정</h2>
            <p className="text-sm text-gray-500">
              제작할 언어를 선택하세요
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
        <div className="p-6 space-y-6">
          {/* Estimated Duration Display */}
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center">
                <Clock size={24} className="text-white" />
              </div>
              <div>
                <p className="text-sm text-blue-600 font-medium">예상 영상 길이</p>
                <p className="text-2xl font-bold text-blue-700">{estimatedDuration}초</p>
              </div>
            </div>
          </div>

          {/* Language Selection */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Globe size={18} className="text-gray-500" />
              <span className="text-sm font-semibold text-gray-900">
                제작할 언어
              </span>
              <span className="text-xs text-gray-400">
                (선택한 언어별로 자동 번역)
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => toggleLanguage(lang.code)}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                    selectedLanguages.includes(lang.code)
                      ? "bg-blue-50 border-blue-500 text-gray-900"
                      : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                  } ${lang.default ? "ring-2 ring-blue-100" : ""}`}
                >
                  <span className="text-xl">{lang.flag}</span>
                  <span className="font-medium text-sm flex-1 text-left">
                    {lang.name}
                  </span>
                  {selectedLanguages.includes(lang.code) && (
                    <Check size={16} className="text-blue-500" />
                  )}
                  {lang.default && (
                    <span className="text-[10px] bg-blue-500 px-1.5 py-0.5 rounded text-white">
                      필수
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">선택된 언어</span>
              <span className="text-gray-900 font-semibold">
                {selectedLanguages.length}개
              </span>
            </div>
            <div className="flex items-center justify-between text-sm mt-2">
              <span className="text-gray-500">생성될 비디오</span>
              <span className="text-gray-900 font-semibold">
                {selectedLanguages.length}개
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleComplete}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-500/20"
          >
            <span>편집 시작하기</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
