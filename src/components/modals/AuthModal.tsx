import { useState, FormEvent } from "react";
import { Loader2, Eye, EyeOff } from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onLogin: (email: string, password: string) => Promise<void>;
  onSignup: (
    email: string,
    password: string,
    displayName: string
  ) => Promise<void>;
  error: string | null;
  loading: boolean;
}

type AuthTab = "login" | "signup";

export function AuthModal({
  isOpen,
  onLogin,
  onSignup,
  error,
  loading,
}: AuthModalProps) {
  const [tab, setTab] = useState<AuthTab>("login");

  // Login fields
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Signup fields
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupPasswordConfirm, setSignupPasswordConfirm] = useState("");
  const [signupName, setSignupName] = useState("");
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showSignupPasswordConfirm, setShowSignupPasswordConfirm] =
    useState(false);

  // Validation errors
  const [validationError, setValidationError] = useState<string | null>(null);

  if (!isOpen) return null;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const handleLoginSubmit = (e: FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!emailRegex.test(loginEmail)) {
      setValidationError("올바른 이메일 형식이 아닙니다");
      return;
    }
    if (loginPassword.length < 6) {
      setValidationError("비밀번호는 6자 이상이어야 합니다");
      return;
    }

    onLogin(loginEmail, loginPassword);
  };

  const handleSignupSubmit = (e: FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!emailRegex.test(signupEmail)) {
      setValidationError("올바른 이메일 형식이 아닙니다");
      return;
    }
    if (signupPassword.length < 6) {
      setValidationError("비밀번호는 6자 이상이어야 합니다");
      return;
    }
    if (signupPassword !== signupPasswordConfirm) {
      setValidationError("비밀번호가 일치하지 않습니다");
      return;
    }
    if (signupName.length < 1) {
      setValidationError("이름을 입력해주세요");
      return;
    }
    if (signupName.length > 50) {
      setValidationError("이름은 50자 이하여야 합니다");
      return;
    }

    onSignup(signupEmail, signupPassword, signupName);
  };

  const displayedError = error || validationError;

  const handleTabSwitch = (newTab: AuthTab) => {
    if (loading) return;
    setTab(newTab);
    setValidationError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fadeIn">
      {/* Backdrop — no onClick, cannot dismiss */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative bg-white rounded-3xl w-full max-w-md mx-4 shadow-2xl animate-slideUp">
        {/* Header */}
        <div className="px-6 pt-6 pb-0">
          <h2 className="text-xl font-bold text-gray-900 text-center">
            환영합니다
          </h2>
          <p className="text-sm text-gray-500 text-center mt-1">
            계정에 로그인하거나 새로 가입하세요
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="px-6 pt-5">
          <div className="flex bg-gray-100 rounded-xl p-1">
            <button
              onClick={() => handleTabSwitch("login")}
              disabled={loading}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                tab === "login"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              } ${loading ? "cursor-not-allowed opacity-60" : ""}`}
            >
              로그인
            </button>
            <button
              onClick={() => handleTabSwitch("signup")}
              disabled={loading}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                tab === "signup"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              } ${loading ? "cursor-not-allowed opacity-60" : ""}`}
            >
              회원가입
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Error Banner */}
          {displayedError && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">
              {displayedError}
            </div>
          )}

          {/* Login Form */}
          {tab === "login" && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">
                  이메일
                </label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="이메일 주소"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">
                  비밀번호
                </label>
                <div className="relative">
                  <input
                    type={showLoginPassword ? "text" : "password"}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="비밀번호"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showLoginPassword ? (
                      <EyeOff size={18} />
                    ) : (
                      <Eye size={18} />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className={`w-full flex items-center justify-center gap-2 py-3 font-semibold rounded-xl transition-all text-sm ${
                  loading
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                }`}
              >
                {loading && <Loader2 size={18} className="animate-spin" />}
                <span>로그인</span>
              </button>
            </form>
          )}

          {/* Signup Form */}
          {tab === "signup" && (
            <form onSubmit={handleSignupSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">
                  이메일
                </label>
                <input
                  type="email"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  placeholder="이메일 주소"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">
                  비밀번호
                </label>
                <div className="relative">
                  <input
                    type={showSignupPassword ? "text" : "password"}
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    placeholder="비밀번호"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSignupPassword(!showSignupPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showSignupPassword ? (
                      <EyeOff size={18} />
                    ) : (
                      <Eye size={18} />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">
                  비밀번호 확인
                </label>
                <div className="relative">
                  <input
                    type={showSignupPasswordConfirm ? "text" : "password"}
                    value={signupPasswordConfirm}
                    onChange={(e) => setSignupPasswordConfirm(e.target.value)}
                    placeholder="비밀번호 확인"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all pr-11"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowSignupPasswordConfirm(!showSignupPasswordConfirm)
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showSignupPasswordConfirm ? (
                      <EyeOff size={18} />
                    ) : (
                      <Eye size={18} />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">
                  이름
                </label>
                <input
                  type="text"
                  value={signupName}
                  onChange={(e) => setSignupName(e.target.value)}
                  placeholder="이름"
                  maxLength={50}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className={`w-full flex items-center justify-center gap-2 py-3 font-semibold rounded-xl transition-all text-sm ${
                  loading
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                }`}
              >
                {loading && <Loader2 size={18} className="animate-spin" />}
                <span>회원가입</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
