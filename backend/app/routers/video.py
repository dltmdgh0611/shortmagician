"""Video URL parsing, metadata extraction, and file serving router.

POST /video/parse-url → parse URL, extract metadata + download video as mp4.
GET  /video/file/{filename} → serve a downloaded video file.
"""

import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.schemas import VideoParseRequest, VideoInfoResponse
from app.services.url_parser import parse_video_url
from app.services.video_info import (
    DOWNLOADS_DIR,
    download_video,
    extract_video_info,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/video", tags=["video"])


@router.post("/parse-url", response_model=VideoInfoResponse)
async def parse_url(body: VideoParseRequest):
    """Parse a video URL, extract metadata, and download as mp4.

    Supports YouTube, Instagram, and TikTok URLs.
    Returns metadata + a video_url for playback.
    """
    url = body.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL을 입력해주세요.")

    # Step 1: Parse the URL to detect platform + video ID
    try:
        parsed = parse_video_url(url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Step 2: Extract metadata via yt-dlp
    try:
        info = extract_video_info(parsed)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error("Unexpected error during video info extraction: %s", e)
        raise HTTPException(
            status_code=500,
            detail="영상 정보를 가져오는 중 서버 오류가 발생했습니다.",
        )

    # Step 3: Download the video as mp4
    video_url: str | None = None
    try:
        filename = download_video(parsed)
        video_url = f"/api/v1/video/file/{filename}"
    except ValueError as e:
        logger.warning("Video download failed (metadata still available): %s", e)
        # Non-fatal: return metadata without video_url
    except Exception as e:
        logger.warning("Unexpected download error (metadata still available): %s", e)

    return VideoInfoResponse(
        platform=info.platform,
        video_id=info.video_id,
        title=info.title,
        thumbnail_url=info.thumbnail_url,
        duration=info.duration,
        author=info.author,
        author_url=info.author_url,
        view_count=info.view_count,
        like_count=info.like_count,
        original_url=info.original_url,
        embed_url=info.embed_url,
        video_url=video_url,
    )


@router.get("/file/{filename}")
async def serve_video_file(filename: str):
    """Serve a downloaded video file for playback.

    Returns the file with proper Content-Type for browser <video> playback.
    """
    # Security: prevent path traversal
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="잘못된 파일명입니다.")

    filepath = DOWNLOADS_DIR / filename
    if not filepath.exists() or not filepath.is_file():
        raise HTTPException(status_code=404, detail="영상 파일을 찾을 수 없습니다.")

    # Determine media type from extension
    suffix = filepath.suffix.lower()
    media_types = {
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".mkv": "video/x-matroska",
        ".m4a": "audio/mp4",
    }
    media_type = media_types.get(suffix, "application/octet-stream")

    return FileResponse(
        path=str(filepath),
        media_type=media_type,
        filename=filepath.name,
    )
