import logging

from app.config import HOST, PORT  # noqa: E402 — must be first to load .env

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.middleware.usage_tracking import UsageTrackingMiddleware
from app.middleware.error_handler import pipeline_error_handler
from app.routers import example, users, earlybird, youtube, pipeline, credits

# ── Logging setup ──────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s [%(name)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    force=True,  # Override any prior logging config
)
# Quiet noisy libraries
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("openai").setLevel(logging.WARNING)

logger = logging.getLogger(__name__)

# Log Firebase init status
from app.firebase_init import db as _fb_db  # noqa: E402
_fb_status = "OK (Firestore connected)" if _fb_db is not None else "FAILED (db is None)"
logger.info("Firebase init status: %s", _fb_status)

app = FastAPI(title="shortmagician API")


# ── Global exception handler for uncaught pipeline errors ──────────────────────
app.add_exception_handler(Exception, pipeline_error_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:1420",
        "tauri://localhost",
        "http://tauri.localhost",
        "https://tauri.localhost",
        "https://your-app.web.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(UsageTrackingMiddleware)

app.include_router(example.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(earlybird.router, prefix="/api/v1")
app.include_router(pipeline.router, prefix="/api/v1")
app.include_router(youtube.router, prefix="/api/v1")
app.include_router(credits.router, prefix="/api/v1")
# video router removed — video parsing now runs locally via Tauri sidecar (yt-dlp)


@app.get("/")
def root() -> dict:
    return {"status": "ok"}


@app.get("/health")
def health() -> dict:
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn

    logger.info("Starting server on %s:%s", HOST, PORT)
    uvicorn.run("app.main:app", host=HOST, port=PORT, reload=True)
