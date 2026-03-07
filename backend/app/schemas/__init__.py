# Import pipeline schemas
from app.schemas.pipeline import (
    TranscribeRequest,
    TranscribeSegment,
    TranscribeResponse,
    TranslateRequest,
    TranslatedSegment,
    TranslateResponse,
    SynthesizeRequest,
    VoiceOption,
    VoiceListResponse,
)

# Import user schemas from the old module
from app.schemas_user import (
    UserCreate,
    UserResponse,
    UserProfile,
    UserUpdateRequest,
    YouTubeAuthUrlResponse,
    YouTubeChannelResponse,
    YouTubeConnectionsResponse,
    EarlybirdRedeemRequest,
    EarlybirdRedeemResponse,
    VideoParseRequest,
    VideoInfoResponse,
    CreditResponse,
)

__all__ = [
    # Pipeline schemas
    "TranscribeRequest",
    "TranscribeSegment",
    "TranscribeResponse",
    "TranslateRequest",
    "TranslatedSegment",
    "TranslateResponse",
    "SynthesizeRequest",
    "VoiceOption",
    "VoiceListResponse",
    # User schemas
    "UserCreate",
    "UserResponse",
    "UserProfile",
    "UserUpdateRequest",
    "YouTubeAuthUrlResponse",
    "YouTubeChannelResponse",
    "YouTubeConnectionsResponse",
    "EarlybirdRedeemRequest",
    "EarlybirdRedeemResponse",
    "VideoParseRequest",
    "VideoInfoResponse",
    "CreditResponse",
]