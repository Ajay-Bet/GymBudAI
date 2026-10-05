"""Shared fixtures: the app with a mocked OpenAI transport. No test touches the network."""

from __future__ import annotations

import json
from collections.abc import Callable

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import CoachSettings
from app.main import create_app

FAKE_KEY = "sk-test-SECRET-0123456789abcdef"
FAKE_MP3 = b"ID3\x04\x00fake-mp3-bytes"


class Upstream:
    """Records requests and answers them with a configurable handler."""

    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []
        self.handler: Callable[[httpx.Request], httpx.Response] = self.default

    @staticmethod
    def default(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/audio/speech"):
            return httpx.Response(200, content=FAKE_MP3, headers={"content-type": "audio/mpeg"})
        return httpx.Response(500)

    async def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        result = self.handler(request)
        if hasattr(result, "__await__"):
            result = await result
        return result

    def json_bodies(self) -> list[dict]:
        return [json.loads(r.content) for r in self.requests]


def responses_body(output: dict | str, status: str = "completed") -> dict:
    text = output if isinstance(output, str) else json.dumps(output)
    return {
        "id": "resp_test",
        "status": status,
        "output": [{"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": text}]}],
    }


@pytest.fixture
def upstream() -> Upstream:
    return Upstream()


@pytest.fixture
def make_client(upstream: Upstream):
    clients: list[TestClient] = []

    def factory(api_key: str = FAKE_KEY, **overrides) -> TestClient:
        settings = CoachSettings(api_key=api_key, **overrides)
        client = TestClient(create_app(settings, transport=httpx.MockTransport(upstream)))
        client.__enter__()
        clients.append(client)
        return client

    yield factory
    for client in clients:
        client.__exit__(None, None, None)


@pytest.fixture
def client(make_client) -> TestClient:
    return make_client()


# =====================================================================================
# Sprint 5: PostgreSQL fixtures (real database at TEST_DATABASE_URL), API helpers and a
# set payload factory shaped like frontend/src/exercises/setSummary.js output.
# Coach tests above never touch the database; only tests that request these fixtures do.
# =====================================================================================

import os  # noqa: E402
import uuid  # noqa: E402
from datetime import UTC, datetime, timedelta  # noqa: E402
from pathlib import Path  # noqa: E402

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from sqlalchemy import Engine, create_engine, text  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

from app.core.config import DEFAULT_TEST_DATABASE_URL, AppSettings  # noqa: E402
from app.database import create_db_engine  # noqa: E402
from app.schemas.workouts import SUMMARY_UNITS  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parents[1]
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "").strip() or DEFAULT_TEST_DATABASE_URL
TEST_PASSWORD = "correct-horse-battery"
DATA_TABLES = ("form_event_reps", "form_events", "reps", "workout_sets", "workout_sessions", "auth_sessions", "users")


def alembic_config(url: str = TEST_DATABASE_URL) -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.attributes["database_url"] = url
    config.attributes["configure_logging"] = False  # keep pytest's logging (caplog) intact
    return config


def guard_schema_reset(url: str) -> None:
    """Refuse to drop a schema unless the database is clearly a test database."""
    from sqlalchemy.engine import make_url

    name = make_url(url).database or ""
    if not name.endswith("_test") and os.environ.get("ALLOW_TEST_SCHEMA_RESET") != "1":
        pytest.exit(
            f"Refusing to drop schema 'public' in database {name!r}: TEST_DATABASE_URL must name a database "
            "ending in '_test' (or set ALLOW_TEST_SCHEMA_RESET=1 deliberately).",
            returncode=2,
        )


def reset_schema(url: str = TEST_DATABASE_URL) -> None:
    """Drop everything in the test database's public schema (guarded: '_test' databases only)."""
    guard_schema_reset(url)
    engine = create_engine(url, poolclass=NullPool)
    try:
        with engine.begin() as connection:
            connection.execute(text("DROP SCHEMA public CASCADE"))
            connection.execute(text("CREATE SCHEMA public"))
    finally:
        engine.dispose()


@pytest.fixture(scope="session")
def migrated_db() -> str:
    """Clean schema + `alembic upgrade head`, once per test session."""
    reset_schema(TEST_DATABASE_URL)
    command.upgrade(alembic_config(TEST_DATABASE_URL), "head")
    return TEST_DATABASE_URL


@pytest.fixture(scope="session")
def db_engine(migrated_db: str):
    engine = create_db_engine(AppSettings(), url=migrated_db)
    yield engine
    engine.dispose()


@pytest.fixture
def clean_db(db_engine: Engine) -> Engine:
    """Empty every data table (the seeded `exercises` rows stay) before the test."""
    with db_engine.begin() as connection:
        connection.execute(text(f"TRUNCATE {', '.join(DATA_TABLES)} CASCADE"))
    return db_engine


@pytest.fixture
def make_api(clean_db: Engine):
    """Factory for TestClients backed by the test database. Coaching is unconfigured (no key)."""
    clients: list[TestClient] = []

    def factory(**app_settings) -> TestClient:
        application = create_app(CoachSettings(api_key=""), app_settings=AppSettings(**app_settings), engine=clean_db)
        client = TestClient(application)
        client.__enter__()
        clients.append(client)
        return client

    yield factory
    for client in clients:
        client.__exit__(None, None, None)


@pytest.fixture
def api(make_api) -> TestClient:
    return make_api()


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def register_user(client: TestClient, email: str | None = None, password: str = TEST_PASSWORD,
                  display_name: str | None = "Test User") -> dict:
    """Register and return the token response body (`accessToken`, `user`, ...)."""
    body = {"email": email or f"user-{uuid.uuid4().hex[:10]}@example.com", "password": password}
    if display_name is not None:
        body["displayName"] = display_name
    response = client.post("/api/auth/register", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def iso(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def workout_body(client_session_id: str | None = None, started_at: datetime | None = None, **extra) -> dict:
    started = started_at or datetime.now(UTC).replace(microsecond=0) - timedelta(minutes=30)
    body = {"clientSessionId": client_session_id or f"workout-{uuid.uuid4()}", "exerciseId": "dumbbell-curl",
            "startedAt": iso(started), "timezone": "America/Chicago"}
    body.update(extra)
    return body


def create_workout(client: TestClient, token: str, **kwargs) -> dict:
    response = client.post("/api/workouts", json=workout_body(**kwargs), headers=auth_header(token))
    assert response.status_code == 201, response.text
    return response.json()


ISSUE_TYPES = ["torso-swing", "upper-arm-drift", "incomplete-rom"]
INTERRUPT_REASONS = ["partial", "tracking-loss", "pause-timeout", "low-coverage", "reset", "recalibration"]


def make_set_payload(set_index: int = 1, rep_count: int = 3, mode: str = "validated-only",
                     client_set_id: str | None = None, ended_at: datetime | None = None,
                     exercise_id: str = "dumbbell-curl", side: str = "left") -> dict:
    """A `WorkoutSetIn` body built the way frontend/src/api/workoutPayload.js builds it from
    buildSetSummary() + analyzerSession.completedReps (Sprint 4 `set-summary-1.0.0`).

    mode 'validated-only' mirrors today's real app (no rule enabled): every rep is not analyzed,
    notAnalyzedReason 'no-validated-rules', episodes are recorded but unassessed.
    mode 'review' assesses every rule: form coverage cycles 0.95/0.9/0.5, a torso-swing episode
    overlaps rep 1, an open upper-arm-drift episode covers the last rep, and an incomplete-rom
    episode belongs to an interrupted attempt.
    """
    session_uid = str(uuid.uuid4())
    set_id = client_set_id or f"set-{uuid.uuid4()}"
    assessed_types = list(ISSUE_TYPES) if mode == "review" else []
    started_ms, rep_ms, gap_ms = 412.5, 2000.25, 500.0

    completed = []
    for i in range(rep_count):
        start = started_ms + 600.0 + i * (rep_ms + gap_ms)
        end = start + rep_ms
        completed.append({"id": f"curl-{session_uid}-{i + 1}", "index": i + 1, "startMs": start, "endMs": end,
                          "durationMs": end - start, "minFlexionDeg": 8.5 + i, "maxFlexionDeg": 128.25 - i,
                          "romDeg": (128.25 - i) - (8.5 + i)})
    last_end = completed[-1]["endMs"] if completed else started_ms + 600.0
    interrupted_id = f"curl-{session_uid}-{rep_count + 1}"
    ended_ms = last_end + 1800.0

    episodes = []
    seq = 0

    def episode(issue_type, start, end, peak, attempt_ids, end_reason):
        nonlocal seq
        seq += 1
        episodes.append({"id": f"issue-{session_uid}-{seq}", "type": issue_type, "startMs": start, "endMs": end,
                         "peak": peak, "unit": "deg", "endReason": end_reason, "attemptIds": attempt_ids,
                         "rulesVersion": "curl-rules-1.0.0", "analyzerVersion": "curl-1.1.0", "enabled": False,
                         "validation": "unvalidated", "assessed": issue_type in assessed_types})

    if completed:
        first = completed[0]
        episode("torso-swing", first["startMs"] + 300.0, first["startMs"] + 1100.0, 14.2, [first["id"]], "resolved")
    if len(completed) >= 2:
        last = completed[-1]
        episode("upper-arm-drift", last["startMs"] + 200.0, None, 21.7, [last["id"]], None)
    episode("incomplete-rom", ended_ms - 200.0, ended_ms - 200.0, 41.0, [interrupted_id], "evaluated-at-attempt-end")

    def episode_end(ep):
        return ep["endMs"] if ep["endMs"] is not None else ended_ms

    def overlaps(ep, rep):
        return rep["id"] in ep["attemptIds"] or (
            ep["type"] != "incomplete-rom" and ep["startMs"] < rep["endMs"] and episode_end(ep) > rep["startMs"])

    coverages = [0.95, 0.9, 0.5]
    summary_reps = []
    for i, rep in enumerate(completed):
        coverage = coverages[i % len(coverages)]
        analyzed = bool(assessed_types) and coverage >= 0.8
        matching = [ep for ep in episodes if ep["assessed"] and overlaps(ep, rep)]
        issue_types = list(dict.fromkeys(ep["type"] for ep in matching))
        summary_reps.append({"id": rep["id"], "index": rep["index"], "startMs": rep["startMs"], "endMs": rep["endMs"],
                             "analyzed": analyzed, "formCoverage": coverage,
                             "issueBearing": analyzed and bool(matching), "issueTypes": issue_types,
                             "episodeIds": [ep["id"] for ep in matching]})

    analyzed_reps = sum(r["analyzed"] for r in summary_reps)
    issue_bearing = sum(r["issueBearing"] for r in summary_reps)
    episode_counts = {t: 0 for t in assessed_types}
    unassessed_counts = {t: 0 for t in ISSUE_TYPES if t not in assessed_types}
    for ep in episodes:
        counts = episode_counts if ep["assessed"] else unassessed_counts
        counts[ep["type"]] = counts.get(ep["type"], 0) + 1
    by_reason = {reason: 0 for reason in INTERRUPT_REASONS}
    by_reason["partial"] = 1
    session_ms = ended_ms - started_ms
    assessable_ms = session_ms * 0.875
    not_analyzed = ("no-validated-rules" if not assessed_types else "no-completed-reps" if not completed
                    else "low-coverage" if analyzed_reps == 0 else None)

    summary = {
        "schemaVersion": "set-summary-1.0.0", "setId": set_id, "setIndex": set_index,
        "sessionId": session_uid, "analyzerSessionId": session_uid, "exerciseId": exercise_id,
        "side": side, "view": "side", "analyzerVersion": "curl-1.1.0", "featureVersion": "1.2.0",
        "rulesVersion": "curl-rules-1.0.0", "feedbackVersion": "feedback-1.1.0", "mode": mode,
        "assessedRuleTypes": assessed_types, "startedMs": started_ms, "endedMs": ended_ms,
        "completedReps": len(completed),
        "interruptedAttempts": {"total": 1, "byReason": by_reason, "closedAtFinish": 0},
        "analyzedReps": analyzed_reps, "notAnalyzedReason": not_analyzed, "issueBearingReps": issue_bearing,
        "noIssueReps": analyzed_reps - issue_bearing,
        "noIssueFraction": (analyzed_reps - issue_bearing) / analyzed_reps if analyzed_reps else None,
        "noIssueFractionLabel": "detector summary",
        "trackingCoverage": {"assessableMs": assessable_ms, "sessionMs": session_ms, "fraction": assessable_ms / session_ms},
        "minFormCoverage": 0.8, "episodes": episodes, "episodeCountsByType": episode_counts,
        "unassessedEpisodeCountsByType": unassessed_counts, "reps": summary_reps,
        "cueLog": [{"atMs": 1500.0, "cueId": "positioning", "text": "Stand side-on.", "spoken": False}],
        "units": dict(SUMMARY_UNITS),
    }

    by_id = {r["id"]: r for r in summary_reps}
    reps = [{"clientRepId": rep["id"], "repIndex": rep["index"], "startMs": rep["startMs"], "endMs": rep["endMs"],
             "durationMs": rep["durationMs"], "minFlexionDeg": rep["minFlexionDeg"],
             "maxFlexionDeg": rep["maxFlexionDeg"], "romDeg": rep["romDeg"],
             "formCoverage": by_id[rep["id"]]["formCoverage"], "analyzed": by_id[rep["id"]]["analyzed"],
             "issueBearing": by_id[rep["id"]]["issueBearing"], "issueTypes": by_id[rep["id"]]["issueTypes"]}
            for rep in completed]
    form_events = [{"clientEventId": ep["id"], "issueType": ep["type"], "startMs": ep["startMs"], "endMs": ep["endMs"],
                    "peak": ep["peak"], "peakUnit": ep["unit"], "assessed": ep["assessed"],
                    "rulesVersion": ep["rulesVersion"],
                    "repClientIds": [rep["id"] for rep in completed if ep["id"] in by_id[rep["id"]]["episodeIds"]]}
                   for ep in episodes]

    ended = ended_at or datetime.now(UTC) - timedelta(minutes=1)
    started = ended - timedelta(milliseconds=ended_ms - started_ms)
    return {"clientSetId": set_id, "setIndex": set_index, "startedAt": iso(started), "endedAt": iso(ended),
            "summary": summary, "reps": reps, "formEvents": form_events}


@pytest.fixture
def set_payload():
    """Factory fixture: `set_payload(set_index=1, rep_count=3, mode='validated-only', ...)`."""
    return make_set_payload
