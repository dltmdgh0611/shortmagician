import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, MoreVertical, Clock, Languages } from "lucide-react";
import { TemplateModal } from "../components/modals/TemplateModal";
import { ScriptModal } from "../components/modals/ScriptModal";
import { ProjectSettingsModal } from "../components/modals/ProjectSettingsModal";
import { ConvertModal } from "../components/modals/ConvertModal";
import { ConvertLanguageModal } from "../components/modals/ConvertLanguageModal";
import { ConvertLoadingModal } from "../components/modals/ConvertLoadingModal";

// 변환 소스 타입
interface ConvertSource {
  type: "link" | "file";
  value: string;
  fileName?: string;
}

export function Home() {
  const navigate = useNavigate();
  
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
  const [convertLanguages, setConvertLanguages] = useState<string[]>(["ko"]);

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

  const handleConvertStart = (languages: string[]) => {
    setConvertLanguages(languages);
    setShowConvertLanguageModal(false);
    setShowConvertLoadingModal(true);
  };

  const handleConvertComplete = () => {
    // 변환 완료 후 에디터로 이동
    // 시연용 고정 스크립트 (한국어 원본)
    const mockConvertedScenes = [
      { id: 1, text: "하루 5분 혈액순환 운동", duration: 3 },
      { id: 2, text: "하루 5분 이 운동만으로도", duration: 3 },
      { id: 3, text: "혈액순환이 달라집니다", duration: 3 },
      { id: 4, text: "특별한 도구는 필요 없습니다", duration: 3 },
    ];
    
    // 시연용 고정 언어: 한국어 + 일본어
    const demoLanguages = ["ko", "ja"];
    
    sessionStorage.setItem("currentScenes", JSON.stringify(mockConvertedScenes));
    sessionStorage.setItem("projectLanguages", JSON.stringify(demoLanguages));
    sessionStorage.setItem("projectDuration", "15");
    sessionStorage.setItem("isConvertedProject", "true");
    sessionStorage.setItem("convertSource", JSON.stringify(convertSource));
    
    setShowConvertLoadingModal(false);
    navigate("/editor");
  };

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
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div
              key={i}
              className="aspect-[9/16] rounded-2xl bg-gray-100 border-2 border-dashed border-gray-200 flex items-center justify-center"
            >
              <div className="text-gray-400 text-sm">빈 슬롯</div>
            </div>
          ))}
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
        languages={convertLanguages}
      />
    </div>
  );
}

function ProjectCard({
  title,
  date,
  thumbnail,
}: {
  title: string;
  date: string;
  thumbnail: string;
}) {
  return (
    <div className="group cursor-pointer">
      <div
        className={`aspect-[9/16] rounded-2xl mb-3 overflow-hidden border border-gray-200 ${thumbnail} relative shadow-sm hover:shadow-md transition-shadow`}
      >
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
          <button className="bg-white text-gray-900 px-4 py-2 rounded-full font-semibold text-sm transform translate-y-2 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all shadow-lg">
            편집하기
          </button>
        </div>
      </div>
      <div>
        <h3 className="font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
          {title}
        </h3>
        <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-1">
          <Clock size={12} />
          <span>{date}</span>
        </div>
      </div>
    </div>
  );
}
