"""Sprint 6 independent synthetic arithmetic, ownership, local-day and cursor checks."""
from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text

from tests.conftest import auth_header, create_workout, iso, make_set_payload, register_user

RANGE = {"startDate": "2025-10-01", "endDate": "2025-10-31", "timezone": "UTC"}


def saved(api, token, started="2025-10-10T12:00:00Z", mode="review", empty=False, finalize=True, mutate=None):
    start = datetime.fromisoformat(started.replace("Z", "+00:00"))
    workout = create_workout(api, token, started_at=start)
    ended = start + timedelta(minutes=5)
    if not empty:
        payload = make_set_payload(mode=mode, ended_at=ended)
        if mutate:
            mutate(payload)
        response = api.post(f"/api/workouts/{workout['id']}/sets", json=payload, headers=auth_header(token))
        assert response.status_code == 201, response.text
    if finalize:
        response = api.post(f"/api/workouts/{workout['id']}/finalize", json={"endedAt": iso(ended)}, headers=auth_header(token))
        assert response.status_code == 200, response.text
    return workout


def analytics(api, token, **params):
    response = api.get("/api/analytics/me", params=RANGE | params, headers=auth_header(token))
    assert response.status_code == 200, response.text
    return response.json()


def measured(payload):
    # Independent observed values: 10, missing, 30 degrees; denominator is two.
    for rep, rom in zip(payload["reps"], [10, None, 30], strict=True):
        rep["romDeg"] = rom


def overlapping(payload):
    measured(payload)
    episode = deepcopy(payload["summary"]["episodes"][0])
    episode.update(id=episode["id"] + "-overlap", type="upper-arm-drift")
    payload["summary"]["episodes"].append(episode)
    payload["summary"]["episodeCountsByType"]["upper-arm-drift"] += 1
    first = payload["summary"]["reps"][0]
    first["episodeIds"].append(episode["id"])
    first["issueTypes"].append("upper-arm-drift")
    payload["reps"][0]["issueTypes"] = list(first["issueTypes"])
    event = deepcopy(payload["formEvents"][0])
    event.update(clientEventId=episode["id"], issueType="upper-arm-drift")
    payload["formEvents"].append(event)


def test_hand_calculated_seed_counts_nulls_overlap_and_exclusions(api):
    token = register_user(api)["accessToken"]
    saved(api, token, mutate=overlapping)
    saved(api, token, started="2025-10-11T12:00:00Z", mutate=measured)
    def unknown_tracking(payload):
        measured(payload)
        payload["summary"]["trackingCoverage"] = {"assessableMs": None, "sessionMs": None, "fraction": None}
    saved(api, token, started="2025-10-12T12:00:00Z", mode="validated-only", mutate=unknown_tracking)
    saved(api, token, empty=True)
    saved(api, token, finalize=False)
    other = register_user(api)["accessToken"]
    saved(api, other, mutate=overlapping)
    data = analytics(api, token)
    totals = data["totals"]
    for key, expected in {"workouts": 3, "sets": 3, "completedReps": 9, "analyzedReps": 4,
                          "issueBearingReps": 2, "noIssueReps": 2, "assessedIssueEpisodes": 7,
                          "unassessedIssueEpisodes": 3, "romObservedReps": 6, "durationObservedReps": 9,
                          "coverageKnownSets": 2, "coverageComplete": False}.items():
        assert totals[key] == expected, key
    assert totals["noIssueFraction"] == .5  # 2 / 4, not 2 / 9 or sum of episode counts.
    assert totals["averageRomDeg"] == 20  # (10+30)*3 / 6; missing values excluded.
    assert totals["medianDurationMs"] == 2000.25
    assert totals["trackingCoverage"] == pytest.approx(.875)
    assert totals["trackingSessionMs"] == pytest.approx(18801.5)
    assert totals["trackingAssessableMs"] == pytest.approx(16451.3125)
    assert totals["episodeCountsByType"] == {"torso-swing": 2, "upper-arm-drift": 3, "incomplete-rom": 2}
    assert data["excluded"] == {"openWorkouts": 1, "emptyWorkouts": 1}
    assert sorted(len(group["points"]) for group in data["groups"]) == [1, 2]
    assert sorted(group["comparisonEligible"] for group in data["groups"]) == [False, True]


def test_empty_and_zero_rep_data_are_unavailable_not_zero(api):
    token = register_user(api)["accessToken"]
    data = analytics(api, token)
    assert data["groups"] == []
    for key in ["averageRomDeg", "medianDurationMs", "noIssueFraction", "trackingCoverage"]:
        assert data["totals"][key] is None
    def no_reps(payload):
        zero = make_set_payload(mode="review", rep_count=0, ended_at=datetime.fromisoformat(payload["endedAt"].replace("Z", "+00:00")))
        payload.clear()
        payload.update(zero)
    saved(api, token, mutate=no_reps)
    data = analytics(api, token)
    assert data["totals"]["sets"] == 1
    assert data["totals"]["completedReps"] == 0
    assert data["totals"]["averageRomDeg"] is None
    assert data["totals"]["medianDurationMs"] is None


@pytest.mark.parametrize("params", [
    {"startDate": "bad"}, {"endDate": "2025-09-01"}, {"timezone": "Mars/Base"},
    {"startDate": "2020-01-01", "endDate": "2025-01-01"},
    {"startDate": "9999-12-31", "endDate": "9999-12-31"},
    {"startDate": "0001-01-01", "endDate": "0001-01-01", "timezone": "Asia/Kolkata"},
])
def test_invalid_and_bounded_ranges(api, params):
    token = register_user(api)["accessToken"]
    response = api.get("/api/analytics/me", params=RANGE | params, headers=auth_header(token))
    assert response.status_code == 422, response.text


def test_analytics_requires_authentication(api):
    assert api.get("/api/analytics/me", params=RANGE).status_code == 401


@pytest.mark.parametrize(("day", "before", "inside", "after", "hours"), [
    ("2025-03-09", "2025-03-09T04:59:00Z", "2025-03-09T07:30:00Z", "2025-03-10T04:00:00Z", 23),
    ("2025-11-02", "2025-11-02T03:59:00Z", "2025-11-02T06:30:00Z", "2025-11-03T05:00:00Z", 25),
])
def test_local_day_dst_bounds_and_started_at_membership(api, day, before, inside, after, hours):
    token = register_user(api)["accessToken"]
    for value in [before, inside, after]:
        saved(api, token, started=value)
    data = analytics(api, token, startDate=day, endDate=day, timezone="America/New_York")
    assert data["totals"]["workouts"] == 1
    assert data["groups"][0]["points"][0]["localDate"] == day
    start = datetime.fromisoformat(data["range"]["startAt"].replace("Z", "+00:00"))
    end = datetime.fromisoformat(data["range"]["endBefore"].replace("Z", "+00:00"))
    assert (end - start).total_seconds() == hours * 3600


def test_comparability_separates_all_stored_configuration_fields(api, clean_db):
    token = register_user(api)["accessToken"]
    saved(api, token)
    for key, value in [("analyzerVersion", "curl-2"), ("featureVersion", "2"), ("rulesVersion", "rules-2"),
                       ("minFormCoverage", .9), ("side", "right")]:
        def change(payload, key=key, value=value):
            payload["summary"][key] = value
            if key == "rulesVersion":
                for ep in payload["summary"]["episodes"]:
                    ep["rulesVersion"] = value
                for ep in payload["formEvents"]:
                    ep["rulesVersion"] = value
        saved(api, token, mutate=change)
    legacy = saved(api, token)
    # Explicit synthetic legacy persisted record: API correctly rejects unsupported new views.
    with clean_db.begin() as conn:
        conn.execute(text("UPDATE workout_sets SET view='front' WHERE session_id=:id"), {"id": legacy["id"]})
    data = analytics(api, token)
    assert len(data["groups"]) == 7
    unsupported = [g for g in data["groups"] if g["configuration"]["view"] == "front"]
    assert len(unsupported) == 1
    assert unsupported[0]["configuration"]["supportedView"] is False
    assert unsupported[0]["comparisonEligible"] is False


def test_tied_timestamp_cursor_stable_owned_pagination(api):
    token = register_user(api)["accessToken"]
    ids = [saved(api, token, empty=True)["id"] for _ in range(7)]
    saved(api, register_user(api)["accessToken"], empty=True)
    seen = []
    params = {"limit": 2}
    while True:
        response = api.get("/api/workouts", params=params, headers=auth_header(token))
        assert response.status_code == 200, response.text
        page = response.json()
        seen.extend(row["id"] for row in page["items"])
        if not page["nextCursor"]:
            break
        params = {"limit": 2, "cursor": page["nextCursor"]}
    assert seen == sorted(ids, reverse=True)
    assert len(set(seen)) == 7
    assert api.get("/api/workouts", params={"cursor": "garbage"}, headers=auth_header(token)).status_code == 422
    assert api.get("/api/workouts", params={"cursor": "garbage", "before": "2025-10-01T00:00:00Z"}, headers=auth_header(token)).status_code == 422


def test_workout_day_uses_session_start_even_when_set_on_following_day(api):
    token = register_user(api)["accessToken"]
    workout = create_workout(api, token, started_at=datetime(2025, 10, 10, 23, 59, tzinfo=UTC))
    ended = datetime(2025, 10, 11, 0, 5, tzinfo=UTC)
    payload = make_set_payload(mode="review", ended_at=ended)
    response = api.post(f"/api/workouts/{workout['id']}/sets", json=payload, headers=auth_header(token))
    assert response.status_code == 201, response.text
    assert api.post(f"/api/workouts/{workout['id']}/finalize", json={"endedAt": iso(ended)}, headers=auth_header(token)).status_code == 200
    data = analytics(api, token, startDate="2025-10-10", endDate="2025-10-10")
    assert data["totals"]["workouts"] == 1
    assert data["groups"][0]["points"][0]["localDate"] == "2025-10-10"
    assert analytics(api, token, startDate="2025-10-11", endDate="2025-10-11")["totals"]["workouts"] == 0

@pytest.mark.parametrize(("key", "value"), [("minFormCoverage", {}), ("minFormCoverage", 1.5), ("minFormCoverage", -1),
                                               ("assessedRuleTypes", 42), ("assessedRuleTypes", [42])])
def test_new_malformed_configuration_rejected(api, key, value):
    token = register_user(api)["accessToken"]
    workout = create_workout(api, token)
    payload = make_set_payload(mode="review")
    payload["summary"][key] = value
    response = api.post(f"/api/workouts/{workout['id']}/sets", json=payload, headers=auth_header(token))
    assert response.status_code == 422, response.text


@pytest.mark.parametrize(("key", "value"), [("minFormCoverage", {}), ("minFormCoverage", 1.5),
                                               ("assessedRuleTypes", 42), ("assessedRuleTypes", [42])])
def test_legacy_malformed_configuration_abstains_without_server_failure(api, clean_db, key, value):
    import json
    token = register_user(api)["accessToken"]
    workout = saved(api, token)
    with clean_db.begin() as conn:
        conn.execute(text("UPDATE workout_sets SET summary=jsonb_set(summary,CAST(:path AS text[]),CAST(:value AS jsonb)) WHERE session_id=:id"),
                     {"path": "{" + key + "}", "value": json.dumps(value), "id": workout["id"]})
    data = analytics(api, token)
    assert data["totals"]["completedReps"] == 3
    assert data["groups"][0]["configuration"][key] is None
    assert data["groups"][0]["comparisonEligible"] is False


def test_weighted_tracking_uses_time_sums_not_mean_of_set_percentages(api):
    token = register_user(api)["accessToken"]
    for a, total in [(100, 1000), (900, 3000)]:
        def change(payload, a=a, total=total):
            payload["summary"]["trackingCoverage"] = {"assessableMs": a, "sessionMs": total, "fraction": a / total}
        saved(api, token, mutate=change)
    data = analytics(api, token)
    assert data["totals"]["trackingCoverage"] == .25  # 1000/4000; mean(.1,.3)=.2 is wrong.
    assert data["totals"]["coverageComplete"] is True


def test_median_is_over_all_normalized_observed_reps(api, clean_db):
    token = register_user(api)["accessToken"]
    for durations in [(1000, 3000, 7000), (2000, 4000, 8000)]:
        workout = saved(api, token)
        # Explicit synthetic legacy normalized data: exercises aggregate-row median, not median-of-medians.
        with clean_db.begin() as conn:
            for index, duration in enumerate(durations, start=1):
                conn.execute(text("UPDATE reps SET duration_ms=:duration,end_ms=start_ms+:duration WHERE rep_index=:index AND set_id IN (SELECT id FROM workout_sets WHERE session_id=:id)"),
                             {"duration": duration, "index": index, "id": workout["id"]})
    assert analytics(api, token)["totals"]["medianDurationMs"] == 3500  # middle observed durations3000,4000.


def test_rule_order_does_not_split_compatible_configuration(api):
    token = register_user(api)["accessToken"]
    saved(api, token)
    def reverse_rules(payload):
        payload["summary"]["assessedRuleTypes"].reverse()
    saved(api, token, mutate=reverse_rules)
    data = analytics(api, token)
    assert len(data["groups"]) == 1
    assert data["groups"][0]["comparisonEligible"] is True
