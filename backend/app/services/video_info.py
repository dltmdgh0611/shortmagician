"""Video metadata extraction and download using yt-dlp.

Extracts metadata (title, thumbnail, duration, author, etc.) from
YouTube, Instagram, and TikTok URLs. Optionally downloads the video as mp4.
"""

import logging
import os
import pathlib
import tempfile
import uuid
from dataclasses import dataclass
from typing import Any

import yt_dlp
from yt_dlp.utils import DownloadError, ExtractorError

from app.config import INSTAGRAM_SESSION_ID
from app.services.url_parser import Platform, ParsedURL

logger = logging.getLogger(__name__)

# ── Downloads directory ───────────────────────────────────────────────────────
DOWNLOADS_DIR = pathlib.Path(__file__).resolve().parent.parent.parent / "downloads"
DOWNLOADS_DIR.mkdir(exist_ok=True)

# ── Base yt-dlp options (metadata-only, no download) ─────────────────────────
_BASE_OPTS: dict[str, Any] = {
    "quiet": True,
    "no_warnings": True,
    "noplaylist": True,
    "skip_download": True,
    "ignoreerrors": False,
    "socket_timeout": 15,
    "geo_bypass": True,
}

# ── Instagram cookie file (Netscape format) ──────────────────────────────────
_ig_cookie_path: str | None = None


def _get_ig_cookie_file() -> str | None:
    """Create a Netscape-format cookie file for Instagram authentication.

    Uses INSTAGRAM_SESSION_ID from config. Returns cached file path.
    """
    global _ig_cookie_path

    if not INSTAGRAM_SESSION_ID:
        return None

    if _ig_cookie_path and os.path.exists(_ig_cookie_path):
        return _ig_cookie_path

    # Netscape cookie format: domain, flag, path, secure, expiry, name, value
    cookie_content = (
        "# Netscape HTTP Cookie File\n"
        f".instagram.com\tTRUE\t/\tTRUE\t0\tsessionid\t{INSTAGRAM_SESSION_ID}\n"
        f".instagram.com\tTRUE\t/\tTRUE\t0\tig_did\t{'A' * 36}\n"
    )

    fd, path = tempfile.mkstemp(suffix=".txt", prefix="ig_cookies_")
    with os.fdopen(fd, "w") as f:
        f.write(cookie_content)

    _ig_cookie_path = path
    logger.info("Instagram cookie file created at %s", path)
    return path


def _get_ydl_opts(platform: Platform) -> dict[str, Any]:
    """Build platform-specific yt-dlp options."""
    opts = {**_BASE_OPTS}

    if platform == Platform.TIKTOK:
        # TikTok actively blocks scrapers; impersonate browser via curl-cffi
        try:
            import curl_cffi  # noqa: F401
            opts["impersonate"] = "chrome"
        except ImportError:
            pass

    if platform == Platform.INSTAGRAM:
        cookie_file = _get_ig_cookie_file()
        if cookie_file:
            opts["cookiefile"] = cookie_file
        else:
            logger.warning(
                "INSTAGRAM_SESSION_ID not configured. "
                "Instagram extraction will likely fail."
            )

    return opts


@dataclass
class VideoInfo:
    """Extracted video metadata."""

    platform: str
    video_id: str
    title: str
    thumbnail_url: str
    duration: int  # seconds
    author: str
    author_url: str
    view_count: int | None
    like_count: int | None
    original_url: str
    embed_url: str | None
    video_file: str | None  # local filename of downloaded mp4 (None if not yet downloaded)


def _build_embed_url(parsed: ParsedURL) -> str | None:
    """Build an embeddable URL for in-app video playback."""
    if parsed.platform == Platform.YOUTUBE:
        return f"https://www.youtube.com/embed/{parsed.video_id}"
    if parsed.platform == Platform.INSTAGRAM:
        return f"https://www.instagram.com/reel/{parsed.video_id}/embed/"
    if parsed.platform == Platform.TIKTOK:
        return f"https://www.tiktok.com/embed/v2/{parsed.video_id}"
    return None


def _safe_int(value: Any) -> int | None:
    """Safely convert to int, returning None on failure."""
    if value is None:
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


def _pick_thumbnail(info: dict[str, Any], parsed: ParsedURL) -> str:
    """Pick the best available thumbnail URL."""
    thumbnail_url = str(info.get("thumbnail", "") or "")

    thumbnails = info.get("thumbnails")
    if thumbnails and isinstance(thumbnails, list):
        best = max(
            thumbnails,
            key=lambda t: (t.get("height", 0) or 0) * (t.get("width", 0) or 0),
            default=None,
        )
        if best and best.get("url"):
            thumbnail_url = str(best["url"])

    # For YouTube, fall back to known high-quality thumbnail URL
    if parsed.platform == Platform.YOUTUBE and parsed.video_id and not thumbnail_url:
        thumbnail_url = f"https://img.youtube.com/vi/{parsed.video_id}/maxresdefault.jpg"

    return thumbnail_url


def _pick_author(info: dict[str, Any], platform: Platform) -> str:
    """Pick the best author name.

    YouTube: prefer 'channel' over 'uploader' (uploader can be None for brand accounts).
    Others: prefer 'uploader'.
    """
    if platform == Platform.YOUTUBE:
        return str(info.get("channel", "") or info.get("uploader", "") or "")
    return str(info.get("uploader", "") or info.get("channel", "") or "")


def extract_video_info(parsed: ParsedURL) -> VideoInfo:
    """Extract video metadata from a parsed URL using yt-dlp.

    Args:
        parsed: A ParsedURL with platform, video_id, and original_url.

    Returns:
        VideoInfo with all available metadata.

    Raises:
        ValueError: If the video is unavailable or cannot be fetched.
    """
    opts = _get_ydl_opts(parsed.platform)

    try:
        ydl = yt_dlp.YoutubeDL(opts)
        raw_info = ydl.extract_info(parsed.original_url, download=False)
        if raw_info is None:
            raise ValueError("영상 정보를 가져올 수 없습니다.")
        # sanitize_info removes non-serializable internal objects
        sanitized = ydl.sanitize_info(raw_info)
        info: dict[str, Any] = dict(sanitized) if sanitized else {}

    except DownloadError as e:
        error_msg = str(e).lower()
        if "private" in error_msg:
            raise ValueError("비공개 영상입니다. 공개 또는 일부 공개 영상의 링크를 입력해주세요.") from e
        if any(kw in error_msg for kw in ("removed", "deleted", "not available", "no longer available")):
            raise ValueError("삭제되었거나 더 이상 사용할 수 없는 영상입니다.") from e
        if "geo" in error_msg or "country" in error_msg:
            raise ValueError("지역 제한으로 접근할 수 없는 영상입니다.") from e
        if any(kw in error_msg for kw in ("sign in", "login", "age", "confirm your age")):
            if parsed.platform == Platform.INSTAGRAM:
                raise ValueError(
                    "Instagram 인증이 필요합니다. "
                    "관리자에게 INSTAGRAM_SESSION_ID 설정을 요청해주세요."
                ) from e
            raise ValueError("로그인이 필요하거나 연령 제한이 있는 영상입니다.") from e
        if "empty media response" in error_msg and parsed.platform == Platform.INSTAGRAM:
            raise ValueError(
                "Instagram 영상을 불러올 수 없습니다. "
                "INSTAGRAM_SESSION_ID가 설정되지 않았거나 만료되었습니다."
            ) from e
        if "copyright" in error_msg:
            raise ValueError("저작권 문제로 접근할 수 없는 영상입니다.") from e
        if "429" in error_msg:
            raise ValueError("요청이 너무 많습니다. 잠시 후 다시 시도해주세요.") from e
        logger.error("yt-dlp DownloadError for %s: %s", parsed.original_url, e)
        raise ValueError("영상 정보를 가져올 수 없습니다. URL을 확인해주세요.") from e

    except ExtractorError as e:
        logger.error("yt-dlp ExtractorError for %s: %s", parsed.original_url, e)
        raise ValueError("영상 정보를 추출하는 중 오류가 발생했습니다.") from e

    except ValueError:
        raise  # re-raise ValueError from info is None check

    except Exception as e:
        logger.error("Unexpected error extracting info for %s: %s", parsed.original_url, e)
        raise ValueError("영상 정보를 가져오는 중 오류가 발생했습니다.") from e

    return VideoInfo(
        platform=parsed.platform.value,
        video_id=parsed.video_id,
        title=str(info.get("title", "") or "제목 없음"),
        thumbnail_url=_pick_thumbnail(info, parsed),
        duration=_safe_int(info.get("duration")) or 0,
        author=_pick_author(info, parsed.platform),
        author_url=str(info.get("uploader_url", "") or info.get("channel_url", "") or ""),
        view_count=_safe_int(info.get("view_count")),
        like_count=_safe_int(info.get("like_count")),
        original_url=parsed.original_url,
        embed_url=_build_embed_url(parsed),
        video_file=None,
    )


# ── Video download ───────────────────────────────────────────────────────────


def download_video(parsed: ParsedURL) -> str:
    """Download a video as mp4 and return the local filename.

    Args:
        parsed: A ParsedURL with platform, video_id, and original_url.

    Returns:
        The filename (not full path) of the downloaded mp4 in DOWNLOADS_DIR.

    Raises:
        ValueError: If the download fails.
    """
    filename = f"{parsed.platform.value}_{parsed.video_id}_{uuid.uuid4().hex[:8]}"
    output_template = str(DOWNLOADS_DIR / f"{filename}.%(ext)s")

    opts = _get_ydl_opts(parsed.platform)
    # Override for actual download
    opts.update({
        "skip_download": False,
        "outtmpl": output_template,
        # Single stream mp4 (no ffmpeg merge needed)
        # Prefer: pre-merged mp4 → any single-file best
        "format": "best[ext=mp4]/best",
        "socket_timeout": 60,
    })

    try:
        ydl = yt_dlp.YoutubeDL(opts)
        ydl.download([parsed.original_url])
    except DownloadError as e:
        logger.error("Download failed for %s: %s", parsed.original_url, e)
        raise ValueError("영상 다운로드에 실패했습니다.") from e
    except Exception as e:
        logger.error("Unexpected download error for %s: %s", parsed.original_url, e)
        raise ValueError("영상 다운로드 중 오류가 발생했습니다.") from e

    # Find the actual downloaded file (yt-dlp may change extension)
    mp4_file = DOWNLOADS_DIR / f"{filename}.mp4"
    if mp4_file.exists():
        return mp4_file.name

    # Fallback: find any file matching the prefix
    for f in DOWNLOADS_DIR.iterdir():
        if f.name.startswith(filename) and f.is_file():
            return f.name

    raise ValueError("영상 파일을 찾을 수 없습니다. 다운로드가 실패했을 수 있습니다.")
