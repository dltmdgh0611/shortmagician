"""URL parser for YouTube, Instagram, and TikTok video links.

Detects the platform and extracts the video ID from a given URL.
"""

import re
from dataclasses import dataclass
from enum import Enum


class Platform(str, Enum):
    YOUTUBE = "youtube"
    INSTAGRAM = "instagram"
    TIKTOK = "tiktok"
    UNKNOWN = "unknown"


@dataclass
class ParsedURL:
    platform: Platform
    video_id: str
    original_url: str


# ── YouTube patterns ─────────────────────────────────────────────────────────
# youtube.com/watch?v=VIDEO_ID
# youtu.be/VIDEO_ID
# youtube.com/shorts/VIDEO_ID
# youtube.com/embed/VIDEO_ID
# youtube.com/v/VIDEO_ID
# m.youtube.com/watch?v=VIDEO_ID
_YOUTUBE_PATTERNS = [
    # Standard watch URL
    re.compile(
        r"(?:https?://)?(?:www\.|m\.)?youtube\.com/watch\?.*?v=([a-zA-Z0-9_-]{11})"
    ),
    # Short URL
    re.compile(
        r"(?:https?://)?youtu\.be/([a-zA-Z0-9_-]{11})"
    ),
    # Shorts URL
    re.compile(
        r"(?:https?://)?(?:www\.|m\.)?youtube\.com/shorts/([a-zA-Z0-9_-]{11})"
    ),
    # Embed URL
    re.compile(
        r"(?:https?://)?(?:www\.)?youtube\.com/embed/([a-zA-Z0-9_-]{11})"
    ),
    # Old-style /v/ URL
    re.compile(
        r"(?:https?://)?(?:www\.)?youtube\.com/v/([a-zA-Z0-9_-]{11})"
    ),
]

# ── Instagram patterns ───────────────────────────────────────────────────────
# instagram.com/reel/CODE/
# instagram.com/reels/CODE/
# instagram.com/p/CODE/
_INSTAGRAM_PATTERNS = [
    re.compile(
        r"(?:https?://)?(?:www\.)?instagram\.com/(?:reel|reels|p)/([a-zA-Z0-9_-]+)"
    ),
]

# ── TikTok patterns ──────────────────────────────────────────────────────────
# tiktok.com/@user/video/VIDEO_ID
# vm.tiktok.com/CODE/
# vt.tiktok.com/CODE/
# tiktok.com/t/CODE/
_TIKTOK_PATTERNS = [
    # Standard video URL
    re.compile(
        r"(?:https?://)?(?:www\.)?tiktok\.com/@[^/]+/video/(\d+)"
    ),
    # Short URL (vm.tiktok.com, vt.tiktok.com)
    re.compile(
        r"(?:https?://)?(?:vm|vt)\.tiktok\.com/([a-zA-Z0-9]+)"
    ),
    # Another short form
    re.compile(
        r"(?:https?://)?(?:www\.)?tiktok\.com/t/([a-zA-Z0-9]+)"
    ),
]


def parse_video_url(url: str) -> ParsedURL:
    """Parse a video URL and detect platform + video ID.

    Args:
        url: The video URL string.

    Returns:
        ParsedURL with platform, video_id, and original_url.

    Raises:
        ValueError: If the URL doesn't match any supported platform.
    """
    url = url.strip()

    # Try YouTube
    for pattern in _YOUTUBE_PATTERNS:
        match = pattern.search(url)
        if match:
            return ParsedURL(
                platform=Platform.YOUTUBE,
                video_id=match.group(1),
                original_url=url,
            )

    # Try Instagram
    for pattern in _INSTAGRAM_PATTERNS:
        match = pattern.search(url)
        if match:
            return ParsedURL(
                platform=Platform.INSTAGRAM,
                video_id=match.group(1),
                original_url=url,
            )

    # Try TikTok
    for pattern in _TIKTOK_PATTERNS:
        match = pattern.search(url)
        if match:
            return ParsedURL(
                platform=Platform.TIKTOK,
                video_id=match.group(1),
                original_url=url,
            )

    raise ValueError(
        "지원하지 않는 URL입니다. YouTube, Instagram, TikTok 링크를 입력해주세요."
    )
