"""GB 501: email + password accounts with opaque bearer sessions (real PostgreSQL)."""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta

import pytest
from argon2 import PasswordHasher
from sqlalchemy import text

from tests.conftest import TEST_PASSWORD, auth_header, register_user


def detail_code(response) -> str:
    return response.json()["detail"]["code"]


def test_register_returns_token_and_user(api, clean_db):
    body = register_user(api, email="  Alice@Example.COM ", display_name="Alice")
    assert body["tokenType"] == "bearer"
    assert len(body["accessToken"]) >= 40
    assert body["user"]["email"] == "alice@example.com"
    assert body["user"]["displayName"] == "Alice"
    expires = datetime.fromisoformat(body["expiresAt"])
    assert timedelta(hours=167) < expires - datetime.now(UTC) <= timedelta(hours=168)
    with clean_db.connect() as connection:
        row = connection.execute(text("SELECT password_hash FROM users")).one()
        stored = connection.execute(text("SELECT token_hash FROM auth_sessions")).scalar_one()
    assert row.password_hash.startswith("$argon2id$")
    assert TEST_PASSWORD not in row.password_hash
    # Only the SHA-256 of the token is stored.
    assert stored == hashlib.sha256(body["accessToken"].encode()).hexdigest()


def test_me_returns_profile(api):
    body = register_user(api, email="me@example.com", display_name=None)
    response = api.get("/api/users/me", headers=auth_header(body["accessToken"]))
    assert response.status_code == 200
    assert response.json() == {"id": body["user"]["id"], "email": "me@example.com", "displayName": None,
                               "createdAt": body["user"]["createdAt"]}


def test_register_duplicate_email_is_409(api):
    register_user(api, email="dup@example.com")
    response = api.post("/api/auth/register", json={"email": "DUP@example.com", "password": TEST_PASSWORD})
    assert response.status_code == 409
    assert detail_code(response) == "email-taken"


@pytest.mark.parametrize("body", [
    {"email": "short@example.com", "password": "123456789"},
    {"email": "long@example.com", "password": "x" * 129},
    {"email": "not-an-email", "password": TEST_PASSWORD},
    {"email": "extra@example.com", "password": TEST_PASSWORD, "isAdmin": True},
    {"password": TEST_PASSWORD},
])
def test_register_validation_is_422(api, body):
    assert api.post("/api/auth/register", json=body).status_code == 422


def test_login_logout_flow(api):
    register_user(api, email="flow@example.com")
    login = api.post("/api/auth/login", json={"email": "FLOW@example.com", "password": TEST_PASSWORD})
    assert login.status_code == 200
    token = login.json()["accessToken"]
    assert api.get("/api/users/me", headers=auth_header(token)).status_code == 200
    assert api.post("/api/auth/logout", headers=auth_header(token)).status_code == 204
    revoked = api.get("/api/users/me", headers=auth_header(token))
    assert revoked.status_code == 401
    assert detail_code(revoked) == "not-authenticated"
    assert revoked.headers["www-authenticate"] == "Bearer"


def test_logout_revokes_only_presented_token(api):
    first = register_user(api, email="two@example.com")["accessToken"]
    second = api.post("/api/auth/login", json={"email": "two@example.com", "password": TEST_PASSWORD}).json()["accessToken"]
    assert api.post("/api/auth/logout", headers=auth_header(second)).status_code == 204
    assert api.get("/api/users/me", headers=auth_header(first)).status_code == 200
    assert api.get("/api/users/me", headers=auth_header(second)).status_code == 401


def test_wrong_password_and_unknown_email_are_identical_401(api):
    register_user(api, email="known@example.com")
    wrong = api.post("/api/auth/login", json={"email": "known@example.com", "password": "wrong-password-1"})
    unknown = api.post("/api/auth/login", json={"email": "nobody@example.com", "password": TEST_PASSWORD})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()
    assert detail_code(wrong) == "invalid-credentials"


def test_expired_token_is_401_session_expired(api, clean_db):
    token = register_user(api)["accessToken"]
    with clean_db.begin() as connection:
        connection.execute(text("UPDATE auth_sessions SET expires_at = now() - interval '1 second'"))
    response = api.get("/api/users/me", headers=auth_header(token))
    assert response.status_code == 401
    assert detail_code(response) == "session-expired"


def test_revoked_token_in_database_is_401(api, clean_db):
    token = register_user(api)["accessToken"]
    with clean_db.begin() as connection:
        connection.execute(text("UPDATE auth_sessions SET revoked_at = now()"))
    response = api.get("/api/users/me", headers=auth_header(token))
    assert response.status_code == 401
    assert detail_code(response) == "not-authenticated"


@pytest.mark.parametrize("header", [
    None, "", "Bearer", "Bearer ", "Basic dXNlcjpwYXNz", "Token abcdefghijklmnopqrstuvwxyz",
    "Bearer abc", "Bearer has spaces in the token value", "Bearer " + "a" * 300,
])
def test_missing_or_malformed_header_is_401(api, header):
    headers = {} if header is None else {"Authorization": header}
    response = api.get("/api/users/me", headers=headers)
    assert response.status_code == 401
    assert detail_code(response) == "not-authenticated"


def test_unknown_well_formed_token_is_401(api):
    response = api.get("/api/users/me", headers=auth_header("A" * 43))
    assert response.status_code == 401
    assert detail_code(response) == "not-authenticated"


def test_logout_requires_authentication(api):
    assert api.post("/api/auth/logout").status_code == 401


def test_login_rehashes_outdated_hash(api, clean_db):
    register_user(api, email="rehash@example.com")
    weak = PasswordHasher(time_cost=1, memory_cost=8, parallelism=1).hash(TEST_PASSWORD)
    with clean_db.begin() as connection:
        connection.execute(text("UPDATE users SET password_hash = :h"), {"h": weak})
    assert api.post("/api/auth/login", json={"email": "rehash@example.com", "password": TEST_PASSWORD}).status_code == 200
    with clean_db.connect() as connection:
        stored = connection.execute(text("SELECT password_hash FROM users")).scalar_one()
    assert stored != weak
    assert not PasswordHasher().check_needs_rehash(stored)
    assert api.post("/api/auth/login", json={"email": "rehash@example.com", "password": TEST_PASSWORD}).status_code == 200


def test_login_rate_limited_per_email_and_ip(make_api):
    api = make_api(login_rate_per_minute=3)
    register_user(api, email="limit@example.com")
    for _ in range(3):
        assert api.post("/api/auth/login", json={"email": "limit@example.com", "password": "nope-nope-1"}).status_code == 401
    limited = api.post("/api/auth/login", json={"email": "limit@example.com", "password": TEST_PASSWORD})
    assert limited.status_code == 429
    assert detail_code(limited) == "rate-limited"
    assert int(limited.headers["retry-after"]) >= 1
    # Another email from the same client is not affected.
    assert api.post("/api/auth/login", json={"email": "other@example.com", "password": "nope-nope-1"}).status_code == 401


def test_exercises_list_needs_no_auth(api):
    response = api.get("/api/exercises")
    assert response.status_code == 200
    assert response.json() == [{"id": "dumbbell-curl", "name": "Dumbbell curl", "supportedViews": ["side"],
                                "analyzerVersion": "curl-1.1.0"}]


def test_error_bodies_never_echo_password(api):
    response = api.post("/api/auth/login", json={"email": "x@example.com", "password": "SuperSecret-Value-42"})
    assert "SuperSecret-Value-42" not in response.text
    short = api.post("/api/auth/register", json={"email": "y@example.com", "password": "Secret-42"})
    assert short.status_code == 422
    assert "Secret-42" not in short.text
