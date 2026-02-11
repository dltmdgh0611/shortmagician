import { useState, useEffect } from "react";
import { ShortsTopbar } from "../components/shorts/ShortsTopbar";
import { ShortsLeftPanel } from "../components/shorts/ShortsLeftPanel";
import { ShortsCenterPanel, Scene } from "../components/shorts/ShortsCenterPanel";
import { ShortsRightPanel } from "../components/shorts/ShortsRightPanel";
import { ExportModal } from "../components/modals/ExportModal";
import { UploadModal } from "../components/modals/UploadModal";
import { Play, FileText, ImageIcon, CheckCircle, X } from "lucide-react";

type MobileTab = "preview" | "script" | "image";

export function ShortsEditor() {
  const [showExportModal, setShowExportModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [projectLanguages, setProjectLanguages] = useState<string[]>(["ko"]);
  const [selectedLanguage, setSelectedLanguage] = useState("ko");
  const [selectedSceneId, setSelectedSceneId] = useState<number | null>(null);
  const [mobileActiveTab, setMobileActiveTab] = useState<MobileTab>("preview");
  const [showConvertToast, setShowConvertToast] = useState(false);

  // Load project data from session storage
  useEffect(() => {
    const savedScenes = sessionStorage.getItem("currentScenes");
    const savedLanguages = sessionStorage.getItem("projectLanguages");
    const isConverted = sessionStorage.getItem("isConvertedProject");
    
    if (savedScenes) {
      setScenes(JSON.parse(savedScenes));
    }
    if (savedLanguages) {
      setProjectLanguages(JSON.parse(savedLanguages));
    }
    
    // 변환된 프로젝트인 경우 토스트 표시
    if (isConverted === "true") {
      setShowConvertToast(true);
      sessionStorage.removeItem("isConvertedProject");
      // 3초 후 자동으로 토스트 숨김
      const timer = setTimeout(() => setShowConvertToast(false), 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleExport = () => {
    setShowExportModal(true);
  };

  const handleExportComplete = () => {
    setShowExportModal(false);
    // Automatically open upload modal after export
    setTimeout(() => {
      setShowUploadModal(true);
    }, 500);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 text-gray-900 overflow-hidden">
      <ShortsTopbar onExport={handleExport} />

      {/* Desktop Layout (md and above) */}
      <div className="hidden md:flex flex-1 overflow-hidden">
        <ShortsLeftPanel scenes={scenes} selectedSceneId={selectedSceneId} />
        <ShortsCenterPanel
          scenes={scenes}
          onScenesChange={setScenes}
          languages={projectLanguages}
          selectedLanguage={selectedLanguage}
          onLanguageChange={setSelectedLanguage}
          selectedSceneId={selectedSceneId}
          onSceneSelect={setSelectedSceneId}
        />
        <ShortsRightPanel
          selectedSceneId={selectedSceneId}
          onClose={() => setSelectedSceneId(null)}
        />
      </div>

      {/* Mobile Layout (below md) */}
      <div className="flex md:hidden flex-1 flex-col overflow-hidden">
        {/* Tab Content */}
        <div className="flex-1 overflow-hidden">
          {mobileActiveTab === "preview" && <ShortsLeftPanel scenes={scenes} selectedSceneId={selectedSceneId} />}
          {mobileActiveTab === "script" && (
            <ShortsCenterPanel
              scenes={scenes}
              onScenesChange={setScenes}
              languages={projectLanguages}
              selectedLanguage={selectedLanguage}
              onLanguageChange={setSelectedLanguage}
              selectedSceneId={selectedSceneId}
              onSceneSelect={(id) => {
                setSelectedSceneId(id);
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
        onExportComplete={handleExportComplete}
        languages={projectLanguages}
      />

      {/* Upload Modal */}
      <UploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        exportedLanguages={projectLanguages}
      />

      {/* 변환 완료 토스트 */}
      {showConvertToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-slideDown">
          <div className="flex items-center gap-3 bg-green-500 text-white px-5 py-3 rounded-xl shadow-lg shadow-green-500/30">
            <CheckCircle size={20} />
            <span className="font-medium">변환이 완료되었습니다!</span>
            <button
              onClick={() => setShowConvertToast(false)}
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
