"""Tests for TTS pipeline endpoints (synthesize + voices).

All Google Cloud TTS calls are mocked — no real API keys needed.
"""

from unittest.mock import MagicMock, patch


# ── Authentication tests ─────────────────────────────────────────────────────

def test_synthesize_requires_auth(client):
    """POST /synthesize without auth → 401 or 422."""
    response = client.post("/api/v1/pipeline/synthesize")
    assert response.status_code in (401, 422)


def test_voices_requires_auth(client):
    """GET /voices without auth → 401 or 422."""
    response = client.get("/api/v1/pipeline/voices")
    assert response.status_code in (401, 422)


# ── Helper ───────────────────────────────────────────────────────────────────

def _auth_headers():
    return {"Authorization": "Bearer valid_token"}


def _mock_db():
    """Return a MagicMock that satisfies the auth.db is not None check."""
    return MagicMock()


# ── POST /synthesize tests ───────────────────────────────────────────────────

def test_synthesize_returns_audio(client, mock_firebase_auth):
    """Valid request → 200 with audio/mpeg content."""
    fake_audio = b"\xff\xfb\x90\x00" * 100  # fake MP3 bytes

    mock_db = _mock_db()
    with patch("app.deps.auth.db", mock_db), \
         patch("app.routers.pipeline.tts.synthesize", return_value=fake_audio) as mock_synth:
        response = client.post(
            "/api/v1/pipeline/synthesize",
            json={
                "text": "안녕하세요",
                "voice_id": "ko-KR-Chirp3-HD-Koa",
                "language": "ko",
                "speed": 1.0,
            },
            headers=_auth_headers(),
        )

    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/mpeg"
    assert response.content == fake_audio
    mock_synth.assert_called_once_with(
        text="안녕하세요",
        voice_name="ko-KR-Chirp3-HD-Koa",
        language_code="ko-KR",
        speed=1.0,
    )


def test_synthesize_with_custom_speed(client, mock_firebase_auth):
    """Speed parameter is forwarded to synthesize()."""
    fake_audio = b"\xff\xfb\x90\x00"
    mock_db = _mock_db()

    with patch("app.deps.auth.db", mock_db), \
         patch("app.routers.pipeline.tts.synthesize", return_value=fake_audio) as mock_synth:
        response = client.post(
            "/api/v1/pipeline/synthesize",
            json={
                "text": "Hello world",
                "voice_id": "en-US-Chirp3-HD-Aria",
                "language": "en",
                "speed": 1.5,
            },
            headers=_auth_headers(),
        )

    assert response.status_code == 200
    mock_synth.assert_called_once_with(
        text="Hello world",
        voice_name="en-US-Chirp3-HD-Aria",
        language_code="en-US",
        speed=1.5,
    )


def test_synthesize_default_speed(client, mock_firebase_auth):
    """Omitting speed defaults to 1.0."""
    fake_audio = b"\xff\xfb\x90\x00"
    mock_db = _mock_db()

    with patch("app.deps.auth.db", mock_db), \
         patch("app.routers.pipeline.tts.synthesize", return_value=fake_audio) as mock_synth:
        response = client.post(
            "/api/v1/pipeline/synthesize",
            json={
                "text": "こんにちは",
                "voice_id": "ja-JP-Chirp3-HD-Aoi",
                "language": "ja",
            },
            headers=_auth_headers(),
        )

    assert response.status_code == 200
    mock_synth.assert_called_once_with(
        text="こんにちは",
        voice_name="ja-JP-Chirp3-HD-Aoi",
        language_code="ja-JP",
        speed=1.0,
    )


def test_synthesize_empty_text_returns_400(client, mock_firebase_auth):
    """Empty text → 400."""
    mock_db = _mock_db()

    with patch("app.deps.auth.db", mock_db):
        response = client.post(
            "/api/v1/pipeline/synthesize",
            json={
                "text": "   ",
                "voice_id": "ko-KR-Chirp3-HD-Koa",
                "language": "ko",
            },
            headers=_auth_headers(),
        )

    assert response.status_code == 400
    assert "비어" in response.json()["detail"]


def test_synthesize_text_too_long_returns_400(client, mock_firebase_auth):
    """Text exceeding MAX_TEXT_LENGTH → 400."""
    mock_db = _mock_db()

    with patch("app.deps.auth.db", mock_db):
        response = client.post(
            "/api/v1/pipeline/synthesize",
            json={
                "text": "가" * 5001,
                "voice_id": "ko-KR-Chirp3-HD-Koa",
                "language": "ko",
            },
            headers=_auth_headers(),
        )

    assert response.status_code == 400
    assert "5000" in response.json()["detail"]


def test_synthesize_unsupported_language_returns_400(client, mock_firebase_auth):
    """Unsupported language code → 400."""
    mock_db = _mock_db()

    with patch("app.deps.auth.db", mock_db):
        response = client.post(
            "/api/v1/pipeline/synthesize",
            json={
                "text": "Bonjour",
                "voice_id": "fr-FR-Chirp3-HD-Test",
                "language": "fr",
            },
            headers=_auth_headers(),
        )

    assert response.status_code == 400
    assert "지원하지 않는 언어" in response.json()["detail"]


def test_synthesize_tts_error_returns_500(client, mock_firebase_auth):
    """Google TTS failure → 500."""
    mock_db = _mock_db()

    with patch("app.deps.auth.db", mock_db), \
         patch("app.routers.pipeline.tts.synthesize", side_effect=Exception("API error")):
        response = client.post(
            "/api/v1/pipeline/synthesize",
            json={
                "text": "테스트",
                "voice_id": "ko-KR-Chirp3-HD-Koa",
                "language": "ko",
            },
            headers=_auth_headers(),
        )

    assert response.status_code == 500
    assert "TTS 합성" in response.json()["detail"]


# ── GET /voices tests ────────────────────────────────────────────────────────

def test_list_voices_all(client, mock_firebase_auth):
    """No language filter → 25 voices (5 per language × 5 languages)."""
    mock_db = _mock_db()

    with patch("app.deps.auth.db", mock_db):
        response = client.get(
            "/api/v1/pipeline/voices",
            headers=_auth_headers(),
        )

    assert response.status_code == 200
    data = response.json()
    assert "voices" in data
    assert len(data["voices"]) == 25


def test_list_voices_filter_korean(client, mock_firebase_auth):
    """?language=ko → 5 Korean voices only."""
    mock_db = _mock_db()

    with patch("app.deps.auth.db", mock_db):
        response = client.get(
            "/api/v1/pipeline/voices?language=ko",
            headers=_auth_headers(),
        )

    assert response.status_code == 200
    data = response.json()
    assert len(data["voices"]) == 5
    for voice in data["voices"]:
        assert voice["language"] == "ko"
        assert "Chirp3-HD" in voice["voice_id"]
        assert voice["voice_id"].startswith("ko-KR-")


def test_list_voices_filter_english(client, mock_firebase_auth):
    """?language=en → 5 English voices only."""
    mock_db = _mock_db()

    with patch("app.deps.auth.db", mock_db):
        response = client.get(
            "/api/v1/pipeline/voices?language=en",
            headers=_auth_headers(),
        )

    assert response.status_code == 200
    data = response.json()
    assert len(data["voices"]) == 5
    for voice in data["voices"]:
        assert voice["language"] == "en"
        assert voice["voice_id"].startswith("en-US-")


def test_list_voices_filter_unsupported_language(client, mock_firebase_auth):
    """?language=fr → 400."""
    mock_db = _mock_db()

    with patch("app.deps.auth.db", mock_db):
        response = client.get(
            "/api/v1/pipeline/voices?language=fr",
            headers=_auth_headers(),
        )

    assert response.status_code == 400
    assert "지원하지 않는 언어" in response.json()["detail"]


def test_list_voices_voice_id_format(client, mock_firebase_auth):
    """Voice IDs follow {bcp47}-Chirp3-HD-{Name} format."""
    mock_db = _mock_db()

    with patch("app.deps.auth.db", mock_db):
        response = client.get(
            "/api/v1/pipeline/voices",
            headers=_auth_headers(),
        )

    data = response.json()
    for voice in data["voices"]:
        parts = voice["voice_id"].split("-Chirp3-HD-")
        assert len(parts) == 2, f"Bad voice_id format: {voice['voice_id']}"
        assert parts[1] == voice["name"]


def test_list_voices_all_languages_present(client, mock_firebase_auth):
    """All 5 supported languages are present in unfiltered response."""
    mock_db = _mock_db()

    with patch("app.deps.auth.db", mock_db):
        response = client.get(
            "/api/v1/pipeline/voices",
            headers=_auth_headers(),
        )

    data = response.json()
    languages = {v["language"] for v in data["voices"]}
    assert languages == {"ko", "en", "ja", "zh", "es"}


def test_list_voices_gender_values(client, mock_firebase_auth):
    """Gender is always MALE or FEMALE."""
    mock_db = _mock_db()

    with patch("app.deps.auth.db", mock_db):
        response = client.get(
            "/api/v1/pipeline/voices",
            headers=_auth_headers(),
        )

    data = response.json()
    for voice in data["voices"]:
        assert voice["gender"] in ("MALE", "FEMALE")


# ── Language mapping tests ───────────────────────────────────────────────────

def test_synthesize_all_supported_languages(client, mock_firebase_auth):
    """All 5 languages map correctly."""
    fake_audio = b"\xff\xfb\x90\x00"
    mock_db = _mock_db()

    expected_mappings = {
        "ko": "ko-KR",
        "en": "en-US",
        "ja": "ja-JP",
        "zh": "cmn-CN",
        "es": "es-ES",
    }

    for lang, bcp47 in expected_mappings.items():
        with patch("app.deps.auth.db", mock_db), \
             patch("app.routers.pipeline.tts.synthesize", return_value=fake_audio) as mock_synth:
            response = client.post(
                "/api/v1/pipeline/synthesize",
                json={
                    "text": "test",
                    "voice_id": f"{bcp47}-Chirp3-HD-Test",
                    "language": lang,
                },
                headers=_auth_headers(),
            )

        assert response.status_code == 200, f"Failed for language: {lang}"
        mock_synth.assert_called_once_with(
            text="test",
            voice_name=f"{bcp47}-Chirp3-HD-Test",
            language_code=bcp47,
            speed=1.0,
        )
