import firebase_admin.auth
from fastapi import Header, HTTPException, Depends, Request
from app.firebase_init import db


def verify_firebase_token(authorization: str = Header(...)) -> dict:
    """Verify Firebase ID token from Authorization header."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="유효하지 않은 인증 형식입니다")

    token = authorization.removeprefix("Bearer ")

    # Check if Firebase Admin is initialized
    if db is None:
        raise HTTPException(status_code=503, detail="인증 서비스를 사용할 수 없습니다")

    try:
        decoded = firebase_admin.auth.verify_id_token(token)
        return decoded
    except Exception:
        raise HTTPException(status_code=401, detail="유효하지 않은 인증 토큰입니다")


def get_current_user(request: Request, token_data: dict = Depends(verify_firebase_token)) -> dict:
    """Extract user info from verified token and expose uid on request state."""
    user = {
        "uid": token_data.get("uid"),
        "email": token_data.get("email", ""),
    }
    # Expose uid on request.state so UsageTrackingMiddleware can read it
    request.state.uid = user["uid"]
    return user
