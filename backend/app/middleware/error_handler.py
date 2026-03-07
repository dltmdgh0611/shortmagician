import logging

from fastapi import Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

# Korean user-friendly error messages
ERROR_MESSAGES = {
    "openai_auth": "OpenAI API 인증에 실패했습니다. 관리자에게 문의하세요.",
    "openai_rate_limit": "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
    "openai_quota": "API 사용량 한도에 도달했습니다. 관리자에게 문의하세요.",
    "openai_server": "음성 인식 서비스에 일시적인 문제가 발생했습니다.",
    "google_auth": "Google Cloud 인증에 실패했습니다. 관리자에게 문의하세요.",
    "google_quota": "TTS 사용량 한도에 도달했습니다.",
    "google_server": "음성 합성 서비스에 일시적인 문제가 발생했습니다.",
    "unknown": "알 수 없는 오류가 발생했습니다. 다시 시도해주세요.",
}


def _get_error_key(exc: Exception) -> tuple[str, int]:
    """Classify an exception into (error_key, http_status_code)."""
    module = type(exc).__module__ or ""

    # ── OpenAI errors ────────────────────────────────────────────────────────────
    if "openai" in module:
        status = getattr(exc, "status_code", None)
        if status == 401:
            return "openai_auth", 401
        if status == 429:
            return "openai_rate_limit", 429
        if status == 402 or "Quota" in type(exc).__name__:
            return "openai_quota", 429
        return "openai_server", 502

    # ── Google Cloud errors ────────────────────────────────────────────────────────
    if "google" in module:
        # google.api_core.exceptions store the HTTP status code in .code
        code = getattr(exc, "code", None)
        if isinstance(code, int):
            if code in (401, 403):
                return "google_auth", 401
            if code == 429:
                return "google_quota", 429
        return "google_server", 502

    return "unknown", 500


async def pipeline_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Map pipeline exceptions to user-friendly Korean error responses.

    Logs the full error server-side for debugging, but returns a
    safe Korean message to the client (never leaks internals).
    """
    error_key, status_code = _get_error_key(exc)
    user_message = ERROR_MESSAGES[error_key]

    # Log the full error server-side
    logger.error(
        "Unhandled %s (key=%s, status=%d): %s",
        type(exc).__name__, error_key, status_code, exc,
        exc_info=True,
    )

    return JSONResponse(
        status_code=status_code,
        content={
            "detail": user_message,
            "error_key": error_key,
            "error_type": type(exc).__name__,
        },
    )
