import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import { ShortsTopbar } from "../components/shorts/ShortsTopbar";
import { ShortsLeftPanel } from "../components/shorts/ShortsLeftPanel";
import { ShortsCenterPanel, Scene } from "../components/shorts/ShortsCenterPanel";
import { ShortsRightPanel } from "../components/shorts/ShortsRightPanel";
import { ExportModal } from "../components/modals/ExportModal";
import { YouTubeUploadModal } from "../components/modals/YouTubeUploadModal";

import { Play, FileText, ImageIcon, CheckCircle, X } from "lucide-react";
import { usePipeline } from "../contexts/PipelineContext";
import { api } from "../lib/api";
import { segmentToScene } from "../lib/pipeline/sceneAdapter";
import type { PipelineSegment, SubtitleSegment, SubtitleStyle } from "../lib/types/pipeline";
import { DEFAULT_SUBTITLE_STYLE } from "../lib/types/pipeline";
import { saveProject, loadProject } from "../lib/services/projectService";
import { generateThumbnail } from "../lib/pipeline/thumbnailService";

import type { SavedProject } from "../lib/services/projectService";
export interface BlurRegion {
  enabled: boolean;
  x: number;      // percentage 0-100 (left offset)
  y: number;      // percentage 0-100 (top offset)
  width: number;   // percentage 0-100
  height: number;  // percentage 0-100
}

export interface TextOverlay {
  id: string;
  text: string;
  x: number;      // percentage 0-100
  y: number;      // percentage 0-100
  width: number;   // percentage 0-100
  height: number;  // percentage 0-100
  fontSize: number;
  fontColor: string;
  bold: boolean;
}


type MobileTab = "preview" | "script" | "image";

export function ShortsEditor() {
  const [showExportModal, setShowExportModal] = useState(false);
  const [showYouTubeModal, setShowYouTubeModal] = useState(false);

  // Route state: projectId is set when loading a saved project
  const location = useLocation();
  const routeProjectId = (location.state as { projectId?: string } | null)?.projectId;
  // Synchronous flag: true when loading a saved project (prevents pipeline effect overrides)
  const isLoadedProjectRef = useRef(!!routeProjectId);

  const [scenes, setScenes] = useState<Scene[]>([]);
  const [projectLanguages, setProjectLanguages] = useState<string[]>(["ko"]);
  const [selectedLanguage, setSelectedLanguage] = useState("ko");
  const [selectedSceneId, setSelectedSceneId] = useState<number | null>(null);
  const [mobileActiveTab, setMobileActiveTab] = useState<MobileTab>("preview");
  const [showSaveToast, setShowSaveToast] = useState(false);

  const [blurRegion, setBlurRegion] = useState<BlurRegion>({
    enabled: false,
    x: 5,
    y: 78,
    width: 90,
    height: 10,
  });

  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>(DEFAULT_SUBTITLE_STYLE);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [selectedTextOverlayId, setSelectedTextOverlayId] = useState<string | null>(null);
  // Pipeline state
  const { result: pipelineResult, updateSegment, updateSubtitleSegment } = usePipeline();

  // Derive pipeline scenes from context when available
  const pipelineScenes = useMemo(() => {
    if (pipelineResult?.status === "done" && pipelineResult.segments.length > 0) {
      return pipelineResult.segments.map((seg, idx) => segmentToScene(seg, idx));
    }
    return null;
  }, [pipelineResult]);

  const pipelineSegments: PipelineSegment[] | undefined =
    pipelineResult?.status === "done" ? pipelineResult.segments : undefined;

  const originalVideoPath: string | undefined =
    pipelineResult?.status === "done" ? pipelineResult.originalVideoPath : undefined;

  const mergedTtsPath: string | undefined =
    pipelineResult?.status === "done" ? pipelineResult.mergedTtsPath : undefined;

  const subtitleSegments: SubtitleSegment[] | undefined =
    pipelineResult?.status === "done" ? pipelineResult.subtitleSegments : undefined;

  // Pipeline handlers for subtitle editing + voice change
  const handleSegmentUpdate = useCallback((segmentId: string, updates: Partial<PipelineSegment>) => {
    updateSegment(segmentId, updates);
  }, [updateSegment]);

  const handleSubtitleSegmentUpdate = useCallback((parentSegId: string, subtitleIndex: number, updates: Partial<SubtitleSegment>) => {
    updateSubtitleSegment(parentSegId, subtitleIndex, updates);
  }, [updateSubtitleSegment]);

  const handleVoiceChange = useCallback(async (segmentId: string, voiceId: string) => {
    try {
      const seg = pipelineSegments?.find(s => s.id === segmentId);
      if (!seg) return;
      const response = await api.post('/api/v1/pipeline/synthesize', {
        text: seg.translatedText,
        voice_id: voiceId,
        language: pipelineResult?.targetLanguage || 'en',
      }, { responseType: 'blob' });
      // Save audio via Tauri fs
      const { writeFile, BaseDirectory } = await import("@tauri-apps/plugin-fs");
      const audioFileName = `tts_${segmentId}_${Date.now()}.mp3`;
      const audioPath = `pipeline/${audioFileName}`;
      const arrayBuffer = await response.data.arrayBuffer();
      await writeFile(audioPath, new Uint8Array(arrayBuffer), { baseDir: BaseDirectory.AppLocalData });
      const voiceName = voiceId.split('-').pop() || voiceId;
      updateSegment(segmentId, { voiceId, voiceName, ttsAudioPath: audioPath });
    } catch (err) {
      console.error('Voice change failed:', err);
    }
  }, [pipelineSegments, pipelineResult, updateSegment]);

  const handleSegmentRetranslate = useCallback(async (segmentId: string, newText: string) => {
    try {
      const seg = pipelineSegments?.find(s => s.id === segmentId);
      if (!seg) return;
      const response = await api.post('/api/v1/pipeline/translate', {
        segments: [{ id: seg.id, start_time: seg.startTime, end_time: seg.endTime, text: newText }],
        source_language: pipelineResult?.sourceLanguage || 'ko',
        target_language: pipelineResult?.targetLanguage || 'en',
      });
      const translated = response.data.segments?.[0];
      if (translated) {
        updateSegment(segmentId, { originalText: newText, translatedText: translated.translated_text });
      }
    } catch (err) {
      console.error('Re-translation failed:', err);
    }
  }, [pipelineSegments, pipelineResult, updateSegment]);

  const handleRecompose = useCallback(async () => {
    // v1: placeholder — full recomposition logic in Task 20
    console.log('Recompose triggered');
  }, []);

  const handleSubtitleSelect = useCallback((id: string | null) => {
    setSelectedSubtitleId(id);
    if (id) setSelectedSceneId(null);
  }, []);

  const handleSceneSelect = useCallback((id: number | null) => {
    setSelectedSceneId(id);
    setSelectedSubtitleId(null);
  }, []);

  const handleAddTextOverlay = useCallback(() => {
    const newOverlay: TextOverlay = {
      id: `text_${Date.now()}`,
      text: '텍스트를 입력하세요',
      x: 10,
      y: 30,
      width: 80,
      height: 12,
      fontSize: 60,
      fontColor: '#FFFFFF',
      bold: true,
    };
    setTextOverlays(prev => [...prev, newOverlay]);
    setSelectedTextOverlayId(newOverlay.id);
  }, []);

  const handleTextOverlayChange = useCallback((id: string, updates: Partial<TextOverlay>) => {
    setTextOverlays(prev => prev.map(o => o.id === id ? { ...o, ...updates } : o));
  }, []);

  const handleDeleteTextOverlay = useCallback((id: string) => {
    setTextOverlays(prev => prev.filter(o => o.id !== id));
    if (selectedTextOverlayId === id) setSelectedTextOverlayId(null);
  }, [selectedTextOverlayId]);
  // Load project data from pipeline result or session storage
  const initialLoadDoneRef = useRef(false);

  // ── Load saved project state directly from disk (authoritative source) ─────
  useEffect(() => {
    if (!routeProjectId) return;

    let cancelled = false;
    loadProject(routeProjectId).then(project => {
      if (cancelled) return;
      isLoadedProjectRef.current = true;

      // Restore ALL visual state from saved project
      if (project.subtitleStyle) setSubtitleStyle(project.subtitleStyle);
      if (project.blurRegion) setBlurRegion(project.blurRegion);
      if (project.selectedLanguage) setSelectedLanguage(project.selectedLanguage);
      if (project.projectLanguages?.length) setProjectLanguages(project.projectLanguages);
      if (project.textOverlays) setTextOverlays(project.textOverlays);
    }).catch(() => {
      // Not yet saved to disk (new project) — use defaults
      isLoadedProjectRef.current = false;
    });

    return () => { cancelled = true; };
  }, [routeProjectId]);

  // ── Sync scenes from pipeline result ───────────────────────────────────────
  useEffect(() => {
    if (pipelineScenes) {
      setScenes(pipelineScenes);
      if (!initialLoadDoneRef.current) {
        initialLoadDoneRef.current = true;
        // Always derive languages from pipeline result so toggle appears immediately
        const langs = new Set<string>(["ko"]);
        if (pipelineResult?.sourceLanguage) langs.add(pipelineResult.sourceLanguage);
        if (pipelineResult?.targetLanguage) langs.add(pipelineResult.targetLanguage);
        setProjectLanguages(Array.from(langs));
        // Only override selectedLanguage for NEW projects, not loaded ones
        if (!isLoadedProjectRef.current) {
          setSelectedLanguage(pipelineResult?.targetLanguage || "ko");
        }
      }
      return;
    }

    const savedScenes = sessionStorage.getItem("currentScenes");
    const savedLanguages = sessionStorage.getItem("projectLanguages");

    if (savedScenes) {
      setScenes(JSON.parse(savedScenes));
    }
    if (savedLanguages) {
      setProjectLanguages(JSON.parse(savedLanguages));
    }

  }, [pipelineScenes]);

  // ── Restore from sessionStorage fallback (backward compat, runs once) ─────
  useEffect(() => {
    // Skip sessionStorage if loading from disk (authoritative source)
    if (isLoadedProjectRef.current) return;

    const savedStyle = sessionStorage.getItem("savedSubtitleStyle");
    if (savedStyle) {
      try { setSubtitleStyle(JSON.parse(savedStyle)); } catch {}
      sessionStorage.removeItem("savedSubtitleStyle");
    }
    const savedBlur = sessionStorage.getItem("savedBlurRegion");
    if (savedBlur) {
      try { setBlurRegion(JSON.parse(savedBlur)); } catch {}
      sessionStorage.removeItem("savedBlurRegion");
    }
    const savedLang = sessionStorage.getItem("savedSelectedLanguage");
    if (savedLang) {
      setSelectedLanguage(savedLang);
      sessionStorage.removeItem("savedSelectedLanguage");
    }
    const savedTextOverlays = sessionStorage.getItem("savedTextOverlays");
    if (savedTextOverlays) {
      try { setTextOverlays(JSON.parse(savedTextOverlays)); } catch {}
      sessionStorage.removeItem("savedTextOverlays");
    }
  }, []);

  // Auto-save project (debounced 2s)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!pipelineResult || pipelineResult.status !== 'done') return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const projectName = pipelineResult.originalVideoPath
        ? pipelineResult.originalVideoPath.split(/[\/\\]/).pop()?.replace(/\.[^.]+$/, '') || '프로젝트'
        : '프로젝트';

      let thumbnailPath: string | undefined;
      try {
        const videoForThumb = originalVideoPath || pipelineResult.originalVideoPath;
        if (videoForThumb) {
          thumbnailPath = await generateThumbnail(videoForThumb, pipelineResult.projectId);
        }
      } catch {
        // thumbnail generation failed, proceed without thumbnail
      }

      const project: SavedProject = {
        id: pipelineResult.projectId,
        name: projectName,
        createdAt: sessionStorage.getItem(`project_created_${pipelineResult.projectId}`) || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        pipelineResult,
        subtitleStyle,
        blurRegion,
        selectedLanguage,
        projectLanguages,
        textOverlays,
        thumbnailPath,
      };
      // Store creation date on first save
      if (!sessionStorage.getItem(`project_created_${pipelineResult.projectId}`)) {
        sessionStorage.setItem(`project_created_${pipelineResult.projectId}`, project.createdAt);
      }

      saveProject(project).catch(err => console.error('Auto-save failed:', err));
    }, 2000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [pipelineResult, subtitleStyle, blurRegion, selectedLanguage, projectLanguages, scenes, textOverlays]);

  const handleSave = useCallback(async () => {
    if (!pipelineResult || pipelineResult.status !== 'done') return;

    const projectName = pipelineResult.originalVideoPath
      ? pipelineResult.originalVideoPath.split(/[\/\\]/).pop()?.replace(/\.[^.]+$/, '') || '프로젝트'
      : '프로젝트';

    let thumbnailPath: string | undefined;
    try {
      const videoForThumb = originalVideoPath || pipelineResult.originalVideoPath;
      if (videoForThumb) {
        thumbnailPath = await generateThumbnail(videoForThumb, pipelineResult.projectId);
      }
    } catch {}

    const project: SavedProject = {
      id: pipelineResult.projectId,
      name: projectName,
      createdAt: sessionStorage.getItem(`project_created_${pipelineResult.projectId}`) || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pipelineResult,
      subtitleStyle,
      blurRegion,
      selectedLanguage,
      projectLanguages,
      textOverlays,
      thumbnailPath,
    };

    if (!sessionStorage.getItem(`project_created_${pipelineResult.projectId}`)) {
      sessionStorage.setItem(`project_created_${pipelineResult.projectId}`, project.createdAt);
    }

    try {
      await saveProject(project);
      setShowSaveToast(true);
      setTimeout(() => setShowSaveToast(false), 3000);
    } catch (err) {
      console.error('Save failed:', err);
    }
  }, [pipelineResult, subtitleStyle, blurRegion, selectedLanguage, projectLanguages, textOverlays, originalVideoPath]);

  const handleFileExport = () => setShowExportModal(true);
  const handleYouTubeExport = () => setShowYouTubeModal(true);

  return (
    <div className="h-screen flex flex-col bg-gray-50 text-gray-900 overflow-hidden">
      <ShortsTopbar onFileExport={handleFileExport} onYouTubeExport={handleYouTubeExport} onSave={handleSave} blurEnabled={blurRegion.enabled} onToggleBlur={() => setBlurRegion(prev => ({ ...prev, enabled: !prev.enabled }))} onAddText={handleAddTextOverlay} />

      {/* Desktop Layout (md and above) */}
      <div className="hidden md:flex flex-1 overflow-hidden">
        <ShortsLeftPanel scenes={scenes} selectedSceneId={selectedSceneId} originalVideoPath={originalVideoPath} mergedTtsPath={mergedTtsPath} pipelineSegments={pipelineSegments} onRecompose={handleRecompose} blurRegion={blurRegion} onBlurRegionChange={setBlurRegion} subtitleStyle={subtitleStyle} onSubtitleStyleChange={setSubtitleStyle} selectedSubtitleId={selectedSubtitleId} onSubtitleSelect={handleSubtitleSelect} subtitleSegments={subtitleSegments} textOverlays={textOverlays} selectedTextOverlayId={selectedTextOverlayId} onTextOverlayChange={handleTextOverlayChange} onTextOverlaySelect={setSelectedTextOverlayId} onTextOverlayDelete={handleDeleteTextOverlay} />
        <ShortsCenterPanel
          scenes={scenes}
          onScenesChange={setScenes}
          languages={projectLanguages}
          selectedLanguage={selectedLanguage}
          onLanguageChange={setSelectedLanguage}
          selectedSceneId={selectedSceneId}
          onSceneSelect={handleSceneSelect}
          pipelineSegments={pipelineSegments}
          subtitleSegments={subtitleSegments}
          onSegmentUpdate={handleSegmentUpdate}
          onVoiceChange={handleVoiceChange}
          onSegmentRetranslate={handleSegmentRetranslate}
          onSubtitleSegmentUpdate={handleSubtitleSegmentUpdate}
        />
        <ShortsRightPanel
          selectedSceneId={selectedSceneId}
          onClose={() => { setSelectedSceneId(null); }}
          selectedSubtitleId={selectedSubtitleId}
          onSubtitleClose={() => setSelectedSubtitleId(null)}
          subtitleStyle={subtitleStyle}
          onSubtitleStyleChange={setSubtitleStyle}
        />
      </div>

      {/* Mobile Layout (below md) */}
      <div className="flex md:hidden flex-1 flex-col overflow-hidden">
        {/* Tab Content */}
        <div className="flex-1 overflow-hidden">
          {mobileActiveTab === "preview" && <ShortsLeftPanel scenes={scenes} selectedSceneId={selectedSceneId} originalVideoPath={originalVideoPath} mergedTtsPath={mergedTtsPath} pipelineSegments={pipelineSegments} onRecompose={handleRecompose} blurRegion={blurRegion} onBlurRegionChange={setBlurRegion} subtitleStyle={subtitleStyle} onSubtitleStyleChange={setSubtitleStyle} selectedSubtitleId={selectedSubtitleId} onSubtitleSelect={handleSubtitleSelect} subtitleSegments={subtitleSegments} textOverlays={textOverlays} selectedTextOverlayId={selectedTextOverlayId} onTextOverlayChange={handleTextOverlayChange} onTextOverlaySelect={setSelectedTextOverlayId} onTextOverlayDelete={handleDeleteTextOverlay} />}
          {mobileActiveTab === "script" && (
            <ShortsCenterPanel
              scenes={scenes}
              onScenesChange={setScenes}
              languages={projectLanguages}
              selectedLanguage={selectedLanguage}
              onLanguageChange={setSelectedLanguage}
              selectedSceneId={selectedSceneId}
              pipelineSegments={pipelineSegments}
              subtitleSegments={subtitleSegments}
              onSegmentUpdate={handleSegmentUpdate}
              onVoiceChange={handleVoiceChange}
              onSegmentRetranslate={handleSegmentRetranslate}
              onSubtitleSegmentUpdate={handleSubtitleSegmentUpdate}
              onSceneSelect={(id) => {
                handleSceneSelect(id);
                if (id !== null) {
                  setMobileActiveTab("image");
                }
              }}
            />
          )}
          {mobileActiveTab === "image" && (
            <ShortsRightPanel
              selectedSceneId={selectedSceneId}
              onClose={() => {
                setSelectedSceneId(null);
                setMobileActiveTab("script");
              }}
              selectedSubtitleId={selectedSubtitleId}
              onSubtitleClose={() => setSelectedSubtitleId(null)}
              subtitleStyle={subtitleStyle}
              onSubtitleStyleChange={setSubtitleStyle}
            />
          )}
        </div>

        {/* Bottom Tab Navigation */}
        <div className="h-16 bg-white border-t border-gray-200 flex items-center justify-around shrink-0 safe-area-inset-bottom">
          <MobileTabButton
            icon={<Play size={20} />}
            label="프리뷰"
            active={mobileActiveTab === "preview"}
            onClick={() => setMobileActiveTab("preview")}
          />
          <MobileTabButton
            icon={<FileText size={20} />}
            label="스크립트"
            active={mobileActiveTab === "script"}
            onClick={() => setMobileActiveTab("script")}
          />
          <MobileTabButton
            icon={<ImageIcon size={20} />}
            label="이미지"
            active={mobileActiveTab === "image"}
            onClick={() => setMobileActiveTab("image")}
            disabled={selectedSceneId === null}
          />
        </div>
      </div>

      {/* Export Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        originalVideoPath={originalVideoPath}
        mergedTtsPath={mergedTtsPath}
        subtitleSegments={subtitleSegments}
        subtitleStyle={subtitleStyle}
        blurRegion={blurRegion}
      />
      <YouTubeUploadModal
        isOpen={showYouTubeModal}
        onClose={() => setShowYouTubeModal(false)}
        originalVideoPath={originalVideoPath}
        mergedTtsPath={mergedTtsPath}
        subtitleSegments={subtitleSegments || []}
        subtitleStyle={subtitleStyle}
        blurRegion={blurRegion}
        targetLanguage={pipelineResult?.targetLanguage || selectedLanguage}
      />

      {/* 저장 완료 토스트 */}
      {showSaveToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-slideDown">
          <div className="flex items-center gap-3 bg-green-500 text-white px-5 py-3 rounded-xl shadow-lg shadow-green-500/30">
            <CheckCircle size={20} />
            <span className="font-medium">저장이 완료되었습니다!</span>
            <button
              onClick={() => setShowSaveToast(false)}
              className="p-1 hover:bg-white/20 rounded-full transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MobileTabButton({
  icon,
  label,
  active = false,
  disabled = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        flex flex-col items-center justify-center gap-1 py-2 px-4 min-w-0 transition-all
        ${disabled
          ? "text-gray-300 cursor-not-allowed"
          : active
            ? "text-blue-600"
            : "text-gray-500 active:text-gray-700"
        }
      `}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}
