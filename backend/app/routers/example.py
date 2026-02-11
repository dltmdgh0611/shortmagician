from fastapi import APIRouter

router = APIRouter(tags=["example"])


@router.get("/hello")
def hello() -> dict:
    return {"message": "Hello from FastAPI"}
