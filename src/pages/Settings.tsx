import { useState, useEffect, useCallback, useRef } from "react";
import { Bell, User, Lock, HelpCircle, ChevronRight, Youtube, Plus, Trash2, Gift, Loader2, ExternalLink, Check, FlaskConical } from "lucide-react";
import { useEarlybirdModal } from "../App";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import { openUrl } from "../lib/openUrl";
import { useNavigate } from "react-router-dom";

interface YouTubeChannel {
  id: string;
  channel_id: string;
  channel_title: string;
  thumbnail_url: string;
  subscriber_count: string;
  google_email: string;
  connected_at: string;
}


const INPUT_CLASS =
  "w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all";

export function Settings() {
  const earlybirdModal = useEarlybirdModal();
  const { state, updateUserProfile, changePassword, refreshProfile } = useAuth();
  const isEarlybird = state.profile?.plan === "earlybird";
  const navigate = useNavigate();

  // Refresh user profile (earlybird plan, etc.) every time Settings page is entered
  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  // YouTube connection state
  const [ytChannels, setYtChannels] = useState<YouTubeChannel[]>([]);
  const [ytLoading, setYtLoading] = useState(true);
  const [ytConnecting, setYtConnecting] = useState(false);
  const [ytError, setYtError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Export directory state
  const [exportDir, setExportDir] = useState("");

  // Load export directory from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("shortmagician_export_dir");
    if (saved) {
      setExportDir(saved);
    }
  }, []);

  const handleExportDirChange = (value: string) => {
    setExportDir(value);
    if (value.trim()) {
      localStorage.setItem("shortmagician_export_dir", value.trim());
    } else {
      localStorage.removeItem("shortmagician_export_dir");
    }
  };
  // Fetch YouTube connections
  const fetchYtChannels = useCallback(async () => {
    try {
      const res = await api.get("/api/v1/youtube/connections");
      setYtChannels(res.data.channels ?? []);
      setYtError(null);
    } catch {
      // Backend may be down — show empty
      setYtChannels([]);
    } finally {
      setYtLoading(false);
    }
  }, []);

  // Load channels on mount
  useEffect(() => {
    fetchYtChannels();
  }, [fetchYtChannels]);

  // Cleanup poll on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Profile edit state
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Password change state
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [pwValidation, setPwValidation] = useState<string | null>(null);

  // Notification state
  const notificationEnabled = state.profile?.notificationEnabled ?? true;
  const [notifToggling, setNotifToggling] = useState(false);

  // Lab state
  const [labPassword, setLabPassword] = useState("");
  const [labError, setLabError] = useState<string | null>(null);

  // Sync profile name when profile loads or form opens
  useEffect(() => {
    if (profileOpen) {
      setProfileName(state.profile?.displayName || state.user?.displayName || "");
    }
  }, [profileOpen, state.profile?.displayName, state.user?.displayName]);

  // Auto-dismiss messages
  useEffect(() => {
    if (profileMsg) {
      const t = setTimeout(() => setProfileMsg(null), 3000);
      return () => clearTimeout(t);
    }
  }, [profileMsg]);

  useEffect(() => {
    if (pwMsg) {
      const t = setTimeout(() => setPwMsg(null), 3000);
      return () => clearTimeout(t);
    }
  }, [pwMsg]);

  const handleDisconnect = async (channelId: string) => {
    try {
      await api.delete(`/api/v1/youtube/connections/${channelId}`);
      setYtChannels((prev) => prev.filter((c) => c.channel_id !== channelId));
    } catch {
      setYtError("채널 연결 해제에 실패했습니다");
    }
  };


  const handleConnect = async () => {
    setYtConnecting(true);
    setYtError(null);
    try {
      const res = await api.get("/api/v1/youtube/auth-url");
      const authUrl: string = res.data.auth_url;

      // Open Google OAuth in system browser
      openUrl(authUrl);

      // Poll for new connections every 3s for up to 2 minutes
      const prevCount = ytChannels.length;
      let elapsed = 0;
      pollRef.current = setInterval(async () => {
        elapsed += 3000;
        try {
          const pollRes = await api.get("/api/v1/youtube/connections");
          const newChannels: YouTubeChannel[] = pollRes.data.channels ?? [];
          if (newChannels.length > prevCount) {
            // New channel detected — stop polling
            setYtChannels(newChannels);
            setYtConnecting(false);
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
          }
        } catch {
          // ignore poll errors
        }
        if (elapsed >= 120000) {
          // Timeout — stop polling
          setYtConnecting(false);
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }, 3000);
    } catch {
      setYtError("YouTube 연동을 시작할 수 없습니다. 백엔드가 실행 중인지 확인해주세요.");
      setYtConnecting(false);
    }
  };

  // Profile save
  const handleProfileSave = async () => {
    const trimmed = profileName.trim();
    if (!trimmed) return;
    setProfileSaving(true);
    setProfileMsg(null);
    try {
      await updateUserProfile({ displayName: trimmed });
      setProfileMsg({ type: "success", text: "이름이 변경되었습니다" });
      setTimeout(() => setProfileOpen(false), 1500);
    } catch {
      setProfileMsg({ type: "error", text: "프로필 저장에 실패했습니다" });
    } finally {
      setProfileSaving(false);
    }
  };

  // Password validation
  useEffect(() => {
    if (!passwordOpen) {
      setPwValidation(null);
      return;
    }
    if (newPw && newPw.length < 6) {
      setPwValidation("비밀번호는 6자 이상이어야 합니다");
    } else if (confirmPw && newPw !== confirmPw) {
      setPwValidation("새 비밀번호가 일치하지 않습니다");
    } else {
      setPwValidation(null);
    }
  }, [newPw, confirmPw, passwordOpen]);

  // Password change
  const handlePasswordChange = async () => {
    if (newPw.length < 6 || newPw !== confirmPw || !currentPw) return;
    setPwSaving(true);
    setPwMsg(null);
    try {
      await changePassword(currentPw, newPw);
      setPwMsg({ type: "success", text: "비밀번호가 변경되었습니다" });
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      setTimeout(() => setPasswordOpen(false), 1500);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || "";
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setPwMsg({ type: "error", text: "현재 비밀번호가 올바르지 않습니다" });
      } else if (code === "auth/weak-password") {
        setPwMsg({ type: "error", text: "비밀번호는 6자 이상이어야 합니다" });
      } else {
        setPwMsg({ type: "error", text: "비밀번호 변경에 실패했습니다" });
      }
    } finally {
      setPwSaving(false);
    }
  };

  // Notification toggle
  const handleNotifToggle = async () => {
    setNotifToggling(true);
    try {
      await updateUserProfile({ notificationEnabled: !notificationEnabled });
    } catch {
      // silent — profile refresh will correct state
    } finally {
      setNotifToggling(false);
    }
  };

  // Lab entry
  const handleLabEnter = () => {
    if (labPassword === "tiuygjhbnm,") {
      navigate("/lab");
    } else {
      setLabError("잘못된 암호입니다");
    }
  };

  const email = state.user?.email || "";

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-8">설정</h2>

      <div className="space-y-6">
        {/* YouTube 계정 연결 섹션 */}
        <Section title="YouTube 계정 연결">
          <div className="p-4 space-y-4">
            {/* Error banner */}
            {ytError && (
              <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                {ytError}
              </div>
            )}

            {/* Loading state */}
            {ytLoading ? (
              <div className="flex items-center justify-center py-6 text-gray-400">
                <Loader2 size={24} className="animate-spin" />
              </div>
            ) : ytChannels.length > 0 ? (
              <div className="space-y-3">
                {ytChannels.map((channel) => (
                  <div
                    key={channel.channel_id}
                    className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center text-white font-bold text-lg overflow-hidden">
                            {channel.thumbnail_url ? (
                              <img
                                src={channel.thumbnail_url}
                                alt={channel.channel_title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Youtube size={20} className="text-white" />
                            )}
                          </div>
                          <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-sm">
                            <Youtube size={12} className="text-red-500" />
                          </div>
                        </div>
                        <div>
                          <span className="font-semibold text-gray-900 block">
                            {channel.channel_title}
                          </span>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span>{channel.google_email}</span>
                            <span>•</span>
                            <span>구독자 {channel.subscriber_count}</span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDisconnect(channel.channel_id)}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="연결 해제"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-gray-500">
                <Youtube size={32} className="mx-auto mb-2 text-gray-300" />
                <p className="text-sm">연결된 YouTube 채널이 없습니다</p>
              </div>
            )}

            {/* 새 채널 연결 버튼 */}
            <button
              onClick={handleConnect}
              disabled={ytConnecting}
              className={`w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed rounded-xl transition-all ${
                ytConnecting
                  ? "border-gray-200 text-gray-400 cursor-not-allowed"
                  : "border-gray-200 text-gray-500 hover:text-red-500 hover:border-red-300 hover:bg-red-50"
              }`}
            >
              {ytConnecting ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  <span className="font-medium">Google 로그인 대기 중...</span>
                </>
              ) : (
                <>
                  <Plus size={20} />
                  <span className="font-medium">새 YouTube 채널 연결</span>
                </>
              )}
            </button>
          </div>
        </Section>

        {/* 내보내기 설정 */}
        <Section title="내보내기">
          <div className="p-4 space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                내보내기 폴더
              </label>
              <p className="text-xs text-gray-400 mb-2">
                비워두면 시스템 다운로드 폴더에 저장됩니다.
              </p>
              <input
                type="text"
                value={exportDir}
                onChange={(e) => handleExportDirChange(e.target.value)}
                placeholder="예: D:\\Videos\\Shorts"
                className={INPUT_CLASS}
              />
            </div>
          </div>
        </Section>

        <Section title="플랜">
          {isEarlybird ? (
            <div className="flex items-center gap-3 px-4 py-3 text-sm">
              <Gift size={18} className="text-amber-500" />
              <div>
                <span className="font-medium text-gray-900">얼리버드 플랜</span>
                <span className="ml-2 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">무제한</span>
              </div>
            </div>
          ) : (
            <button
              onClick={() => earlybirdModal?.open()}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 rounded-xl transition-colors text-left"
            >
              <div className="flex items-center gap-3 text-gray-700">
                <Gift size={18} />
                <span className="text-sm font-medium">얼리버드 (무제한 라이선스) 등록</span>
              </div>
              <ChevronRight size={16} className="text-gray-400" />
            </button>
          )}
        </Section>

        {/* 계정 설정 */}
        <Section title="계정 설정">
          {/* 프로필 수정 */}
          <div>
            <button
              onClick={() => {
                setProfileOpen(!profileOpen);
                setProfileMsg(null);
              }}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 rounded-xl transition-colors text-left"
            >
              <div className="flex items-center gap-3 text-gray-700">
                <User size={18} />
                <span className="text-sm font-medium">프로필 수정</span>
              </div>
              <ChevronRight
                size={16}
                className={`text-gray-400 transition-transform duration-200 ${profileOpen ? "rotate-90" : ""}`}
              />
            </button>

            {profileOpen && (
              <div className="px-4 pb-4 space-y-3">
                {/* Email (read-only) */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">이메일</label>
                  <div className="px-4 py-3 bg-gray-100 border border-gray-200 rounded-xl text-sm text-gray-500">
                    {email}
                  </div>
                </div>

                {/* Display name input */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">이름</label>
                  <input
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className={INPUT_CLASS}
                    placeholder="이름을 입력하세요"
                  />
                </div>

                {/* Messages */}
                {profileMsg && (
                  <div
                    className={`px-4 py-3 rounded-xl text-sm flex items-center gap-2 ${
                      profileMsg.type === "success"
                        ? "bg-green-50 border border-green-200 text-green-600"
                        : "bg-red-50 border border-red-200 text-red-600"
                    }`}
                  >
                    {profileMsg.type === "success" && <Check size={14} />}
                    {profileMsg.text}
                  </div>
                )}

                {/* Buttons */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={handleProfileSave}
                    disabled={profileSaving || !profileName.trim()}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors"
                  >
                    {profileSaving && <Loader2 size={14} className="animate-spin" />}
                    저장
                  </button>
                  <button
                    onClick={() => {
                      setProfileOpen(false);
                      setProfileMsg(null);
                    }}
                    className="px-5 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    취소
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 비밀번호 변경 */}
          <div>
            <button
              onClick={() => {
                setPasswordOpen(!passwordOpen);
                setPwMsg(null);
                setPwValidation(null);
                if (!passwordOpen) {
                  setCurrentPw("");
                  setNewPw("");
                  setConfirmPw("");
                }
              }}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 rounded-xl transition-colors text-left"
            >
              <div className="flex items-center gap-3 text-gray-700">
                <Lock size={18} />
                <span className="text-sm font-medium">비밀번호 변경</span>
              </div>
              <ChevronRight
                size={16}
                className={`text-gray-400 transition-transform duration-200 ${passwordOpen ? "rotate-90" : ""}`}
              />
            </button>

            {passwordOpen && (
              <div className="px-4 pb-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">현재 비밀번호</label>
                  <input
                    type="password"
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    className={INPUT_CLASS}
                    placeholder="현재 비밀번호를 입력하세요"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">새 비밀번호</label>
                  <input
                    type="password"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    className={INPUT_CLASS}
                    placeholder="새 비밀번호 (6자 이상)"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">새 비밀번호 확인</label>
                  <input
                    type="password"
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    className={INPUT_CLASS}
                    placeholder="새 비밀번호를 다시 입력하세요"
                  />
                </div>

                {/* Validation */}
                {pwValidation && (
                  <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                    {pwValidation}
                  </div>
                )}

                {/* Messages */}
                {pwMsg && (
                  <div
                    className={`px-4 py-3 rounded-xl text-sm flex items-center gap-2 ${
                      pwMsg.type === "success"
                        ? "bg-green-50 border border-green-200 text-green-600"
                        : "bg-red-50 border border-red-200 text-red-600"
                    }`}
                  >
                    {pwMsg.type === "success" && <Check size={14} />}
                    {pwMsg.text}
                  </div>
                )}

                {/* Buttons */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={handlePasswordChange}
                    disabled={
                      pwSaving ||
                      !currentPw ||
                      newPw.length < 6 ||
                      newPw !== confirmPw
                    }
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors"
                  >
                    {pwSaving && <Loader2 size={14} className="animate-spin" />}
                    변경하기
                  </button>
                  <button
                    onClick={() => {
                      setPasswordOpen(false);
                      setPwMsg(null);
                      setCurrentPw("");
                      setNewPw("");
                      setConfirmPw("");
                    }}
                    className="px-5 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    취소
                  </button>
                </div>
              </div>
            )}
          </div>
        </Section>

        {/* 앱 설정 */}
        <Section title="앱 설정">
          {/* 알림 설정 — toggle switch */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3 text-gray-700">
              <Bell size={18} />
              <span className="text-sm font-medium">알림 설정</span>
            </div>
            <button
              onClick={handleNotifToggle}
              disabled={notifToggling}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                notificationEnabled ? "bg-blue-500" : "bg-gray-300"
              } ${notifToggling ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              role="switch"
              aria-checked={notificationEnabled}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                  notificationEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </Section>

        {/* 지원 */}
        <Section title="지원">
          <button
            onClick={() => openUrl("https://kmong.com/gig/665168")}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 rounded-xl transition-colors text-left"
          >
            <div className="flex items-center gap-3 text-gray-700">
              <HelpCircle size={18} />
              <span className="text-sm font-medium">도움말 및 지원</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ExternalLink size={14} className="text-gray-400" />
              <ChevronRight size={16} className="text-gray-400" />
            </div>
          </button>
        </Section>

        {/* 개발자 */}
        <Section title="개발자">
          <div className="px-4 py-3 space-y-3">
            <div className="flex items-center gap-3 text-gray-700">
              <FlaskConical size={18} />
              <span className="text-sm font-medium">실험실</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={labPassword}
                onChange={(e) => {
                  setLabPassword(e.target.value);
                  setLabError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleLabEnter();
                }}
                className={INPUT_CLASS}
                placeholder="암호를 입력하세요"
              />
              <button
                onClick={handleLabEnter}
                className="shrink-0 px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-xl transition-colors"
              >
                입장
              </button>
            </div>
            {labError && (
              <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                {labError}
              </div>
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
        <span className="text-sm font-semibold text-gray-500">{title}</span>
      </div>
      <div className="p-2">{children}</div>
    </div>
  );
}
