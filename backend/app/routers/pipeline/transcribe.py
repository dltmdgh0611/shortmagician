import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile

from app.deps.auth import get_current_user
from app.schemas.pipeline import TranscribeResponse, TranscribeSegment
from app.services.openai_client import get_openai_client
from app.services.usage_logger import log_usage

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_FILE_SIZE = 25 * 1024 * 1024  # 25MB
NO_SPEECH_THRESHOLD = 0.6  # Segments above this are likely non-speech
MIN_SEGMENT_DURATION = 0.5  # Seconds — merge shorter segments with neighbors

# Whisper returns full language names (e.g. "korean"); translate expects ISO codes.
WHISPER_LANG_MAP: dict[str, str] = {
    "korean": "ko",
    "english": "en",
    "japanese": "ja",
    "chinese": "zh",
    "spanish": "es",
}


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_audio(
    file: UploadFile = File(...),
    language: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Transcribe audio using OpenAI Whisper API."""
    content = await file.read()

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="파일 크기가 25MB를 초과합니다")

    try:
        client = get_openai_client()

        kwargs = {
            "model": "whisper-1",
            "file": (file.filename or "audio.wav", content),
            "response_format": "verbose_json",
            "timestamp_granularities": ["segment"],
        }
        if language:
            kwargs["language"] = language

        response = client.audio.transcriptions.create(**kwargs)

        # Check for no-speech: if majority of segments have high no_speech_prob
        raw_segments = response.segments or []
        if not raw_segments:
            raise HTTPException(
                status_code=422,
                detail="음성이 감지되지 않았습니다. 오디오가 비어있거나 음악만 포함되어 있습니다."
            )

        no_speech_count = sum(
            1 for seg in raw_segments
            if getattr(seg, "no_speech_prob", 0) > NO_SPEECH_THRESHOLD
        )
        if no_speech_count == len(raw_segments):
            raise HTTPException(
                status_code=422,
                detail="음성이 감지되지 않았습니다. 오디오에 인식 가능한 음성이 없습니다."
            )

        # Build segments, merging short ones (<0.5s) with next neighbor
        pre_segments = [
            TranscribeSegment(
                id=str(seg.id),
                start_time=seg.start,
                end_time=seg.end,
                text=seg.text,
            )
            for seg in raw_segments
            if getattr(seg, "no_speech_prob", 0) <= NO_SPEECH_THRESHOLD
        ]

        segments = []
        for seg in pre_segments:
            dur = seg.end_time - seg.start_time
            if dur < MIN_SEGMENT_DURATION and segments:
                # Merge with previous: extend end_time, append text
                prev = segments[-1]
                segments[-1] = TranscribeSegment(
                    id=prev.id,
                    start_time=prev.start_time,
                    end_time=seg.end_time,
                    text=prev.text + " " + seg.text,
                )
            else:
                segments.append(seg)

        # Re-assign sequential IDs after merge
        for idx, seg in enumerate(segments):
            seg.id = str(idx)

        raw_language = response.language or "unknown"
        detected_language = WHISPER_LANG_MAP.get(raw_language, raw_language)

        duration = int(segments[-1].end_time) if segments else 0
        await log_usage(current_user["uid"], "whisper", duration, "seconds")

        return TranscribeResponse(
            segments=segments,
            detected_language=detected_language,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Whisper transcription failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"음성 변환에 실패했습니다: {type(e).__name__}: {e}",
        )
