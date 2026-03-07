"""Re-transcribe TTS audio with Whisper to get word-level timestamps.

Used for precise subtitle-audio alignment: after generating paragraph-level
TTS (for natural prosody), we run Whisper on the TTS output to discover
exactly when each word is spoken, then use those timestamps for subtitles.
"""

import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.deps.auth import get_current_user
from app.schemas.pipeline import RealignResponse, WordTimestamp
from app.services.openai_client import get_openai_client
from app.services.usage_logger import log_usage

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_FILE_SIZE = 25 * 1024 * 1024  # 25MB


@router.post("/realign", response_model=RealignResponse)
async def realign_tts_audio(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Re-transcribe TTS audio to get word-level timestamps for subtitle alignment.

    Accepts a TTS-generated audio file and returns word-level timestamps
    using Whisper's word granularity mode. These timestamps reflect the
    actual speech timing in the TTS output.
    """
    content = await file.read()

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="파일 크기가 25MB를 초과합니다")

    try:
        client = get_openai_client()

        response = client.audio.transcriptions.create(
            model="whisper-1",
            file=(file.filename or "tts_audio.mp3", content),
            response_format="verbose_json",
            timestamp_granularities=["word"],
        )

        raw_words = response.words or []
        if not raw_words:
            logger.warning("Whisper returned no words for realignment")
            return RealignResponse(words=[], duration=0.0)

        words = [
            WordTimestamp(
                word=w.word.strip(),
                start=w.start,
                end=w.end,
            )
            for w in raw_words
            if w.word.strip()
        ]

        # Duration: use last word's end time (more reliable than response.duration
        # for short clips where Whisper may pad silence)
        duration = words[-1].end if words else 0.0

        # Log usage (billed by audio duration in seconds)
        await log_usage(
            current_user["uid"], "whisper-realign", int(duration), "seconds",
        )

        logger.info(
            "Realign complete: %d words, %.1fs duration",
            len(words), duration,
        )
        return RealignResponse(words=words, duration=duration)

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Whisper realignment failed: %s", e)
        raise HTTPException(
            status_code=500,
            detail=f"자막 정렬에 실패했습니다: {type(e).__name__}: {e}",
        )
