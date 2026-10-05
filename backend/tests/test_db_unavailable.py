"""Sprint 5 independent validation (s5-validation): behaviour when SQL cannot be reached.

Every database-backed route answers 503 `database-unavailable` with `Retry-After`, never a stack trace,
the database URL, host, user or password. `/health` (process liveness, no database) stays 200. Logs
name only exception classes. The unreachable database is a closed local port (connection refused) and
an exhausted pool; no real outage is involved.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from app.core.config import AppSettings, CoachSettings
from app.database import create_db_engine
from app.main import create_app
from tests.conftest import auth_header, make_set_payload, register_user, workout_body

SECRET_PASSWORD = "Sup3r-S3cret-DB-pw"
UNREACHABLE_URL = f"postgresql+psycopg://gymbud_admin:{SECRET_PASSWORD}@127.0.0.1:1/gymbud_prod_db"
LEAK_MARKERS = (SECRET_PASSWORD, "gymbud_admin", "gymbud_prod_db", "127.0.0.1", "psycopg", "Traceback",
                "OperationalError", "postgresql", "connection refused", "Connection refused", "port 1")

FAKE_TOKEN = "A" * 43  # well-formed bearer token; the database lookup is what fails


@pytest.fixture
def down_api():
    settings = AppSettings(database_url=UNREACHABLE_URL, db_connect_timeout_s=2)
    engine = create_db_engine(settings)
    app = create_app(CoachSettings(api_key=""), app_settings=settings, engine=engine)
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client
    engine.dispose()


def assert_unavailable(response) -> None:
    assert response.status_code == 503, response.text
    assert response.json() == {"detail": {"code": "database-unavailable",
                                          "message": "Saved workouts are temporarily unavailable. Try again."}}
    assert response.headers.get("retry-after") == "5"
    for marker in LEAK_MARKERS:
        assert marker not in response.text, f"503 body leaks {marker!r}"


REQUESTS = [
    ("post", "/api/auth/register", {"email": "new@example.com", "password": "correct-horse-battery"}, False),
    ("post", "/api/auth/login", {"email": "new@example.com", "password": "correct-horse-battery"}, False),
    ("post", "/api/auth/logout", None, True),
    ("get", "/api/users/me", None, True),
    ("get", "/api/exercises", None, False),
    ("get", "/api/workouts", None, True),
    ("post", "/api/workouts", workout_body(), True),
    ("get", "/api/workouts/00000000-0000-4000-8000-000000000000", None, True),
    ("post", "/api/workouts/00000000-0000-4000-8000-000000000000/sets", make_set_payload(1, 2), True),
    ("post", "/api/workouts/00000000-0000-4000-8000-000000000000/finalize",
     {"endedAt": datetime.now(UTC).isoformat()}, True),
    ("patch", "/api/workouts/00000000-0000-4000-8000-000000000000", {"notes": "x"}, True),
]


@pytest.mark.parametrize(("method", "path", "body", "authed"), REQUESTS, ids=[f"{m} {p}" for m, p, _, _ in REQUESTS])
def test_every_database_route_is_503_without_leaks(down_api, caplog, method, path, body, authed):
    headers = auth_header(FAKE_TOKEN) if authed else {}
    with caplog.at_level(logging.DEBUG):
        response = getattr(down_api, method)(path, headers=headers, **({"json": body} if body is not None else {}))
    assert_unavailable(response)
    logged = "\n".join(record.getMessage() for record in caplog.records)
    assert SECRET_PASSWORD not in logged and FAKE_TOKEN not in logged
    assert "correct-horse-battery" not in logged
    assert any("database unavailable" in record.getMessage() for record in caplog.records)


def test_health_is_200_while_database_is_down(down_api):
    response = down_api.get("/health")
    assert response.status_code == 200 and response.json() == {"status": "ok"}


def test_validation_still_422_before_touching_the_database(down_api):
    """A malformed body is rejected without a database round trip (no 503 masking a client error)."""
    response = down_api.post("/api/auth/register", json={"email": "not-an-email", "password": "pw-xyzzy"})
    assert response.status_code == 422
    assert "pw-xyzzy" not in response.text  # input is not echoed


def test_missing_token_is_401_even_when_database_is_down(down_api):
    assert down_api.get("/api/workouts").status_code == 401


def test_exhausted_pool_is_503(clean_db, migrated_db):
    """All pooled connections busy past the pool timeout: 503, not a hang or 500."""
    settings = AppSettings(database_url=migrated_db, db_pool_size=1, db_max_overflow=0, db_pool_timeout_s=1)
    engine = create_db_engine(settings, url=migrated_db)
    app = create_app(CoachSettings(api_key=""), app_settings=settings, engine=engine)
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            token = register_user(client)["accessToken"]
            held = engine.connect()  # takes the only connection
            try:
                assert_unavailable(client.get("/api/workouts", headers=auth_header(token)))
            finally:
                held.close()
            assert client.get("/api/workouts", headers=auth_header(token)).status_code == 200
    finally:
        engine.dispose()


def test_recovers_when_database_comes_back(clean_db, migrated_db):
    """pool_pre_ping: after connections are invalidated (database restart), the next request works."""
    settings = AppSettings(database_url=migrated_db)
    engine = create_db_engine(settings, url=migrated_db)
    app = create_app(CoachSettings(api_key=""), app_settings=settings, engine=engine)
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            token = register_user(client)["accessToken"]
            assert client.get("/api/workouts", headers=auth_header(token)).status_code == 200
            with engine.connect() as connection:
                connection.invalidate()  # as after a server restart
            engine.pool.dispose()
            assert client.get("/api/workouts", headers=auth_header(token)).status_code == 200
            assert client.post("/api/workouts", json=workout_body(), headers=auth_header(token)).status_code == 201
    finally:
        engine.dispose()
