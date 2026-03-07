import { render, screen, fireEvent } from "@testing-library/react";
import { ShortsCenterPanel, Scene, CHIRP3_HD_VOICES } from "../components/shorts/ShortsCenterPanel";
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
];

const mockScenes: Scene[] = [
  { id: 0, text: "Hello", duration: 4 },
];

const baseProps = {
  scenes: mockScenes,
  onScenesChange: vi.fn(),
  languages: ["ko", "en"],
  selectedLanguage: "en",
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Voice selector in pipeline mode", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows segment voiceName in voice button", () => {
    render(
      <ShortsCenterPanel
        {...baseProps}
        pipelineSegments={mockSegments}
      />
    );
    expect(screen.getByText("Liam")).toBeInTheDocument();
  });

  it("clicking voice button opens dropdown with Chirp 3 HD voices", () => {
    render(
      <ShortsCenterPanel
        {...baseProps}
        pipelineSegments={mockSegments}
      />
    );
    // Click the voice button that shows "Liam"
    const voiceBtn = screen.getByText("Liam").closest("button")!;
    fireEvent.click(voiceBtn);

    // Dropdown should show English Chirp voices (selectedLanguage = "en")
    const enVoices = CHIRP3_HD_VOICES.filter(v => v.language === "en");
    enVoices.forEach((voice) => {
      expect(screen.getAllByText(voice.name).length).toBeGreaterThanOrEqual(1);
    });
  });

  it("dropdown filters voices by selected language", () => {
    render(
      <ShortsCenterPanel
        {...baseProps}
        selectedLanguage="ja"
        pipelineSegments={[{
          ...mockSegments[0],
          voiceId: "ja-JP-Chirp3-HD-Aoi",
          voiceName: "Aoi",
        }]}
        scenes={[{ id: 0, text: "こんにちは", duration: 4 }]}
      />
    );
    const voiceBtn = screen.getByText("Aoi").closest("button")!;
    fireEvent.click(voiceBtn);

    // Should show Japanese voices, not English
    const jaVoices = CHIRP3_HD_VOICES.filter(v => v.language === "ja");
    jaVoices.forEach((voice) => {
      expect(screen.getAllByText(voice.name).length).toBeGreaterThanOrEqual(1);
    });
    // English voices should NOT be in dropdown items (Aria might appear elsewhere, check within dropdown)
    expect(screen.queryByText("Orion")).not.toBeInTheDocument();
  });

  it("selecting a voice calls onVoiceChange with segmentId and voiceId", async () => {
    const onVoiceChange = vi.fn().mockResolvedValue(undefined);
    render(
      <ShortsCenterPanel
        {...baseProps}
        pipelineSegments={mockSegments}
        onVoiceChange={onVoiceChange}
      />
    );
    // Open dropdown
    const voiceBtn = screen.getByText("Liam").closest("button")!;
    fireEvent.click(voiceBtn);

    // Click a different voice — "Aria"
    const ariaBtn = screen.getByText("Aria").closest("button")!;
    fireEvent.click(ariaBtn);

    expect(onVoiceChange).toHaveBeenCalledWith("seg-0", "en-US-Chirp3-HD-Aria");
  });

  it("regenerate button calls onVoiceChange with same voiceId", async () => {
    const onVoiceChange = vi.fn().mockResolvedValue(undefined);
    render(
      <ShortsCenterPanel
        {...baseProps}
        pipelineSegments={mockSegments}
        onVoiceChange={onVoiceChange}
      />
    );
    const regenBtn = screen.getByTitle("TTS 재생성");
    fireEvent.click(regenBtn);

    expect(onVoiceChange).toHaveBeenCalledWith("seg-0", "en-US-Chirp3-HD-Liam");
  });

  it("fallback mode shows dummy voices when no pipelineSegments", () => {
    render(
      <ShortsCenterPanel
        {...baseProps}
        selectedLanguage="ko"
      />
    );
    // Should show dummy Korean voice names, not Chirp voices
    // Default voice is "민수" for ko
    expect(screen.queryByText("Aria")).not.toBeInTheDocument();
    expect(screen.queryByTitle("TTS 재생성")).not.toBeInTheDocument();
  });
});
