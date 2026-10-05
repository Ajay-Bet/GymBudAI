"""Local synthetic 1000-workout/3000-rep baseline; does not assert staging latency."""
from __future__ import annotations

import json
import platform
import time
import uuid

from sqlalchemy import event, text

from tests.conftest import auth_header, register_user
from tests.test_analytics import RANGE, analytics, saved


def seed_large_history(connection, source_id: str, count: int = 1000, namespace: str | None = None):
    """Clone one synthetic 3-rep workout within caller-owned transaction.

    No schema reset, commit or credential reads. `count` includes the source workout. The
    namespace keeps temporary IDs unique; suitable for a staging test transaction rollback.
    Copies normalized rows, never camera records. Source must have one set and three reps.
    """
    ns = namespace or uuid.uuid4().hex
    connection.execute(text("""
        INSERT INTO workout_sessions
          (id,user_id,client_session_id,exercise_id,status,started_at,ended_at,finalized_at)
        SELECT md5(:ns || '-workout-' || n)::uuid,user_id,:ns || '-client-' || n,
               exercise_id,status,started_at,ended_at,finalized_at
        FROM workout_sessions CROSS JOIN generate_series(1,:copies) AS n WHERE id=:source
    """), {"ns": ns, "copies": count - 1, "source": source_id})
    connection.execute(text("""
        INSERT INTO workout_sets
          (id,session_id,client_set_id,set_index,side,view,mode,started_at,ended_at,
           summary_schema_version,analyzer_version,feature_version,rules_version,feedback_version,
           completed_reps,analyzed_reps,issue_bearing_reps,no_issue_reps,no_issue_fraction,
           not_analyzed_reason,tracking_assessable_ms,tracking_session_ms,tracking_coverage,
           interrupted_attempts,episode_counts_by_type,summary,payload_sha256)
        SELECT md5(:ns || '-set-' || n)::uuid,md5(:ns || '-workout-' || n)::uuid,
               client_set_id,set_index,side,view,mode,started_at,ended_at,
               summary_schema_version,analyzer_version,feature_version,rules_version,feedback_version,
               completed_reps,analyzed_reps,issue_bearing_reps,no_issue_reps,no_issue_fraction,
               not_analyzed_reason,tracking_assessable_ms,tracking_session_ms,tracking_coverage,
               interrupted_attempts,episode_counts_by_type,summary,payload_sha256
        FROM workout_sets CROSS JOIN generate_series(1,:copies) AS n WHERE session_id=:source
    """), {"ns": ns, "copies": count - 1, "source": source_id})
    connection.execute(text("""
        INSERT INTO reps
          (id,set_id,client_rep_id,rep_index,start_ms,end_ms,duration_ms,min_flexion_deg,
           max_flexion_deg,rom_deg,form_coverage,analyzed,issue_bearing,issue_types)
        SELECT md5(:ns || '-rep-' || n || '-' || rep_index)::uuid,md5(:ns || '-set-' || n)::uuid,
               client_rep_id,rep_index,start_ms,end_ms,duration_ms,min_flexion_deg,
               max_flexion_deg,rom_deg,form_coverage,analyzed,issue_bearing,issue_types
        FROM reps JOIN workout_sets ON workout_sets.id=reps.set_id
             CROSS JOIN generate_series(1,:copies) AS n WHERE workout_sets.session_id=:source
    """), {"ns": ns, "copies": count - 1, "source": source_id})
    return ns


def test_large_owned_history_baseline_and_explain(api, clean_db):
    owner = register_user(api)
    token = owner["accessToken"]
    source = saved(api, token, mode="validated-only")
    saved(api, register_user(api)["accessToken"], mode="review")
    with clean_db.begin() as connection:
        seed_large_history(connection, source["id"])
        connection.execute(text("ANALYZE workout_sessions"))
        connection.execute(text("ANALYZE workout_sets"))
        connection.execute(text("ANALYZE reps"))
        version = connection.execute(text("SELECT version()" )).scalar()
        counts = connection.execute(text("""SELECT
            (SELECT count(*) FROM workout_sessions WHERE user_id=:owner),
            (SELECT count(*) FROM reps JOIN workout_sets ON workout_sets.id=reps.set_id
             JOIN workout_sessions ON workout_sessions.id=workout_sets.session_id WHERE user_id=:owner)
        """), {"owner": owner["user"]["id"]}).one()
        plan = connection.execute(text("""EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
            SELECT id,started_at FROM workout_sessions WHERE user_id=:owner
            AND started_at >= '2025-10-01' AND started_at < '2025-11-01'
            ORDER BY started_at DESC,id DESC LIMIT 20
        """), {"owner": owner["user"]["id"]}).scalar()
    assert tuple(counts) == (1000, 3000)
    assert "ix_workout_sessions_user_started_id" in json.dumps(plan)
    captured = []
    def capture_sql(conn, cursor, statement, parameters, context, executemany):
        if "percentile_cont" in statement:
            captured.append((statement, parameters))
    event.listen(clean_db, "before_cursor_execute", capture_sql)
    timings = {"historyMs": [], "summaryMs": []}
    for _ in range(3):
        start = time.perf_counter()
        page = api.get("/api/workouts", params={"limit": 20}, headers=auth_header(token))
        timings["historyMs"].append((time.perf_counter() - start) * 1000)
        assert page.status_code == 200
        assert len(page.json()["items"]) == 20
        start = time.perf_counter()
        result = analytics(api, token)
        timings["summaryMs"].append((time.perf_counter() - start) * 1000)
        assert result["totals"]["workouts"] == 1000
        assert result["totals"]["completedReps"] == 3000
        assert result["totals"]["analyzedReps"] == 0
        assert result["totals"]["noIssueFraction"] is None
    event.remove(clean_db, "before_cursor_execute", capture_sql)
    with clean_db.connect() as connection:
        statement, parameters = captured[-1]
        aggregate_plan = connection.exec_driver_sql("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + statement, parameters).scalar()
    print("\nS6_LOCAL_BASELINE " + json.dumps({"platform": platform.platform(), "postgres": version,
          "workouts": 1000, "reps": 3000, "transport": "FastAPI TestClient + local TCP PostgreSQL",
          "timings": timings, "historyPlan": plan, "aggregatePlan": aggregate_plan}))


def test_over_cap_range_is_rejected_instead_of_truncated(api, clean_db):
    token = register_user(api)["accessToken"]
    source = saved(api, token, mode="validated-only")
    with clean_db.begin() as connection:
        seed_large_history(connection, source["id"], count=2001)
    response = api.get("/api/analytics/me", params=RANGE, headers=auth_header(token))
    assert response.status_code == 422, response.text
    assert response.json()["detail"]["code"] == "range-too-large"
