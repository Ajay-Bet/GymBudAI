"""Sprint 5 independent validation (s5-validation): GB 504 owned history.

User B must never read, list, append to, edit or finalize user A's workout, including by guessing ids.
Every attempt is 404 `not-found` (indistinguishable from a missing workout), and A's rows are unchanged
afterwards. Runs against the real PostgreSQL test database (TEST_DATABASE_URL).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text

from tests.conftest import auth_header, iso, make_set_payload, register_user, workout_body

TABLES = ("workout_sessions", "workout_sets", "reps", "form_events", "form_event_reps")


def snapshot(engine) -> dict:
    """Full row content of every workout table (A's data must be byte-for-byte unchanged)."""
    out = {}
    with engine.connect() as connection:
        for table in TABLES:
            rows = connection.execute(text(f"SELECT * FROM {table}")).mappings().all()
            out[table] = sorted((tuple(sorted((k, str(v)) for k, v in row.items())) for row in rows))
    return out


@pytest.fixture
def two_users(api):
    a = register_user(api, email="owner-a@example.com")
    b = register_user(api, email="intruder-b@example.com")
    return auth_header(a["accessToken"]), auth_header(b["accessToken"])


@pytest.fixture
def a_workout(api, two_users):
    """A's open workout with one review-mode set (reps, events and rep links all present)."""
    a, _ = two_users
    workout = api.post("/api/workouts", json=workout_body(), headers=a).json()
    response = api.post(f"/api/workouts/{workout['id']}/sets", json=make_set_payload(1, 3, mode="review"), headers=a)
    assert response.status_code == 201, response.text
    return workout


def assert_not_found(response) -> None:
    assert response.status_code == 404, response.text
    assert response.json() == {"detail": {"code": "not-found", "message": "Workout not found."}}


def test_cross_user_read_append_edit_finalize_are_all_404(api, two_users, a_workout, clean_db):
    a, b = two_users
    wid = a_workout["id"]
    before = snapshot(clean_db)

    assert_not_found(api.get(f"/api/workouts/{wid}", headers=b))
    assert_not_found(api.post(f"/api/workouts/{wid}/sets", json=make_set_payload(2, 2), headers=b))
    # Even an exact replay of A's set body (same clientSetId) must not reveal or touch it.
    replay = make_set_payload(1, 3, mode="review")
    assert_not_found(api.post(f"/api/workouts/{wid}/sets", json=replay, headers=b))
    assert_not_found(api.patch(f"/api/workouts/{wid}", json={"notes": "pwned"}, headers=b))
    assert_not_found(api.patch(f"/api/workouts/{wid}", json={"notes": None}, headers=b))
    assert_not_found(api.post(f"/api/workouts/{wid}/finalize", json={"endedAt": iso(datetime.now(UTC))}, headers=b))

    assert b_list_ids(api, b) == []
    assert snapshot(clean_db) == before, "A's data changed after B's attempts"

    # A still sees and controls the workout normally.
    detail = api.get(f"/api/workouts/{wid}", headers=a).json()
    assert detail["status"] == "open" and detail["notes"] is None and detail["totals"]["sets"] == 1


def b_list_ids(api, headers) -> list[str]:
    response = api.get("/api/workouts?limit=100", headers=headers)
    assert response.status_code == 200
    return [item["id"] for item in response.json()["items"]]


def test_cross_user_404_is_identical_to_missing_workout(api, two_users, a_workout):
    """No existence oracle: B gets the same status, body and headers for A's id and a random id."""
    _, b = two_users
    owned = api.get(f"/api/workouts/{a_workout['id']}", headers=b)
    missing = api.get(f"/api/workouts/{uuid.uuid4()}", headers=b)
    assert (owned.status_code, owned.json()) == (missing.status_code, missing.json())
    assert owned.headers.get("content-length") == missing.headers.get("content-length")
    for path, body in (("/sets", make_set_payload(5, 1)), ("/finalize", {"endedAt": iso(datetime.now(UTC))})):
        x = api.post(f"/api/workouts/{a_workout['id']}{path}", json=body, headers=b)
        y = api.post(f"/api/workouts/{uuid.uuid4()}{path}", json=body, headers=b)
        assert (x.status_code, x.json()) == (y.status_code, y.json()) == (404, x.json())


def test_cross_user_on_finalized_workout_is_still_404_not_409(api, two_users, a_workout):
    """A finalized workout must not leak `workout-finalized` (409) to another user."""
    a, b = two_users
    wid = a_workout["id"]
    assert api.post(f"/api/workouts/{wid}/finalize", json={"endedAt": iso(datetime.now(UTC))}, headers=a).status_code == 200
    assert_not_found(api.post(f"/api/workouts/{wid}/sets", json=make_set_payload(2, 1), headers=b))
    assert_not_found(api.post(f"/api/workouts/{wid}/finalize", json={"endedAt": iso(datetime.now(UTC))}, headers=b))


def test_b_reusing_a_client_session_id_gets_its_own_workout(api, two_users, a_workout, clean_db):
    a, b = two_users
    before_a = api.get(f"/api/workouts/{a_workout['id']}", headers=a).json()
    # Same clientSessionId, and even different content: no 409, no leak, a separate workout for B.
    body = workout_body(client_session_id=a_workout["clientSessionId"],
                        started_at=datetime.now(UTC).replace(microsecond=0) - timedelta(hours=2))
    response = api.post("/api/workouts", json=body, headers=b)
    assert response.status_code == 201, response.text
    b_workout = response.json()
    assert b_workout["id"] != a_workout["id"]
    assert b_workout["totals"]["sets"] == 0 and b_workout["sets"] == []
    # B appends a set reusing A's clientSetId into B's own workout: allowed (ids are scoped per owner).
    a_set_id = before_a["sets"][0]["clientSetId"]
    payload = make_set_payload(1, 2, client_set_id=a_set_id)
    assert api.post(f"/api/workouts/{b_workout['id']}/sets", json=payload, headers=b).status_code == 201
    assert api.get(f"/api/workouts/{a_workout['id']}", headers=a).json() == before_a
    assert b_list_ids(api, b) == [b_workout["id"]]
    assert [i["id"] for i in api.get("/api/workouts", headers=a).json()["items"]] == [a_workout["id"]]


@pytest.mark.parametrize("guess", [
    lambda real: str(uuid.uuid4()),
    lambda real: str(uuid.UUID(int=uuid.UUID(real).int ^ 1)),  # neighbour of a real id
    lambda real: real.upper(),  # same id, different case: still A's, still 404 for B
    lambda real: real.replace("-", ""),  # same id without dashes
    lambda real: "00000000-0000-0000-0000-000000000000",
    lambda real: "1 OR 1=1",
    lambda real: "' OR ''='",
])
def test_guessed_and_malformed_ids_are_404(api, two_users, a_workout, guess):
    _, b = two_users
    wid = guess(a_workout["id"])
    assert_not_found(api.get(f"/api/workouts/{wid}", headers=b))
    assert_not_found(api.patch(f"/api/workouts/{wid}", json={"notes": "x"}, headers=b))
    assert_not_found(api.post(f"/api/workouts/{wid}/finalize", json={"endedAt": iso(datetime.now(UTC))}, headers=b))


def test_path_tricks_never_reach_another_route(api, two_users, a_workout):
    """Encoded slashes do not route anywhere useful (router 404/405, no data)."""
    _, b = two_users
    for wid in ("..%2F..%2Fapi%2Fusers%2Fme", f"{a_workout['id']}%2Fsets", f"{a_workout['id']}/../{a_workout['id']}"):
        response = api.get(f"/api/workouts/{wid}", headers=b)
        assert response.status_code in (404, 405), (wid, response.text)
        assert a_workout["id"] not in response.text and "email" not in response.text


def test_list_never_includes_other_users_even_with_cursor(api, two_users):
    a, b = two_users
    base = datetime.now(UTC).replace(microsecond=0) - timedelta(days=3)
    for i in range(5):
        api.post("/api/workouts", json=workout_body(started_at=base + timedelta(hours=i)), headers=a)
    api.post("/api/workouts", json=workout_body(started_at=base + timedelta(hours=10)), headers=b)
    far_future_cursor = iso(datetime.now(UTC) + timedelta(days=1))
    items = api.get(f"/api/workouts?limit=100&before={far_future_cursor}", headers=b).json()["items"]
    assert len(items) == 1
    # Page through A's list two at a time: exactly A's five, never B's.
    seen, cursor = [], None
    while True:
        params = {"limit": 2, **({"before": cursor} if cursor else {})}
        page = api.get("/api/workouts", params=params, headers=a).json()
        seen += page["items"]
        cursor = page["nextBefore"]
        if not cursor:
            break
    assert len(seen) == 5 and len({w["id"] for w in seen}) == 5
    assert items[0]["id"] not in {w["id"] for w in seen}


def test_revoked_or_other_session_token_cannot_reach_a_workout(api, two_users, a_workout):
    """After A logs out, A's old token is 401 everywhere (not 404, no data)."""
    a, _ = two_users
    assert api.post("/api/auth/logout", headers=a).status_code == 204
    for response in (api.get(f"/api/workouts/{a_workout['id']}", headers=a), api.get("/api/workouts", headers=a),
                     api.post(f"/api/workouts/{a_workout['id']}/sets", json=make_set_payload(2, 1), headers=a)):
        assert response.status_code == 401
        assert "sets" not in response.text


def test_user_id_in_body_or_query_is_ignored(api, two_users, a_workout):
    """A supplied user id is never authorization: extra keys are rejected, query params ignored."""
    a, b = two_users
    a_user = api.get("/api/users/me", headers=a).json()["id"]
    response = api.post("/api/workouts", json={**workout_body(), "userId": a_user}, headers=b)
    assert response.status_code == 422
    items = api.get(f"/api/workouts?userId={a_user}&user_id={a_user}", headers=b).json()["items"]
    assert items == []
