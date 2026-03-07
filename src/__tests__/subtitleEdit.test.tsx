import { render, screen, fireEvent } from "@testing-library/react";
import { ShortsCenterPanel, Scene } from "../components/shorts/ShortsCenterPanel";
import type { PipelineSegment } from "../lib/types/pipeline";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockSegments: PipelineSegment[] = [
  {
    id: "seg-0",
    startTime: 0,
    endTime: 3.5,
    originalText: "안녕하세요",
    translatedText: "Hello",
    voiceId: "en-US-Chirp3-HD-Liam",
    voiceName: "Liam",
  },
  {
    id: "seg-1",
    startTime: 3.5,
    endTime: 8,
    originalText: "반갑습니다",
    translatedText: "Nice to meet you",
    voiceId: "en-US-Chirp3-HD-Aria",
    voiceName: "Aria",
  },
];

const mockScenes: Scene[] = [
  { id: 0, text: "Hello", duration: 4 },
  { id: 1, text: "Nice to meet you", duration: 5 },
];

const baseProps = {
  scenes: mockScenes,
  onScenesChange: vi.fn(),
  languages: ["ko", "en"],
  selectedLanguage: "en",
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Subtitle editing in pipeline mode", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("text field is editable when pipelineSegments are present", () => {
    render(
      <ShortsCenterPanel
        {...baseProps}
        pipelineSegments={mockSegments}
      />
    );
    const textareas = screen.getAllByRole("textbox");
    expect(textareas.length).toBe(2);
    // Pipeline mode textareas should NOT be disabled
    textareas.forEach((ta) => {
      expect(ta).not.toBeDisabled();
    });
  });

  it("text field is disabled for non-ko language when no pipelineSegments", () => {
    render(
      <ShortsCenterPanel
        {...baseProps}
        selectedLanguage="en"
      />
    );
    const textareas = screen.getAllByRole("textbox");
    textareas.forEach((ta) => {
      expect(ta).toBeDisabled();
    });
  });

  it("editing text calls onScenesChange (local state update)", () => {
    const onScenesChange = vi.fn();
    render(
      <ShortsCenterPanel
        {...baseProps}
        onScenesChange={onScenesChange}
        pipelineSegments={mockSegments}
      />
    );
    const textareas = screen.getAllByRole("textbox");
    fireEvent.change(textareas[0], { target: { value: "Hi there" } });
    expect(onScenesChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 0, text: "Hi there" }),
      ])
    );
  });

  it("blurring textarea with changed text calls onSegmentUpdate", () => {
    const onSegmentUpdate = vi.fn();
    render(
      <ShortsCenterPanel
        {...baseProps}
        pipelineSegments={mockSegments}
        onSegmentUpdate={onSegmentUpdate}
      />
    );
    const textareas = screen.getAllByRole("textbox");
    // Change the text first, then blur
    fireEvent.change(textareas[0], { target: { value: "Goodbye" } });
    fireEvent.blur(textareas[0], { target: { value: "Goodbye" } });
    expect(onSegmentUpdate).toHaveBeenCalledWith("seg-0", { translatedText: "Goodbye" });
  });

  it("blurring textarea with same text does NOT call onSegmentUpdate", () => {
    const onSegmentUpdate = vi.fn();
    render(
      <ShortsCenterPanel
        {...baseProps}
        pipelineSegments={mockSegments}
        onSegmentUpdate={onSegmentUpdate}
      />
    );
    const textareas = screen.getAllByRole("textbox");
    // Blur without changing text — value is still "Hello" which matches seg.translatedText
    fireEvent.blur(textareas[0], { target: { value: "Hello" } });
    expect(onSegmentUpdate).not.toHaveBeenCalled();
  });

  it("shows translated text from pipeline segment via scene adapter", () => {
    render(
      <ShortsCenterPanel
        {...baseProps}
        pipelineSegments={mockSegments}
      />
    );
    const textareas = screen.getAllByRole("textbox");
    expect(textareas[0]).toHaveValue("Hello");
    expect(textareas[1]).toHaveValue("Nice to meet you");
  });
});
