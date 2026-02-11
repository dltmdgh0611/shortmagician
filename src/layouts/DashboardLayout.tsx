import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Home as HomeIcon,
  LayoutTemplate,
  UploadCloud,
  Settings,
} from "lucide-react";

export function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 p-6 flex flex-col gap-8 shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-3 px-2">
          <img src="/logo.png" alt="ShortMagician" className="w-9 h-9 rounded-xl object-cover" />
          <span className="font-bold text-xl tracking-tight text-gray-900">
            ShortMagician
          </span>
        </div>

        {/* Navigation */}
        <nav className="space-y-1">
          <NavItem
            icon={<HomeIcon size={20} />}
            label="홈"
            active={isActive("/")}
            onClick={() => navigate("/")}
          />
          <NavItem
            icon={<LayoutTemplate size={20} />}
            label="템플릿"
            active={isActive("/templates")}
            onClick={() => navigate("/templates")}
          />
          <NavItem
            icon={<UploadCloud size={20} />}
            label="업로드"
            active={isActive("/upload")}
            onClick={() => navigate("/upload")}
          />
          <NavItem
            icon={<Settings size={20} />}
            label="설정"
            active={isActive("/settings")}
            onClick={() => navigate("/settings")}
          />
        </nav>

        {/* User Profile (Bottom) */}
        <div className="mt-auto pt-6 border-t border-gray-100">
          <div className="flex items-center gap-3 px-2">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center text-white text-xs font-bold">
              A
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">Admin</p>
              <p className="text-xs text-gray-500 truncate">admin@shortmagician.com</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-gray-50">
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({
  icon,
  label,
  active = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all
        ${
          active
            ? "bg-blue-50 text-blue-600"
            : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
        }
      `}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
