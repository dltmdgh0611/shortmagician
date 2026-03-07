import { invoke } from "@tauri-apps/api/core";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SubtitleSegment {
  text: string;
  startTime: number;
  endTime: number;
}

// ── Main function ────────────────────────────────────────────────────────────

/**
 * Generate ASS subtitle file from translated segments via Tauri command.
 *
 * @param segments - Array of subtitle segments with timing info.
 * @param fontDir - Absolute path to the CJK font directory.
 * @returns Absolute path to the generated .ass file.
 */
export async function generateSubtitles(
  segments: SubtitleSegment[],
  fontDir: string,
): Promise<string> {
  // Map camelCase → snake_case for Rust serde
  const rustSegments = segments.map((seg) => ({
    text: seg.text,
    start_time: seg.startTime,
    end_time: seg.endTime,
  }));

  const outputPath = await invoke<string>("generate_subtitles", {
    segments: rustSegments,
    fontDir,
  });

  return outputPath;
}
