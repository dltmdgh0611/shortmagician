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
import { Loader2 } from "lucide-react";
import { api } from "./lib/api";

const EarlybirdModalContext = createContext<{ open: () => void } | null>(null);
export const useEarlybirdModal = () => useContext(EarlybirdModalContext);

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
