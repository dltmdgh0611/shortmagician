from datetime import datetime, timezone
from app.firebase_init import db


async def log_usage(
    uid: str,
    service: str,
    units: int,
    unit_type: str = "characters",
) -> None:
    """Log API usage to Firestore usage_logs collection."""
    if db is None:
        return  # Skip logging if Firestore unavailable

    try:
        db.collection("usage_logs").add({
            "uid": uid,
            "service": service,
            "units": units,
            "unit_type": unit_type,
            "timestamp": datetime.now(timezone.utc),
        })
    except Exception:
        pass  # Don't fail pipeline on logging errors
