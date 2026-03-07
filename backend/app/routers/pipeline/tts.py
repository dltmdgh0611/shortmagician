import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from app.deps.auth import get_current_user
from app.schemas.pipeline import SynthesizeRequest, VoiceListResponse, VoiceOption
from app.services.google_tts_client import (
    CHIRP3_HD_VOICES,
    LANGUAGE_MAP,
    MAX_TEXT_LENGTH,
    synthesize,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/synthesize")
async def synthesize_speech(
    request: SynthesizeRequest,
    current_user: dict = Depends(get_current_user),
):
    """Synthesize speech using Google Cloud TTS (non-blocking)."""
    # Validate text length
    if len(request.text) > MAX_TEXT_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"\ud14d\uc2a4\ud2b8\uac00 \ub108\ubb34 \uae41\ub2c8\ub2e4. \ucd5c\ub300 {MAX_TEXT_LENGTH}\uc790\uae4c\uc9c0 \uac00\ub2a5\ud569\ub2c8\ub2e4.",
        )

    if not request.text.strip():
        raise HTTPException(
            status_code=400,
            detail="\ud14d\uc2a4\ud2b8\uac00 \ube44\uc5b4 \uc788\uc2b5\ub2c8\ub2e4.",
        )

    # Map short language code to BCP-47
    language_code = LANGUAGE_MAP.get(request.language)
    if language_code is None:
        raise HTTPException(
            status_code=400,
            detail=f"\uc9c0\uc6d0\ud558\uc9c0 \uc54a\ub294 \uc5b8\uc5b4\uc785\ub2c8\ub2e4: {request.language}. "
            f"\uc9c0\uc6d0 \uc5b8\uc5b4: {', '.join(LANGUAGE_MAP.keys())}",
        )

    voice_name = request.voice_id

    try:
        # Run synchronous gRPC call in thread with timeout to prevent infinite hangs
        audio_bytes = await asyncio.wait_for(
            asyncio.to_thread(
                synthesize,
                text=request.text,
                voice_name=voice_name,
                language_code=language_code,
                speed=request.speed,
            ),
            timeout=30.0,  # 30s — gRPC should respond well within this
        )
    except asyncio.TimeoutError:
        logger.error("TTS synthesis timed out for voice=%s lang=%s text=%.50s", voice_name, language_code, request.text)
        raise HTTPException(
            status_code=504,
            detail="TTS 합성 시간이 초과되었습니다 (30초). 다시 시도해주세요.",
        )
    except Exception as e:
        logger.exception("TTS synthesis failed for voice=%s lang=%s text=%.50s", voice_name, language_code, request.text)
        raise HTTPException(
            status_code=502,
            detail=f"TTS 합성에 실패했습니다: {type(e).__name__}: {e}",
        )

    logger.debug("TTS OK: %d bytes, voice=%s", len(audio_bytes), voice_name)
    return Response(content=audio_bytes, media_type="audio/mpeg")


@router.get("/voices", response_model=VoiceListResponse)
async def list_voices(
    language: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """List available Chirp 3 HD voices."""
    voices: list[VoiceOption] = []

    if language:
        if language not in CHIRP3_HD_VOICES:
            raise HTTPException(
                status_code=400,
                detail=f"\uc9c0\uc6d0\ud558\uc9c0 \uc54a\ub294 \uc5b8\uc5b4\uc785\ub2c8\ub2e4: {language}. "
                f"\uc9c0\uc6d0 \uc5b8\uc5b4: {', '.join(CHIRP3_HD_VOICES.keys())}",
            )
        languages = [language]
    else:
        languages = list(CHIRP3_HD_VOICES.keys())

    for lang in languages:
        bcp47 = LANGUAGE_MAP[lang]
        for voice_info in CHIRP3_HD_VOICES[lang]:
            voice_id = f"{bcp47}-Chirp3-HD-{voice_info['name']}"
            voices.append(
                VoiceOption(
                    voice_id=voice_id,
                    name=voice_info["name"],
                    language=lang,
                    gender=voice_info["gender"],
                )
            )

    return VoiceListResponse(voices=voices)
