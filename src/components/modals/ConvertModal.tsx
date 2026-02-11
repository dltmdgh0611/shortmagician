import { useState, useRef, ChangeEvent, DragEvent } from "react";
import { X, Link, Upload, FileVideo, ArrowRight } from "lucide-react";

interface ConvertModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNext: (source: { type: "link" | "file"; value: string; fileName?: string }) => void;
}

type InputMode = "link" | "file";

export function ConvertModal({ isOpen, onClose, onNext }: ConvertModalProps) {
  const [mode, setMode] = useState<InputMode>("link");
  const [linkValue, setLinkValue] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.type.startsWith("video/") || file.type.startsWith("audio/"))) {
      setSelectedFile(file);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleNext = () => {
    if (mode === "link" && linkValue.trim()) {
      onNext({ type: "link", value: linkValue.trim() });
    } else if (mode === "file" && selectedFile) {
      onNext({ type: "file", value: URL.createObjectURL(selectedFile), fileName: selectedFile.name });
    }
  };

  const isValid = (mode === "link" && linkValue.trim()) || (mode === "file" && selectedFile);

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
            <h2 className="text-xl font-bold text-gray-900">프로젝트 변환</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              영상 링크 또는 파일을 입력하세요
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
        <div className="p-6 space-y-5">
          {/* Mode Toggle */}
          <div className="flex bg-gray-100 rounded-xl p-1">
            <button
              onClick={() => setMode("link")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                mode === "link"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Link size={16} />
              <span>링크 입력</span>
            </button>
            <button
              onClick={() => setMode("file")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                mode === "file"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Upload size={16} />
              <span>파일 업로드</span>
            </button>
          </div>

          {/* Link Input */}
          {mode === "link" && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                영상 URL
              </label>
              <input
                type="url"
                value={linkValue}
                onChange={(e) => setLinkValue(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
              <p className="text-xs text-gray-400">
                YouTube, TikTok, Instagram 등의 영상 링크를 지원합니다
              </p>
            </div>
          )}

          {/* File Upload */}
          {mode === "file" && (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                isDragging
                  ? "border-blue-400 bg-blue-50"
                  : selectedFile
                  ? "border-green-400 bg-green-50"
                  : "border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*,audio/*"
                onChange={handleFileChange}
                className="hidden"
              />
              
              {selectedFile ? (
                <div className="flex flex-col items-center gap-3 w-full">
                  {/* 비디오 미리보기 */}
                  <div className="w-full rounded-xl overflow-hidden bg-black aspect-video">
                    <video
                      src={URL.createObjectURL(selectedFile)}
                      className="w-full h-full object-contain"
                      controls
                      muted
                    />
                  </div>
                  <div className="flex items-center justify-between w-full">
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{selectedFile.name}</p>
                      <p className="text-xs text-gray-500">
                        {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(null);
                      }}
                      className="text-sm text-red-500 hover:text-red-600 font-medium"
                    >
                      파일 제거
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-gray-200 flex items-center justify-center">
                    <Upload size={28} className="text-gray-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-700">
                      파일을 드래그하거나 클릭하세요
                    </p>
                    <p className="text-sm text-gray-400 mt-1">
                      MP4, MOV, AVI 등 영상 파일 지원
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
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
            onClick={handleNext}
            disabled={!isValid}
            className={`flex items-center gap-2 px-5 py-2.5 font-semibold rounded-xl transition-all ${
              isValid
                ? "bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
          >
            <span>다음</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
