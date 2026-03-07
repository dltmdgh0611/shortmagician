import { Command } from "@tauri-apps/plugin-shell";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { mkdir, exists, readFile, BaseDirectory } from "@tauri-apps/plugin-fs";
import { parseVideoUrl } from "./urlParser";

// ── Types ────────────────────────────────────────────────────────────────────

export type FetchStage =
  | "parsing"
  | "metadata"
  | "downloading"
  | "preparing"
  | "done";

export interface VideoInfo {
  platform: "youtube" | "instagram" | "tiktok";
  video_id: string;
  title: string;
  thumbnail_url: string;
  duration: number; // seconds
  author: string;
  author_url: string;
  view_count: number | null;
  like_count: number | null;
  original_url: string;
  localFilePath: string | null; // absolute path on disk
  playbackUrl: string | null; // blob URL for <video> playback
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function randomSuffix(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function safeInt(value: unknown): number | null {
  if (typeof value === "number") return Math.floor(value);
  return null;
}

function pickThumbnail(meta: Record<string, unknown>): string {
  const thumbnails = meta.thumbnails;
  if (Array.isArray(thumbnails) && thumbnails.length > 0) {
    const best = thumbnails.reduce(
      (a: Record<string, unknown>, b: Record<string, unknown>) => {
        const aArea =
          ((a.height as number) || 0) * ((a.width as number) || 0);
        const bArea =
          ((b.height as number) || 0) * ((b.width as number) || 0);
        return bArea > aArea ? b : a;
      },
    );
    if (best && typeof best.url === "string") return best.url;
  }
  if (typeof meta.thumbnail === "string") return meta.thumbnail;
  return "";
}

function pickAuthor(meta: Record<string, unknown>, platform: string): string {
  if (platform === "youtube") {
    return (
      (typeof meta.channel === "string" ? meta.channel : "") ||
      (typeof meta.uploader === "string" ? meta.uploader : "")
    );
  }
  return (
    (typeof meta.uploader === "string" ? meta.uploader : "") ||
    (typeof meta.channel === "string" ? meta.channel : "")
  );
}

// ── Main fetch function ──────────────────────────────────────────────────────

/**
 * Fetch video metadata and download mp4 locally via yt-dlp sidecar.
 *
 * @param url - YouTube, Instagram, or TikTok URL.
 * @param onProgress - Optional callback for UI progress updates.
 * @returns VideoInfo with metadata + playbackUrl (blob URL) for <video>.
 */
export async function fetchVideoInfo(
  url: string,
  onProgress?: (stage: FetchStage, message: string) => void,
): Promise<VideoInfo> {
  // ── 1. Parse URL ───────────────────────────────────────────────────────────
  onProgress?.("parsing", "URL을 분석하는 중...");
  const parsed = parseVideoUrl(url);

  // ── 2. Fetch metadata ──────────────────────────────────────────────────────
  onProgress?.("metadata", "영상 정보를 불러오는 중...");

  const metaResult = await Command.sidecar("binaries/yt-dlp", [
    parsed.originalUrl,
    "--dump-json",
    "--no-download",
    "--no-playlist",
  ]).execute();

  if (metaResult.code !== 0) {
    const stderr = metaResult.stderr.toLowerCase();
    if (stderr.includes("private"))
      throw new Error("비공개 영상입니다. 공개 영상의 링크를 입력해주세요.");
    if (stderr.includes("429"))
      throw new Error("요청이 너무 많습니다. 잠시 후 다시 시도해주세요.");
    throw new Error("영상 정보를 가져올 수 없습니다. URL을 확인해주세요.");
  }

  let meta: Record<string, unknown>;
  try {
    meta = JSON.parse(metaResult.stdout) as Record<string, unknown>;
  } catch {
    throw new Error("영상 정보를 가져올 수 없습니다. URL을 확인해주세요.");
  }

  const title = typeof meta.title === "string" ? meta.title : "제목 없음";
  const thumbnail = pickThumbnail(meta);
  const duration = safeInt(meta.duration) ?? 0;
  const author = pickAuthor(meta, parsed.platform);
  const authorUrl =
    typeof meta.uploader_url === "string"
      ? meta.uploader_url
      : typeof meta.channel_url === "string"
        ? meta.channel_url
        : "";
  const viewCount = safeInt(meta.view_count);
  const likeCount = safeInt(meta.like_count);

  // ── 3. Prepare download directory ──────────────────────────────────────────
  onProgress?.("downloading", "영상을 다운로드하는 중...");

  const dirExists = await exists("downloads", {
    baseDir: BaseDirectory.AppLocalData,
  });
  if (!dirExists) {
    await mkdir("downloads", {
      baseDir: BaseDirectory.AppLocalData,
      recursive: true,
    });
  }

  // ── 4. Download video ──────────────────────────────────────────────────────
  const dataDir = await appLocalDataDir();
  const filenameBase = `${parsed.platform}_${parsed.videoId}_${randomSuffix()}`;
  const outputTemplate = await join(
    dataDir,
    "downloads",
    `${filenameBase}.%(ext)s`,
  );

  const dlResult = await Command.sidecar("binaries/yt-dlp", [
    parsed.originalUrl,
    "-o",
    outputTemplate,
    "-f",
    "best[ext=mp4]/best",
    "--no-playlist",
  ]).execute();

  if (dlResult.code !== 0) {
    throw new Error("영상 다운로드에 실패했습니다.");
  }

  // ── 5. Find actual downloaded file ─────────────────────────────────────────
  onProgress?.("preparing", "영상을 준비하는 중...");

  let actualFilename: string | null = null;
  for (const ext of ["mp4", "webm", "mkv", "mov"]) {
    const candidate = `downloads/${filenameBase}.${ext}`;
    const found = await exists(candidate, {
      baseDir: BaseDirectory.AppLocalData,
    });
    if (found) {
      actualFilename = `${filenameBase}.${ext}`;
      break;
    }
  }

  if (!actualFilename) {
    throw new Error("다운로드된 영상 파일을 찾을 수 없습니다.");
  }

  // ── 6. Read file → blob URL for <video> playback ───────────────────────────
  const bytes = await readFile(`downloads/${actualFilename}`, {
    baseDir: BaseDirectory.AppLocalData,
  });

  const isWebm = actualFilename.endsWith(".webm");
  const mimeType = isWebm ? "video/webm" : "video/mp4";
  const blob = new Blob([bytes], { type: mimeType });
  const playbackUrl = URL.createObjectURL(blob);

  const actualPath = await join(dataDir, "downloads", actualFilename);

  onProgress?.("done", "완료!");

  return {
    platform: parsed.platform,
    video_id: parsed.videoId,
    title,
    thumbnail_url: thumbnail,
    duration,
    author,
    author_url: authorUrl,
    view_count: viewCount,
    like_count: likeCount,
    original_url: parsed.originalUrl,
    localFilePath: actualPath,
    playbackUrl,
  };
}

// Helper: format seconds to "M:SS" or "H:MM:SS"
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Helper: format view count to "1.2만", "3.4천"
export function formatViewCount(count: number | null): string {
  if (count === null || count === undefined) return "";
  if (count >= 10000) {
    const v = count / 10000;
    return v === Math.floor(v) ? `${Math.floor(v)}만` : `${v.toFixed(1)}만`;
  }
  if (count >= 1000) {
    const v = count / 1000;
    return v === Math.floor(v) ? `${Math.floor(v)}천` : `${v.toFixed(1)}천`;
  }
  return count.toLocaleString();
}

// Platform display config
export const PLATFORM_CONFIG = {
  youtube: { label: "YouTube", color: "bg-red-500", icon: "▶" },
  instagram: {
    label: "Instagram",
    color: "bg-gradient-to-br from-purple-500 to-pink-500",
    icon: "📷",
  },
  tiktok: { label: "TikTok", color: "bg-black", icon: "♪" },
} as const;
