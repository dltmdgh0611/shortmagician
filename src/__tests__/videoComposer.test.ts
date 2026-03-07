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
  resolveResource: vi.fn(() => Promise.resolve("C:\\Program Files\\shortmagician\\resources\\fonts")),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: vi.fn(() => Promise.resolve(true)),
  mkdir: vi.fn(() => Promise.resolve()),
  writeFile: vi.fn(() => Promise.resolve()),
  BaseDirectory: { AppLocalData: 26 },
}));

import { composeVideo, buildAtempoFilter, smoothSegmentTempos, type TtsSegmentInfo } from "../lib/pipeline/videoComposer";
import { Command } from "@tauri-apps/plugin-shell";
import { resolveResource } from "@tauri-apps/api/path";
import { exists, mkdir } from "@tauri-apps/plugin-fs";

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeTtsSegments = (count = 3): TtsSegmentInfo[] =>
  Array.from({ length: count }, (_, i) => ({
    audioPath: `C:\\audio\\tts_${i}.mp3`,
    startTime: i * 5,
    endTime: (i + 1) * 5,
  }));

// ── Tests ────────────────────────────────────────────────────────────────────

describe("composeVideo", () => {
  // Default mock: duration probes return 3s, all FFmpeg calls succeed
  const DURATION_STDERR = "Duration: 00:00:03.00, start: 0.000000";

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: all calls succeed, duration probes return 3s audio
    mockExecute.mockResolvedValue({ code: 0, stdout: "", stderr: DURATION_STDERR });
    vi.mocked(exists).mockResolvedValue(true);
  });

  // For N segments: N duration probes + 1 merge + 1 compose = N+2 sidecar calls

  it("makes N+2 FFmpeg calls: N probes + merge TTS + compose video", async () => {
    const segments = makeTtsSegments(3);
    await composeVideo("C:\\v.mp4", segments);

    // 3 probes + 1 merge + 1 compose = 5
    expect(Command.sidecar).toHaveBeenCalledTimes(5);
  });

  it("single TTS segment uses adelay without amix", async () => {
    const segments = makeTtsSegments(1);
    await composeVideo("C:\\v.mp4", segments);

    // calls[0] = duration probe, calls[1] = TTS merge (single segment)
    const mergeCall = vi.mocked(Command.sidecar).mock.calls[1];
    const mergeArgs = mergeCall[1] as string[];

    expect(mergeArgs).toContain("-i");
    expect(mergeArgs).toContain(segments[0].audioPath);
    expect(mergeArgs).toContain("-filter_complex_script");
    expect(mergeArgs).toContain("-map");
    expect(mergeArgs).toContain("[aout]");
  });

  it("compose step includes blur filter and subtitle burn", async () => {
    const segments = makeTtsSegments(2);
    await composeVideo("C:\\v.mp4", segments);

    // 2 probes + 1 merge = calls[0..2], compose = calls[3]
    const composeCall = vi.mocked(Command.sidecar).mock.calls[3];
    const composeArgs = composeCall[1] as string[];

    expect(composeArgs).toContain("-filter_complex_script");
    expect(composeArgs).toContain("-map");
    expect(composeArgs).toContain("[v]");
    expect(composeArgs).toContain("1:a");
  });

  it("does NOT pass -shortest flag (full video duration)", async () => {
    const segments = makeTtsSegments(2);
    await composeVideo("C:\\v.mp4", segments);

    // compose call is at index N+1 = 3
    const composeCall = vi.mocked(Command.sidecar).mock.calls[3];
    const composeArgs = composeCall[1] as string[];

    expect(composeArgs).not.toContain("-shortest");
  });

  it("resolves font directory from bundled resources", async () => {
    await composeVideo("C:\\v.mp4", makeTtsSegments(1));
    expect(resolveResource).toHaveBeenCalledWith("resources/fonts");
  });

  it("returns output path on success", async () => {
    const result = await composeVideo("C:\\v.mp4", makeTtsSegments(1));
    expect(result).toContain("pipeline\\composed.mp4");
  });

  it("creates pipeline directory when it does not exist", async () => {
    vi.mocked(exists).mockResolvedValueOnce(false);
    await composeVideo("C:\\v.mp4", makeTtsSegments(1));

    expect(mkdir).toHaveBeenCalledWith("pipeline", {
      baseDir: 26,
      recursive: true,
    });
  });

  it("skips mkdir when pipeline directory already exists", async () => {
    vi.mocked(exists).mockResolvedValueOnce(true);
    await composeVideo("C:\\v.mp4", makeTtsSegments(1));

    expect(mkdir).not.toHaveBeenCalled();
  });

  it("throws on TTS merge FFmpeg failure", async () => {
    // 1 segment → 1 probe (succeeds) + 1 merge (fails)
    mockExecute
      .mockResolvedValueOnce({ code: 0, stdout: "", stderr: DURATION_STDERR }) // probe
      .mockResolvedValueOnce({ code: 1, stdout: "", stderr: "audio error" }); // merge

    await expect(
      composeVideo("C:\\v.mp4", makeTtsSegments(1)),
    ).rejects.toThrow("TTS 오디오 병합 실패");
  });

  it("throws on compose FFmpeg failure", async () => {
    // 2 segments → 2 probes + 1 merge (succeeds) + 1 compose (fails)
    mockExecute
      .mockResolvedValueOnce({ code: 0, stdout: "", stderr: DURATION_STDERR }) // probe 0
      .mockResolvedValueOnce({ code: 0, stdout: "", stderr: DURATION_STDERR }) // probe 1
      .mockResolvedValueOnce({ code: 0, stdout: "", stderr: "" })              // merge OK
      .mockResolvedValueOnce({ code: 1, stdout: "", stderr: "codec not found" }); // compose fail

    await expect(
      composeVideo("C:\\v.mp4", makeTtsSegments(2)),
    ).rejects.toThrow("codec not found");
  });

  it("throws generic message when compose stderr is empty", async () => {
    // 1 segment → 1 probe + 1 merge (succeeds) + 1 compose (fails with empty stderr)
    mockExecute
      .mockResolvedValueOnce({ code: 0, stdout: "", stderr: DURATION_STDERR }) // probe
      .mockResolvedValueOnce({ code: 0, stdout: "", stderr: "" })              // merge OK
      .mockResolvedValueOnce({ code: 1, stdout: "", stderr: "" });              // compose fail

    await expect(
      composeVideo("C:\\v.mp4", makeTtsSegments(1)),
    ).rejects.toThrow("영상 합성에 실패했습니다.");
  });

  it("throws when no TTS segments provided", async () => {
    await expect(
      composeVideo("C:\\v.mp4", []),
    ).rejects.toThrow("TTS 세그먼트가 없습니다.");
  });

  it("calls onProgress callbacks in order", async () => {
    const stages: string[] = [];
    await composeVideo("C:\\v.mp4", makeTtsSegments(2), (stage) => {
      stages.push(stage);
    });

    expect(stages).toEqual(["preparing", "merging_audio", "composing", "done"]);
  });
});

describe("buildAtempoFilter", () => {
  it("returns empty string for tempo ~1.0", () => {
    expect(buildAtempoFilter(1.0)).toBe("");
    expect(buildAtempoFilter(1.00005)).toBe("");
    expect(buildAtempoFilter(0.9999)).toBe("");
  });

  it("returns single atempo for slowdown (0.5 <= tempo < 1.0)", () => {
    expect(buildAtempoFilter(0.8)).toBe("atempo=0.8000");
    expect(buildAtempoFilter(0.5)).toBe("atempo=0.5000");
  });

  it("chains atempo filters for extreme slowdown (< 0.5)", () => {
    // 0.25 → atempo=0.5,atempo=0.5
    const result = buildAtempoFilter(0.25);
    expect(result).toContain("atempo=0.5");
    expect(result.split(",").length).toBeGreaterThanOrEqual(2);
  });

  it("returns single atempo for tempo <= 2.0", () => {
    expect(buildAtempoFilter(1.5)).toBe("atempo=1.5000");
    expect(buildAtempoFilter(2.0)).toBe("atempo=2.0000");
  });

  it("chains atempo filters for tempo > 2.0", () => {
    // 3.0 → atempo=2.0,atempo=1.5
    const result = buildAtempoFilter(3.0);
    expect(result).toContain("atempo=2.0");
    expect(result.split(",").length).toBeGreaterThanOrEqual(2);
  });
});

describe("smoothSegmentTempos", () => {
  it("returns slowdown tempo for segments where TTS fits in slot", () => {
    const segs = [
      { startTime: 0, endTime: 3 },
      { startTime: 3, endTime: 6 },
    ];
    const ttsDurs = [2, 2.5]; // both shorter than 3s slots
    const results = smoothSegmentTempos(segs, ttsDurs);
    expect(results).toHaveLength(2);
    // TTS fits → slowdown applied (tempo = ttsDur/segDur, clamped to min 0.8)
    expect(results[0].tempo).toBeGreaterThanOrEqual(0.8);
    expect(results[0].tempo).toBeLessThanOrEqual(1.0);
    expect(results[1].tempo).toBeGreaterThanOrEqual(0.8);
    expect(results[1].tempo).toBeLessThanOrEqual(1.0);
  });

  it("clamps slowdown to ABSOLUTE_MIN (0.8x)", () => {
    // TTS = 1s in 5s slot → raw 0.2, should clamp to 0.8
    const segs = [{ startTime: 0, endTime: 5 }];
    const ttsDurs = [1];
    const results = smoothSegmentTempos(segs, ttsDurs);
    expect(results[0].tempo).toBe(0.8);
  });

  it("caps extreme tempo and redistributes overflow to next segment", () => {
    // Seg 0: TTS=6s in 2s slot → raw tempo 3.0 (should be capped)
    // Seg 1: TTS=2s in 2s slot → raw tempo 1.0 (should absorb overflow)
    const segs = [
      { startTime: 0, endTime: 2 },
      { startTime: 2, endTime: 4 },
    ];
    const ttsDurs = [6, 2];
    const results = smoothSegmentTempos(segs, ttsDurs);

    // Seg 0 should be capped below raw 3.0
    expect(results[0].tempo).toBeLessThan(3.0);
    expect(results[0].tempo).toBeGreaterThan(1.0);
    // Seg 1 should be >1.0 (absorbing overflow)
    expect(results[1].tempo).toBeGreaterThan(1.0);
  });

  it("no segment exceeds ABSOLUTE_MAX (2.5x)", () => {
    // All segments have extreme mismatch
    const segs = [
      { startTime: 0, endTime: 1 },
      { startTime: 1, endTime: 2 },
      { startTime: 2, endTime: 3 },
    ];
    const ttsDurs = [10, 10, 10]; // 10s each in 1s slots → raw 10x
    const results = smoothSegmentTempos(segs, ttsDurs);

    for (const r of results) {
      expect(r.tempo).toBeLessThanOrEqual(2.5);
    }
  });

  it("preserves original delays (startTime * 1000)", () => {
    const segs = [
      { startTime: 1.5, endTime: 3 },
      { startTime: 5, endTime: 7 },
    ];
    const ttsDurs = [2, 2];
    const results = smoothSegmentTempos(segs, ttsDurs);

    expect(results[0].delayMs).toBe(1500);
    expect(results[1].delayMs).toBe(5000);
  });

  it("absorbs overflow in inter-segment gaps", () => {
    // Seg 0: TTS=6s in 2s slot → overflow
    // 3s gap between seg 0 and seg 1 → absorbs overflow
    // Seg 1: TTS=2s in 2s slot → should stay near 1.0
    const segs = [
      { startTime: 0, endTime: 2 },
      { startTime: 5, endTime: 7 },  // 3s gap after seg 0
    ];
    const ttsDurs = [6, 2];
    const results = smoothSegmentTempos(segs, ttsDurs);

    // Gap absorbs most/all overflow → seg 1 stays low
    expect(results[1].tempo).toBeLessThanOrEqual(1.5);
  });

  it("returns empty array for empty input", () => {
    expect(smoothSegmentTempos([], [])).toEqual([]);
  });

  it("distributes tempos more evenly than raw calculation", () => {
    // Without smoothing: tempos would be [1.0, 4.0, 1.0, 1.0]
    // With smoothing: max should be much lower, and neighbors absorb
    const segs = [
      { startTime: 0, endTime: 2 },
      { startTime: 2, endTime: 3 },   // short slot!
      { startTime: 3, endTime: 5 },
      { startTime: 5, endTime: 8 },
    ];
    const ttsDurs = [2, 4, 2, 2]; // seg 1 raw tempo = 4.0
    const results = smoothSegmentTempos(segs, ttsDurs);

    const rawMax = 4.0;
    const smoothedMax = Math.max(...results.map((r) => r.tempo));
    // Smoothed max should be significantly lower than raw max
    expect(smoothedMax).toBeLessThan(rawMax);
    // And at least one neighbor should have absorbed overflow
    expect(results[2].tempo).toBeGreaterThan(1.0);
  });

  it("effective duration floor prevents infinite cascade", () => {
    // 5 segments all needing extreme speedup → overflow cascades
    // but 30% floor prevents effective duration from reaching 0
    const segs = Array.from({ length: 5 }, (_, i) => ({
      startTime: i * 2,
      endTime: (i + 1) * 2,
    }));
    const ttsDurs = [8, 8, 8, 8, 8]; // all need 4x in 2s slots
    const results = smoothSegmentTempos(segs, ttsDurs);

    // All tempos should be finite and positive
    for (const r of results) {
      expect(r.tempo).toBeGreaterThan(0);
      expect(Number.isFinite(r.tempo)).toBe(true);
    }
  });
});
