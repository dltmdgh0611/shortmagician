import { createContext, useContext, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { PipelineProvider } from "./contexts/PipelineContext";
import { AuthModal } from "./components/modals/AuthModal";
import { EarlybirdModal } from "./components/modals/EarlybirdModal";
import { DashboardLayout } from "./layouts/DashboardLayout";
import { Home } from "./pages/Home";
import { Templates } from "./pages/Templates";
import { Upload } from "./pages/Upload";
import { Settings } from "./pages/Settings";
import { ShortsEditor } from "./pages/ShortsEditor";
import { Lab } from "./pages/Lab";
import { Loader2, Download, X } from "lucide-react";
import { api } from "./lib/api";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

const EarlybirdModalContext = createContext<{ open: () => void } | null>(null);
export const useEarlybirdModal = () => useContext(EarlybirdModalContext);

// ── Auto-update banner ──────────────────────────────────────────────────────
function UpdateBanner() {
  const [status, setStatus] = useState<"idle" | "available" | "downloading" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [version, setVersion] = useState("");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ghToken = import.meta.env.VITE_GITHUB_TOKEN as string | undefined;
        const update = await check({
          headers: {
            ...(ghToken ? { Authorization: `token ${ghToken}` } : {}),
            Accept: "application/octet-stream",
          },
        });
        if (cancelled || !update) return;
        setVersion(update.version);
        setStatus("available");

        // Auto-start download
        setStatus("downloading");
        let contentLength = 0;
        let downloaded = 0;
        await update.downloadAndInstall((event) => {
          if (event.event === "Started") {
            contentLength = event.data.contentLength ?? 0;
          } else if (event.event === "Progress") {
            downloaded += event.data.chunkLength;
            if (contentLength > 0) setProgress(Math.round((downloaded / contentLength) * 100));
          } else if (event.event === "Finished") {
            setProgress(100);
          }
        });
        if (!cancelled) {
          setStatus("done");
          // Auto-relaunch after brief delay
          setTimeout(() => relaunch(), 1500);
        }
      } catch (e) {
        console.error("Update check failed:", e);
        if (!cancelled) setStatus("error");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (status === "idle" || status === "error" || dismissed) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-blue-600 text-white px-4 py-2.5 flex items-center justify-center gap-3 text-sm shadow-lg animate-slideDown">
      <Download size={16} className={status === "downloading" ? "animate-bounce" : ""} />
      {status === "available" && <span>새 버전 {version}을 다운로드 중...</span>}
      {status === "downloading" && (
        <div className="flex items-center gap-3">
          <span>업데이트 다운로드 중... {progress}%</span>
          <div className="w-32 h-1.5 bg-blue-400 rounded-full overflow-hidden">
            <div className="h-full bg-white rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
      {status === "done" && <span>업데이트 완료! 앱을 재시작합니다...</span>}
      {status !== "done" && (
        <button onClick={() => setDismissed(true)} className="p-1 hover:bg-blue-500 rounded transition-colors ml-2">
          <X size={14} />
        </button>
      )}
    </div>
  );
}

// Inner component that uses useAuth (must be inside AuthProvider)
function AppContent() {
  const { state, login, signup, refreshProfile, isNewSignup, clearNewSignup } = useAuth();
  const [showEarlybird, setShowEarlybird] = useState(false);
  const [earlybirdError, setEarlybirdError] = useState<string | null>(null);
  const [earlybirdLoading, setEarlybirdLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  // Show earlybird modal after new signup
  useEffect(() => {
    if (isNewSignup && state.status === "authenticated") {
      setShowEarlybird(true);
      clearNewSignup();
    }
  }, [isNewSignup, state.status]);

  const handleEarlybirdSubmit = async (code: string) => {
    setEarlybirdError(null);
    setEarlybirdLoading(true);
    try {
      const res = await api.post("/api/v1/earlybird/redeem", { code });
      if (res.data.success) {
        await refreshProfile();
        setShowEarlybird(false);
      } else {
        setEarlybirdError(res.data.message);
      }
    } catch (err: any) {
      setEarlybirdError(err.response?.data?.detail || "코드 등록에 실패했습니다");
    } finally {
      setEarlybirdLoading(false);
    }
  };

  const handleLogin = async (email: string, password: string) => {
    setAuthLoading(true);
    try {
      await login(email, password);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignup = async (email: string, password: string, displayName: string) => {
    setAuthLoading(true);
    try {
      await signup(email, password, displayName);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleEarlybirdSkip = () => {
    setShowEarlybird(false);
  };

  // Loading state — show spinner while Firebase auth initializes
  if (state.status === "loading") {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin text-blue-500" />
          <p className="text-sm text-gray-500">로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Auto-update banner */}
      <UpdateBanner />

      {/* Auth Modal — shown when unauthenticated */}
      <AuthModal
        isOpen={state.status === "unauthenticated"}
        onLogin={handleLogin}
        onSignup={handleSignup}
        error={state.error}
        loading={authLoading}
      />

      {/* Earlybird Modal — shown after signup or triggered from Settings */}
      <EarlybirdModal
        isOpen={showEarlybird}
        onSubmit={handleEarlybirdSubmit}
        onSkip={handleEarlybirdSkip}
        error={earlybirdError}
        loading={earlybirdLoading}
      />

      {/* App Routes — always rendered but hidden behind modal when unauth */}
      <EarlybirdModalContext.Provider value={{ open: () => setShowEarlybird(true) }}>
        <Routes>
          <Route element={<DashboardLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/lab" element={<Lab />} />
          </Route>
          <Route path="/editor" element={<ShortsEditorWrapper />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </EarlybirdModalContext.Provider>
    </>
  );
}

function ShortsEditorWrapper() {
  const location = useLocation();
  const projectKey = (location.state as { projectId?: string } | null)?.projectId || 'default';
  return <ShortsEditor key={projectKey} />;
}

function App() {
  return (
    <AuthProvider>
      <PipelineProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </PipelineProvider>
    </AuthProvider>
  );
}

export default App;
