import asyncio
from functools import wraps


def with_retry(max_retries: int = 3, base_delay: float = 1.0):
    """Decorator for async API calls with exponential backoff on 429 errors.

    Args:
        max_retries: Maximum number of retry attempts (default 3).
        base_delay:  Initial delay in seconds; doubles each attempt.

    Usage::

        @with_retry(max_retries=3, base_delay=1.0)
        async def call_openai(...):
            ...
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            for attempt in range(max_retries + 1):
                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    if attempt == max_retries:
                        raise
                    if _is_rate_limit(e):
                        delay = base_delay * (2 ** attempt)
                        await asyncio.sleep(delay)
                    else:
                        raise
        return wrapper
    return decorator


def _is_rate_limit(exc: Exception) -> bool:
    """Return True if *exc* represents an HTTP 429 rate-limit error."""
    # OpenAI SDK: openai.RateLimitError has .status_code == 429
    if hasattr(exc, "status_code") and exc.status_code == 429:
        return True
    # google.api_core.exceptions: ResourceExhausted has .code == 429
    if hasattr(exc, "code") and exc.code == 429:
        return True
    return False
