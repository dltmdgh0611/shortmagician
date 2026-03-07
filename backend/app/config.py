import os
from dotenv import load_dotenv

load_dotenv(override=True)

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID")

# Google OAuth2 (for YouTube API)
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv(
    "GOOGLE_REDIRECT_URI",
    f"http://localhost:{PORT}/api/v1/youtube/callback",
)

# Instagram authentication (required for Instagram link parsing)
# Get sessionid: Instagram 웹 > F12 DevTools > Application > Cookies > sessionid 값 복사
INSTAGRAM_SESSION_ID = os.getenv("INSTAGRAM_SESSION_ID", "")

# OpenAI API (Whisper STT + GPT Translation)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

# Google Cloud (TTS) - uses same service account as Firebase
GOOGLE_CLOUD_PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT", os.getenv("FIREBASE_PROJECT_ID", ""))
