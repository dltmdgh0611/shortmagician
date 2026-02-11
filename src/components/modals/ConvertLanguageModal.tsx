import { useState } from "react";
import { X, Globe, Check, ArrowRight, ArrowLeft } from "lucide-react";

interface ConvertLanguageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBack: () => void;
  onStart: (languages: string[]) => void;
  source: { type: "link" | "file"; value: string; fileName?: string };
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

export function ConvertLanguageModal({
  isOpen,
  onClose,
  onBack,
  onStart,
  source,
}: ConvertLanguageModalProps) {
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(["ko"]);

  if (!isOpen) return null;

  const toggleLanguage = (code: string) => {
    if (code === "ko") return; // 한국어는 필수
    setSelectedLanguages((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleStart = () => {
    onStart(selectedLanguages);
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
            <h2 className="font-bold text-gray-900">언어 선택</h2>
            <p className="text-sm text-gray-500">변환할 언어를 선택하세요</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Language Selection */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Globe size={18} className="text-gray-500" />
              <span className="text-sm font-semibold text-gray-900">
                변환할 언어
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
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft size={16} />
            <span>이전</span>
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleStart}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-500/20"
            >
              <span>변환 시작</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
