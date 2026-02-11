import { Outlet, Link } from "react-router-dom";

export function AppLayout() {
  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* 모바일: 상단 네비 | 데스크톱: 사이드바 */}
      <header className="md:w-48 md:min-h-screen flex-shrink-0 border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <nav className="flex md:flex-col gap-1 p-3" role="navigation">
          <Link
            to="/"
            className="min-h-[44px] md:min-h-[44px] flex items-center px-4 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors touch-manipulation"
          >
            Home
          </Link>
        </nav>
      </header>
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}
