"""Tests for the Firebase auth dependency (app/deps/auth.py).

Covers: missing header, malformed token, invalid token, valid token with no profile,
and successful profile creation via POST. All tests mock Firestore db since the
test environment has db=None (no Firebase credentials).
"""
from unittest.mock import MagicMock, patch


def test_get_me_no_auth_header(client):
    """Missing Authorization header → 422 (FastAPI validates required header)."""
    response = client.get("/api/v1/users/me")
    assert response.status_code == 422


def test_get_me_malformed_token(client):
    """Authorization header without 'Bearer ' prefix → 401.

    verify_firebase_token checks startswith('Bearer ') before db check,
    so no db mock needed here.
    """
    response = client.get(
        "/api/v1/users/me",
        headers={"Authorization": "InvalidTokenWithoutBearer"},
    )
    assert response.status_code == 401
    assert "인증 형식" in response.json()["detail"]


def test_get_me_invalid_token(client):
    """Bearer token that fails firebase verify_id_token → 401.

    db must be mocked non-None so the code reaches token verification.
    """
    mock_db = MagicMock()
    with patch("app.deps.auth.db", mock_db), patch(
        "firebase_admin.auth.verify_id_token",
        side_effect=Exception("token invalid"),
    ):
        response = client.get(
            "/api/v1/users/me",
            headers={"Authorization": "Bearer bad_token"},
        )
    assert response.status_code == 401
    assert "인증 토큰" in response.json()["detail"]


def test_get_me_valid_token_no_profile(client, mock_firebase_auth):
    """Valid token but no Firestore profile for this uid → 404.

    mock_firebase_auth fixture patches verify_id_token to return
    {"uid": "test-uid-123", "email": "test@test.com"}.
    Firestore doc.exists=False simulates missing profile.
    """
    mock_db = MagicMock()
    mock_doc = MagicMock()
    mock_doc.exists = False
    mock_db.collection.return_value.document.return_value.get.return_value = mock_doc

    with patch("app.deps.auth.db", mock_db), patch("app.routers.users.db", mock_db):
        response = client.get(
            "/api/v1/users/me",
            headers={"Authorization": "Bearer valid_token"},
        )

    assert response.status_code == 404
    assert "프로필" in response.json()["detail"]


def test_post_users_with_valid_token_creates_profile(client, mock_firebase_auth):
    """POST /api/v1/users/ with valid token and complete body → 200.

    Simulates first-time user creation (doc.exists=False → set profile).
    Verifies auth dependency passes end-to-end.
    """
    mock_db = MagicMock()
    mock_doc = MagicMock()
    mock_doc.exists = False
    mock_db.collection.return_value.document.return_value.get.return_value = mock_doc
    mock_db.collection.return_value.document.return_value.set.return_value = None

    with patch("app.deps.auth.db", mock_db), patch("app.routers.users.db", mock_db):
        response = client.post(
            "/api/v1/users/",
            json={
                "uid": "test-uid-123",
                "email": "test@test.com",
                "display_name": "Test User",
            },
            headers={"Authorization": "Bearer valid_token"},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["uid"] == "test-uid-123"
    assert data["email"] == "test@test.com"
    assert data["display_name"] == "Test User"
    assert data["plan"] == "free"
    assert data["subscription_status"] == "none"
