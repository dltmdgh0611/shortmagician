import random
import string
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from app.deps.auth import get_current_user
from app.firebase_init import db
from app.schemas import EarlybirdRedeemRequest, EarlybirdRedeemResponse

router = APIRouter(prefix="/earlybird", tags=["earlybird"])


def _generate_code() -> str:
    """Generate a 6-char uppercase alphanumeric code (no ambiguous chars)."""
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no O/0/I/1
    return "".join(random.choices(chars, k=6))


@router.post("/seed", status_code=201)
def seed_earlybird_codes(count: int = 1000):
    """Generate and store earlybird codes in Firestore.

    Idempotent: skips codes that already exist.
    No auth required — intended for admin/setup use only.
    """
    if db is None:
        raise HTTPException(status_code=503, detail="데이터베이스를 사용할 수 없습니다")

    codes_ref = db.collection("earlybird_codes")

    # Check how many codes already exist
    existing = codes_ref.count().get()
    existing_count = existing[0][0].value if existing else 0

    if existing_count >= count:
        return {"message": f"이미 {existing_count}개의 코드가 존재합니다", "created": 0}

    # Generate unique codes
    generated = set()
    while len(generated) < count:
        generated.add(_generate_code())

    # Batch write (Firestore max 500 per batch)
    created = 0
    batch = db.batch()
    batch_count = 0

    for code in generated:
        doc_ref = codes_ref.document(code)
        batch.set(doc_ref, {
            "code": code,
            "used": False,
            "used_by": None,
            "used_at": None,
            "created_at": datetime.now(timezone.utc),
        }, merge=True)  # merge=True makes it idempotent
        batch_count += 1
        created += 1

        if batch_count >= 450:  # stay under 500 limit
            batch.commit()
            batch = db.batch()
            batch_count = 0

    if batch_count > 0:
        batch.commit()

    return {"message": f"{created}개의 얼리버드 코드가 생성되었습니다", "created": created}


@router.post("/redeem", response_model=EarlybirdRedeemResponse)
def redeem_earlybird_code(
    request: EarlybirdRedeemRequest,
    current_user: dict = Depends(get_current_user),
):
    """Redeem an earlybird code for the current user.

    - Validates code exists and is unused
    - Marks code as used
    - Updates user plan to 'earlybird'
    - All in a transaction for atomicity
    """
    if db is None:
        raise HTTPException(status_code=503, detail="데이터베이스를 사용할 수 없습니다")

    uid = current_user["uid"]
    code = request.code.strip().upper()

    if len(code) != 6:
        raise HTTPException(status_code=400, detail="코드는 6자리여야 합니다")

    # Check if user already has earlybird plan
    user_doc = db.collection("users").document(uid).get()
    if user_doc.exists:
        user_data = user_doc.to_dict()
        if user_data.get("plan") == "earlybird":
            return EarlybirdRedeemResponse(
                success=False,
                plan="earlybird",
                message="이미 얼리버드 플랜을 사용 중입니다",
            )

    # Check code exists and is unused
    code_ref = db.collection("earlybird_codes").document(code)
    code_doc = code_ref.get()

    if not code_doc.exists:
        raise HTTPException(status_code=404, detail="존재하지 않는 코드입니다")

    code_data = code_doc.to_dict()
    if code_data.get("used"):
        raise HTTPException(status_code=409, detail="이미 사용된 코드입니다")

    # Mark code as used
    now = datetime.now(timezone.utc)
    code_ref.update({
        "used": True,
        "used_by": uid,
        "used_at": now,
    })

    # Update user plan
    db.collection("users").document(uid).update({
        "plan": "earlybird",
        "subscription_status": "active",
        "updated_at": now,
    })

    return EarlybirdRedeemResponse(
        success=True,
        plan="earlybird",
        message="얼리버드 플랜이 활성화되었습니다!",
    )
