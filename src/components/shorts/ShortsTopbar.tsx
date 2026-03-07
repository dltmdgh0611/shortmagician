import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Type,
  Shapes,
  EyeOff,
  Save,
  Download,
  ChevronLeft,
  ChevronDown,
  Youtube,
} from "lucide-react";

interface ShortsTopbarProps {
  onFileExport?: () => void;
  onYouTubeExport?: () => void;
  onSave?: () => void;
  blurEnabled?: boolean;
  onToggleBlur?: () => void;
  onAddText?: () => void;
}

export function ShortsTopbar({ onFileExport, onYouTubeExport, onSave, blurEnabled, onToggleBlur, onAddText }: ShortsTopbarProps) {
  const navigate = useNavigate();
  const [showElementToast, setShowElementToast] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    if (showExportMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showExportMenu]);


  const handleElementClick = () => {
    setShowElementToast(true);
    setTimeout(() => setShowElementToast(false), 2000);
  };

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center px-2 md:px-4 shrink-0 select-none">
      {/* Left: Home Button */}
      <div className="flex-1 flex items-center gap-2">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
        >
          <ChevronLeft size={18} />
          <span className="hidden sm:inline">홈으로</span>
        </button>
      </div>

      {/* Center: Tools - Hidden on mobile, shown on md+ */}
      <div className="hidden md:flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
        <ToolButton icon={<Type size={18} />} label="텍스트 추가" onClick={onAddText} />
        <div className="relative">
          <ToolButton icon={<Shapes size={18} />} label="요소 추가" onClick={handleElementClick} />
          {showElementToast && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 animate-fadeIn">
              <div className="whitespace-nowrap bg-gray-800 text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-lg">
                개발 진행중
              </div>
            </div>
          )}
        </div>
        <ToolButton icon={<EyeOff size={18} />} label="자막 블러" active={blurEnabled} onClick={onToggleBlur} />
      </div>

      {/* Right: Actions */}
      <div className="flex-1 flex items-center justify-end gap-1 md:gap-3">
        <button
          onClick={onSave}
          className="flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
        >
          <Save size={18} />
          <span className="hidden md:inline">저장</span>
        </button>
        <div className="relative" ref={exportMenuRef}>
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            className="flex items-center gap-1 md:gap-2 px-3 md:px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-xl shadow-lg shadow-blue-500/20 transition-all hover:translate-y-[-1px] active:translate-y-[0px]"
          >
            <Download size={18} />
            <span className="hidden sm:inline">내보내기</span>
            <ChevronDown size={14} className="ml-0.5 opacity-70" />
          </button>
          {showExportMenu && (
            <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-50 animate-fadeIn">
              <button
                onClick={() => {
                  onFileExport?.();
                  setShowExportMenu(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Download size={16} className="text-blue-500" />
                <span>파일로 내보내기</span>
              </button>
              <button
                onClick={() => {
                  onYouTubeExport?.();
                  setShowExportMenu(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Youtube size={16} className="text-red-500" />
                <span>유튜브로 내보내기</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function ToolButton({
  icon,
  label,
  active = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex flex-col items-center justify-center w-16 py-1.5 rounded-lg transition-all
        ${
          active
            ? "bg-white text-blue-600 shadow-sm"
            : "text-gray-500 hover:text-gray-700 hover:bg-white/50"
        }
      `}
      title={label}
    >
      {icon}
      <span className="text-[10px] mt-0.5 font-medium">{label}</span>
    </button>
  );
}
