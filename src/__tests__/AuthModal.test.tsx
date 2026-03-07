import { render, screen, fireEvent } from "@testing-library/react";
import { AuthModal } from "../components/modals/AuthModal";

// ── Helpers ──────────────────────────────────────────────────────────────────

const defaultProps = {
  isOpen: true,
  onLogin: vi.fn().mockResolvedValue(undefined),
  onSignup: vi.fn().mockResolvedValue(undefined),
  error: null,
  loading: false,
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("AuthModal", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── Test 1 ──────────────────────────────────────────────────────────────────
  it("isOpen=false → modal not rendered (returns null)", () => {
    render(<AuthModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByText("환영합니다")).not.toBeInTheDocument();
  });

  // ── Test 2 ──────────────────────────────────────────────────────────────────
  it("isOpen=true → modal rendered with 환영합니다 heading", () => {
    render(<AuthModal {...defaultProps} />);
    expect(screen.getByText("환영합니다")).toBeInTheDocument();
  });

  // ── Test 3 ──────────────────────────────────────────────────────────────────
  it("click 회원가입 tab → signup form appears with password confirm field", () => {
    render(<AuthModal {...defaultProps} />);

    fireEvent.click(screen.getByText("회원가입"));

    expect(
      screen.getByPlaceholderText("비밀번호 확인")
    ).toBeInTheDocument();
  });

  // ── Test 4 ──────────────────────────────────────────────────────────────────
  it("submit login form with empty email → validation error shown", () => {
    const { container } = render(<AuthModal {...defaultProps} />);

    // Submit with blank email/password
    fireEvent.submit(container.querySelector("form")!);

    expect(
      screen.getByText("올바른 이메일 형식이 아닙니다")
    ).toBeInTheDocument();
    expect(defaultProps.onLogin).not.toHaveBeenCalled();
  });

  // ── Test 5 ──────────────────────────────────────────────────────────────────
  it("submit signup form with mismatched passwords → 비밀번호가 일치하지 않습니다", () => {
    const { container } = render(<AuthModal {...defaultProps} />);

    // Switch to signup tab
    fireEvent.click(screen.getByText("회원가입"));

    // Fill email
    fireEvent.change(screen.getByPlaceholderText("이메일 주소"), {
      target: { value: "test@test.com" },
    });

    // Fill password (unique placeholder in signup tab)
    fireEvent.change(screen.getByPlaceholderText("비밀번호"), {
      target: { value: "password123" },
    });

    // Fill mismatched confirm
    fireEvent.change(screen.getByPlaceholderText("비밀번호 확인"), {
      target: { value: "differentpassword" },
    });

    // Fill name
    fireEvent.change(screen.getByPlaceholderText("이름"), {
      target: { value: "TestUser" },
    });

    // Submit signup form
    fireEvent.submit(container.querySelector("form")!);

    expect(
      screen.getByText("비밀번호가 일치하지 않습니다")
    ).toBeInTheDocument();
    expect(defaultProps.onSignup).not.toHaveBeenCalled();
  });

  // ── Test 6 ──────────────────────────────────────────────────────────────────
  it("loading=true → submit button is disabled", () => {
    const { container } = render(<AuthModal {...defaultProps} loading={true} />);

    const submitBtn = container.querySelector<HTMLButtonElement>(
      "button[type='submit']"
    )!;
    expect(submitBtn).toBeDisabled();
  });

  // ── Test 7 ──────────────────────────────────────────────────────────────────
  it("error prop → error banner displayed", () => {
    render(
      <AuthModal {...defaultProps} error="이미 사용 중인 이메일입니다" />
    );

    expect(
      screen.getByText("이미 사용 중인 이메일입니다")
    ).toBeInTheDocument();
  });
});
