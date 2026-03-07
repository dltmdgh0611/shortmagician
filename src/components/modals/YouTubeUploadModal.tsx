import { useState, useEffect, useRef } from "react";
import {
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Hash,
  Plus,
  Youtube,
} from "lucide-react";
import { api } from "../../lib/api";
import { openUrl } from "../../lib/openUrl";
import { exportVideo } from "../../lib/pipeline/exportService";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import type { SubtitleSegment, SubtitleStyle } from "../../lib/types/pipeline";
import type { BlurRegion } from "../../pages/ShortsEditor";

// ── Types ────────────────────────────────────────────────────────────────────

type ModalStatus =
  | "idle"
  | "channel_select"
  | "rendering"
  | "generating"
  | "preview"
  | "uploading"
  | "done"
  | "error";

interface YouTubeChannel {
  channel_id: string;
  channel_title: string;
  thumbnail_url: string;
  google_email: string;
}

interface YouTubeUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Export params (for rendering video with FFmpeg)
  originalVideoPath?: string;
  mergedTtsPath?: string;
  subtitleSegments: SubtitleSegment[];
  subtitleStyle?: SubtitleStyle;
  blurRegion?: BlurRegion;
  // Language from editor
  targetLanguage: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function YouTubeUploadModal({
  isOpen,
  onClose,
  originalVideoPath,
  mergedTtsPath,
  subtitleSegments,
  subtitleStyle,
  blurRegion,
  targetLanguage,
}: YouTubeUploadModalProps) {
  const [status, setStatus] = useState<ModalStatus>("idle");
  const [channels, setChannels] = useState<YouTubeChannel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<YouTubeChannel | null>(null);
  const [exportedPath, setExportedPath] = useState("");
  const [exportProgress, setExportProgress] = useState(0);
  const [exportMessage, setExportMessage] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [hashtagInput, setHashtagInput] = useState("");
  const [videoId, setVideoId] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isAuthError, setIsAuthError] = useState(false);
  const isProcessingRef = useRef(false);

  // ── Open: set channel_select then fetch channels ────────────────────────

  useEffect(() => {
    if (!isOpen || isProcessingRef.current) return;

    isProcessingRef.current = true;
    setStatus("channel_select");

    (async () => {
      try {
        const connectionsRes = await api.get<{ channels: YouTubeChannel[] }>(
          "/api/v1/youtube/connections"
        );
        const fetchedChannels = connectionsRes.data.channels;
        if (!fetchedChannels || fetchedChannels.length === 0) {
          setErrorMsg("연결된 YouTube 채널이 없습니다. 설정에서 채널을 연결해주세요.");
          setStatus("error");
        } else {
          setChannels(fetchedChannels);
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "채널 정보를 불러오는 중 오류가 발생했습니다.";
        setErrorMsg(message);
        setStatus("error");
      } finally {
        isProcessingRef.current = false;
      }
    })();
  }, [isOpen]);

  // ── Reset on close ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) {
      setStatus("idle");
      setChannels([]);
      setSelectedChannel(null);
      setExportedPath("");
      setExportProgress(0);
      setExportMessage("");
      setTitle("");
      setDescription("");
      setHashtags([]);
      setHashtagInput("");
      setVideoId("");
      setErrorMsg("");
      setIsAuthError(false);
      isProcessingRef.current = false;
    }
  }, [isOpen]);

  // Block ESC key during uploading and rendering
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (status === "uploading" || status === "rendering")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    if (status === "uploading" || status === "rendering") {
      document.addEventListener("keydown", handleKeyDown, true);
      return () => document.removeEventListener("keydown", handleKeyDown, true);
    }
  }, [status]);

  // ── Early return ───────────────────────────────────────────────────────

  if (!isOpen) return null;

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleChannelSelect = async (ch: YouTubeChannel) => {
    setSelectedChannel(ch);

    if (!originalVideoPath || !mergedTtsPath || !subtitleSegments?.length || !subtitleStyle) {
      setErrorMsg("변환된 영상이 없습니다. 먼저 영상을 변환해주세요.");
      setStatus("error");
      return;
    }

    setStatus("rendering");

    try {
      const dataDir = await appLocalDataDir();
      const tempDir = await join(dataDir, "pipeline");

      const path = await exportVideo({
        originalVideoPath,
        mergedTtsPath,
        subtitleSegments,
        subtitleStyle,
        blurRegion: blurRegion?.enabled ? blurRegion : undefined,
        outputDir: tempDir,
        onProgress: (pct, msg) => {
          setExportProgress(pct);
          setExportMessage(msg);
        },
      });

      setExportedPath(path);
      setStatus("generating");

      // Generate metadata
      try {
        const subtitleText = subtitleSegments
          .map((s) => s.translatedText || s.originalText)
          .join(" ");
        const metadataRes = await api.post<{
          title: string;
          description: string;
          hashtags: string[];
        }>("/api/v1/youtube/generate-metadata", {
          subtitle_text: subtitleText,
          language: targetLanguage,
        });
        setTitle(metadataRes.data.title || "");
        setDescription(metadataRes.data.description || "");
        setHashtags(metadataRes.data.hashtags || []);
      } catch {
        setTitle("");
        setDescription("");
        setHashtags([]);
      }

      setStatus("preview");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "영상 렌더링 중 오류가 발생했습니다.";
      setErrorMsg(message);
      setStatus("error");
    }
  };

  const handleUpload = async () => {
    if (!selectedChannel || !exportedPath) return;

    setStatus("uploading");

    try {
      const fullDescription =
        hashtags.length > 0
          ? `${description}\n\n${hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}`
          : description;

      const res = await api.post<{
        video_id: string;
        video_url: string;
        status: string;
      }>("/api/v1/youtube/upload", {
        channel_id: selectedChannel.channel_id,
        file_path: exportedPath,
        title,
        description: fullDescription,
        language: targetLanguage,
      });

      setVideoId(res.data.video_id);
      setStatus("done");
    } catch (err: unknown) {
      let message = "업로드 중 오류가 발생했습니다.";
      let authRelated = false;

      if (typeof err === "object" && err !== null && "response" in err) {
        const response = (err as { response?: { status?: number } }).response;
        const httpStatus = response?.status;

        if (httpStatus === 400) {
          message = "내보내기한 파일을 찾을 수 없습니다. 다시 내보내기 해주세요.";
        } else if (httpStatus === 401 || httpStatus === 403) {
          message = "인증이 만료되었습니다. 설정에서 채널을 다시 연결해주세요.";
          authRelated = true;
        } else if (httpStatus === 429) {
          message = "YouTube 일일 업로드 할당량이 초과되었습니다. 내일 다시 시도해주세요.";
        } else if (httpStatus === 500) {
          message = "YouTube 업로드 중 서버 오류가 발생했습니다.";
        }
      } else if (typeof err === "object" && err !== null && "message" in err) {
        const errObj = err as { message?: string; code?: string };
        if (errObj.code === "ERR_NETWORK" || errObj.message === "Network Error") {
          message = "네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.";
        }
      }

      setIsAuthError(authRelated);
      setErrorMsg(message);
      setStatus("error");
    }
  };

  const handleRemoveHashtag = (index: number) => {
    setHashtags((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddHashtag = () => {
    const raw = hashtagInput.trim();
    if (!raw) return;
    const tag = raw.startsWith("#") ? raw : `#${raw}`;
    if (!hashtags.includes(tag)) {
      setHashtags((prev) => [...prev, tag]);
    }
    setHashtagInput("");
  };

  const handleHashtagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddHashtag();
    }
  };

  const handleOpenVideoUrl = async () => {
    if (videoId) {
      await openUrl(`https://youtu.be/${videoId}`);
    }
  };

  const handleGoToSettings = async () => {
    window.location.hash = "/settings";
    onClose();
  };

  // ── Backdrop click ─────────────────────────────────────────────────────

  const canClose =
    status === "done" ||
    status === "error" ||
    status === "preview" ||
    status === "channel_select";

  // ── Header subtitle ────────────────────────────────────────────────────

  const headerSubtitle = (() => {
    switch (status) {
      case "idle":
      case "channel_select":
        return "업로드할 채널을 선택하세요";
      case "rendering":
        return "영상을 렌더링하는 중...";
      case "generating":
        return "메타데이터를 생성하는 중...";
      case "preview":
        return "제목과 설명을 확인해주세요";
      case "uploading":
        return "YouTube에 업로드 중...";
      case "done":
        return "업로드가 완료되었습니다!";
      case "error":
        return "업로드에 실패했습니다.";
    }
  })();

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fadeIn">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={canClose ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-3xl w-full max-w-lg mx-4 shadow-2xl animate-slideUp">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-500 flex items-center justify-center">
              <Youtube size={16} className="text-white" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900">YouTube 업로드</h2>
              <p className="text-sm text-gray-500">{headerSubtitle}</p>
            </div>
          </div>
          {canClose && status !== "uploading" && (
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
          {/* ── Channel select state ─────────────────────────────────── */}
          {status === "channel_select" && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700 mb-3">업로드할 채널을 선택하세요</p>
              {channels.map((ch) => (
                <button
                  key={ch.channel_id}
                  onClick={() => handleChannelSelect(ch)}
                  className="w-full flex items-center gap-3 p-3 bg-gray-50 hover:bg-blue-50 hover:border-blue-200 border border-gray-100 rounded-xl transition-all text-left"
                >
                  <img
                    src={ch.thumbnail_url}
                    alt={ch.channel_title}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {ch.channel_title}
                    </p>
                    <p className="text-xs text-gray-500">{ch.google_email}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* ── Rendering state ──────────────────────────────────────── */}
          {status === "rendering" && (
            <div className="flex flex-col items-center gap-5">
              <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
                <Loader2 size={32} className="text-blue-500 animate-spin" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-700">
                  {exportMessage || "영상을 렌더링하는 중..."}
                </p>
                <div className="w-48 h-1.5 bg-gray-200 rounded-full mt-3 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${exportProgress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">{exportProgress}%</p>
              </div>
            </div>
          )}

          {/* ── Generating state ─────────────────────────────────────── */}
          {(status === "idle" || status === "generating") && (
            <div className="flex flex-col items-center gap-5">
              <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
                <Loader2 size={32} className="text-blue-500 animate-spin" />
              </div>
              <p className="text-sm font-medium text-gray-700">
                제목과 해시태그를 생성하는 중...
              </p>
            </div>
          )}

          {/* ── Preview state ────────────────────────────────────────── */}
          {status === "preview" && (
            <div className="space-y-4">
              {/* Channel info */}
              {selectedChannel && (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <img
                    src={selectedChannel.thumbnail_url}
                    alt={selectedChannel.channel_title}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {selectedChannel.channel_title}
                    </p>
                    <p className="text-xs text-gray-500">{selectedChannel.google_email}</p>
                  </div>
                </div>
              )}

              {/* Title */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-gray-700">제목</label>
                  <span className="text-xs text-gray-400">{title.length}/100</span>
                </div>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={100}
                  placeholder="영상 제목을 입력하세요"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">설명</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="영상 설명을 입력하세요"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all resize-none"
                />
              </div>

              {/* Hashtags */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">해시태그</label>
                <div className="flex flex-wrap items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-xl min-h-[44px]">
                  {hashtags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm"
                    >
                      <Hash size={12} />
                      {tag.replace(/^#/, "")}
                      <button
                        onClick={() => handleRemoveHashtag(idx)}
                        className="ml-0.5 p-0.5 hover:bg-blue-100 rounded-full transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                  <div className="inline-flex items-center gap-1 flex-1 min-w-[120px]">
                    <input
                      type="text"
                      value={hashtagInput}
                      onChange={(e) => setHashtagInput(e.target.value)}
                      onKeyDown={handleHashtagKeyDown}
                      placeholder="태그 입력 후 Enter"
                      className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
                    />
                    {hashtagInput.trim() && (
                      <button
                        onClick={handleAddHashtag}
                        className="p-1 text-blue-500 hover:bg-blue-50 rounded-full transition-colors"
                      >
                        <Plus size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Uploading state ──────────────────────────────────────── */}
          {status === "uploading" && (
            <div className="flex flex-col items-center gap-5">
              <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
                <Loader2 size={32} className="text-blue-500 animate-spin" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-700">YouTube에 업로드 중...</p>
                <p className="text-xs text-gray-400 mt-1">창을 닫지 마세요</p>
              </div>
            </div>
          )}

          {/* ── Done state ───────────────────────────────────────────── */}
          {status === "done" && (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 size={32} className="text-emerald-500" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900 mb-1">YouTube에 업로드 완료!</p>
                {videoId && (
                  <button
                    onClick={handleOpenVideoUrl}
                    className="text-sm text-blue-500 hover:text-blue-600 hover:underline transition-colors"
                  >
                    https://youtu.be/{videoId}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Error state ──────────────────────────────────────────── */}
          {status === "error" && (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
                <AlertCircle size={32} className="text-red-500" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900 mb-1">업로드 실패</p>
                <p className="text-sm text-red-500 leading-relaxed">{errorMsg}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {status === "channel_select" && (
          <div className="flex items-center justify-end px-6 py-4 border-t border-gray-100">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              취소
            </button>
          </div>
        )}

        {status === "preview" && (
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleUpload}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-500/20"
            >
              <Youtube size={16} />
              <span>업로드</span>
            </button>
          </div>
        )}

        {status === "uploading" && (
          <div className="flex items-center justify-end px-6 py-4 border-t border-gray-100">
            <button
              disabled
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-500 text-white font-semibold rounded-xl opacity-50 cursor-not-allowed"
            >
              <Loader2 size={16} className="animate-spin" />
              <span>업로드 중...</span>
            </button>
          </div>
        )}

        {status === "done" && (
          <div className="flex items-center justify-end px-6 py-4 border-t border-gray-100">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              닫기
            </button>
          </div>
        )}

        {status === "error" && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              닫기
            </button>
            {isAuthError && (
              <button
                onClick={handleGoToSettings}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-500/20"
              >
                <span>설정으로 이동</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
