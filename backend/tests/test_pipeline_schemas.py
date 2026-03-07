import pytest
from app.schemas.pipeline import (
    TranscribeSegment,
    TranscribeRequest,
    TranslateRequest,
    SynthesizeRequest,
    VoiceOption,
)


def test_transcribe_segment_valid():
    """Test TranscribeSegment accepts valid data"""
    segment = TranscribeSegment(
        id="seg_1",
        start_time=0.0,
        end_time=5.0,
        text="Hello world"
    )
    assert segment.id == "seg_1"
    assert segment.start_time == 0.0
    assert segment.end_time == 5.0
    assert segment.text == "Hello world"


def test_translate_request_validates_segments():
    """Test TranslateRequest validates segments list"""
    segments = [
        TranscribeSegment(
            id="seg_1",
            start_time=0.0,
            end_time=5.0,
            text="Hello"
        ),
        TranscribeSegment(
            id="seg_2",
            start_time=5.0,
            end_time=10.0,
            text="World"
        ),
    ]
    request = TranslateRequest(
        segments=segments,
        source_language="en",
        target_language="ko"
    )
    assert len(request.segments) == 2
    assert request.source_language == "en"
    assert request.target_language == "ko"


def test_synthesize_request_has_defaults():
    """Test SynthesizeRequest has defaults for speed"""
    request = SynthesizeRequest(
        text="Hello",
        voice_id="voice_1",
        language="en"
    )
    assert request.text == "Hello"
    assert request.voice_id == "voice_1"
    assert request.language == "en"
    assert request.speed == 1.0


def test_voice_option_valid():
    """Test VoiceOption accepts valid data"""
    voice = VoiceOption(
        voice_id="voice_1",
        name="Alice",
        language="en",
        gender="female"
    )
    assert voice.voice_id == "voice_1"
    assert voice.name == "Alice"
    assert voice.language == "en"
    assert voice.gender == "female"
