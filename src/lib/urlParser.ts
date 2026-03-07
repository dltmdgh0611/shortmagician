/**
 * URL parser for YouTube, Instagram, and TikTok video links.
 * TypeScript port of backend/app/services/url_parser.py
 *
 * Detects the platform and extracts the video ID from a given URL.
 */

export type Platform = "youtube" | "instagram" | "tiktok";

export interface ParsedURL {
  platform: Platform;
  videoId: string;
  originalUrl: string;
}

// ── YouTube patterns ─────────────────────────────────────────────────────────
// youtube.com/watch?v=VIDEO_ID
// youtu.be/VIDEO_ID
// youtube.com/shorts/VIDEO_ID
// youtube.com/embed/VIDEO_ID
// youtube.com/v/VIDEO_ID
// m.youtube.com/watch?v=VIDEO_ID
const YOUTUBE_PATTERNS: RegExp[] = [
  // Standard watch URL
  /(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/watch\?.*?v=([a-zA-Z0-9_-]{11})/,
  // Short URL
  /(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
  // Shorts URL
  /(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  // Embed URL
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  // Old-style /v/ URL
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
];

// ── Instagram patterns ───────────────────────────────────────────────────────
// instagram.com/reel/CODE/
// instagram.com/reels/CODE/
// instagram.com/p/CODE/
const INSTAGRAM_PATTERNS: RegExp[] = [
  /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:reel|reels|p)\/([a-zA-Z0-9_-]+)/,
];

// ── TikTok patterns ──────────────────────────────────────────────────────────
// tiktok.com/@user/video/VIDEO_ID
// vm.tiktok.com/CODE/
// vt.tiktok.com/CODE/
// tiktok.com/t/CODE/
const TIKTOK_PATTERNS: RegExp[] = [
  // Standard video URL
  /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@[^/]+\/video\/(\d+)/,
  // Short URL (vm.tiktok.com, vt.tiktok.com)
  /(?:https?:\/\/)?(?:vm|vt)\.tiktok\.com\/([a-zA-Z0-9]+)/,
  // Another short form
  /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/t\/([a-zA-Z0-9]+)/,
];

/**
 * Parse a video URL and detect platform + video ID.
 *
 * @param url - The video URL string.
 * @returns ParsedURL with platform, videoId, and originalUrl.
 * @throws Error if the URL does not match any supported platform.
 */
export function parseVideoUrl(url: string): ParsedURL {
  const trimmed = url.trim();

  // Try YouTube
  for (const pattern of YOUTUBE_PATTERNS) {
    const match = pattern.exec(trimmed);
    if (match) {
      return { platform: "youtube", videoId: match[1], originalUrl: trimmed };
    }
  }

  // Try Instagram
  for (const pattern of INSTAGRAM_PATTERNS) {
    const match = pattern.exec(trimmed);
    if (match) {
      return { platform: "instagram", videoId: match[1], originalUrl: trimmed };
    }
  }

  // Try TikTok
  for (const pattern of TIKTOK_PATTERNS) {
    const match = pattern.exec(trimmed);
    if (match) {
      return { platform: "tiktok", videoId: match[1], originalUrl: trimmed };
    }
  }

  throw new Error(
    "지원하지 않는 URL입니다. YouTube, Instagram, TikTok 링크를 입력해주세요."
  );
}
