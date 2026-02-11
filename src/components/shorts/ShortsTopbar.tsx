import { useNavigate } from "react-router-dom";
import {
  Scissors,
  SquarePlus,
  CirclePlus,
  Activity,
  Save,
  Download,
  ChevronLeft,
} from "lucide-react";

interface ShortsTopbarProps {
  onExport?: () => void;
}

export function ShortsTopbar({ onExport }: ShortsTopbarProps) {
  const navigate = useNavigate();

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-2 md:px-4 shrink-0 select-none">
      {/* Left: Home Button */}
      <div className="flex items-center gap-2">
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
        <ToolButton icon={<Scissors size={18} />} label="컷 편집" active />
        <ToolButton icon={<SquarePlus size={18} />} label="장면 추가" />
        <ToolButton icon={<CirclePlus size={18} />} label="요소" />
        <ToolButton icon={<Activity size={18} />} label="타임라인" />
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1 md:gap-3">
        <button className="flex items-center gap-1 md:gap-2 px-2 md:px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors">
          <Save size={18} />
          <span className="hidden md:inline">저장</span>
        </button>
        <button
          onClick={onExport}
          className="flex items-center gap-1 md:gap-2 px-3 md:px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-xl shadow-lg shadow-blue-500/20 transition-all hover:translate-y-[-1px] active:translate-y-[0px]"
        >
          <Download size={18} />
          <span className="hidden sm:inline">내보내기</span>
        </button>
      </div>
    </header>
  );
}

function ToolButton({
  icon,
  label,
  active = false,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
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
