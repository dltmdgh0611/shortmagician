import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.firebase_init import db

try:
    from firebase_admin import firestore
except ImportError:
    firestore = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)


class UsageTrackingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not request.url.path.startswith("/api/v1/pipeline"):
            return await call_next(request)

        start_time = time.time()
        response = await call_next(request)
        duration = time.time() - start_time

        # Log non-2xx responses for debugging
        if response.status_code >= 400:
            logger.warning(
                "%s %s → %d (%.0fms)",
                request.method, request.url.path,
                response.status_code, duration * 1000,
            )

        # Extract user UID from request state (set by auth dependency)
        uid = getattr(request.state, "uid", None)

        # Log to Firestore (fire and forget, don't block response)
        if db is not None and uid:
            try:
                db.collection("usage_logs").add({
                    "uid": uid,
                    "endpoint": request.url.path,
                    "method": request.method,
                    "status_code": response.status_code,
                    "duration_ms": round(duration * 1000),
                    "timestamp": firestore.SERVER_TIMESTAMP if firestore else None,
                })
            except Exception:
                pass  # Never fail on logging

        return response
