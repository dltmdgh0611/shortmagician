import { useState } from "react";
import { X, Globe, Check, ArrowRight, ArrowLeft, Mic } from "lucide-react";
import { SUPPORTED_LANGUAGES } from "../../lib/constants/languages";

interface ConvertLanguageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBack: () => void;
  onStart: (sourceLanguage: string, targetLanguages: string[]) => void;
  source: { type: "link" | "file"; value: string; fileName?: string };
}

export function ConvertLanguageModal({
  isOpen,
  onClose,
  onBack,
  onStart,
}: ConvertLanguageModalProps) {
  const [sourceLanguage, setSourceLanguage] = useState<string>("ko");
  const [targetLanguages, setTargetLanguages] = useState<string[]>([]);

  if (!isOpen) return null;

  const toggleTargetLanguage = (code: string) => {
    // 원본 언어와 같으면 선택 불가
    if (code === sourceLanguage) return;
    setTargetLanguages((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleSourceChange = (code: string) => {
    setSourceLanguage(code);
    // 원본 언어가 변경되면, 대상 언어 목록에서 해당 언어 제거
    setTargetLanguages((prev) => prev.filter((c) => c !== code));
  };

  const handleStart = () => {
    if (targetLanguages.length === 0) return;
    onStart(sourceLanguage, targetLanguages);
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
            <p className="text-sm text-gray-500">원본 언어와 번역할 언어를 선택하세요</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
          {/* Step 1: Source Language */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Mic size={18} className="text-emerald-500" />
              <span className="text-sm font-semibold text-gray-900">
                원본 영상 언어
              </span>
              <span className="text-xs text-gray-400">
                (영상의 현재 언어)
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {SUPPORTED_LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => handleSourceChange(lang.code)}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                    sourceLanguage === lang.code
                      ? "bg-emerald-50 border-emerald-500 text-gray-900"
                      : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                  }`}
                >
                  <span className="text-xl">{lang.flag}</span>
                  <span className="font-medium text-sm flex-1 text-left">
                    {lang.name}
                  </span>
                  {sourceLanguage === lang.code && (
                    <Check size={16} className="text-emerald-500" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-200" />
            <ArrowRight size={16} className="text-gray-300" />
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Step 2: Target Languages */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Globe size={18} className="text-blue-500" />
              <span className="text-sm font-semibold text-gray-900">
                번역할 언어
              </span>
              <span className="text-xs text-gray-400">
                (하나 이상 선택)
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {SUPPORTED_LANGUAGES.map((lang) => {
                const isSource = lang.code === sourceLanguage;
                const isSelected = targetLanguages.includes(lang.code);
                return (
                  <button
                    key={lang.code}
                    onClick={() => toggleTargetLanguage(lang.code)}
                    disabled={isSource}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                      isSource
                        ? "bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed"
                        : isSelected
                        ? "bg-blue-50 border-blue-500 text-gray-900"
                        : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    <span className={`text-xl ${isSource ? "opacity-40" : ""}`}>{lang.flag}</span>
                    <span className={`font-medium text-sm flex-1 text-left ${isSource ? "line-through" : ""}`}>
                      {lang.name}
                    </span>
                    {isSelected && !isSource && (
                      <Check size={16} className="text-blue-500" />
                    )}
                    {isSource && (
                      <span className="text-[10px] bg-gray-300 px-1.5 py-0.5 rounded text-white">
                        원본
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Summary */}
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">원본 언어</span>
              <span className="text-gray-900 font-semibold">
                {SUPPORTED_LANGUAGES.find((l) => l.code === sourceLanguage)?.name ?? sourceLanguage}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm mt-2">
              <span className="text-gray-500">번역 대상</span>
              <span className="text-gray-900 font-semibold">
                {targetLanguages.length > 0
                  ? targetLanguages
                      .map((code) => SUPPORTED_LANGUAGES.find((l) => l.code === code)?.name ?? code)
                      .join(", ")
                  : "선택 없음"}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm mt-2">
              <span className="text-gray-500">생성될 비디오</span>
              <span className="text-gray-900 font-semibold">
                {targetLanguages.length}개
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
              disabled={targetLanguages.length === 0}
              className={`flex items-center gap-2 px-5 py-2.5 font-semibold rounded-xl transition-all ${
                targetLanguages.length > 0
                  ? "bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white shadow-lg shadow-blue-500/20"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
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
