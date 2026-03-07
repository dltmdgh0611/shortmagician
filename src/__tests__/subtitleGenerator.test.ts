import { generateSubtitles, SubtitleSegment } from "../lib/pipeline/subtitleGenerator";
import { invoke } from "@tauri-apps/api/core";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

// ── Tests ────────────────────────────────────────────────────────────────────

describe("generateSubtitles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invokes generate_subtitles with correct command name and args", async () => {
    mockedInvoke.mockResolvedValue("/path/to/subtitles.ass");

    const segments: SubtitleSegment[] = [
      { text: "안녕하세요", startTime: 0.0, endTime: 1.5 },
      { text: "반갑습니다", startTime: 1.5, endTime: 3.0 },
    ];

    await generateSubtitles(segments, "/fonts");

    expect(mockedInvoke).toHaveBeenCalledOnce();
    expect(mockedInvoke).toHaveBeenCalledWith("generate_subtitles", {
      segments: [
        { text: "안녕하세요", start_time: 0.0, end_time: 1.5 },
        { text: "반갑습니다", start_time: 1.5, end_time: 3.0 },
      ],
      fontDir: "/fonts",
    });
  });

  it("maps camelCase to snake_case for Rust", async () => {
    mockedInvoke.mockResolvedValue("/output.ass");

    const segments: SubtitleSegment[] = [
      { text: "テスト", startTime: 10.25, endTime: 15.75 },
    ];

    await generateSubtitles(segments, "/cjk-fonts");

    const call = mockedInvoke.mock.calls[0];
    const rustSegments = (call[1] as Record<string, unknown>).segments as Record<string, unknown>[];

    // Verify snake_case keys exist, camelCase keys do not
    expect(rustSegments[0]).toHaveProperty("start_time", 10.25);
    expect(rustSegments[0]).toHaveProperty("end_time", 15.75);
    expect(rustSegments[0]).not.toHaveProperty("startTime");
    expect(rustSegments[0]).not.toHaveProperty("endTime");
  });

  it("returns the output file path from invoke", async () => {
    const expectedPath = "/data/pipeline/subtitles.ass";
    mockedInvoke.mockResolvedValue(expectedPath);

    const result = await generateSubtitles(
      [{ text: "hello", startTime: 0, endTime: 1 }],
      "/fonts",
    );

    expect(result).toBe(expectedPath);
  });

  it("propagates invoke errors", async () => {
    mockedInvoke.mockRejectedValue(new Error("자막 세그먼트가 비어있습니다."));

    await expect(
      generateSubtitles([], "/fonts"),
    ).rejects.toThrow("자막 세그먼트가 비어있습니다.");
  });
});
