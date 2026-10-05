"""GB 503 / GB 504: workout create, set submission, idempotent retries, finalize, edit, list and
detail against real PostgreSQL. Payloads come from make_set_payload (setSummary.js shape)."""

from __future__ import annotations

import copy
import json
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text

from tests.conftest import auth_header, create_workout, iso, make_set_payload, register_user, workout_body

TABLES = ("workout_sessions", "workout_sets", "reps", "form_events", "form_event_reps")


def counts(engine) -> dict[str, int]:
    with engine.connect() as connection:
        return {t: connection.execute(text(f"SELECT count(*) FROM {t}")).scalar_one() for t in TABLES}


@pytest.fixture
def user(api):
    return register_user(api)


@pytest.fixture
def headers(user):
    return auth_header(user["accessToken"])


@pytest.fixture
def workout(api, user):
    return create_workout(api, user["accessToken"])


def submit(api, headers, workout_id, payload):
    return api.post(f"/api/workouts/{workout_id}/sets", json=payload, headers=headers)


# ---------- create ----------

def test_create_is_idempotent(api, headers, clean_db):
    body = workout_body()
    first = api.post("/api/workouts", json=body, headers=headers)
    assert first.status_code == 201
    created = first.json()
    assert created["status"] == "open" and created["sets"] == [] and created["endedAt"] is None
    assert created["clientSessionId"] == body["clientSessionId"]
    assert created["timezone"] == "America/Chicago"
    assert created["totals"] == {"sets": 0, "completedReps": 0, "analyzedReps": 0, "issueBearingReps": 0}
    # Same instant in another offset is the same workout.
    started = datetime.fromisoformat(body["startedAt"].replace("Z", "+00:00"))
    replay = api.post("/api/workouts", json={**body, "startedAt": started.astimezone(
        datetime.now().astimezone().tzinfo).isoformat()}, headers=headers)
    assert replay.status_code == 200
    assert replay.json()["id"] == created["id"]
    assert counts(clean_db)["workout_sessions"] == 1


def test_create_conflict_on_different_content(api, headers):
    body = workout_body()
    assert api.post("/api/workouts", json=body, headers=headers).status_code == 201
    later = iso(datetime.now(UTC) - timedelta(minutes=5))
    response = api.post("/api/workouts", json={**body, "startedAt": later}, headers=headers)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "conflict"


def test_create_same_client_id_for_two_users_is_independent(api, headers):
    other = auth_header(register_user(api)["accessToken"])
    body = workout_body()
    a = api.post("/api/workouts", json=body, headers=headers)
    b = api.post("/api/workouts", json=body, headers=other)
    assert a.status_code == b.status_code == 201
    assert a.json()["id"] != b.json()["id"]


def test_create_requires_auth(api):
    response = api.post("/api/workouts", json=workout_body())
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "not-authenticated"


@pytest.mark.parametrize("change", [
    {"exerciseId": "barbell-squat"},
    {"exerciseId": "Not A Slug"},
    {"startedAt": "2026-10-04T10:00:00"},  # naive
    {"startedAt": "2019-12-31T23:59:59Z"},
    {"startedAt": iso(datetime.now(UTC) + timedelta(minutes=10))},
    {"clientSessionId": ""},
    {"clientSessionId": "has spaces"},
    {"clientSessionId": "x" * 129},
    {"timezone": "Not a zone!"},
    {"unexpected": 1},
])
def test_create_validation_is_422(api, headers, change):
    assert api.post("/api/workouts", json={**workout_body(), **change}, headers=headers).status_code == 422


# ---------- submit a set ----------

def test_submit_set_and_identical_replay(api, headers, workout, clean_db):
    payload = make_set_payload(mode="review")
    first = submit(api, headers, workout["id"], payload)
    assert first.status_code == 201, first.text
    before = counts(clean_db)
    assert before == {"workout_sessions": 1, "workout_sets": 1, "reps": 3, "form_events": 3, "form_event_reps": 2}
    replay = submit(api, headers, workout["id"], copy.deepcopy(payload))
    assert replay.status_code == 200
    assert replay.json() == first.json()
    # A different (local-only) cue log is not part of the stored content.
    altered_cues = copy.deepcopy(payload)
    altered_cues["summary"]["cueLog"] = []
    assert submit(api, headers, workout["id"], altered_cues).status_code == 200
    assert counts(clean_db) == before


def test_replay_treats_integral_floats_as_equal(api, headers, workout, clean_db):
    payload = make_set_payload()
    payload["summary"]["minFormCoverage"] = 1
    payload["reps"][0]["formCoverage"] = 1.0
    payload["summary"]["reps"][0]["formCoverage"] = 1.0
    assert submit(api, headers, workout["id"], payload).status_code == 201
    replay = copy.deepcopy(payload)
    replay["summary"]["minFormCoverage"] = 1.0
    replay["reps"][0]["formCoverage"] = 1
    replay["summary"]["reps"][0]["formCoverage"] = 1
    assert submit(api, headers, workout["id"], replay).status_code == 200
    assert counts(clean_db)["workout_sets"] == 1


def test_schema_reset_guard_refuses_non_test_database(monkeypatch):
    from tests.conftest import guard_schema_reset

    monkeypatch.delenv("ALLOW_TEST_SCHEMA_RESET", raising=False)
    with pytest.raises(pytest.exit.Exception):
        guard_schema_reset("postgresql+psycopg://gymbud@127.0.0.1:5432/gymbud_dev")
    guard_schema_reset("postgresql+psycopg://gymbud@127.0.0.1:5432/gymbud_staging_test")
    monkeypatch.setenv("ALLOW_TEST_SCHEMA_RESET", "1")
    guard_schema_reset("postgresql+psycopg://gymbud@127.0.0.1:5432/gymbud_dev")


def test_conflicting_replay_is_409(api, headers, workout, clean_db):
    payload = make_set_payload()
    assert submit(api, headers, workout["id"], payload).status_code == 201
    changed = copy.deepcopy(payload)
    changed["reps"][0]["minFlexionDeg"] += 1
    response = submit(api, headers, workout["id"], changed)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "conflict"
    assert counts(clean_db)["reps"] == 3


def test_same_set_index_with_new_client_id_is_409(api, headers, workout):
    assert submit(api, headers, workout["id"], make_set_payload(set_index=1)).status_code == 201
    response = submit(api, headers, workout["id"], make_set_payload(set_index=1))
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "conflict"


def test_links_only_join_rows_of_the_same_set(api, headers, workout, clean_db):
    for index in (1, 2):
        assert submit(api, headers, workout["id"], make_set_payload(set_index=index, mode="review")).status_code == 201
    with clean_db.connect() as connection:
        mismatched = connection.execute(text(
            "SELECT count(*) FROM form_event_reps l JOIN form_events e ON e.id = l.form_event_id "
            "JOIN reps r ON r.id = l.rep_id WHERE e.set_id <> r.set_id")).scalar_one()
    assert mismatched == 0


def test_cue_log_is_not_stored(api, headers, workout, clean_db):
    assert submit(api, headers, workout["id"], make_set_payload()).status_code == 201
    with clean_db.connect() as connection:
        assert connection.execute(text("SELECT count(*) FROM workout_sets WHERE summary ? 'cueLog'")).scalar_one() == 0


def test_unknown_or_garbage_workout_id_is_404(api, headers):
    for workout_id in (str(uuid.uuid4()), "not-a-uuid"):
        response = submit(api, headers, workout_id, make_set_payload())
        assert response.status_code == 404
        assert response.json()["detail"]["code"] == "not-found"
        assert api.get(f"/api/workouts/{workout_id}", headers=headers).status_code == 404


def test_summary_exercise_must_match_workout(api, headers, workout):
    response = submit(api, headers, workout["id"], make_set_payload(exercise_id="barbell-squat"))
    assert response.status_code == 422


def _mutate(path, value):
    def apply(payload):
        target = payload
        for key in path[:-1]:
            target = target[key]
        if value is _DELETE:
            del target[path[-1]]
        else:
            target[path[-1]] = value(target[path[-1]]) if callable(value) else value
    return apply


_DELETE = object()


def _duplicate_rep_id(payload):
    payload["reps"][1]["clientRepId"] = payload["reps"][0]["clientRepId"]


@pytest.mark.parametrize("mutation", [
    _mutate(["summary", "schemaVersion"], "set-summary-2.0.0"),
    _mutate(["summary", "units", "reps.startMs"], "s"),
    _mutate(["summary", "units"], {}),
    _mutate(["summary", "analyzerVersion"], "Curl 1.1"),
    _mutate(["summary", "rulesVersion"], "r" * 65),
    _mutate(["summary", "featureVersion"], ""),
    _mutate(["summary", "side"], "up"),
    _mutate(["summary", "mode"], "anything"),
    _mutate(["summary", "setId"], "set-other"),
    _mutate(["summary", "setIndex"], 7),
    _mutate(["summary", "completedReps"], 4),
    _mutate(["summary", "analyzedReps"], 3),
    _mutate(["summary", "issueBearingReps"], 0),
    _mutate(["summary", "noIssueReps"], 2),
    _mutate(["summary", "noIssueFraction"], 0.75),
    _mutate(["summary", "episodeCountsByType", "torso-swing"], 2),
    _mutate(["summary", "trackingCoverage", "assessableMs"], 1e9),
    _mutate(["summary", "trackingCoverage", "fraction"], 1.5),
    _mutate(["summary", "completedReps"], "3"),
    _mutate(["summary", "rulesVersion"], _DELETE),
    _mutate(["endedAt"], lambda v: iso(datetime.now(UTC) - timedelta(hours=2))),  # before startedAt
    _mutate(["endedAt"], lambda v: iso(datetime.now(UTC) + timedelta(minutes=10))),
    _mutate(["startedAt"], "2019-06-01T00:00:00Z"),
    _mutate(["startedAt"], "2026-10-04T10:00:00"),
    _duplicate_rep_id,
    _mutate(["reps", 0, "endMs"], lambda v: v - 5000),
    _mutate(["reps", 0, "formCoverage"], 1.2),
    _mutate(["reps", 0, "startMs"], "100"),
    _mutate(["reps", 0, "analyzed"], "true"),
    _mutate(["reps", 0, "clientRepId"], "x" * 129),
    _mutate(["reps", 0, "issueBearing"], lambda v: not v),
    _mutate(["formEvents", 0, "repClientIds"], ["curl-not-in-payload-1"]),
    _mutate(["formEvents", 0, "endMs"], -1.0),
    _mutate(["formEvents", 0, "rulesVersion"], "Bad Version"),
    _mutate(["clientSetId"], "bad id with spaces"),
    _mutate(["setIndex"], 0),
    _mutate(["extraField"], 1),
])
def test_set_validation_is_422(api, headers, workout, clean_db, mutation):
    payload = make_set_payload(mode="review")
    mutation(payload)
    response = submit(api, headers, workout["id"], payload)
    assert response.status_code == 422, response.text
    assert counts(clean_db)["workout_sets"] == 0


def test_duplicate_rep_index_and_event_id_are_422(api, headers, workout):
    payload = make_set_payload(mode="review")
    payload["reps"][1]["repIndex"] = payload["reps"][0]["repIndex"]
    assert submit(api, headers, workout["id"], payload).status_code == 422
    payload = make_set_payload(mode="review")
    payload["formEvents"][1]["clientEventId"] = payload["formEvents"][0]["clientEventId"]
    assert submit(api, headers, workout["id"], payload).status_code == 422


def test_non_finite_numbers_are_422(api, headers, workout):
    payload = make_set_payload()
    payload["summary"]["minFormCoverage"] = float("nan")
    raw = json.dumps(payload)  # Python emits NaN, which a strict JSON parser would refuse
    response = api.post(f"/api/workouts/{workout['id']}/sets", content=raw,
                        headers={**headers, "Content-Type": "application/json"})
    assert response.status_code == 422


def test_limits_on_reps_and_body_size(api, headers, workout):
    payload = make_set_payload()
    payload["reps"] = payload["reps"] * 167 + payload["reps"][:2]  # 503 reps
    assert submit(api, headers, workout["id"], payload).status_code == 422
    big = make_set_payload()
    big["summary"]["padding"] = "x" * (520 * 1024)
    response = submit(api, headers, workout["id"], big)
    assert response.status_code == 413
    assert response.json()["detail"]["code"] == "request-too-large"


def test_zero_rep_set_is_accepted(api, headers, workout):
    payload = make_set_payload(rep_count=0)
    response = submit(api, headers, workout["id"], payload)
    assert response.status_code == 201, response.text
    assert response.json()["completedReps"] == 0


# ---------- finalize / edit ----------

def test_finalize_is_idempotent_and_blocks_appends(api, headers, workout, clean_db):
    accepted = make_set_payload(set_index=1)
    assert submit(api, headers, workout["id"], accepted).status_code == 201
    ended = iso(datetime.now(UTC))
    first = api.post(f"/api/workouts/{workout['id']}/finalize", json={"endedAt": ended}, headers=headers)
    assert first.status_code == 200
    assert first.json()["status"] == "finalized"
    assert datetime.fromisoformat(first.json()["endedAt"]) == datetime.fromisoformat(ended)
    again = api.post(f"/api/workouts/{workout['id']}/finalize", json={"endedAt": ended}, headers=headers)
    assert again.status_code == 200
    assert again.json() == first.json()
    late = submit(api, headers, workout["id"], make_set_payload(set_index=2))
    assert late.status_code == 409
    assert late.json()["detail"]["code"] == "workout-finalized"
    # A retry of a set accepted before finalization still succeeds (lost response).
    assert submit(api, headers, workout["id"], accepted).status_code == 200
    assert counts(clean_db)["workout_sets"] == 1


def test_finalize_rejects_end_before_start_or_last_set(api, headers, workout):
    assert submit(api, headers, workout["id"], make_set_payload(ended_at=datetime.now(UTC) - timedelta(minutes=2))).status_code == 201
    started = datetime.fromisoformat(workout["startedAt"])
    for ended in (started - timedelta(seconds=1), datetime.now(UTC) - timedelta(minutes=10)):
        response = api.post(f"/api/workouts/{workout['id']}/finalize", json={"endedAt": iso(ended)}, headers=headers)
        assert response.status_code == 422
    future = api.post(f"/api/workouts/{workout['id']}/finalize",
                      json={"endedAt": iso(datetime.now(UTC) + timedelta(hours=1))}, headers=headers)
    assert future.status_code == 422


def test_patch_notes(api, headers, workout):
    response = api.patch(f"/api/workouts/{workout['id']}", json={"notes": "Felt strong."}, headers=headers)
    assert response.status_code == 200
    assert response.json()["notes"] == "Felt strong."
    assert api.patch(f"/api/workouts/{workout['id']}", json={"notes": None}, headers=headers).json()["notes"] is None
    assert api.patch(f"/api/workouts/{workout['id']}", json={"notes": "x" * 1001}, headers=headers).status_code == 422


# ---------- list / detail ----------

def test_detail_round_trips_every_summary_field(api, headers, workout):
    payloads = [make_set_payload(set_index=1, mode="review"), make_set_payload(set_index=2)]
    for payload in payloads:
        assert submit(api, headers, workout["id"], payload).status_code == 201
    detail = api.get(f"/api/workouts/{workout['id']}", headers=headers).json()
    assert detail["totals"] == {"sets": 2, "completedReps": 6, "analyzedReps": 2, "issueBearingReps": 1}
    assert [s["setIndex"] for s in detail["sets"]] == [1, 2]
    for payload, stored in zip(payloads, detail["sets"]):
        sent = payload["summary"]
        expected_summary = {k: v for k, v in sent.items() if k != "cueLog"}
        assert stored["summary"] == expected_summary
        assert stored["clientSetId"] == payload["clientSetId"]
        assert datetime.fromisoformat(stored["startedAt"]) == datetime.fromisoformat(payload["startedAt"])
        assert datetime.fromisoformat(stored["endedAt"]) == datetime.fromisoformat(payload["endedAt"])
        column_map = {
            "side": sent["side"], "view": sent["view"], "mode": sent["mode"],
            "summarySchemaVersion": sent["schemaVersion"], "analyzerVersion": sent["analyzerVersion"],
            "featureVersion": sent["featureVersion"], "rulesVersion": sent["rulesVersion"],
            "feedbackVersion": sent["feedbackVersion"], "completedReps": sent["completedReps"],
            "analyzedReps": sent["analyzedReps"], "issueBearingReps": sent["issueBearingReps"],
            "noIssueReps": sent["noIssueReps"], "noIssueFraction": sent["noIssueFraction"],
            "notAnalyzedReason": sent["notAnalyzedReason"],
            "trackingAssessableMs": sent["trackingCoverage"]["assessableMs"],
            "trackingSessionMs": sent["trackingCoverage"]["sessionMs"],
            "trackingCoverage": sent["trackingCoverage"]["fraction"],
            "interruptedAttempts": sent["interruptedAttempts"], "episodeCountsByType": sent["episodeCountsByType"],
        }
        assert {k: stored[k] for k in column_map} == column_map
        assert [{k: v for k, v in r.items() if k != "id"} for r in stored["reps"]] == payload["reps"]
        sent_events = sorted(payload["formEvents"], key=lambda e: (e["startMs"], e["clientEventId"]))
        assert [{k: v for k, v in e.items() if k != "id"} for e in stored["formEvents"]] == sent_events


def test_list_is_newest_first_with_cursor(api, headers, user):
    token = user["accessToken"]
    now = datetime.now(UTC).replace(microsecond=0)
    ids = [create_workout(api, token, started_at=now - timedelta(hours=h))["id"] for h in (3, 1, 2)]
    first = api.post(f"/api/workouts/{ids[1]}/sets", json=make_set_payload(), headers=headers)
    assert first.status_code == 201
    page = api.get("/api/workouts?limit=2", headers=headers).json()
    assert [item["id"] for item in page["items"]] == [ids[1], ids[2]]
    assert page["items"][0]["totals"] == {"sets": 1, "completedReps": 3, "analyzedReps": 0, "issueBearingReps": 0}
    assert set(page["items"][0]) == {"id", "clientSessionId", "exerciseId", "status", "startedAt", "endedAt", "totals"}
    assert page["nextBefore"] is not None
    rest = api.get("/api/workouts", params={"limit": 2, "before": page["nextBefore"]}, headers=headers).json()
    assert [item["id"] for item in rest["items"]] == [ids[0]]
    assert rest["nextBefore"] is None


@pytest.mark.parametrize("query", ["limit=0", "limit=101", "limit=abc", "before=2026-10-04T10:00:00", "before=yesterday"])
def test_list_query_validation_is_422(api, headers, query):
    assert api.get(f"/api/workouts?{query}", headers=headers).status_code == 422


def test_list_only_shows_own_workouts(api, headers, user):
    create_workout(api, user["accessToken"])
    other = register_user(api)["accessToken"]
    assert api.get("/api/workouts", headers=auth_header(other)).json() == {"items": [], "nextBefore": None, "nextCursor": None}
