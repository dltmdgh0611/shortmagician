import { Command } from "@tauri-apps/plugin-shell";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { mkdir, BaseDirectory } from "@tauri-apps/plugin-fs";

/**
 * Generates a thumbnail image from a video file using FFmpeg sidecar.
 * Extracts a single frame at 1 second into the video.
 *
 * @param videoPath - Absolute path to the source video file
 * @param projectId - Unique project identifier (used as filename)
 * @returns Absolute path to the generated thumbnail JPEG
 */
export async function generateThumbnail(videoPath: string, projectId: string): Promise<string> {
  // Ensure pipeline/thumbnails directory exists in AppLocalData
  try {
    await mkdir("pipeline/thumbnails", { baseDir: BaseDirectory.AppLocalData, recursive: true });
  } catch {
    // directory already exists
  }

  const baseDir = await appLocalDataDir();
  const outputPath = await join(baseDir, "pipeline", "thumbnails", `${projectId}.jpg`);

  const result = await Command.sidecar("binaries/ffmpeg", [
    "-i", videoPath,
    "-ss", "1",
    "-vframes", "1",
    "-vf", "scale=540:960",
    "-y",
    outputPath,
  ]).execute();

  if (result.code !== 0) {
    throw new Error(`FFmpeg thumbnail generation failed: ${result.stderr}`);
  }

  return outputPath;
}

/**
 * Returns the expected thumbnail path for a project without generating it.
 *
 * @param projectId - Unique project identifier
 * @returns Absolute path where the thumbnail would be stored
 */
export async function getThumbnailPath(projectId: string): Promise<string> {
  const baseDir = await appLocalDataDir();
  return await join(baseDir, "pipeline", "thumbnails", `${projectId}.jpg`);
}
