"""Tests for POST /api/v1/pipeline/transcribe (Whisper STT endpoint).

All tests mock the OpenAI client — no real API key needed.
"""
import io
from unittest.mock import AsyncMock, MagicMock, patch


def test_transcribe_requires_auth(client):
    """No auth token → 401/422."""
    response = client.post("/api/v1/pipeline/transcribe")
    assert response.status_code in (401, 422)


def test_transcribe_returns_segments(client, mock_firebase_auth):
    """Mock Whisper response → valid TranscribeResponse shape."""
    mock_db = MagicMock()

    mock_response = MagicMock()
    mock_response.segments = [
        MagicMock(id=0, start=0.0, end=2.5, text="안녕하세요", no_speech_prob=0.1),
        MagicMock(id=1, start=2.5, end=5.0, text="반갑습니다", no_speech_prob=0.05),
    ]
    mock_response.language = "ko"

    mock_client = MagicMock()
    mock_client.audio.transcriptions.create.return_value = mock_response

    audio = io.BytesIO(b"fake audio content")

    with (
        patch("app.deps.auth.db", mock_db),
        patch(
            "app.routers.pipeline.transcribe.get_openai_client",
            return_value=mock_client,
        ),
        patch(
            "app.routers.pipeline.transcribe.log_usage",
            new_callable=AsyncMock,
        ),
    ):
        response = client.post(
            "/api/v1/pipeline/transcribe",
            files={"file": ("test.wav", audio, "audio/wav")},
            headers={"Authorization": "Bearer valid_token"},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["detected_language"] == "ko"
    assert len(data["segments"]) == 2
    assert data["segments"][0]["id"] == "0"
    assert data["segments"][0]["start_time"] == 0.0
    assert data["segments"][0]["end_time"] == 2.5
    assert data["segments"][0]["text"] == "안녕하세요"
    assert data["segments"][1]["id"] == "1"
    assert data["segments"][1]["start_time"] == 2.5
    assert data["segments"][1]["end_time"] == 5.0
    assert data["segments"][1]["text"] == "반갑습니다"


def test_transcribe_rejects_large_file(client, mock_firebase_auth):
    """File >25MB → 413."""
    mock_db = MagicMock()

    large_content = b"x" * (25 * 1024 * 1024 + 1)
    audio = io.BytesIO(large_content)

    with patch("app.deps.auth.db", mock_db):
        response = client.post(
            "/api/v1/pipeline/transcribe",
            files={"file": ("large.wav", audio, "audio/wav")},
            headers={"Authorization": "Bearer valid_token"},
        )

    assert response.status_code == 413


def test_transcribe_handles_whisper_error(client, mock_firebase_auth):
    """Whisper API error → 500 with message."""
    mock_db = MagicMock()

    mock_client = MagicMock()
    mock_client.audio.transcriptions.create.side_effect = Exception("API error")

    audio = io.BytesIO(b"fake audio content")

    with (
        patch("app.deps.auth.db", mock_db),
        patch(
            "app.routers.pipeline.transcribe.get_openai_client",
            return_value=mock_client,
        ),
    ):
        response = client.post(
            "/api/v1/pipeline/transcribe",
            files={"file": ("test.wav", audio, "audio/wav")},
            headers={"Authorization": "Bearer valid_token"},
        )

    assert response.status_code == 500
    assert "음성 변환" in response.json()["detail"]
