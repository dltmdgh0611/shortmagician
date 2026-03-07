"""YouTube OAuth2 connection router.

Flow (Tauri desktop app):
1. Frontend calls GET /youtube/auth-url (authenticated) → gets Google OAuth URL
2. Frontend opens URL in system browser → user authorizes
3. Google redirects to GET /youtube/callback?code=...&state=...
4. Backend exchanges code for tokens, fetches YouTube channel info, stores in Firestore
5. Returns HTML "연동 완료" page → user closes browser tab
6. Frontend polls GET /youtube/connections to detect new connection
"""

import asyncio
import json

import secrets
import time
import pathlib
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from googleapiclient.errors import HttpError
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse

from app.config import GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
from app.deps.auth import get_current_user
from app.services.openai_client import client as openai_client
from app.firebase_init import db
from app.schemas import (
    YouTubeAuthUrlResponse,
    YouTubeChannelResponse,
    YouTubeConnectionsResponse,
)
from app.schemas.youtube_schemas import YouTubeMetadataRequest, YouTubeMetadataResponse, YouTubeUploadRequest, YouTubeUploadResponse

router = APIRouter(prefix="/youtube", tags=["youtube"])

# ── In-memory OAuth state store ──────────────────────────────────────────────
# Maps state token → { uid, created_at }
# Fine for single-user desktop app; for production use Redis/Firestore.
_oauth_states: dict[str, dict] = {}

_STATE_EXPIRY_SECONDS = 600  # 10 minutes

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
YOUTUBE_CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"

SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
]


def _cleanup_expired_states() -> None:
    """Remove expired OAuth states."""
    now = time.time()
    expired = [k for k, v in _oauth_states.items() if now - v["created_at"] > _STATE_EXPIRY_SECONDS]
    for k in expired:
        del _oauth_states[k]


def _format_subscriber_count(count_str: str) -> str:
    """Format subscriber count for display (e.g. 12345 → '1.2만')."""
    try:
        count = int(count_str)
    except (ValueError, TypeError):
        return count_str

    if count >= 10000:
        v = count / 10000
        return f"{v:.1f}만" if v != int(v) else f"{int(v)}만"
    if count >= 1000:
        v = count / 1000
        return f"{v:.1f}천" if v != int(v) else f"{int(v)}천"
    return str(count)

async def _refresh_channel_token(uid: str, channel_id: str) -> str:
    """Refresh YouTube channel access token if expired.
    
    Args:
        uid: User ID
        channel_id: YouTube channel ID
    
    Returns:
        Fresh access_token
    
    Raises:
        HTTPException: If token refresh fails
    """
    if db is None:
        raise HTTPException(status_code=503, detail="데이터베이스를 사용할 수 없습니다")
    
    # Get channel doc from Firestore
    doc_ref = db.collection("users").document(uid).collection("youtube_channels").document(channel_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="연결된 채널을 찾을 수 없습니다")
    
    data = doc.to_dict()
    access_token = data.get("access_token", "")
    refresh_token = data.get("refresh_token", "")
    token_expiry = data.get("token_expiry")  # Unix timestamp or Firestore timestamp
    
    # Convert token_expiry to datetime if it's a Firestore timestamp
    if hasattr(token_expiry, "timestamp"):
        expiry_dt = datetime.fromtimestamp(token_expiry.timestamp(), tz=timezone.utc)
    elif isinstance(token_expiry, (int, float)):
        expiry_dt = datetime.fromtimestamp(token_expiry, tz=timezone.utc)
    else:
        expiry_dt = datetime.now(timezone.utc)
    
    # Check if token is still valid (with 5 minute buffer)
    now = datetime.now(timezone.utc)
    buffer = timedelta(minutes=5)
    if now < (expiry_dt - buffer):
        # Token still valid
        return access_token
    
    # Token expired, refresh it
    if not refresh_token:
        raise HTTPException(
            status_code=401,
            detail="YouTube 채널 인증이 만료되었습니다. 설정에서 채널을 다시 연결해주세요."
        )
    
    try:
        token_response = httpx.post(
            GOOGLE_TOKEN_URL,
            data={
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
            timeout=15.0,
        )
        token_response.raise_for_status()
        tokens = token_response.json()
    except httpx.HTTPStatusError as e:
        error_data = e.response.json() if e.response.headers.get("content-type") == "application/json" else {}
        if error_data.get("error") == "invalid_grant":
            raise HTTPException(
                status_code=401,
                detail="YouTube 채널 인증이 만료되었습니다. 설정에서 채널을 다시 연결해주세요."
            )
        raise HTTPException(status_code=500, detail="토큰 갱신 중 오류가 발생했습니다.")
    except Exception:
        raise HTTPException(status_code=500, detail="토큰 갱신 중 오류가 발생했습니다.")
    
    new_access_token = tokens.get("access_token")
    expires_in = tokens.get("expires_in", 3600)
    
    if not new_access_token:
        raise HTTPException(status_code=500, detail="토큰 갱신 중 오류가 발생했습니다.")
    
    # Update Firestore with new token and expiry
    now = datetime.now(timezone.utc)
    doc_ref.update({
        "access_token": new_access_token,
        "token_expiry": now.timestamp() + expires_in,
        "updated_at": now,
    })
    
    return new_access_token

# ── Endpoints ────────────────────────────────────────────────────────────────


@router.get("/auth-url", response_model=YouTubeAuthUrlResponse)
def get_auth_url(current_user: dict = Depends(get_current_user)):
    """Generate Google OAuth2 authorization URL."""
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=503,
            detail="Google OAuth가 설정되지 않았습니다. GOOGLE_CLIENT_ID와 GOOGLE_CLIENT_SECRET을 설정해주세요.",
        )

    _cleanup_expired_states()

    state = secrets.token_urlsafe(32)
    _oauth_states[state] = {
        "uid": current_user["uid"],
        "created_at": time.time(),
    }

    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",  # get refresh_token
        "prompt": "consent",  # force consent to ensure refresh_token
        "state": state,
    }

    auth_url = f"{GOOGLE_AUTH_URL}?{urlencode(params)}"
    return YouTubeAuthUrlResponse(auth_url=auth_url)


@router.get("/callback", response_class=HTMLResponse)
def oauth_callback(
    code: str = Query(...),
    state: str = Query(...),
):
    """Handle Google OAuth2 callback.

    This endpoint is called by Google after user authorization.
    No Firebase auth required — it's a browser redirect from Google.
    """
    if db is None:
        return HTMLResponse(_error_html("데이터베이스를 사용할 수 없습니다"), status_code=503)

    # Validate state
    _cleanup_expired_states()
    state_data = _oauth_states.pop(state, None)
    if state_data is None:
        return HTMLResponse(_error_html("인증 세션이 만료되었습니다. 다시 시도해주세요."), status_code=400)

    uid = state_data["uid"]

    # Exchange code for tokens
    try:
        token_response = httpx.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
            timeout=15.0,
        )
        token_response.raise_for_status()
        tokens = token_response.json()
    except Exception:
        return HTMLResponse(_error_html("Google 인증 토큰 교환에 실패했습니다."), status_code=502)

    access_token = tokens.get("access_token")
    refresh_token = tokens.get("refresh_token")
    expires_in = tokens.get("expires_in", 3600)

    if not access_token:
        return HTMLResponse(_error_html("액세스 토큰을 받지 못했습니다."), status_code=502)

    # Get Google user email
    google_email = ""
    try:
        userinfo_resp = httpx.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10.0,
        )
        if userinfo_resp.status_code == 200:
            google_email = userinfo_resp.json().get("email", "")
    except Exception:
        pass  # email is optional

    # Get YouTube channels
    try:
        yt_resp = httpx.get(
            YOUTUBE_CHANNELS_URL,
            params={"part": "snippet,statistics", "mine": "true"},
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10.0,
        )
        yt_resp.raise_for_status()
        yt_data = yt_resp.json()
    except Exception:
        return HTMLResponse(_error_html("YouTube 채널 정보를 가져오는데 실패했습니다."), status_code=502)

    items = yt_data.get("items", [])
    if not items:
        return HTMLResponse(_error_html("이 Google 계정에 연결된 YouTube 채널이 없습니다."), status_code=404)

    # Store each channel in Firestore
    now = datetime.now(timezone.utc)
    channels_ref = db.collection("users").document(uid).collection("youtube_channels")
    stored_count = 0

    for item in items:
        channel_id = item.get("id", "")
        snippet = item.get("snippet", {})
        statistics = item.get("statistics", {})

        # Check if channel already connected
        existing = channels_ref.document(channel_id).get()
        if existing.exists:
            # Update tokens only
            channels_ref.document(channel_id).update({
                "access_token": access_token,
                "refresh_token": refresh_token or existing.to_dict().get("refresh_token", ""),
                "token_expiry": now.timestamp() + expires_in,
                "updated_at": now,
            })
        else:
            # Create new connection
            channels_ref.document(channel_id).set({
                "channel_id": channel_id,
                "channel_title": snippet.get("title", ""),
                "thumbnail_url": snippet.get("thumbnails", {}).get("default", {}).get("url", ""),
                "subscriber_count": _format_subscriber_count(statistics.get("subscriberCount", "0")),
                "google_email": google_email,
                "access_token": access_token,
                "refresh_token": refresh_token or "",
                "token_expiry": now.timestamp() + expires_in,
                "connected_at": now,
                "updated_at": now,
            })
        stored_count += 1

    return HTMLResponse(_success_html(stored_count))


@router.get("/connections", response_model=YouTubeConnectionsResponse)
def list_connections(current_user: dict = Depends(get_current_user)):
    """List all connected YouTube channels for the current user."""
    if db is None:
        raise HTTPException(status_code=503, detail="데이터베이스를 사용할 수 없습니다")

    uid = current_user["uid"]
    channels_ref = db.collection("users").document(uid).collection("youtube_channels")
    docs = channels_ref.stream()

    channels = []
    for doc in docs:
        data = doc.to_dict()
        channels.append(
            YouTubeChannelResponse(
                id=doc.id,
                channel_id=data.get("channel_id", ""),
                channel_title=data.get("channel_title", ""),
                thumbnail_url=data.get("thumbnail_url", ""),
                subscriber_count=data.get("subscriber_count", "0"),
                google_email=data.get("google_email", ""),
                connected_at=data.get("connected_at", datetime.now(timezone.utc)),
            )
        )
    return YouTubeConnectionsResponse(channels=channels)


@router.delete("/connections/{channel_id}", status_code=200)
def disconnect_channel(
    channel_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Disconnect a YouTube channel."""
    if db is None:
        raise HTTPException(status_code=503, detail="데이터베이스를 사용할 수 없습니다")

    uid = current_user["uid"]
    doc_ref = db.collection("users").document(uid).collection("youtube_channels").document(channel_id)
    doc = doc_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=404, detail="연결된 채널을 찾을 수 없습니다")

    doc_ref.delete()
    return {"message": "채널 연결이 해제되었습니다"}



@router.post("/generate-metadata", response_model=YouTubeMetadataResponse)
async def generate_metadata(
    body: YouTubeMetadataRequest,
    current_user: dict = Depends(get_current_user),
):
    """Generate YouTube Shorts metadata (title, description, hashtags) using GPT-4o."""
    language_map = {
        "ko": "Korean",
        "en": "English",
        "ja": "Japanese",
        "zh": "Chinese",
        "es": "Spanish",
    }
    language = language_map.get(body.language, body.language)
    subtitle_text = body.subtitle_text[:3000]

    system_prompt = (
        f"You are a YouTube Shorts metadata generator. Generate a catchy title, description, and hashtags based on the provided subtitle content.\n\n"
        f"Rules:\n"
        f"- Title: Must be in {language} language, maximum 100 characters, engaging and click-worthy for YouTube Shorts\n"
        f"- Description: Must be in {language} language, 2-3 sentences summarizing the content, include relevant context\n"
        f"- Hashtags: 5-8 hashtags in {language} language, each prefixed with #, relevant to the content\n\n"
        f'Respond in JSON format:\n{{"title": "...", "description": "...", "hashtags": ["#tag1", "#tag2", ...]}}'
    )

    def _call_openai_metadata():
        return openai_client.chat.completions.create(
            model="gpt-4o",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": subtitle_text},
            ],
        )

    try:
        if openai_client is None:
            return YouTubeMetadataResponse(title="", description="", hashtags=[])

        completion = await asyncio.to_thread(_call_openai_metadata)
        raw = completion.choices[0].message.content
        data = json.loads(raw)

        title = data.get("title", "")[:100]
        description = data.get("description", "")
        hashtags = data.get("hashtags", [])

        if len(hashtags) > 8:
            hashtags = hashtags[:8]

        return YouTubeMetadataResponse(title=title, description=description, hashtags=hashtags)
    except Exception:
        return YouTubeMetadataResponse(title="", description="", hashtags=[])


@router.post("/refresh-token/{channel_id}")
async def refresh_token(
    channel_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Manually refresh YouTube channel access token."""
    if db is None:
        raise HTTPException(status_code=503, detail="데이터베이스를 사용할 수 없습니다")
    
    uid = current_user["uid"]
    await _refresh_channel_token(uid, channel_id)
    return {"success": True, "message": "토큰이 갱신되었습니다."}


@router.post("/upload", response_model=YouTubeUploadResponse)
async def upload_video(
    body: YouTubeUploadRequest,
    current_user: dict = Depends(get_current_user),
):
    """Upload a local video file to YouTube using resumable upload."""
    # Validate file exists
    if not pathlib.Path(body.file_path).exists():
        raise HTTPException(status_code=400, detail=f"파일을 찾을 수 없습니다: {body.file_path}")

    uid = current_user["uid"]

    # Refresh token (raises 401 if auth expired)
    access_token = await _refresh_channel_token(uid, body.channel_id)

    # Build YouTube service
    credentials = Credentials(token=access_token)
    youtube = build('youtube', 'v3', credentials=credentials, cache_discovery=False)

    # Prepare upload request body
    request_body = {
        'snippet': {
            'title': body.title,
            'description': body.description,
            'tags': [],
            'categoryId': '22',
            'defaultLanguage': body.language,
        },
        'status': {
            'privacyStatus': 'public',
            'madeForKids': False,
            'selfDeclaredMadeForKids': False,
        }
    }
    media = MediaFileUpload(body.file_path, mimetype='video/mp4', resumable=True)
    insert_request = youtube.videos().insert(
        part='snippet,status',
        body=request_body,
        media_body=media,
    )

    try:
        response = await asyncio.to_thread(insert_request.execute)
    except HttpError as e:
        error_content = e.content.decode('utf-8') if isinstance(e.content, bytes) else str(e.content)
        if 'quotaExceeded' in error_content:
            raise HTTPException(status_code=429, detail="YouTube 일일 업로드 할당량이 초과되었습니다.")
        raise HTTPException(status_code=500, detail=f"YouTube 업로드 중 오류가 발생했습니다: {str(e)}")

    video_id = response['id']
    return YouTubeUploadResponse(
        video_id=video_id,
        video_url=f"https://youtu.be/{video_id}",
        status="uploaded",
    )


# ── HTML templates for OAuth callback ────────────────────────────────────────


def _success_html(channel_count: int) -> str:
    return f"""<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>YouTube 연동 완료</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex; align-items: center; justify-content: center;
            min-height: 100vh; margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }}
        .card {{
            background: white; border-radius: 24px; padding: 48px;
            text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.15);
            max-width: 400px;
        }}
        .icon {{ font-size: 48px; margin-bottom: 16px; }}
        h1 {{ font-size: 22px; color: #1a1a1a; margin: 0 0 8px; }}
        p {{ font-size: 14px; color: #6b7280; margin: 0 0 24px; line-height: 1.5; }}
        .close-btn {{
            display: inline-block; padding: 12px 32px;
            background: #3b82f6; color: white; border: none; border-radius: 12px;
            font-size: 14px; font-weight: 600; cursor: pointer;
            text-decoration: none;
        }}
        .close-btn:hover {{ background: #2563eb; }}
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">&#10004;&#65039;</div>
        <h1>YouTube 연동 완료!</h1>
        <p>{channel_count}개의 채널이 연결되었습니다.<br>이 창을 닫고 앱으로 돌아가주세요.</p>
        <button class="close-btn" onclick="window.close()">창 닫기</button>
    </div>
</body>
</html>"""


def _error_html(message: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>YouTube 연동 실패</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex; align-items: center; justify-content: center;
            min-height: 100vh; margin: 0;
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        }}
        .card {{
            background: white; border-radius: 24px; padding: 48px;
            text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.15);
            max-width: 400px;
        }}
        .icon {{ font-size: 48px; margin-bottom: 16px; }}
        h1 {{ font-size: 22px; color: #1a1a1a; margin: 0 0 8px; }}
        p {{ font-size: 14px; color: #6b7280; margin: 0 0 24px; line-height: 1.5; }}
        .close-btn {{
            display: inline-block; padding: 12px 32px;
            background: #6b7280; color: white; border: none; border-radius: 12px;
            font-size: 14px; font-weight: 600; cursor: pointer;
        }}
        .close-btn:hover {{ background: #4b5563; }}
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">&#9888;&#65039;</div>
        <h1>연동 실패</h1>
        <p>{message}</p>
        <button class="close-btn" onclick="window.close()">창 닫기</button>
    </div>
</body>
</html>"""
