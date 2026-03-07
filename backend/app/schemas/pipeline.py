from pydantic import BaseModel
from typing import Optional


class TranscribeRequest(BaseModel):
    language: Optional[str] = None  # auto-detect if None


class TranscribeSegment(BaseModel):
    id: str
    start_time: float
    end_time: float
    text: str


class TranscribeResponse(BaseModel):
    segments: list[TranscribeSegment]
    detected_language: str


class TranslateRequest(BaseModel):
    segments: list[TranscribeSegment]
    source_language: str
    target_language: str


class TranslatedSegment(BaseModel):
    id: str
    start_time: float
    end_time: float
    original_text: str
    translated_text: str


class TranslateResponse(BaseModel):
    segments: list[TranslatedSegment]
    source_language: str
    target_language: str


class SynthesizeRequest(BaseModel):
    text: str
    voice_id: str
    language: str
    speed: Optional[float] = 1.0


class VoiceOption(BaseModel):
    voice_id: str
    name: str
    language: str
    gender: str


class VoiceListResponse(BaseModel):
    voices: list[VoiceOption]


class SplitSegmentsRequest(BaseModel):
    segments: list[TranslatedSegment]
    max_duration: float = 2.0
    max_lines: int = 3
    target_language: str


class SplitSegmentsResponse(BaseModel):
    segments: list[TranslatedSegment]


class WordTimestamp(BaseModel):
    word: str
    start: float  # seconds relative to audio start
    end: float    # seconds relative to audio start


class RealignResponse(BaseModel):
    words: list[WordTimestamp]
    duration: float  # total audio duration in seconds
