from fastapi import APIRouter

from app.routers.pipeline.transcribe import router as transcribe_router
from app.routers.pipeline.translate import router as translate_router
from app.routers.pipeline.tts import router as tts_router
from app.routers.pipeline.split_segments import router as split_router
from app.routers.pipeline.realign import router as realign_router

router = APIRouter(prefix="/pipeline", tags=["pipeline"])

router.include_router(transcribe_router)
router.include_router(translate_router)
router.include_router(tts_router)
router.include_router(split_router)
router.include_router(realign_router)
