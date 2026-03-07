import { render, screen } from "@testing-library/react";
import { ShortsCenterPanel, Scene } from "../components/shorts/ShortsCenterPanel";
import { ShortsLeftPanel } from "../components/shorts/ShortsLeftPanel";
import type { PipelineSegment } from "../lib/types/pipeline";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock Tauri fs (ShortsLeftPanel dynamically imports it)
vi.mock("@tauri-apps/plugin-fs", () => ({
  readFile: vi.fn(),
}));

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
    voiceId: "en-US-Chirp3-HD-Liam",
    voiceName: "Liam",
  },
];

const mockScenes: Scene[] = [
  { id: 0, text: "Hello", duration: 4 },
  { id: 1, text: "Nice to meet you", duration: 5 },
];

const defaultCenterProps = {
  scenes: mockScenes,
  onScenesChange: vi.fn(),
  languages: ["ko", "en"],
  selectedLanguage: "en",
};

// ── ShortsCenterPanel with pipelineSegments ───────────────────────────────────

describe("ShortsCenterPanel with pipeline data", () => {
  it("shows original text from pipeline segments", () => {
    render(
      <ShortsCenterPanel
        {...defaultCenterProps}
        pipelineSegments={mockSegments}
      />
    );
    expect(screen.getByText(/안녕하세요/)).toBeInTheDocument();
    expect(screen.getByText(/반갑습니다/)).toBeInTheDocument();
  });

  it("shows timestamps from pipeline segments", () => {
    render(
      <ShortsCenterPanel
        {...defaultCenterProps}
        pipelineSegments={mockSegments}
      />
    );
    expect(screen.getByText(/0:00 - 0:03/)).toBeInTheDocument();
    expect(screen.getByText(/0:03 - 0:08/)).toBeInTheDocument();
  });

  it("does NOT show timestamps when no pipeline segments", () => {
    render(<ShortsCenterPanel {...defaultCenterProps} />);
    expect(screen.queryByText(/⏱/)).not.toBeInTheDocument();
  });
});

// ── ShortsLeftPanel ───────────────────────────────────────────────────────────

describe("ShortsLeftPanel video/image toggle", () => {
  it("renders <img> when no composedVideoPath", () => {
    render(<ShortsLeftPanel />);
    expect(screen.getByTestId("preview-image")).toBeInTheDocument();
    expect(screen.queryByTestId("preview-video")).not.toBeInTheDocument();
  });

  // Note: composedVideoPath triggers an async dynamic import of @tauri-apps/plugin-fs
  // which is mocked but the blob URL won't be set synchronously, so we just verify
  // default state renders <img> when no path is provided.
});
