import { render, screen, fireEvent } from "@testing-library/react";
import { ConvertLoadingModal } from "../components/modals/ConvertLoadingModal";
import type { PipelineProgress } from "../lib/pipeline/pipelineService";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Stub out the timer-based progress hook so tests are fast and deterministic
vi.mock("../lib/useRealisticProgress", () => ({
  useMultiStepProgress: vi.fn(() => ({
    currentStepIndex: 0,
    stepProgress: 0,
    totalProgress: 0,
    isRunning: false,
    isComplete: false,
    currentStep: null,
    start: vi.fn(),
    reset: vi.fn(),
  })),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const defaultProps = {
  isOpen: true,
  onComplete: vi.fn(),
  languages: ["en"],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ConvertLoadingModal", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── Test 1 ──────────────────────────────────────────────────────────────────
  it("isOpen=false → modal not rendered (returns null)", () => {
    render(<ConvertLoadingModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByText("쇼츠 변환 중")).not.toBeInTheDocument();
  });

  // ── Test 2 ──────────────────────────────────────────────────────────────────
  it("isOpen=true → shows 쇼츠 변환 중 heading", () => {
    render(<ConvertLoadingModal {...defaultProps} />);
    expect(screen.getByText("쇼츠 변환 중")).toBeInTheDocument();
  });

  // ── Test 3 ──────────────────────────────────────────────────────────────────
  it("shows all 6 Korean step labels", () => {
    render(<ConvertLoadingModal {...defaultProps} />);
    expect(screen.getByText("음성을 추출하는 중...")).toBeInTheDocument();
    expect(screen.getByText("음성을 인식하는 중...")).toBeInTheDocument();
    expect(screen.getByText("번역하는 중...")).toBeInTheDocument();
    expect(screen.getByText("AI 음성을 생성하는 중...")).toBeInTheDocument();
    expect(screen.getByText("자막을 음성에 정렬하는 중...")).toBeInTheDocument();
    expect(screen.getByText("영상을 합성하는 중...")).toBeInTheDocument();
  });

  // ── Test 4 ──────────────────────────────────────────────────────────────────
  it("default (no pipelineProgress) → step counter shows 단계 1 / 6", () => {
    render(<ConvertLoadingModal {...defaultProps} />);
    expect(screen.getByText("단계 1 / 6")).toBeInTheDocument();
  });

  // ── Test 5 ──────────────────────────────────────────────────────────────────
  it("pipelineProgress at stepIndex=2 → step counter shows 단계 3 / 6", () => {
    const progress: PipelineProgress = {
      step: "translating",
      stepIndex: 2,
      totalSteps: 6,
      message: "번역하는 중...",
    };
    render(<ConvertLoadingModal {...defaultProps} pipelineProgress={progress} />);
    expect(screen.getByText("단계 3 / 6")).toBeInTheDocument();
  });

  // ── Test 6 ──────────────────────────────────────────────────────────────────
  it("pipelineProgress at stepIndex=5 (merging_tts) → step counter shows 단계 6 / 6", () => {
    const progress: PipelineProgress = {
      step: "merging_tts",
      stepIndex: 5,
      totalSteps: 6,
      message: "음성 트랙을 병합하는 중...",
    };
    render(<ConvertLoadingModal {...defaultProps} pipelineProgress={progress} />);
    expect(screen.getByText("단계 6 / 6")).toBeInTheDocument();
  });

  // ── Test 7 ──────────────────────────────────────────────────────────────────
  it("error prop → shows error message", () => {
    render(
      <ConvertLoadingModal
        {...defaultProps}
        error="변환 중 오류가 발생했습니다"
      />
    );
    expect(screen.getByText("변환 중 오류가 발생했습니다")).toBeInTheDocument();
  });

  // ── Test 8 ──────────────────────────────────────────────────────────────────
  it("error prop → progress bar and step list are hidden", () => {
    render(
      <ConvertLoadingModal
        {...defaultProps}
        error="오류"
      />
    );
    expect(screen.queryByText("진행률")).not.toBeInTheDocument();
    expect(screen.queryByText("음성을 추출하는 중...")).not.toBeInTheDocument();
  });

  // ── Test 9 ──────────────────────────────────────────────────────────────────
  it("error + onRetry → shows 다시 시도 button", () => {
    render(
      <ConvertLoadingModal
        {...defaultProps}
        error="오류"
        onRetry={vi.fn()}
      />
    );
    expect(screen.getByText("다시 시도")).toBeInTheDocument();
  });

  // ── Test 10 ─────────────────────────────────────────────────────────────────
  it("click 다시 시도 → onRetry is called once", () => {
    const onRetry = vi.fn();
    render(
      <ConvertLoadingModal
        {...defaultProps}
        error="오류"
        onRetry={onRetry}
      />
    );
    fireEvent.click(screen.getByText("다시 시도"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  // ── Test 11 ─────────────────────────────────────────────────────────────────
  it("error without onRetry → no 다시 시도 button rendered", () => {
    render(
      <ConvertLoadingModal
        {...defaultProps}
        error="오류"
      />
    );
    expect(screen.queryByText("다시 시도")).not.toBeInTheDocument();
  });

  // ── Test 12 ─────────────────────────────────────────────────────────────────
  it("no error → shows 진행률 label and step list", () => {
    render(<ConvertLoadingModal {...defaultProps} />);
    expect(screen.getByText("진행률")).toBeInTheDocument();
    expect(screen.getByText("음성을 추출하는 중...")).toBeInTheDocument();
  });
});
