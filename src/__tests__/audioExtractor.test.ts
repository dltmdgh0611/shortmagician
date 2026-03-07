import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockExecute = vi.fn();

vi.mock("@tauri-apps/plugin-shell", () => ({
  Command: {
    sidecar: vi.fn(() => ({
      execute: mockExecute,
    })),
  },
}));

vi.mock("@tauri-apps/api/path", () => ({
  appLocalDataDir: vi.fn(() => Promise.resolve("C:\\Users\\test\\AppData\\Local\\com.hvnsoft.shortmagician")),
  join: vi.fn((...parts: string[]) => Promise.resolve(parts.join("\\"))),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: vi.fn(() => Promise.resolve(true)),
  mkdir: vi.fn(() => Promise.resolve()),
  BaseDirectory: { AppLocalData: 26 },
}));

import { extractAudio } from "../lib/pipeline/audioExtractor";
import { Command } from "@tauri-apps/plugin-shell";
import { exists, mkdir } from "@tauri-apps/plugin-fs";

// ── Tests ────────────────────────────────────────────────────────────────────

describe("extractAudio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue({ code: 0, stdout: "", stderr: "" });
    vi.mocked(exists).mockResolvedValue(true);
  });

  it("passes correct FFmpeg args for 16kHz mono MP3", async () => {
    const videoPath = "C:\\videos\\test.mp4";
    await extractAudio(videoPath);

    expect(Command.sidecar).toHaveBeenCalledWith("binaries/ffmpeg", [
      "-i",
      videoPath,
      "-vn",
      "-acodec",
      "libmp3lame",
      "-ar",
      "16000",
      "-ac",
      "1",
      "-b:a",
      "64k",
      "-y",
      expect.stringContaining("pipeline\\audio.mp3"),
    ]);
  });

  it("returns output path on success", async () => {
    const result = await extractAudio("C:\\videos\\test.mp4");
    expect(result).toContain("pipeline\\audio.mp3");
  });

  it("creates pipeline directory when it does not exist", async () => {
    vi.mocked(exists).mockResolvedValueOnce(false);
    await extractAudio("C:\\videos\\test.mp4");

    expect(mkdir).toHaveBeenCalledWith("pipeline", {
      baseDir: 26,
      recursive: true,
    });
  });

  it("skips mkdir when pipeline directory already exists", async () => {
    vi.mocked(exists).mockResolvedValueOnce(true);
    await extractAudio("C:\\videos\\test.mp4");

    expect(mkdir).not.toHaveBeenCalled();
  });

  it("throws on FFmpeg non-zero exit code", async () => {
    mockExecute.mockResolvedValueOnce({
      code: 1,
      stdout: "",
      stderr: "No such file or directory",
    });

    await expect(extractAudio("C:\\videos\\bad.mp4")).rejects.toThrow(
      "오디오 추출에 실패했습니다",
    );
  });

  it("throws generic message when stderr is empty", async () => {
    mockExecute.mockResolvedValueOnce({
      code: 1,
      stdout: "",
      stderr: "",
    });

    await expect(extractAudio("C:\\videos\\bad.mp4")).rejects.toThrow(
      "오디오 추출에 실패했습니다.",
    );
  });

  it("calls onProgress callbacks in order", async () => {
    const stages: string[] = [];
    await extractAudio("C:\\videos\\test.mp4", (stage) => {
      stages.push(stage);
    });

    expect(stages).toEqual(["preparing", "extracting", "done"]);
  });
});
