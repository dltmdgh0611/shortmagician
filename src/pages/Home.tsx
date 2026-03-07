import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, MoreVertical, Languages, X, Trash2 } from "lucide-react";
import { TemplateModal } from "../components/modals/TemplateModal";
import { ScriptModal } from "../components/modals/ScriptModal";
import { ProjectSettingsModal } from "../components/modals/ProjectSettingsModal";
import { ConvertModal } from "../components/modals/ConvertModal";
import { ConvertLanguageModal } from "../components/modals/ConvertLanguageModal";
import { ConvertLoadingModal } from "../components/modals/ConvertLoadingModal";
import type { VideoInfo } from "../lib/videoParser";
import { usePipeline } from "../contexts/PipelineContext";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import { listProjects, loadProject as loadProjectFromDisk, deleteProject as deleteProjectFromDisk } from "../lib/services/projectService";
import { readFile } from "@tauri-apps/plugin-fs";
import type { ProjectSummary } from "../lib/services/projectService";
import type { SupportedLanguage } from "../lib/types/pipeline";

// 변환 소스 타입
interface ConvertSource {
  type: "link" | "file";
  value: string;
  fileName?: string;
  videoInfo?: VideoInfo;
}

export function Home() {
  const navigate = useNavigate();
  const { fetchCredits } = useAuth();
  const { startPipeline, cancelPipeline, progress, error, logs, result: pipelineResult, isProcessing, clearPipeline, loadPipelineResult } = usePipeline();

  const [savedProjects, setSavedProjects] = useState<ProjectSummary[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  
  // 새 프로젝트 생성 관련 상태
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showScriptModal, setShowScriptModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState("");

  // 프로젝트 변환 관련 상태
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [showConvertLanguageModal, setShowConvertLanguageModal] = useState(false);
  const [showConvertLoadingModal, setShowConvertLoadingModal] = useState(false);
  const [convertSource, setConvertSource] = useState<ConvertSource | null>(null);
  const [convertLanguages, setConvertLanguages] = useState<string[]>([]);

  // Credit state
  const [credits, setCredits] = useState<{ dailyLimit: number; usedToday: number; remaining: number; resetDate: string } | null>(null);
  const [creditError, setCreditError] = useState<string | null>(null);

  useEffect(() => {
    listProjects()
      .then(setSavedProjects)
      .catch(() => setSavedProjects([]))
      .finally(() => setProjectsLoading(false));
  }, []);

  useEffect(() => {
    const loadThumbnails = async () => {
      const urls: Record<string, string> = {};
      for (const project of savedProjects) {
        if (project.thumbnailPath) {
          try {
            const bytes = await readFile(project.thumbnailPath);
            const blob = new Blob([bytes], { type: "image/jpeg" });
            urls[project.id] = URL.createObjectURL(blob);
          } catch {
            // thumbnail file missing or unreadable, skip
          }
        }
      }
      setThumbnailUrls(prev => {
        Object.values(prev).forEach(URL.revokeObjectURL);
        return urls;
      });
    };
    loadThumbnails();
    return () => {
      setThumbnailUrls(prev => {
        Object.values(prev).forEach(URL.revokeObjectURL);
        return {};
      });
    };
  }, [savedProjects]);

  useEffect(() => {
    fetchCredits().then(setCredits);
  }, []);

  const clearProjectSessionStorage = () => {
    const keysToRemove = [
      "savedSubtitleStyle", "savedBlurRegion", "savedSelectedLanguage",
      "savedTextOverlays", "projectLanguages", "isConvertedProject",
      "convertSource", "convertSourceLanguage", "currentScenes",
    ];
    keysToRemove.forEach(key => sessionStorage.removeItem(key));
    // Also remove project_created_ keys
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key?.startsWith("project_created_")) sessionStorage.removeItem(key);
    }
  };

  const handleResumeProject = async (projectId: string) => {
    try {
      const project = await loadProjectFromDisk(projectId);

      // 1. Clear all stale session data
      clearProjectSessionStorage();

      // 2. Reset pipeline context
      clearPipeline();

      // 3. Load new project into pipeline context
      loadPipelineResult(project.pipelineResult);

      // 4. Store project-specific state for editor restoration
      sessionStorage.setItem("projectLanguages", JSON.stringify(project.projectLanguages));
      sessionStorage.setItem("savedSubtitleStyle", JSON.stringify(project.subtitleStyle));
      sessionStorage.setItem("savedBlurRegion", JSON.stringify(project.blurRegion));
      sessionStorage.setItem("savedSelectedLanguage", project.selectedLanguage);
      sessionStorage.setItem("isConvertedProject", "true");
      if (project.textOverlays) {
        sessionStorage.setItem("savedTextOverlays", JSON.stringify(project.textOverlays));
      }

      // 5. Navigate with projectId key to force editor remount
      navigate("/editor", { state: { projectId: project.id } });
    } catch (err) {
      console.error("Failed to load project:", err);
    }
  };
  // 새 프로젝트 생성 핸들러
  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    setShowTemplateModal(false);
    setShowScriptModal(true);
  };

  const handleScriptComplete = (_script: string) => {
    setShowScriptModal(false);
    setShowSettingsModal(true);
  };

  const handleSettingsComplete = (settings: { duration: number; languages: string[] }) => {
    sessionStorage.setItem("projectDuration", settings.duration.toString());
    sessionStorage.setItem("projectLanguages", JSON.stringify(settings.languages));
    setShowSettingsModal(false);
    navigate("/editor");
  };

  // 프로젝트 변환 핸들러
  const handleConvertSourceSubmit = (source: ConvertSource) => {
    setConvertSource(source);
    setShowConvertModal(false);
    setShowConvertLanguageModal(true);
  };

  const handleConvertLanguageBack = () => {
    setShowConvertLanguageModal(false);
    setShowConvertModal(true);
  };

  const handleConvertStart = async (sourceLanguage: string, targetLanguages: string[]) => {
    // Credit check — deduct one credit before starting pipeline
    try {
      const res = await api.post('/api/v1/credits/deduct');
      setCredits({
        dailyLimit: res.data.daily_limit,
        usedToday: res.data.used_today,
        remaining: res.data.remaining,
        resetDate: res.data.reset_date,
      });
    } catch (err: any) {
      if (err.response?.status === 403) {
        setCreditError("오늘의 크레딧을 모두 사용했습니다 (5/5). 내일 다시 시도해주세요.");
        setShowConvertLanguageModal(false);
        return;
      }
    }

    setConvertLanguages(targetLanguages);
    setShowConvertLanguageModal(false);
    setShowConvertLoadingModal(true);
    sessionStorage.setItem("convertSourceLanguage", sourceLanguage);
    if (convertSource) {
      const videoPath = convertSource.type === "link"
        ? (convertSource.videoInfo?.localFilePath || convertSource.value)
        : convertSource.value;
      // 첫 번째 대상 언어로 파이프라인 시작 (원본 언어는 제외됨)
      startPipeline(videoPath, targetLanguages[0] as SupportedLanguage);
    }
  };

  const handleConvertComplete = () => {
    sessionStorage.setItem("projectLanguages", JSON.stringify(convertLanguages));
    sessionStorage.setItem("isConvertedProject", "true");
    if (convertSource) {
      sessionStorage.setItem("convertSource", JSON.stringify(convertSource));
    }
    setShowConvertLoadingModal(false);
    navigate("/editor", { state: { projectId: pipelineResult?.projectId || `new-${Date.now()}` } });
  };

  const handleDeleteProject = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation(); // Don't trigger card click
    if (!confirm("이 프로젝트를 삭제하시겠습니까?")) return;
    try {
      await deleteProjectFromDisk(projectId);
      setSavedProjects(prev => prev.filter(p => p.id !== projectId));
      setThumbnailUrls(prev => {
        const newUrls = { ...prev };
        if (newUrls[projectId]) {
          URL.revokeObjectURL(newUrls[projectId]);
          delete newUrls[projectId];
        }
        return newUrls;
      });
    } catch (err) {
      console.error("Failed to delete project:", err);
    }
  };
  useEffect(() => {
    if (showConvertLoadingModal && !isProcessing && pipelineResult) {
      if (pipelineResult.status === "done") {
        handleConvertComplete();
      }
    }
  }, [showConvertLoadingModal, isProcessing, pipelineResult]);

  return (
    <div className="max-w-6xl mx-auto p-8 space-y-8">
      {/* Create / Convert Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 새 프로젝트 생성 버튼 */}
        <button
          onClick={() => setShowTemplateModal(true)}
          className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-dashed border-blue-200 rounded-2xl p-6 text-center hover:border-blue-400 hover:bg-gradient-to-br hover:from-blue-100 hover:to-indigo-100 transition-all group cursor-pointer"
        >
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-blue-500 flex items-center justify-center group-hover:scale-105 transition-transform shadow-lg shadow-blue-500/30">
              <Plus size={28} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-0.5">
                새 프로젝트
              </h2>
              <p className="text-gray-500 text-sm">템플릿을 선택해서 쇼츠 만들기</p>
            </div>
          </div>
        </button>

        {/* 프로젝트 다국어 전환 버튼 */}
        <button
          onClick={() => setShowConvertModal(true)}
          className="bg-gradient-to-br from-emerald-50 to-teal-50 border-2 border-dashed border-emerald-200 rounded-2xl p-6 text-center hover:border-emerald-400 hover:bg-gradient-to-br hover:from-emerald-100 hover:to-teal-100 transition-all group cursor-pointer"
        >
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center group-hover:scale-105 transition-transform shadow-lg shadow-emerald-500/30">
              <Languages size={28} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-0.5">
                프로젝트 다국어 전환
              </h2>
              <p className="text-gray-500 text-sm">쇼츠를 여러 언어로 자동 번역</p>
            </div>
          </div>
        </button>
      </div>

      {/* Credit Display */}
      {credits && (
        <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-5 py-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <span className="text-amber-600 text-sm font-bold">⚡</span>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">오늘의 크레딧</p>
              <p className="text-xs text-gray-400">매일 자정에 초기화됩니다</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {Array.from({ length: credits.dailyLimit }).map((_, i) => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-full ${
                    i < credits.remaining
                      ? 'bg-amber-400'
                      : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>
            <span className="text-sm font-bold text-gray-900">
              {credits.remaining}/{credits.dailyLimit}
            </span>
          </div>
        </div>
      )}

      {/* Credit Error Banner */}
      {creditError && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-3 bg-red-500 text-white px-5 py-3 rounded-xl shadow-lg shadow-red-500/30">
            <span className="font-medium">{creditError}</span>
            <button onClick={() => setCreditError(null)} className="p-1 hover:bg-white/20 rounded-full transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Projects Section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">내 프로젝트</h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={16}
              />
              <input
                type="text"
                placeholder="검색"
                className="bg-white border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>
            <button className="p-2.5 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors">
              <MoreVertical size={20} />
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {/* Placeholders */}
          {projectsLoading ? (
            /* loading state */
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="aspect-[9/16] rounded-2xl bg-gray-100 border border-gray-200 animate-pulse" />
            ))
          ) : savedProjects.length > 0 ? (
            savedProjects.map((project) => (
              <div
                key={project.id}
                onClick={() => handleResumeProject(project.id)}
                className="aspect-[9/16] rounded-2xl bg-white border border-gray-200 flex flex-col overflow-hidden cursor-pointer hover:shadow-lg hover:border-blue-300 transition-all group"
              >
                <div className="flex-1 bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center overflow-hidden">
                  {thumbnailUrls[project.id] ? (
                    <img src={thumbnailUrls[project.id]} alt={project.name} className="w-full h-full object-cover" />
                  ) : (
                    <Languages size={40} className="text-blue-300 group-hover:text-blue-400 transition-colors" />
                  )}
                </div>
                <div className="p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-900 truncate flex-1">{project.name}</h3>
                    <button
                      onClick={(e) => handleDeleteProject(e, project.id)}
                      className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      title="프로젝트 삭제"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400">
                    {new Date(project.updatedAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </p>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-medium">
                      {project.sourceLanguage?.toUpperCase()} → {project.targetLanguage?.toUpperCase()}
                    </span>
                  </div>
              </div>
              </div>
            ))
          ) : (
            <div className="col-span-full py-12 text-center">
              <p className="text-sm text-gray-400">아직 저장된 프로젝트가 없습니다</p>
              <p className="text-xs text-gray-300 mt-1">프로젝트를 변환하면 자동으로 저장됩니다</p>
            </div>
          )}

        </div>
      </div>

      {/* === 새 프로젝트 생성 모달들 === */}
      
      {/* Template Modal */}
      <TemplateModal
        isOpen={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        onSelect={handleTemplateSelect}
      />

      {/* Script Modal */}
      <ScriptModal
        isOpen={showScriptModal}
        onClose={() => setShowScriptModal(false)}
        onComplete={handleScriptComplete}
        templateId={selectedTemplate}
      />

      {/* Project Settings Modal */}
      <ProjectSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        onComplete={handleSettingsComplete}
      />

      {/* === 프로젝트 변환 모달들 === */}
      
      {/* Convert Modal - 링크/파일 입력 */}
      <ConvertModal
        isOpen={showConvertModal}
        onClose={() => setShowConvertModal(false)}
        onNext={handleConvertSourceSubmit}
      />

      {/* Convert Language Modal - 언어 선택 */}
      {convertSource && (
        <ConvertLanguageModal
          isOpen={showConvertLanguageModal}
          onClose={() => {
            setShowConvertLanguageModal(false);
            setConvertSource(null);
          }}
          onBack={handleConvertLanguageBack}
          onStart={handleConvertStart}
          source={convertSource}
        />
      )}

      {/* Convert Loading Modal - 변환 진행 */}
      <ConvertLoadingModal
        isOpen={showConvertLoadingModal}
        onComplete={handleConvertComplete}
        onCancel={() => { cancelPipeline(); setShowConvertLoadingModal(false); }}
        languages={convertLanguages}
        pipelineProgress={progress ?? undefined}
        error={error ?? undefined}
        logs={logs}
        onRetry={() => {
          clearPipeline();
          if (convertSource) {
            const videoPath = convertSource.type === "link"
              ? (convertSource.videoInfo?.localFilePath || convertSource.value)
              : convertSource.value;
            startPipeline(videoPath, convertLanguages[0] as SupportedLanguage);
          }
        }}
      />
    </div>
  );
}

