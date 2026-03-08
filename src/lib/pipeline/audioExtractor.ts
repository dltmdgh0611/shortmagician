import { Command } from "@tauri-apps/plugin-shell";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { mkdir, exists, BaseDirectory } from "@tauri-apps/plugin-fs";

// ── Types ────────────────────────────────────────────────────────────────────

export type AudioExtractStage = "preparing" | "extracting" | "done";

// ── Main function ────────────────────────────────────────────────────────────

/**
 * Extract 16kHz mono MP3 audio from a video file using FFmpeg sidecar.
 *
 * @param videoPath - Absolute path to the source video file.
 * @param onProgress - Optional callback for UI progress updates.
 * @returns Absolute path to the extracted audio.mp3 file.
 */
export async function extractAudio(
  videoPath: string,
  onProgress?: (stage: AudioExtractStage, message: string) => void,
): Promise<string> {
  // ── 1. Prepare output directory ─────────────────────────────────────────────
  onProgress?.("preparing", "오디오 추출을 준비하는 중...");

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
  const outputPath = await join(dataDir, "pipeline", "audio.mp3");

  // ── 2. Run FFmpeg sidecar ───────────────────────────────────────────────────
  onProgress?.("extracting", "오디오를 추출하는 중...");

  console.log("[AudioExtractor] Input:", videoPath);
  console.log("[AudioExtractor] Output:", outputPath);

  let result;
  try {
    result = await Command.sidecar("binaries/ffmpeg", [
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
      outputPath,
    ]).execute();
  } catch (sidecarErr) {
    const errMsg = typeof sidecarErr === 'string'
      ? sidecarErr
      : (sidecarErr instanceof Error ? sidecarErr.message : JSON.stringify(sidecarErr));
    console.error("[AudioExtractor] Sidecar execution failed:", errMsg, sidecarErr);
    throw new Error(`FFmpeg sidecar 실행 실패: ${errMsg}`);
  }

  if (result.code !== 0) {
    const stderr = result.stderr.trim();
    throw new Error(
      stderr
        ? `오디오 추출에 실패했습니다: ${stderr}`
        : "오디오 추출에 실패했습니다.",
    );
  }

  // ── 3. Done ─────────────────────────────────────────────────────────────────
  onProgress?.("done", "오디오 추출 완료!");

  return outputPath;
}
