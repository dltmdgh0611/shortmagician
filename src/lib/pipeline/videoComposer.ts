import { Command } from "@tauri-apps/plugin-shell";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { mkdir, exists, writeFile, BaseDirectory } from "@tauri-apps/plugin-fs";

// ── Types ────────────────────────────────────────────────────────────────────

export type ComposeStage = "preparing" | "merging_audio" | "composing" | "done";

export interface TtsSegmentInfo {
  audioPath: string;
  startTime: number;
  endTime: number;
}

// ── Helper: escape paths for FFmpeg filter syntax ────────────────────────────

export const escapeForFilter = (p: string) =>
  `'${p.replace(/\\/g, "/").replace(/:/g, "\\:")}'`;

// ── Helper: get audio duration via FFmpeg ──────────────────────────────────

async function getAudioDuration(audioPath: string): Promise<number> {
  const result = await Command.sidecar("binaries/ffmpeg", [
    "-i",
    audioPath,
    "-hide_banner",
  ]).execute();
  // FFmpeg prints duration to stderr even on "error" (no output file)
  const match = result.stderr.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  if (match) {
    return (
      parseInt(match[1]) * 3600 +
      parseInt(match[2]) * 60 +
      parseFloat(match[3])
    );
  }
  return 0;
}

// ── Helper: build atempo filter chain ─────────────────────────────────────
//  atempo supports 0.5–100.0. Chain multiple for >2.0x for maximum compat.

export function buildAtempoFilter(tempo: number): string {
  if (tempo >= 0.9999 && tempo <= 1.0001) return "";
  // Speedup: 1.0 < tempo <= 2.0
  if (tempo > 1.0 && tempo <= 2.0) return `atempo=${tempo.toFixed(4)}`;
  // Speedup: chain for > 2.0
  if (tempo > 2.0) {
    const parts: string[] = [];
    let remaining = tempo;
    while (remaining > 2.0) {
      parts.push("atempo=2.0");
      remaining /= 2.0;
    }
    if (remaining > 1.0001) parts.push(`atempo=${remaining.toFixed(4)}`);
    return parts.join(",");
  }
  // Slowdown: 0.5 <= tempo < 1.0
  if (tempo >= 0.5) return `atempo=${tempo.toFixed(4)}`;
  // Slowdown: chain for < 0.5
  const parts: string[] = [];
  let remaining = tempo;
  while (remaining < 0.5) {
    parts.push("atempo=0.5");
    remaining /= 0.5;
  }
  if (remaining < 0.9999) parts.push(`atempo=${remaining.toFixed(4)}`);
  return parts.join(",");
}

// ── Helper: smooth segment tempos ──────────────────────────────────────────
//  Prevents extreme speed-ups on individual segments by capping tempo and
//  redistributing overflow to subsequent segments.

export interface SmoothedTempo {
  tempo: number;    // adjusted playback speed (1.0 = normal)
  delayMs: number;  // audio start delay in milliseconds
}

/**
 * Smooth TTS playback tempos across segments.
 *
 * Problem: some segments need extreme speedup (3-4x) while neighbors are 1.2x.
 * Solution: cap each segment's tempo and let overflow cascade forward —
 *           subsequent segments absorb the excess by playing slightly faster.
 *
 * Algorithm:
 *   1. Compute raw tempo per segment: ttsDur / segDur
 *   2. Derive maxTempo = min(ABSOLUTE_MAX, avg_speedup * RELATIVE_CAP)
 *   3. Forward pass: cap each tempo at maxTempo; if capped, the overflow
 *      (extra playback time beyond the segment slot) reduces the effective
 *      duration of the next segment, making it naturally faster.
 *   4. Inter-segment gaps absorb overflow first.
 *
 * @param segments  - Segment timing info (startTime, endTime in seconds)
 * @param ttsDurations - Actual TTS audio durations in seconds
 * @returns Adjusted tempo and delay for each segment
 */
export function smoothSegmentTempos(
  segments: { startTime: number; endTime: number }[],
  ttsDurations: number[],
): SmoothedTempo[] {
  const ABSOLUTE_MAX = 2.5;
  const ABSOLUTE_MIN = 0.8;
  const RELATIVE_CAP = 1.35;

  const n = segments.length;
  if (n === 0) return [];

  const segDurs = segments.map((s) => s.endTime - s.startTime);

  // Phase 1: Raw tempos for ALL segments (speedup and slowdown)
  const rawTempos = ttsDurations.map((td, i) =>
    td > 0 && segDurs[i] > 0 ? td / segDurs[i] : 1.0,
  );

  // Phase 2: Determine maxTempo from average of segments that need speedup
  const speedups = rawTempos.filter((t) => t > 1.0);
  let maxTempo: number;
  if (speedups.length === 0) {
    maxTempo = ABSOLUTE_MAX;
  } else {
    const avg = speedups.reduce((a, b) => a + b, 0) / speedups.length;
    maxTempo = Math.min(ABSOLUTE_MAX, Math.max(1.5, avg * RELATIVE_CAP));
  }

  // Phase 3: Forward pass — cap tempos, redistribute overflow
  const results: SmoothedTempo[] = [];
  let overflowSec = 0;

  for (let i = 0; i < n; i++) {
    const segDur = segDurs[i];
    const ttsDur = ttsDurations[i];
    const originalDelayMs = Math.round(segments[i].startTime * 1000);

    // Absorb overflow in the gap before this segment
    if (i > 0 && overflowSec > 0) {
      const gap = segments[i].startTime - segments[i - 1].endTime;
      if (gap > 0) {
        overflowSec = Math.max(0, overflowSec - gap);
      }
    }

    // Effective duration = slot minus overflow from previous capped segments
    // Floor at 30% of original to prevent infinite cascade
    const effectiveDur = Math.max(segDur - overflowSec, segDur * 0.3);

    let tempo: number;
    if (ttsDur <= 0 || segDur <= 0) {
      tempo = 1.0;
      overflowSec = 0;
    } else if (ttsDur <= effectiveDur) {
      // TTS fits in the effective slot — slow down to fill it (min 0.8x)
      const rawSlowdown = ttsDur / effectiveDur;
      tempo = Math.max(ABSOLUTE_MIN, rawSlowdown);
      overflowSec = 0;
    } else {
      const needed = ttsDur / effectiveDur;
      if (needed <= maxTempo) {
        // Within cap — use exact tempo, no overflow
        tempo = needed;
        overflowSec = 0;
      } else {
        // Exceeds cap — cap it, pass overflow forward
        tempo = maxTempo;
        const playbackDur = ttsDur / maxTempo;
        overflowSec = Math.max(0, playbackDur - segDur);
      }
    }

    results.push({ tempo, delayMs: originalDelayMs });
  }

  return results;
}

// ── TTS Audio Merger ─────────────────────────────────────────────────────────

/**
 * Merge multiple TTS audio files into a single track, placing each at its
 * correct start time using FFmpeg `adelay` + `amix`.
 *
 * For a single segment, just delay it to the correct position.
 * For multiple segments, delay each and mix together with normalize=0
 * so volume stays at 100% (only one segment plays at a time).
 */
export async function mergeTtsAudio(
  dataDir: string,
  segments: TtsSegmentInfo[],
): Promise<string> {
  const mergedPath = await join(dataDir, "pipeline", "merged_tts.mp3");

  if (segments.length === 0) {
    throw new Error("TTS 세그먼트가 없습니다.");
  }

  const filterScriptPath = await join(dataDir, "pipeline", "merge_filter.txt");

  // ── Validate all input files exist before processing ────────────────────
  const missingFiles: string[] = [];
  for (const seg of segments) {
    const fileExists = await exists(seg.audioPath);
    if (!fileExists) {
      missingFiles.push(seg.audioPath);
    }
  }
  if (missingFiles.length > 0) {
    throw new Error(
      `TTS 오디오 파일이 존재하지 않습니다 (${missingFiles.length}개 누락):\n${missingFiles.join("\n")}`,
    );
  }


  // ── Probe TTS durations in batches of 5 ────────────────────────────────
  const PROBE_CONCURRENCY = 5;
  const ttsDurations: number[] = new Array(segments.length).fill(0);
  for (let i = 0; i < segments.length; i += PROBE_CONCURRENCY) {
    const batch = segments.slice(i, i + PROBE_CONCURRENCY);
    const results = await Promise.all(
      batch.map((seg) => getAudioDuration(seg.audioPath)),
    );
    results.forEach((dur, batchIdx) => {
      ttsDurations[i + batchIdx] = dur;
    });
  }

  // ── Smooth tempos across all segments ────────────────────────────────
  const smoothed = smoothSegmentTempos(segments, ttsDurations);

  if (segments.length === 1) {
    // Single segment: speed-adjust + delay
    const seg = segments[0];
    const { tempo, delayMs } = smoothed[0];

    let filterChain = `[0:a]`;
    const atempoChain = buildAtempoFilter(tempo);
    if (atempoChain) filterChain += `${atempoChain},`;
    filterChain += `adelay=${delayMs}:all=1[aout]`;

    await writeFile(filterScriptPath, new TextEncoder().encode(filterChain));

    const result = await Command.sidecar("binaries/ffmpeg", [
      "-i",
      seg.audioPath,
      "-filter_complex_script",
      filterScriptPath,
      "-map",
      "[aout]",
      "-y",
      mergedPath,
    ]).execute();

    if (result.code !== 0) {
      throw new Error(`TTS 오디오 병합 실패: ${result.stderr}`);
    }
    return mergedPath;
  }

  // Multiple segments: speed-adjust each with smoothed tempos, delay, then mix
  const inputArgs: string[] = [];
  const filterParts: string[] = [];
  const mixLabels: string[] = [];

  segments.forEach((seg, idx) => {
    inputArgs.push("-i", seg.audioPath);
    const { tempo, delayMs } = smoothed[idx];

    let filterChain = `[${idx}:a]`;
    const atempoChain = buildAtempoFilter(tempo);
    if (atempoChain) filterChain += `${atempoChain},`;
    filterChain += `adelay=${delayMs}:all=1[a${idx}]`;

    filterParts.push(filterChain);
    mixLabels.push(`[a${idx}]`);
  });

  // amix with normalize=0: keep each input at full volume (no division by N)
  filterParts.push(
    `${mixLabels.join("")}amix=inputs=${segments.length}:duration=longest:dropout_transition=0:normalize=0[aout]`,
  );

  await writeFile(
    filterScriptPath,
    new TextEncoder().encode(filterParts.join(";\n")),
  );

  const result = await Command.sidecar("binaries/ffmpeg", [
    ...inputArgs,
    "-filter_complex_script",
    filterScriptPath,
    "-map",
    "[aout]",
    "-y",
    mergedPath,
  ]).execute();

  if (result.code !== 0) {
    throw new Error(`TTS 오디오 병합 실패: ${result.stderr}`);
  }

  return mergedPath;
}

// ── Main function ────────────────────────────────────────────────────────────

/**
 * Compose final video:
 *   1. Merge all TTS audio segments with correct timing
 *   2. Remux video + merged TTS audio (no subtitle/blur burning)
 *
 * @param videoPath    - Absolute path to the source video file.
 * @param ttsSegments  - Array of TTS audio files with their start times.
 * @param onProgress   - Optional callback for UI progress updates.
 * @returns Absolute path to the composed output video (composed.mp4).
 */
export async function composeVideo(
  videoPath: string,
  ttsSegments: TtsSegmentInfo[],
  onProgress?: (stage: ComposeStage, message: string) => void,
): Promise<string> {
  // ── 1. Prepare output directory ─────────────────────────────────────────────
  onProgress?.("preparing", "영상 합성을 준비하는 중...");

  const dirExists = await exists("pipeline", {
    baseDir: BaseDirectory.AppLocalData,
  });
  if (!dirExists) {
    await mkdir("pipeline", {
      baseDir: BaseDirectory.AppLocalData,
      recursive: true,
    });
  }

  const dataDir = await appLocalDataDir();
  const outputPath = await join(dataDir, "pipeline", "composed.mp4");

  // ── 2. Merge all TTS audio with correct timing ─────────────────────────────
  onProgress?.("merging_audio", "음성을 병합하는 중...");
  const mergedAudioPath = await mergeTtsAudio(dataDir, ttsSegments);

  // ── 3. Remux video + merged TTS audio (no re-encode) ─────────────────────
  onProgress?.("composing", "영상을 합성하는 중...");

  const result = await Command.sidecar("binaries/ffmpeg", [
    "-i", videoPath,
    "-i", mergedAudioPath,
    "-map", "0:v",
    "-map", "1:a",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "128k",
    "-y",
    outputPath,
  ]).execute();

  if (result.code !== 0) {
    const stderr = result.stderr.trim();
    throw new Error(
      stderr
        ? `영상 합성에 실패했습니다: ${stderr}`
        : "영상 합성에 실패했습니다.",
    );
  }

  // ── 4. Done ─────────────────────────────────────────────────────────────────
  onProgress?.("done", "영상 합성 완료!");

  return outputPath;
}
