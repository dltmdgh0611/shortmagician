from datetime import datetime, timezone, date
from fastapi import APIRouter, Depends, HTTPException
from app.deps.auth import get_current_user
from app.firebase_init import db
from app.schemas import CreditResponse

router = APIRouter(prefix="/credits", tags=["credits"])

DAILY_LIMIT = 5  # same for all plans


def _get_credit_info(uid: str) -> dict:
    """Read user's credit fields from Firestore, auto-reset if new day."""
    if db is None:
        raise HTTPException(status_code=503, detail="데이터베이스를 사용할 수 없습니다")

    doc_ref = db.collection("users").document(uid)
    doc = doc_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")

    data = doc.to_dict()
    today_str = date.today().isoformat()  # "2026-03-02"
    plan = data.get("plan", "free")

    credits_reset_date = data.get("credits_reset_date", "")
    credits_used_today = data.get("credits_used_today", 0)

    # Auto-reset on new day
    if credits_reset_date != today_str:
        credits_used_today = 0
        doc_ref.update({
            "credits_used_today": 0,
            "credits_reset_date": today_str,
            "updated_at": datetime.now(timezone.utc),
        })

    remaining = max(0, DAILY_LIMIT - credits_used_today)
    return {
        "daily_limit": DAILY_LIMIT,
        "used_today": credits_used_today,
        "remaining": remaining,
        "reset_date": today_str,
        "plan": plan,
    }


@router.get("/", response_model=CreditResponse)
def get_credits(
    current_user: dict = Depends(get_current_user),
) -> CreditResponse:
    """Get current user's daily credit usage."""
    info = _get_credit_info(current_user["uid"])
    return CreditResponse(**info)


@router.post("/deduct", response_model=CreditResponse)
def deduct_credit(
    current_user: dict = Depends(get_current_user),
) -> CreditResponse:
    """Deduct one credit. Returns 403 if no credits remaining."""
    if db is None:
        raise HTTPException(status_code=503, detail="데이터베이스를 사용할 수 없습니다")

    uid = current_user["uid"]
    info = _get_credit_info(uid)

    if info["remaining"] <= 0:
        raise HTTPException(
            status_code=403,
            detail="오늘의 크레딧을 모두 사용했습니다. 내일 다시 시도해주세요.",
        )

    # Increment used count
    new_used = info["used_today"] + 1
    db.collection("users").document(uid).update({
        "credits_used_today": new_used,
        "updated_at": datetime.now(timezone.utc),
    })

    return CreditResponse(
        daily_limit=info["daily_limit"],
        used_today=new_used,
        remaining=info["daily_limit"] - new_used,
        reset_date=info["reset_date"],
        plan=info["plan"],
    )


@router.post("/reset", response_model=CreditResponse)
def reset_credits(
    current_user: dict = Depends(get_current_user),
) -> CreditResponse:
    """Reset credits for testing. Sets used_today back to 0."""
    if db is None:
        raise HTTPException(status_code=503, detail="데이터베이스를 사용할 수 없습니다")

    uid = current_user["uid"]
    today_str = date.today().isoformat()
    
    db.collection("users").document(uid).update({
        "credits_used_today": 0,
        "credits_reset_date": today_str,
        "updated_at": datetime.now(timezone.utc),
    })

    return CreditResponse(
        daily_limit=DAILY_LIMIT,
        used_today=0,
        remaining=DAILY_LIMIT,
        reset_date=today_str,
        plan=current_user.get("plan", "free"),
    )
