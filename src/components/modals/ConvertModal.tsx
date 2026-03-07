import { useState, useRef, useEffect, ChangeEvent, DragEvent } from "react";
import {
  X,
  Link,
  Upload,
  ArrowRight,
  Loader2,
  AlertCircle,
  Eye,
  Download,
} from "lucide-react";
import {
  type VideoInfo,
  fetchVideoInfo,
  formatDuration,
  formatViewCount,
  PLATFORM_CONFIG,
} from "../../lib/videoParser";
import { writeFile, BaseDirectory, exists, mkdir } from "@tauri-apps/plugin-fs";
import { appLocalDataDir, join } from "@tauri-apps/api/path";

interface ConvertModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNext: (source: {
    type: "link" | "file";
    value: string;
    fileName?: string;
    videoInfo?: VideoInfo;
  }) => void;
}

type InputMode = "link" | "file";

export function ConvertModal({ isOpen, onClose, onNext }: ConvertModalProps) {
  const [mode, setMode] = useState<InputMode>("link");
  const [linkValue, setLinkValue] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Video parse state
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState("");
  const [progressMessage, setProgressMessage] = useState("");

  // Cleanup blob URLs on unmount or when video changes
  useEffect(() => {
    return () => {
      if (videoInfo?.playbackUrl) {
        URL.revokeObjectURL(videoInfo.playbackUrl);
      }
    };
  }, [videoInfo]);

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

  const handleAnalyze = async () => {
    const url = linkValue.trim();
    if (!url) return;

    setIsAnalyzing(true);
    setAnalyzeError("");
    setVideoInfo(null);
    setProgressMessage("URL을 분석하는 중...");

    try {
      const info = await fetchVideoInfo(url, (_stage, message) => {
        setProgressMessage(message);
      });
      setVideoInfo(info);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "URL 분석에 실패했습니다. 올바른 링크인지 확인해주세요.";
      setAnalyzeError(message);
    } finally {
      setIsAnalyzing(false);
      setProgressMessage("");
    }
  };

  const handleClearVideo = () => {
    setVideoInfo(null);
    setAnalyzeError("");
    setLinkValue("");
  };

  const handleNext = async () => {
    if (mode === "link" && videoInfo) {
      onNext({ type: "link", value: videoInfo.localFilePath || linkValue.trim(), videoInfo });
    } else if (mode === "file" && selectedFile) {
      const dataDir = await appLocalDataDir();
      const uploadDir = await join(dataDir, "uploads");
      const dirExists = await exists("uploads", { baseDir: BaseDirectory.AppLocalData });
      if (!dirExists) await mkdir("uploads", { baseDir: BaseDirectory.AppLocalData, recursive: true });
      const arrayBuf = await selectedFile.arrayBuffer();
      const filePath = await join(uploadDir, selectedFile.name);
      await writeFile(filePath, new Uint8Array(arrayBuf));
      onNext({ type: "file", value: filePath, fileName: selectedFile.name });
    }
  };

  const isValid = (mode === "link" && videoInfo !== null) || (mode === "file" && selectedFile !== null);

  const platformCfg = videoInfo ? PLATFORM_CONFIG[videoInfo.platform] : null;

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

              {/* Input + Analyze button row */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="url"
                    value={linkValue}
                    onChange={(e) => {
                      setLinkValue(e.target.value);
                      if (videoInfo) {
                        setVideoInfo(null);
                      }
                      if (analyzeError) {
                        setAnalyzeError("");
                      }
                    }}
                    placeholder="https://www.youtube.com/watch?v=..."
                    disabled={isAnalyzing}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-60"
                  />
                  {isAnalyzing && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Loader2
                        size={18}
                        className="text-blue-500 animate-spin"
                      />
                    </div>
                  )}
                </div>
                <button
                  onClick={handleAnalyze}
                  disabled={!linkValue.trim() || isAnalyzing}
                  className={`flex items-center gap-1.5 px-4 py-3 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
                    linkValue.trim() && !isAnalyzing
                      ? "bg-blue-500 hover:bg-blue-600 text-white shadow-md shadow-blue-500/20"
                      : "bg-gray-100 text-gray-400 cursor-not-allowed"
                  }`}
                >
                  <Download size={15} />
                  <span>가져오기</span>
                </button>
              </div>

              {/* Progress message */}
              {isAnalyzing && progressMessage && (
                <div className="flex items-center gap-2.5 p-3 bg-blue-50 border border-blue-100 rounded-xl animate-fadeIn">
                  <Loader2
                    size={16}
                    className="text-blue-500 animate-spin shrink-0"
                  />
                  <p className="text-sm text-blue-600 font-medium">
                    {progressMessage}
                  </p>
                </div>
              )}

              {/* Error message */}
              {analyzeError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl animate-fadeIn">
                  <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-600">{analyzeError}</p>
                </div>
              )}

              {/* Video Preview Card */}
              {videoInfo && platformCfg && (
                <div className="bg-gray-50 border border-gray-200 rounded-2xl overflow-hidden animate-fadeIn">
                  {/* Video Player */}
                  <div className="relative aspect-video bg-black rounded-t-2xl overflow-hidden">
                    {videoInfo.playbackUrl ? (
                      <video
                        src={videoInfo.playbackUrl}
                        className="w-full h-full object-contain"
                        controls
                        poster={videoInfo.thumbnail_url}
                      />
                    ) : (
                      <img
                        src={videoInfo.thumbnail_url}
                        alt={videoInfo.title}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3.5 space-y-2.5">
                    {/* Platform badge + title + duration */}
                    <div className="flex items-start gap-2.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-white text-[11px] font-bold shrink-0 mt-0.5 ${platformCfg.color}`}
                      >
                        <span>{platformCfg.icon}</span>
                        <span>{platformCfg.label}</span>
                      </span>
                      <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug flex-1">
                        {videoInfo.title}
                      </h3>
                      {videoInfo.duration > 0 && (
                        <span className="text-xs text-gray-400 font-medium shrink-0 mt-0.5">
                          {formatDuration(videoInfo.duration)}
                        </span>
                      )}
                    </div>

                    {/* Author + views + clear */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-gray-500 min-w-0">
                        <span className="truncate">{videoInfo.author}</span>
                        {videoInfo.view_count !== null && (
                          <>
                            <span className="text-gray-300">&middot;</span>
                            <span className="flex items-center gap-1 shrink-0">
                              <Eye size={12} />
                              {formatViewCount(videoInfo.view_count)}
                            </span>
                          </>
                        )}
                      </div>
                      <button
                        onClick={handleClearVideo}
                        className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-full transition-colors shrink-0"
                        title="다시 입력"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Hint — only shown when no video loaded and no error */}
              {!videoInfo && !analyzeError && (
                <p className="text-xs text-gray-400">
                  YouTube, TikTok, Instagram 등의 영상 링크를 지원합니다
                </p>
              )}
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
