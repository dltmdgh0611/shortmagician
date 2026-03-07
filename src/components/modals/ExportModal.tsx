import { useState, useEffect, useRef } from "react";
import { X, Loader2, CheckCircle2, FolderOpen, AlertCircle } from "lucide-react";
import { exportVideo } from "../../lib/pipeline/exportService";
import type { SubtitleSegment, SubtitleStyle } from "../../lib/types/pipeline";
import type { BlurRegion } from "../../pages/ShortsEditor";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalVideoPath?: string;
  mergedTtsPath?: string;
  subtitleSegments?: SubtitleSegment[];
  subtitleStyle?: SubtitleStyle;
  blurRegion?: BlurRegion;
}

export function ExportModal({
  isOpen,
  onClose,
  originalVideoPath,
  mergedTtsPath,
  subtitleSegments,
  subtitleStyle,
  blurRegion,
}: ExportModalProps) {
  const [status, setStatus] = useState<"idle" | "exporting" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [outputPath, setOutputPath] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const isExportingRef = useRef(false);

  // Auto-start export when modal opens
  useEffect(() => {
    if (!isOpen || isExportingRef.current) return;

    if (!originalVideoPath || !mergedTtsPath || !subtitleSegments || !subtitleStyle) {
      setStatus("error");
      setErrorMsg("변환된 영상이 없습니다. 먼저 영상을 변환해주세요.");
      return;
    }

    isExportingRef.current = true;
    setStatus("exporting");
    setProgress(0);
    setMessage("내보내기 준비 중...");

    const customDir = localStorage.getItem("shortmagician_export_dir") || undefined;

    exportVideo({
      originalVideoPath,
      mergedTtsPath,
      subtitleSegments,
      subtitleStyle,
      blurRegion: blurRegion?.enabled ? blurRegion : undefined,
      outputDir: customDir,
      onProgress: (pct, msg) => {
        setProgress(pct);
        setMessage(msg);
      },
    })
    .then((path) => {
      setStatus("done");
      setOutputPath(path);
      setProgress(100);
      setMessage("내보내기 완료!");
    })
      .catch((err: Error) => {
        setStatus("error");
        setErrorMsg(err.message || "내보내기 중 오류가 발생했습니다.");
      })
      .finally(() => {
        isExportingRef.current = false;
      });
  }, [isOpen, originalVideoPath, mergedTtsPath, subtitleSegments, subtitleStyle, blurRegion]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setStatus("idle");
      setProgress(0);
      setMessage("");
      setOutputPath("");
      setErrorMsg("");
      isExportingRef.current = false;
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOpenFolder = async () => {
    try {
      const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
      await revealItemInDir(outputPath);
    } catch {
      // Fallback: do nothing
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fadeIn">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={status === "done" || status === "error" ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-3xl w-full max-w-lg mx-4 shadow-2xl animate-slideUp">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900">내보내기</h2>
            <p className="text-sm text-gray-500">
              {status === "exporting" && "자막을 영상에 합성하는 중..."}
              {status === "done" && "다운로드 폴더에 저장되었습니다!"}
              {status === "error" && "내보내기에 실패했습니다."}
              {status === "idle" && "내보내기를 준비하는 중..."}
            </p>
          </div>
          {(status === "done" || status === "error") && (
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
          {/* Exporting state */}
          {(status === "exporting" || status === "idle") && (
            <div className="flex flex-col items-center gap-5">
              <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
                <Loader2 size={32} className="text-blue-500 animate-spin" />
              </div>
              <div className="w-full">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">{message || "준비 중..."}</span>
                  <span className="text-sm font-bold text-blue-600">{progress}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className="h-2 rounded-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Done state */}
          {status === "done" && (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 size={32} className="text-emerald-500" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900 mb-1">내보내기 완료!</p>
                <p className="text-sm text-gray-500 break-all leading-relaxed">{outputPath}</p>
              </div>
            </div>
          )}

          {/* Error state */}
          {status === "error" && (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
                <AlertCircle size={32} className="text-red-500" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900 mb-1">내보내기 실패</p>
                <p className="text-sm text-red-500 leading-relaxed">{errorMsg}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {status === "done" && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              닫기
            </button>
            <button
              onClick={handleOpenFolder}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-500/20"
            >
              <FolderOpen size={16} />
              <span>폴더 열기</span>
            </button>
          </div>
        )}

        {status === "error" && (
          <div className="flex items-center justify-end px-6 py-4 border-t border-gray-100">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              닫기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
