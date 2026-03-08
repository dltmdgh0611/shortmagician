"""
PyInstaller entry point for the ShortMagician FastAPI backend.

When bundled with PyInstaller, this script:
1. Loads encrypted secrets from _secrets.py (no .env or key files on disk)
2. Starts the uvicorn server

In development (non-frozen), the normal .env file is used as before.
"""
import sys
import os

# ── PyInstaller frozen environment setup ──────────────────────────────────────
# Must run BEFORE any app imports (config.py calls load_dotenv at import time)
if getattr(sys, "frozen", False):
    _exe_dir = os.path.dirname(os.path.abspath(sys.executable))
    os.chdir(_exe_dir)

    # Load encrypted secrets into environment variables (replaces .env file)
    try:
        from app._secrets import load_env
        load_env()
    except ImportError:
        # Fallback: try .env file if _secrets.py is not embedded
        pass

# ── App imports (triggers config.py → load_dotenv) ───────────────────────────
import uvicorn  # noqa: E402
from app.main import app  # noqa: E402
from app.config import HOST, PORT  # noqa: E402


def main() -> None:
    uvicorn.run(app, host=HOST, port=int(PORT), log_level="info")


if __name__ == "__main__":
    main()
