"""End-to-end pipeline test using FastAPI TestClient.

Bypasses Firebase auth and tests: transcribe → translate → TTS
Uses test.mp4 from project root.
"""
import os
import sys
import json
import subprocess
import tempfile

# Ensure backend is importable
sys.path.insert(0, os.path.dirname(__file__))

from fastapi.testclient import TestClient
from app.main import app
from app.deps.auth import get_current_user

# ── Override auth dependency ─────────────────────────────────────────────────
FAKE_USER = {"uid": "test-user-001", "email": "test@test.com"}

def fake_current_user():
    return FAKE_USER

app.dependency_overrides[get_current_user] = fake_current_user

client = TestClient(app)

# ── Paths ────────────────────────────────────────────────────────────────────
PROJECT_ROOT = os.path.dirname(os.path.dirname(__file__))
TEST_VIDEO = os.path.join(PROJECT_ROOT, "test.mp4")


def extract_audio_ffmpeg(video_path: str) -> str:
    """Extract audio from video using ffmpeg (same as frontend audioExtractor)."""
    out_path = os.path.join(tempfile.gettempdir(), "test_pipeline_audio.mp3")
    cmd = [
        r"D:\shortmagician\shortmagician-master\ffmpeg-temp\ffmpeg-8.0.1-essentials_build\bin\ffmpeg.exe",
        "-y", "-i", video_path,
        "-vn", "-c:a", "libmp3lame", "-ar", "16000", "-ac", "1",
        out_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  [WARN] ffmpeg stderr: {result.stderr[:500]}")
    assert result.returncode == 0, f"ffmpeg failed: {result.stderr}"
    assert os.path.getsize(out_path) > 0
    return out_path


def test_health():
    print("\n=== Step 0: Health Check ===")
    r = client.get("/health")
    print(f"  Status: {r.status_code}, Body: {r.json()}")
    assert r.status_code == 200


def test_transcribe(audio_path: str) -> dict:
    print("\n=== Step 1: Transcribe (Whisper) ===")
    with open(audio_path, "rb") as f:
        r = client.post(
            "/api/v1/pipeline/transcribe",
            files={"file": ("audio.mp3", f, "audio/mpeg")},
        )
    print(f"  Status: {r.status_code}")
    if r.status_code != 200:
        print(f"  Error: {r.text[:500]}")
        raise AssertionError(f"Transcribe failed: {r.status_code}")

    data = r.json()
    segments = data["segments"]
    lang = data["detected_language"]
    print(f"  Detected language: {lang}")
    print(f"  Segments: {len(segments)}")
    for seg in segments[:5]:
        print(f"    [{seg['start_time']:.1f}s-{seg['end_time']:.1f}s] {seg['text'][:60]}")
    if len(segments) > 5:
        print(f"    ... and {len(segments) - 5} more")
    return data


def test_translate(segments: list, source_lang: str, target_lang: str) -> dict:
    print(f"\n=== Step 2: Translate ({source_lang} → {target_lang}) ===")
    r = client.post(
        "/api/v1/pipeline/translate",
        json={
            "segments": segments,
            "source_language": source_lang,
            "target_language": target_lang,
        },
    )
    print(f"  Status: {r.status_code}")
    if r.status_code != 200:
        print(f"  Error: {r.text[:500]}")
        raise AssertionError(f"Translate failed: {r.status_code}")

    data = r.json()
    translated = data["segments"]
    print(f"  Translated segments: {len(translated)}")
    for seg in translated[:5]:
        print(f"    {seg['original_text'][:30]} → {seg['translated_text'][:30]}")
    if len(translated) > 5:
        print(f"    ... and {len(translated) - 5} more")
    return data


def test_voices(language: str) -> dict:
    print(f"\n=== Step 3a: List Voices ({language}) ===")
    r = client.get(f"/api/v1/pipeline/voices?language={language}")
    print(f"  Status: {r.status_code}")
    if r.status_code != 200:
        print(f"  Error: {r.text[:500]}")
        raise AssertionError(f"Voices failed: {r.status_code}")

    data = r.json()
    voices = data["voices"]
    print(f"  Available voices: {len(voices)}")
    for v in voices[:3]:
        print(f"    {v['voice_id']} ({v['gender']})")
    return data


def test_tts(text: str, voice_id: str, language: str) -> bytes:
    print(f"\n=== Step 3b: TTS Synthesize ===")
    print(f"  Text: {text[:60]}")
    print(f"  Voice: {voice_id}")
    print(f"  Language: {language}")
    r = client.post(
        "/api/v1/pipeline/synthesize",
        json={
            "text": text,
            "voice_id": voice_id,
            "language": language,
            "speed": 1.0,
        },
    )
    print(f"  Status: {r.status_code}")
    if r.status_code != 200:
        print(f"  Error: {r.text[:500]}")
        raise AssertionError(f"TTS failed: {r.status_code}")

    audio_bytes = r.content
    print(f"  Audio size: {len(audio_bytes)} bytes")
    assert len(audio_bytes) > 100, "Audio too small — likely empty"

    # Save to temp for verification
    out = os.path.join(tempfile.gettempdir(), "test_tts_output.mp3")
    with open(out, "wb") as f:
        f.write(audio_bytes)
    print(f"  Saved to: {out}")
    return audio_bytes


def run_full_pipeline():
    """Run all steps sequentially, mimicking the frontend pipeline."""
    print("=" * 60)
    print("  FULL PIPELINE E2E TEST")
    print("=" * 60)

    # 0. Health
    test_health()

    # 1. Extract audio
    print("\n=== Step 0.5: Extract Audio (ffmpeg) ===")
    assert os.path.exists(TEST_VIDEO), f"test.mp4 not found at {TEST_VIDEO}"
    print(f"  Video: {TEST_VIDEO} ({os.path.getsize(TEST_VIDEO)} bytes)")
    audio_path = extract_audio_ffmpeg(TEST_VIDEO)
    print(f"  Audio: {audio_path} ({os.path.getsize(audio_path)} bytes)")

    # 2. Transcribe
    transcribe_data = test_transcribe(audio_path)
    segments = transcribe_data["segments"]
    detected_lang = transcribe_data["detected_language"]

    if not segments:
        print("\n  [SKIP] No segments detected — cannot continue")
        return

    # Determine target language (if source is Korean, target English; otherwise target Korean)
    target_lang = "en" if detected_lang == "ko" else "ko"
    print(f"\n  Source: {detected_lang} → Target: {target_lang}")

    # 3. Translate
    translate_data = test_translate(segments, detected_lang, target_lang)
    translated_segments = translate_data["segments"]

    # 4. List voices
    voices_data = test_voices(target_lang)
    default_voice = voices_data["voices"][0]

    # 5. TTS — test first segment only first, then do all
    first_seg = translated_segments[0]
    test_tts(first_seg["translated_text"], default_voice["voice_id"], target_lang)

    # 6. TTS all segments (batched, concurrency=2)
    print(f"\n=== Step 4: TTS All Segments ({len(translated_segments)}) ===")
    success_count = 0
    fail_count = 0
    for i, seg in enumerate(translated_segments):
        try:
            r = client.post(
                "/api/v1/pipeline/synthesize",
                json={
                    "text": seg["translated_text"],
                    "voice_id": default_voice["voice_id"],
                    "language": target_lang,
                    "speed": 1.0,
                },
            )
            if r.status_code == 200 and len(r.content) > 100:
                success_count += 1
                print(f"  [OK] TTS #{i}: {len(r.content)} bytes -- {seg['translated_text'][:40]}")
            else:
                fail_count += 1
                print(f"  [FAIL] TTS #{i}: status={r.status_code}, body={r.text[:200]}")
        except Exception as e:
            fail_count += 1
            print(f"  [FAIL] TTS #{i}: {type(e).__name__}: {e}")

    print(f"\n  Results: {success_count} OK, {fail_count} FAILED out of {len(translated_segments)}")

    print("\n" + "=" * 60)
    if fail_count == 0:
        print("  [PASS] FULL PIPELINE E2E: ALL STEPS PASSED")
    else:
        print(f"  [WARN] FULL PIPELINE E2E: {fail_count} TTS FAILURES")
    print("=" * 60)


if __name__ == "__main__":
    run_full_pipeline()
