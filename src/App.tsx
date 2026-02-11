import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { DashboardLayout } from "./layouts/DashboardLayout";
import { Home } from "./pages/Home";
import { Templates } from "./pages/Templates";
import { Upload } from "./pages/Upload";
import { Settings } from "./pages/Settings";
import { ShortsEditor } from "./pages/ShortsEditor";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Dashboard Routes (Shared Sidebar) */}
        <Route element={<DashboardLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/settings" element={<Settings />} />
        </Route>

        {/* Fullscreen Editor Route */}
        <Route path="/editor" element={<ShortsEditor />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
