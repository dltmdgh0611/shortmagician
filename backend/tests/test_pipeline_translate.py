"""Tests for POST /api/v1/pipeline/translate endpoint."""
import json
from unittest.mock import MagicMock, patch


TRANSLATE_URL = "/api/v1/pipeline/translate"
AUTH_HEADER = {"Authorization": "Bearer valid_token"}

SAMPLE_SEGMENTS = [
    {"id": "seg-1", "start_time": 0.0, "end_time": 2.5, "text": "안녕하세요"},
    {"id": "seg-2", "start_time": 2.5, "end_time": 5.0, "text": "만나서 반갑습니다"},
]


def _mock_openai_completion(translations: list[str], total_tokens: int = 50):
    """Build a mock OpenAI ChatCompletion object."""
    mock_completion = MagicMock()
    mock_completion.choices = [MagicMock()]
    mock_completion.choices[0].message.content = json.dumps(
        {"translations": translations}
    )
    mock_completion.usage.total_tokens = total_tokens
    return mock_completion


def test_translate_requires_auth(client):
    """No auth token → 401 or 422."""
    response = client.post(TRANSLATE_URL)
    assert response.status_code in (401, 422)


def test_translate_returns_translated_segments(client, mock_firebase_auth):
    """Mock GPT response, verify response shape and content."""
    mock_completion = _mock_openai_completion(["Hello", "Nice to meet you"])

    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = mock_completion

    with patch("app.deps.auth.db", MagicMock()), \
         patch("app.routers.pipeline.translate.openai_client", mock_client), \
         patch("app.routers.pipeline.translate.log_usage") as mock_log:
        response = client.post(
            TRANSLATE_URL,
            json={
                "segments": SAMPLE_SEGMENTS,
                "source_language": "ko",
                "target_language": "en",
            },
            headers=AUTH_HEADER,
        )

    assert response.status_code == 200
    data = response.json()
    assert data["source_language"] == "ko"
    assert data["target_language"] == "en"
    assert len(data["segments"]) == 2
    assert data["segments"][0]["translated_text"] == "Hello"
    assert data["segments"][1]["translated_text"] == "Nice to meet you"
    assert data["segments"][0]["original_text"] == "안녕하세요"
    assert data["segments"][1]["original_text"] == "만나서 반갑습니다"

    # Verify usage logging was called
    mock_log.assert_called_once_with("test-uid-123", "gpt-translate", 50, "tokens")


def test_translate_preserves_timestamps(client, mock_firebase_auth):
    """start_time and end_time must be unchanged after translation."""
    mock_completion = _mock_openai_completion(["Hello", "Nice to meet you"])

    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = mock_completion

    with patch("app.deps.auth.db", MagicMock()), \
         patch("app.routers.pipeline.translate.openai_client", mock_client), \
         patch("app.routers.pipeline.translate.log_usage"):
        response = client.post(
            TRANSLATE_URL,
            json={
                "segments": SAMPLE_SEGMENTS,
                "source_language": "ko",
                "target_language": "en",
            },
            headers=AUTH_HEADER,
        )

    assert response.status_code == 200
    segments = response.json()["segments"]
    assert segments[0]["id"] == "seg-1"
    assert segments[0]["start_time"] == 0.0
    assert segments[0]["end_time"] == 2.5
    assert segments[1]["id"] == "seg-2"
    assert segments[1]["start_time"] == 2.5
    assert segments[1]["end_time"] == 5.0


def test_translate_rejects_empty_segments(client, mock_firebase_auth):
    """Empty segments array → 422."""
    with patch("app.deps.auth.db", MagicMock()):
        response = client.post(
            TRANSLATE_URL,
            json={
                "segments": [],
                "source_language": "ko",
                "target_language": "en",
            },
            headers=AUTH_HEADER,
        )

    assert response.status_code == 422
    assert "empty" in response.json()["detail"].lower()


def test_translate_rejects_invalid_language(client, mock_firebase_auth):
    """Unsupported language code → 422."""
    with patch("app.deps.auth.db", MagicMock()):
        response = client.post(
            TRANSLATE_URL,
            json={
                "segments": SAMPLE_SEGMENTS,
                "source_language": "ko",
                "target_language": "fr",
            },
            headers=AUTH_HEADER,
        )

    assert response.status_code == 422
    assert "Unsupported" in response.json()["detail"]
