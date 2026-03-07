"""Google Cloud Text-to-Speech client wrapper.

Encapsulates the Google Cloud TTS API calls so routers and tests
can interact with a thin, mockable interface.
"""

import logging

from google.cloud import texttospeech

from app.config import GOOGLE_CLOUD_PROJECT

logger = logging.getLogger(__name__)

# Language code mapping: short code → BCP-47
LANGUAGE_MAP: dict[str, str] = {
    "ko": "ko-KR",
    "en": "en-US",
    "ja": "ja-JP",
    "zh": "cmn-CN",
    "es": "es-ES",
}

# Chirp 3 HD voices per language (5 voices × 5 languages = 25 total)
CHIRP3_HD_VOICES: dict[str, list[dict]] = {
    "ko": [
        {"name": "Achernar", "gender": "FEMALE"},
        {"name": "Achird", "gender": "MALE"},
        {"name": "Aoede", "gender": "FEMALE"},
        {"name": "Algenib", "gender": "MALE"},
        {"name": "Autonoe", "gender": "FEMALE"},
    ],
    "en": [
        {"name": "Achernar", "gender": "FEMALE"},
        {"name": "Achird", "gender": "MALE"},
        {"name": "Aoede", "gender": "FEMALE"},
        {"name": "Algenib", "gender": "MALE"},
        {"name": "Autonoe", "gender": "FEMALE"},
    ],
    "ja": [
        {"name": "Achernar", "gender": "FEMALE"},
        {"name": "Achird", "gender": "MALE"},
        {"name": "Aoede", "gender": "FEMALE"},
        {"name": "Algenib", "gender": "MALE"},
        {"name": "Autonoe", "gender": "FEMALE"},
    ],
    "zh": [
        {"name": "Achernar", "gender": "FEMALE"},
        {"name": "Achird", "gender": "MALE"},
        {"name": "Aoede", "gender": "FEMALE"},
        {"name": "Algenib", "gender": "MALE"},
        {"name": "Autonoe", "gender": "FEMALE"},
    ],
    "es": [
        {"name": "Achernar", "gender": "FEMALE"},
        {"name": "Achird", "gender": "MALE"},
        {"name": "Aoede", "gender": "FEMALE"},
        {"name": "Algenib", "gender": "MALE"},
        {"name": "Autonoe", "gender": "FEMALE"},
    ],
}

# Maximum text length for synthesis (characters)
MAX_TEXT_LENGTH = 5000

# ── Shared singleton client ─────────────────────────────────────────────────

_tts_client: texttospeech.TextToSpeechClient | None = None


def get_tts_client() -> texttospeech.TextToSpeechClient:
    """Return the shared Google Cloud TTS client (created once, reused)."""
    global _tts_client
    if _tts_client is None:
        logger.info("Creating shared Google Cloud TTS client")
        _tts_client = texttospeech.TextToSpeechClient()
    return _tts_client


def build_ssml(text: str, speed: float = 1.0) -> str:
    """Wrap plain text in SSML with prosody rate control.

    Args:
        text: Plain text to speak.
        speed: Speaking rate multiplier (1.0 = normal).

    Returns:
        SSML string ready for Google TTS.
    """
    # Escape XML special characters
    escaped = (
        text
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )
    # Clamp speed to Google TTS supported range (0.25 – 4.0)
    clamped = max(0.25, min(4.0, speed))
    rate_pct = f"{clamped * 100:.0f}%"
    return f'<speak><prosody rate="{rate_pct}">{escaped}</prosody></speak>'


def synthesize(
    text: str,
    voice_name: str,
    language_code: str,
    speed: float = 1.0,
    client: texttospeech.TextToSpeechClient | None = None,
) -> bytes:
    """Synthesize speech and return MP3 audio bytes.

    Args:
        text: Plain text to synthesize.
        voice_name: Full Google TTS voice name (e.g. "ko-KR-Chirp3-HD-Koa").
        language_code: BCP-47 language code (e.g. "ko-KR").
        speed: Speaking rate multiplier (default 1.0).
        client: Optional pre-built TTS client (for dependency injection).

    Returns:
        Raw MP3 audio bytes.
    """
    if client is None:
        client = get_tts_client()

    ssml = build_ssml(text, speed)

    synthesis_input = texttospeech.SynthesisInput(ssml=ssml)
    voice_params = texttospeech.VoiceSelectionParams(
        language_code=language_code,
        name=voice_name,
    )
    audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.MP3,
    )

    response = client.synthesize_speech(
        input=synthesis_input,
        voice=voice_params,
        audio_config=audio_config,
    )

    return response.audio_content
