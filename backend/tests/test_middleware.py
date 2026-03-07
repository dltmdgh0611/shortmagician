"""Tests for usage-tracking middleware, error handler, and retry utility.

All tests are isolated — they use a minimal FastAPI test app rather than the
full app, so pipeline routes that raise NotImplementedError do not interfere.
"""
import json
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_pipeline_app():
    """Minimal FastAPI app that has UsageTrackingMiddleware and two routes:
    one under /api/v1/pipeline/* and one outside that prefix.
    """
    from app.middleware.usage_tracking import UsageTrackingMiddleware

    app = FastAPI()
    app.add_middleware(UsageTrackingMiddleware)

    @app.get("/api/v1/pipeline/test")
    async def pipeline_endpoint(request: Request):
        # Simulate what get_current_user does: expose uid on request.state
        request.state.uid = "test-uid-123"
        return {"ok": True}

    @app.get("/api/v1/other")
    async def other_endpoint():
        return {"ok": True}

    return app


def _has_korean(text: str) -> bool:
    """Return True if *text* contains at least one Hangul syllable character."""
    return any("\uAC00" <= ch <= "\uD7A3" for ch in text)


# ── Middleware: pipeline request is logged ────────────────────────────────────

def test_usage_middleware_logs_pipeline_requests():
    """Middleware creates a Firestore log entry for /api/v1/pipeline/* hits."""
    mock_db = MagicMock()

    with patch("app.middleware.usage_tracking.db", mock_db):
        app = _make_pipeline_app()
        with TestClient(app) as client:
            response = client.get("/api/v1/pipeline/test")

    assert response.status_code == 200

    # Verify collection("usage_logs").add(...) was called exactly once
    mock_db.collection.assert_called_once_with("usage_logs")
    mock_db.collection.return_value.add.assert_called_once()

    logged = mock_db.collection.return_value.add.call_args[0][0]
    assert logged["uid"] == "test-uid-123"
    assert logged["endpoint"] == "/api/v1/pipeline/test"
    assert logged["method"] == "GET"
    assert logged["status_code"] == 200
    assert "duration_ms" in logged
    assert "timestamp" in logged


# ── Middleware: non-pipeline request is NOT logged ────────────────────────────

def test_usage_middleware_skips_non_pipeline():
    """Middleware must NOT log requests outside /api/v1/pipeline/*."""
    mock_db = MagicMock()

    with patch("app.middleware.usage_tracking.db", mock_db):
        app = _make_pipeline_app()
        with TestClient(app) as client:
            response = client.get("/api/v1/other")

    assert response.status_code == 200
    # Firestore must never be touched
    mock_db.collection.assert_not_called()


# ── Retry: retries on 429 until success ──────────────────────────────────────

async def test_retry_on_rate_limit():
    """Retries up to max_retries times when 429-style error is raised."""
    from app.services.api_retry import with_retry

    call_count = 0

    class FakeRateLimitError(Exception):
        status_code = 429

    @with_retry(max_retries=2, base_delay=0.001)
    async def flaky():
        nonlocal call_count
        call_count += 1
        if call_count < 3:
            raise FakeRateLimitError("rate limited")
        return "success"

    result = await flaky()
    assert result == "success"
    assert call_count == 3  # 1 initial + 2 retries


# ── Retry: gives up after max_retries exhausted ───────────────────────────────

async def test_retry_max_attempts():
    """Raises the original exception once max_retries are exhausted."""
    from app.services.api_retry import with_retry

    call_count = 0

    class FakeRateLimitError(Exception):
        status_code = 429

    @with_retry(max_retries=2, base_delay=0.001)
    async def always_fails():
        nonlocal call_count
        call_count += 1
        raise FakeRateLimitError("still rate limited")

    with pytest.raises(FakeRateLimitError):
        await always_fails()

    assert call_count == 3  # 1 initial + 2 retries, then gives up


# ── Error messages: all must be Korean ───────────────────────────────────────

def test_error_messages_are_korean():
    """Every value in ERROR_MESSAGES must contain at least one Korean character."""
    from app.middleware.error_handler import ERROR_MESSAGES

    for key, message in ERROR_MESSAGES.items():
        assert _has_korean(message), (
            f"Message for '{key}' does not contain Korean characters: {message!r}"
        )


# ── Error handler: OpenAI exceptions → Korean JSON response ──────────────────

async def test_error_handler_maps_openai_errors():
    """OpenAI auth errors produce a 401 JSON response with a Korean detail."""
    from app.middleware.error_handler import pipeline_error_handler

    # Build a fake OpenAI authentication exception (module must contain "openai")
    class FakeOpenAIAuthError(Exception):
        status_code = 401

    FakeOpenAIAuthError.__module__ = "openai"

    mock_request = MagicMock()
    exc = FakeOpenAIAuthError("auth failed")

    response = await pipeline_error_handler(mock_request, exc)

    assert response.status_code == 401
    body = json.loads(response.body)
    detail = body["detail"]

    # Must be Korean and must not contain any stack trace or API key hints
    assert _has_korean(detail), f"Response detail is not Korean: {detail!r}"
    assert "Traceback" not in detail
    assert "sk-" not in detail  # no API key leak
