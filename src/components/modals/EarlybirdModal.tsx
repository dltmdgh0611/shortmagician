import { useState, FormEvent } from "react";
import { Loader2 } from "lucide-react";

interface EarlybirdModalProps {
  isOpen: boolean;
  onSubmit: (code: string) => Promise<void>;
  onSkip: () => void;
  error: string | null;
  loading: boolean;
}

export function EarlybirdModal({
  isOpen,
  onSubmit,
  onSkip,
  error,
  loading,
}: EarlybirdModalProps) {
  const [code, setCode] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (code.trim().length === 0) return;
    onSubmit(code.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fadeIn">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative bg-white rounded-3xl w-full max-w-md mx-4 shadow-2xl animate-slideUp">
        {/* Header */}
        <div className="px-6 pt-6 pb-0">
          <h2 className="text-xl font-bold text-gray-900 text-center">
            얼리버드 회원이신가요?
          </h2>
          <p className="text-sm text-gray-500 text-center mt-1">
            6자리 시리얼 코드를 입력해주세요
          </p>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Error Banner */}
          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="시리얼 코드"
              maxLength={6}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-mono tracking-widest text-center text-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />

            <button
              type="submit"
              disabled={loading || code.trim().length === 0}
              className={`w-full flex items-center justify-center gap-2 py-3 font-semibold rounded-xl transition-all text-sm ${
                loading || code.trim().length === 0
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20"
              }`}
            >
              {loading && <Loader2 size={18} className="animate-spin" />}
              <span>등록하기</span>
            </button>
          </form>

          {/* Skip button — hidden during loading */}
          {!loading && (
            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={onSkip}
                className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                건너뛰기
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
