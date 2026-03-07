import { render, screen, fireEvent } from "@testing-library/react";
import { EarlybirdModal } from "../components/modals/EarlybirdModal";

// ── Helpers ──────────────────────────────────────────────────────────────────

const defaultProps = {
  isOpen: true,
  onSubmit: vi.fn().mockResolvedValue(undefined),
  onSkip: vi.fn(),
  error: null,
  loading: false,
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("EarlybirdModal", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── Test 1 ──────────────────────────────────────────────────────────────────
  it("isOpen=false → modal not rendered (returns null)", () => {
    render(<EarlybirdModal {...defaultProps} isOpen={false} />);
    expect(
      screen.queryByText("얼리버드 회원이신가요?")
    ).not.toBeInTheDocument();
  });

  // ── Test 2 ──────────────────────────────────────────────────────────────────
  it("isOpen=true → modal rendered with 얼리버드 회원이신가요? heading", () => {
    render(<EarlybirdModal {...defaultProps} />);
    expect(screen.getByText("얼리버드 회원이신가요?")).toBeInTheDocument();
  });

  // ── Test 3 ──────────────────────────────────────────────────────────────────
  it("error prop → error banner displayed", () => {
    render(
      <EarlybirdModal
        {...defaultProps}
        error="유효하지 않은 시리얼 코드입니다"
      />
    );

    expect(
      screen.getByText("유효하지 않은 시리얼 코드입니다")
    ).toBeInTheDocument();
  });

  // ── Test 4 ──────────────────────────────────────────────────────────────────
  it("loading=true → submit button is disabled", () => {
    const { container } = render(
      <EarlybirdModal {...defaultProps} loading={true} />
    );

    const submitBtn = container.querySelector<HTMLButtonElement>(
      "button[type='submit']"
    )!;
    expect(submitBtn).toBeDisabled();
  });

  // ── Test 5 ──────────────────────────────────────────────────────────────────
  it("empty code input → submit button is disabled", () => {
    const { container } = render(<EarlybirdModal {...defaultProps} />);

    const submitBtn = container.querySelector<HTMLButtonElement>(
      "button[type='submit']"
    )!;
    expect(submitBtn).toBeDisabled();
  });

  // ── Test 6 ──────────────────────────────────────────────────────────────────
  it("typing code → input updates with uppercase conversion", () => {
    render(<EarlybirdModal {...defaultProps} />);

    const input = screen.getByPlaceholderText("시리얼 코드") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "abc123" } });

    expect(input.value).toBe("ABC123");
  });

  // ── Test 7 ──────────────────────────────────────────────────────────────────
  it("click 건너뛰기 → onSkip is called", () => {
    render(<EarlybirdModal {...defaultProps} />);

    fireEvent.click(screen.getByText("건너뛰기"));

    expect(defaultProps.onSkip).toHaveBeenCalledTimes(1);
  });

  // ── Test 8 ──────────────────────────────────────────────────────────────────
  it("loading=true → 건너뛰기 button is hidden", () => {
    render(<EarlybirdModal {...defaultProps} loading={true} />);

    expect(screen.queryByText("건너뛰기")).not.toBeInTheDocument();
  });
});
