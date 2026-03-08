from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from app.deps.auth import get_current_user
from app.firebase_init import db
from app.schemas import UserCreate, UserResponse, UserUpdateRequest

router = APIRouter(prefix="/users", tags=["users"])


@router.post("/", response_model=UserResponse)
def create_or_get_user(
    user_data: UserCreate,
    current_user: dict = Depends(get_current_user),
) -> UserResponse:
    """Create or get user profile (idempotent)."""
    if db is None:
        raise HTTPException(status_code=503, detail="데이터베이스를 사용할 수 없습니다")

    uid = current_user["uid"]
    doc_ref = db.collection("users").document(uid)
    doc = doc_ref.get()

    if doc.exists:
        # Return existing profile
        data = doc.to_dict()
        return UserResponse(
            uid=uid,
            email=data.get("email", user_data.email),
            display_name=data.get("display_name", user_data.display_name),
            created_at=data.get("created_at", datetime.now(timezone.utc)),
            updated_at=data.get("updated_at", datetime.now(timezone.utc)),
            plan=data.get("plan", "free"),
            subscription_status=data.get("subscription_status", "none"),
            quota=data.get("quota", {}),
        )

    # Create new profile
    now = datetime.now(timezone.utc)
    profile = {
        "uid": uid,
        "email": user_data.email,
        "display_name": user_data.display_name,
        "created_at": now,
        "updated_at": now,
        "plan": "free",
        "subscription_status": "none",
        "quota": {},
    }
    doc_ref.set(profile)

    return UserResponse(
        uid=uid,
        email=user_data.email,
        display_name=user_data.display_name,
        created_at=now,
        updated_at=now,
    )


@router.get("/me", response_model=UserResponse)
def get_my_profile(
    current_user: dict = Depends(get_current_user),
) -> UserResponse:
    """Get current user's profile."""
    if db is None:
        raise HTTPException(status_code=503, detail="데이터베이스를 사용할 수 없습니다")

    uid = current_user["uid"]
    doc = db.collection("users").document(uid).get()

    if not doc.exists:
        raise HTTPException(status_code=404, detail="사용자 프로필을 찾을 수 없습니다")

    data = doc.to_dict()
    return UserResponse(
        uid=uid,
        email=data.get("email", ""),
        display_name=data.get("display_name", ""),
        created_at=data.get("created_at", datetime.now(timezone.utc)),
        updated_at=data.get("updated_at", datetime.now(timezone.utc)),
        plan=data.get("plan", "free"),
        subscription_status=data.get("subscription_status", "none"),
        quota=data.get("quota", {}),
    )


@router.patch("/me", response_model=UserResponse)
def update_my_profile(
    update_data: UserUpdateRequest,
    current_user: dict = Depends(get_current_user),
) -> UserResponse:
    """Update current user's profile (display_name, notification_enabled)."""
    if db is None:
        raise HTTPException(status_code=503, detail="데이터베이스를 사용할 수 없습니다")

    uid = current_user["uid"]
    doc_ref = db.collection("users").document(uid)
    doc = doc_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=404, detail="사용자 프로필을 찾을 수 없습니다")

    # Build update dict from non-None fields only
    updates: dict = {"updated_at": datetime.now(timezone.utc)}
    if update_data.display_name is not None:
        updates["display_name"] = update_data.display_name
    doc_ref.update(updates)

    # Return updated profile
    data = doc_ref.get().to_dict()
    return UserResponse(
        uid=uid,
        email=data.get("email", ""),
        display_name=data.get("display_name", ""),
        created_at=data.get("created_at", datetime.now(timezone.utc)),
        updated_at=data.get("updated_at", datetime.now(timezone.utc)),
        plan=data.get("plan", "free"),
        subscription_status=data.get("subscription_status", "none"),
        quota=data.get("quota", {}),
    )
