from openai import OpenAI, Timeout

from app.config import OPENAI_API_KEY

client: OpenAI | None = None

if OPENAI_API_KEY:
    client = OpenAI(
        api_key=OPENAI_API_KEY,
        timeout=Timeout(60.0, connect=10.0),  # 60s total, 10s connect
    )


def get_openai_client() -> OpenAI:
    """Return the shared OpenAI client instance (for Whisper etc)."""
    if client is None:
        raise RuntimeError("OpenAI API key not configured")
    return client
