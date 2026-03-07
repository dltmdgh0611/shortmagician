import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Play, Pause, SkipBack, SkipForward, RefreshCw, Loader2 } from "lucide-react";
import type { PipelineSegment, SubtitleSegment, SubtitleStyle } from "../../lib/types/pipeline";
import type { BlurRegion } from "../../pages/ShortsEditor";
import { DraggableOverlay } from "./DraggableOverlay";

interface ShortsLeftPanelProps {
  scenes?: unknown[];
  selectedSceneId?: number | null;
  originalVideoPath?: string;
  mergedTtsPath?: string;
  pipelineSegments?: PipelineSegment[];
  onRecompose?: () => Promise<void>;
  blurRegion?: BlurRegion;
  onBlurRegionChange?: (region: BlurRegion) => void;
  subtitleStyle?: SubtitleStyle;
  onSubtitleStyleChange?: (style: SubtitleStyle) => void;
  selectedSubtitleId?: string | null;
  onSubtitleSelect?: (id: string | null) => void;
  subtitleSegments?: SubtitleSegment[];
  textOverlays?: Array<{
    id: string;
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize: number;
    fontColor: string;
    bold: boolean;
  }>;
  selectedTextOverlayId?: string | null;
  onTextOverlayChange?: (id: string, updates: Record<string, unknown>) => void;
  onTextOverlaySelect?: (id: string | null) => void;
  onTextOverlayDelete?: (id: string) => void;
}

export function ShortsLeftPanel({
  originalVideoPath,
  mergedTtsPath,
  selectedSceneId,
  pipelineSegments,
  onRecompose,
  blurRegion,
  onBlurRegionChange,
  subtitleStyle,
  onSubtitleStyleChange,
  onSubtitleSelect,
  subtitleSegments,
  textOverlays,
  selectedTextOverlayId,
  onTextOverlayChange,
  onTextOverlaySelect,
  onTextOverlayDelete,
}: ShortsLeftPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalTime, setTotalTime] = useState(60);
  const progress = totalTime > 0 ? (currentTime / totalTime) * 100 : 0;
  const [isRecomposing, setIsRecomposing] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Find active subtitle segment for current playback time
  const activeSubtitle = useMemo(() => {
    if (!subtitleSegments || subtitleSegments.length === 0) return null;
    // Exact match: current time falls within a segment
    const exact = subtitleSegments.find(
      seg => currentTime >= seg.startTime && currentTime <= seg.endTime
    );
    if (exact) return exact;
    // Gap between segments: keep showing the most recently ended subtitle
    let lastEnded: typeof subtitleSegments[number] | null = null;
    for (const seg of subtitleSegments) {
      if (seg.endTime <= currentTime) lastEnded = seg;
      else break; // sorted by time — no need to continue
    }
    return lastEnded;
  }, [subtitleSegments, currentTime]);

  // Load original video via Tauri fs → blob URL (played muted)
  useEffect(() => {
    let revoked = false;
    let blobUrl: string | null = null;

    async function loadVideo() {
      if (!originalVideoPath) return;
      try {
        const { readFile } = await import("@tauri-apps/plugin-fs");
        const bytes = await readFile(originalVideoPath);
        const blob = new Blob([bytes], { type: "video/mp4" });
        blobUrl = URL.createObjectURL(blob);
        if (!revoked) setVideoUrl(blobUrl);
      } catch {
        // Tauri not available (test/web) — ignore
      }
    }

    loadVideo();
    return () => {
      revoked = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [originalVideoPath]);

  // Load merged TTS audio via Tauri fs → blob URL
  useEffect(() => {
    let revoked = false;
    let blobUrl: string | null = null;

    async function loadAudio() {
      if (!mergedTtsPath) return;
      try {
        const { readFile } = await import("@tauri-apps/plugin-fs");
        const bytes = await readFile(mergedTtsPath);
        const blob = new Blob([bytes], { type: "audio/mpeg" });
        blobUrl = URL.createObjectURL(blob);
        if (!revoked) setAudioUrl(blobUrl);
      } catch {
        // Tauri not available (test/web) — ignore
      }
    }

    loadAudio();
    return () => {
      revoked = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [mergedTtsPath]);

  // Seek to segment start time when user selects a segment
  useEffect(() => {
    const v = videoRef.current;
    const a = audioRef.current;
    if (!v || selectedSceneId == null || !pipelineSegments) return;
    const seg = pipelineSegments[selectedSceneId];
    if (seg) {
      v.currentTime = seg.startTime;
      if (a) a.currentTime = seg.startTime;
    }
  }, [selectedSceneId, pipelineSegments]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const togglePlay = () => {
    const v = videoRef.current;
    const a = audioRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      a?.play();
      setIsPlaying(true);
    } else {
      v.pause();
      a?.pause();
      setIsPlaying(false);
    }
  };

  // rAF-based time tracking (~16ms precision vs timeupdate's ~250ms)
  const rafRef = useRef<number>(0);
  const pollTime = useCallback(() => {
    const v = videoRef.current;
    if (v && !v.paused) {
      setCurrentTime(v.currentTime);
      rafRef.current = requestAnimationFrame(pollTime);
    }
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => { rafRef.current = requestAnimationFrame(pollTime); };
    const onPauseOrEnd = () => {
      cancelAnimationFrame(rafRef.current);
      setCurrentTime(v.currentTime);
      // Sync audio position on seek
      const a = audioRef.current;
      if (a && Math.abs(a.currentTime - v.currentTime) > 0.1) {
        a.currentTime = v.currentTime;
      }
    };
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPauseOrEnd);
    v.addEventListener('seeked', onPauseOrEnd);
    return () => {
      cancelAnimationFrame(rafRef.current);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPauseOrEnd);
      v.removeEventListener('seeked', onPauseOrEnd);
    };
  }, [videoUrl, pollTime]);

  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (v) setTotalTime(v.duration);
  };

  const handleEnded = () => {
    setIsPlaying(false);
    audioRef.current?.pause();
  };

  const showBlur = blurRegion?.enabled && onBlurRegionChange;
  const showSubtitle = subtitleStyle && onSubtitleStyleChange;

  return (
    <aside className="w-80 lg:w-96 flex flex-col border-r border-gray-200 bg-white shrink-0">
      {/* Header */}
      <div className="h-10 px-4 flex items-center border-b border-gray-100 bg-gray-50">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Preview
        </span>
      </div>

      {/* Main Preview Area */}
      <div className="flex-1 flex flex-col bg-gray-100 relative group p-4 gap-4 overflow-hidden">
        {/* Vertical Video Container - 19.5:9 비율 */}
        <div className="flex-1 flex items-center justify-center overflow-hidden min-h-0">
          <div
            ref={containerRef}
            className="relative w-full max-h-full"
            style={{ aspectRatio: '9 / 19.5' }}
          >
            {videoUrl ? (
              <>
                <video
                  ref={videoRef}
                  src={videoUrl}
                  onLoadedMetadata={handleLoadedMetadata}
                  onEnded={handleEnded}
                  className="absolute inset-0 w-full h-full rounded-xl border border-gray-200 object-cover shadow-sm"
                  playsInline
                  muted
                  data-testid="preview-video"
                />
                {/* Hidden audio element for TTS playback, synced with video */}
                {audioUrl && (
                  <audio
                    ref={audioRef}
                    src={audioUrl}
                    preload="auto"
                  />
                )}
              </>
            ) : (
              <img
                src="/\uC370\uC1FC\uCE20_\uBA54\uC778.png"
                alt="\uC370\uC1FC\uCE20_\uBA54\uC778"
                className="absolute inset-0 w-full h-full rounded-xl border border-gray-200 object-cover shadow-sm"
                data-testid="preview-image"
              />
            )}

            {/* Blur Region Overlay — z-index 5 (BEHIND subtitles) */}
            {showBlur && blurRegion && (
              <DraggableOverlay
                containerRef={containerRef}
                x={blurRegion.x}
                y={blurRegion.y}
                width={blurRegion.width}
                height={blurRegion.height}
                onChange={(r) => onBlurRegionChange({ ...blurRegion, ...r })}
                zIndex={5}
                borderColor="rgba(147, 51, 234, 0.5)"
                label="자막 블러"
                overlayStyle={{
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  background: 'rgba(0, 0, 0, 0.05)',
                }}
              />
            )}

            {/* Subtitle Region Overlay — z-index 15 (IN FRONT of blur) */}
            {showSubtitle && subtitleStyle && (
              <DraggableOverlay
                containerRef={containerRef}
                x={subtitleStyle.x}
                y={subtitleStyle.y}
                width={subtitleStyle.width}
                height={subtitleStyle.height}
                onChange={(r) => onSubtitleStyleChange?.({ ...subtitleStyle!, ...r })}
                onInteract={() => { if (activeSubtitle) onSubtitleSelect?.(activeSubtitle.id); }}
                zIndex={15}
                borderColor="rgba(59, 130, 246, 0.5)"
                label="자막"
              >
                {/* Active subtitle text */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    height: '100%',
                    color: subtitleStyle.fontColor,
                    fontFamily: subtitleStyle.fontFamily,
                    fontSize: containerHeight > 0 ? `${(subtitleStyle.fontSize / 1920) * containerHeight}px` : '11px',
                    fontWeight: subtitleStyle.bold ? 700 : 400,
                    fontStyle: subtitleStyle.italic ? 'italic' : 'normal',
                    textShadow: containerHeight > 0
                      ? `${(subtitleStyle.shadowBlur / 1920) * containerHeight}px ${(subtitleStyle.shadowBlur / 1920) * containerHeight}px 0px ${subtitleStyle.shadowColor}`
                      : `1px 1px 0px ${subtitleStyle.shadowColor}`,
                    WebkitTextStroke: containerHeight > 0 ? `${(subtitleStyle.outlineWidth / 1920) * containerHeight}px ${subtitleStyle.outlineColor}` : undefined,
                    paintOrder: 'stroke fill' as const,
                    backgroundColor: subtitleStyle.backgroundColor,
                    textAlign: 'center' as const,
                    padding: '4px',
                    pointerEvents: 'none' as const,
                    userSelect: 'none' as const,
                    lineHeight: 1.4,
                    wordBreak: 'keep-all' as const,
                    overflow: 'hidden' as const,
                  }}
                >
                  {activeSubtitle?.translatedText || ''}
                </div>
              </DraggableOverlay>
            )}

            {/* Text Overlays — z-index 20 (above subtitles) */}
            {textOverlays?.map((overlay) => (
              <DraggableOverlay
                key={overlay.id}
                containerRef={containerRef}
                x={overlay.x}
                y={overlay.y}
                width={overlay.width}
                height={overlay.height}
                onChange={(r) => onTextOverlayChange?.(overlay.id, r)}
                onInteract={() => onTextOverlaySelect?.(overlay.id)}
                zIndex={20}
                borderColor={selectedTextOverlayId === overlay.id ? 'rgba(234, 179, 8, 0.8)' : 'rgba(234, 179, 8, 0.3)'}
                label=""
              >
                <div
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => onTextOverlayChange?.(overlay.id, { text: e.currentTarget.textContent || '' })}
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace' && (e.currentTarget.textContent || '').length === 0) {
                      e.preventDefault();
                      onTextOverlayDelete?.(overlay.id);
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    height: '100%',
                    color: overlay.fontColor,
                    fontSize: containerHeight > 0 ? `${(overlay.fontSize / 1920) * containerHeight}px` : '11px',
                    fontWeight: overlay.bold ? 700 : 400,
                    textAlign: 'center' as const,
                    outline: 'none',
                    cursor: 'text',
                    lineHeight: 1.3,
                    wordBreak: 'keep-all' as const,
                    textShadow: '0 1px 4px rgba(0,0,0,0.5)',
                    WebkitTextStroke: containerHeight > 0 ? `${(1 / 1920) * containerHeight}px rgba(0,0,0,0.3)` : undefined,
                  }}
                >
                  {overlay.text}
                </div>
              </DraggableOverlay>
            ))}
          </div>
        </div>

        {/* Playback Controls with Progress */}
        <div className="bg-white rounded-xl border border-gray-200 shrink-0 shadow-sm overflow-hidden">
          {/* Progress Bar */}
          <div className="h-1 bg-gray-200 cursor-pointer group/progress">
            <div 
              className="h-full bg-blue-500 relative transition-all"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-blue-500 rounded-full opacity-0 group-hover/progress:opacity-100 transition-opacity" />
            </div>
          </div>

          {/* Controls Row */}
          <div className="h-12 flex items-center justify-between px-4">
            {/* Time Display */}
            <span className="text-xs text-gray-500 font-medium w-20">
              {formatTime(currentTime)} / {formatTime(totalTime)}
            </span>

            {/* Play Controls */}
            <div className="flex items-center gap-3">
              <button className="text-gray-400 hover:text-gray-700 transition-colors">
                <SkipBack size={18} />
              </button>
              <button
                onClick={togglePlay}
                className="w-9 h-9 flex items-center justify-center bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors shadow-md"
              >
                {isPlaying ? (
                  <Pause size={16} fill="currentColor" />
                ) : (
                  <Play size={16} className="ml-0.5" fill="currentColor" />
                )}
              </button>
              <button className="text-gray-400 hover:text-gray-700 transition-colors">
                <SkipForward size={18} />
              </button>
            </div>

            {/* Spacer to balance layout */}
            <div className="w-20" />
          </div>

        </div>
        {/* Recompose Button */}
        {pipelineSegments && onRecompose && (
          <div className="shrink-0">
            <button
              onClick={async () => {
                setIsRecomposing(true);
                try { await onRecompose(); } finally { setIsRecomposing(false); }
              }}
              disabled={isRecomposing}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white text-xs font-medium rounded-lg transition-colors"
            >
              {isRecomposing ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>재합성 중...</span>
                </>
              ) : (
                <>
                  <RefreshCw size={14} />
                  <span>재합성</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
