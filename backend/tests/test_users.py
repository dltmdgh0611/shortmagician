"""Tests for the users router (app/routers/users.py).

Covers: UserResponse shape, idempotent create-or-get, GET /me after POST,
and Pydantic validation of required body fields.
All tests mock Firestore db since db=None in the test environment.
"""
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch


def _make_mock_db(doc_exists=False, existing_data=None):
    """Helper: build a MagicMock Firestore client for common scenarios."""
    mock_db = MagicMock()
    mock_doc = MagicMock()
    mock_doc.exists = doc_exists
    if existing_data is not None:
        mock_doc.to_dict.return_value = existing_data
    mock_db.collection.return_value.document.return_value.get.return_value = mock_doc
    mock_db.collection.return_value.document.return_value.set.return_value = None
    return mock_db


_VALID_PAYLOAD = {
    "uid": "test-uid-123",
    "email": "test@test.com",
    "display_name": "Test User",
}
_AUTH_HEADERS = {"Authorization": "Bearer valid_token"}


def test_post_users_returns_user_response_shape(client, mock_firebase_auth):
    """POST /api/v1/users/ returns all UserResponse fields with correct defaults."""
    mock_db = _make_mock_db(doc_exists=False)

    with patch("app.deps.auth.db", mock_db), patch("app.routers.users.db", mock_db):
        response = client.post(
            "/api/v1/users/",
            json=_VALID_PAYLOAD,
            headers=_AUTH_HEADERS,
        )

    assert response.status_code == 200
    data = response.json()

    # All UserResponse fields must be present
    for field in ("uid", "email", "display_name", "created_at", "updated_at", "plan", "subscription_status", "quota"):
        assert field in data, f"Missing field: {field}"

    # Values from payload
    assert data["uid"] == "test-uid-123"
    assert data["email"] == "test@test.com"
    assert data["display_name"] == "Test User"

    # Schema defaults
    assert data["plan"] == "free"
    assert data["subscription_status"] == "none"
    assert data["quota"] == {}


def test_post_users_idempotent(client, mock_firebase_auth):
    """POST /api/v1/users/ twice with same uid → same profile returned (create-or-get).

    First call: doc.exists=False → creates profile.
    Second call: doc.exists=True → returns existing profile.
    Both responses must share the same uid and email.
    """
    mock_db = MagicMock()
    now = datetime.now(timezone.utc)

    existing_profile = {
        "email": "test@test.com",
        "display_name": "Test User",
        "plan": "free",
        "subscription_status": "none",
        "quota": {},
        "created_at": now,
        "updated_at": now,
    }

    mock_doc_new = MagicMock()
    mock_doc_new.exists = False

    mock_doc_existing = MagicMock()
    mock_doc_existing.exists = True
    mock_doc_existing.to_dict.return_value = existing_profile

    # side_effect list is consumed in call order
    mock_db.collection.return_value.document.return_value.get.side_effect = [
        mock_doc_new,
        mock_doc_existing,
    ]
    mock_db.collection.return_value.document.return_value.set.return_value = None

    with patch("app.deps.auth.db", mock_db), patch("app.routers.users.db", mock_db):
        response1 = client.post("/api/v1/users/", json=_VALID_PAYLOAD, headers=_AUTH_HEADERS)
        response2 = client.post("/api/v1/users/", json=_VALID_PAYLOAD, headers=_AUTH_HEADERS)

    assert response1.status_code == 200
    assert response2.status_code == 200

    data1 = response1.json()
    data2 = response2.json()

    # Profiles must refer to the same user
    assert data1["uid"] == data2["uid"]
    assert data1["email"] == data2["email"]
    assert data1["display_name"] == data2["display_name"]


def test_get_me_after_post_returns_same_profile(client, mock_firebase_auth):
    """GET /api/v1/users/me after POST returns the same profile data.

    POST: doc.exists=False → creates profile.
    GET:  doc.exists=True  → returns stored profile.
    uid and email must match between both responses.
    """
    mock_db = MagicMock()
    now = datetime.now(timezone.utc)

    profile_data = {
        "email": "test@test.com",
        "display_name": "Test User",
        "plan": "free",
        "subscription_status": "none",
        "quota": {},
        "created_at": now,
        "updated_at": now,
    }

    mock_doc_new = MagicMock()
    mock_doc_new.exists = False

    mock_doc_existing = MagicMock()
    mock_doc_existing.exists = True
    mock_doc_existing.to_dict.return_value = profile_data

    mock_db.collection.return_value.document.return_value.get.side_effect = [
        mock_doc_new,       # consumed by POST
        mock_doc_existing,  # consumed by GET
    ]
    mock_db.collection.return_value.document.return_value.set.return_value = None

    with patch("app.deps.auth.db", mock_db), patch("app.routers.users.db", mock_db):
        post_response = client.post(
            "/api/v1/users/",
            json=_VALID_PAYLOAD,
            headers=_AUTH_HEADERS,
        )
        get_response = client.get("/api/v1/users/me", headers=_AUTH_HEADERS)

    assert post_response.status_code == 200
    assert get_response.status_code == 200

    post_data = post_response.json()
    get_data = get_response.json()

    assert post_data["uid"] == get_data["uid"]
    assert post_data["email"] == get_data["email"]
    assert post_data["display_name"] == get_data["display_name"]


def test_post_users_missing_required_field(client):
    """POST /api/v1/users/ with incomplete body → 422 (Pydantic validation error).

    UserCreate requires uid, email, and display_name. Sending only email
    (and no Authorization header) triggers FastAPI's 422 for missing parameters.
    """
    response = client.post(
        "/api/v1/users/",
        json={"email": "test@test.com"},  # missing uid and display_name
    )
    assert response.status_code == 422
