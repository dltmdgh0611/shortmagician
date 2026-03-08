from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class UserCreate(BaseModel):
    """Schema for user creation request."""
    email: str
    display_name: str
    uid: str


class UserResponse(BaseModel):
    """Schema for user response."""
    uid: str
    email: str
    display_name: str
    created_at: datetime
    updated_at: datetime
    plan: str = "free"
    subscription_status: str = "none"
    quota: dict = {}


# Alias for UserResponse
UserProfile = UserResponse


class UserUpdateRequest(BaseModel):
    """Schema for updating user profile."""
    display_name: str | None = None


class YouTubeAuthUrlResponse(BaseModel):
    """Google OAuth URL for YouTube connection."""
    auth_url: str


class YouTubeChannelResponse(BaseModel):
    """A connected YouTube channel."""
    id: str
    channel_id: str
    channel_title: str
    thumbnail_url: str
    subscriber_count: str
    google_email: str
    connected_at: datetime

class YouTubeConnectionsResponse(BaseModel):
    """List of connected YouTube channels."""
    channels: list[YouTubeChannelResponse]


class EarlybirdRedeemRequest(BaseModel):
    """Schema for earlybird code redemption."""
    code: str


class EarlybirdRedeemResponse(BaseModel):
    """Schema for earlybird code redemption result."""
    success: bool
    plan: str
    message: str


# ── Video URL parsing ────────────────────────────────────────────────────────


class VideoParseRequest(BaseModel):
    """Request to parse a video URL."""
    url: str


class VideoInfoResponse(BaseModel):
    """Parsed video metadata response."""
    platform: str          # "youtube" | "instagram" | "tiktok"
    video_id: str
    title: str
    thumbnail_url: str
    duration: int          # seconds
    author: str
    author_url: str
    view_count: int | None = None
    like_count: int | None = None
    original_url: str
    embed_url: str | None = None
    video_url: str | None = None  # URL to stream the downloaded mp4 file


class CreditResponse(BaseModel):
    """Daily credit usage info."""
    daily_limit: int = 5
    used_today: int = 0
    remaining: int = 5
    reset_date: str  # YYYY-MM-DD format
    plan: str = "free"
