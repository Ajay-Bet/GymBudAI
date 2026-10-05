"""Reject contradictory duplicate summary records before any persistence occurs."""
from __future__ import annotations

import copy

import pytest
from pydantic import ValidationError

from app.schemas.workouts import WorkoutSetIn
from tests.conftest import auth_header, create_workout, make_set_payload, register_user


def altered(path, value):
    payload = make_set_payload(mode="review")
    target = payload
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value(target[path[-1]]) if callable(value) else value
    return payload


DUPLICATE_RECORD_CHANGES = [
    (["summary", "reps"], []),
    (["summary", "episodes"], []),
    (["summary", "reps"], lambda rows: rows[:-1]),
    (["summary", "episodes"], lambda rows: rows[:-1]),
    (["summary", "reps"], lambda rows: rows + [copy.deepcopy(rows[0])]),
    (["summary", "episodes"], lambda rows: rows + [copy.deepcopy(rows[0])]),
    (["summary", "reps", 0, "id"], "different-rep"),
    (["summary", "reps", 0, "index"], 40),
    (["summary", "reps", 0, "startMs"], lambda n: n + 1),
    (["summary", "reps", 0, "endMs"], lambda n: n + 1),
    (["summary", "reps", 0, "formCoverage"], 0.1),
    (["summary", "reps", 0, "analyzed"], False),
    (["summary", "reps", 0, "issueBearing"], False),
    (["summary", "reps", 0, "issueTypes"], []),
    (["summary", "reps", 0, "issueTypes"], lambda xs: xs + xs),
    (["summary", "reps", 0, "episodeIds"], []),
    (["summary", "reps", 0, "episodeIds"], ["unknown-event"]),
    (["summary", "reps", 0, "episodeIds"], lambda xs: xs + xs),
    (["summary", "episodes", 0, "id"], "different-event"),
    (["summary", "episodes", 0, "type"], "incomplete-rom"),
    (["summary", "episodes", 0, "startMs"], lambda n: n + 1),
    (["summary", "episodes", 0, "endMs"], lambda n: n + 1),
    (["summary", "episodes", 0, "peak"], lambda n: n + 1),
    (["summary", "episodes", 0, "unit"], "radians"),
    (["summary", "episodes", 0, "assessed"], False),
    (["summary", "episodes", 0, "rulesVersion"], "curl-rules-9.0.0"),
    (["formEvents", 0, "repClientIds"], []),
    (["summary", "trackingCoverage", "fraction"], 0),
    (["summary", "trackingCoverage", "fraction"], None),
]


@pytest.mark.parametrize("path,value", DUPLICATE_RECORD_CHANGES)
def test_contradictory_summary_is_rejected(path, value):
    with pytest.raises(ValidationError):
        WorkoutSetIn.model_validate(altered(path, value))


@pytest.mark.parametrize("key", ["reps", "episodes"])
def test_summary_records_are_required(key):
    payload = make_set_payload()
    del payload["summary"][key]
    with pytest.raises(ValidationError):
        WorkoutSetIn.model_validate(payload)


@pytest.mark.parametrize("coverage", [
    {"assessableMs": 0, "sessionMs": 0, "fraction": 0},
    {"assessableMs": None, "sessionMs": 10, "fraction": 0},
    {"assessableMs": 0, "sessionMs": None, "fraction": 0},
    {"assessableMs": None, "sessionMs": None, "fraction": 1},
])
def test_unknown_or_zero_denominator_cannot_claim_fraction(coverage):
    with pytest.raises(ValidationError):
        WorkoutSetIn.model_validate(altered(["summary", "trackingCoverage"], coverage))


@pytest.mark.parametrize("coverage", [
    {"assessableMs": 0, "sessionMs": 0, "fraction": None},
    {"assessableMs": None, "sessionMs": 10, "fraction": None},
    {"assessableMs": 0, "sessionMs": None, "fraction": None},
    {"assessableMs": None, "sessionMs": None, "fraction": None},
    {"assessableMs": 0, "sessionMs": 10, "fraction": 0},
    {"assessableMs": 10, "sessionMs": 10, "fraction": 1},
    {"assessableMs": 1, "sessionMs": 3, "fraction": 1 / 3},
])
def test_consistent_coverage_preserves_sent_summary(coverage):
    payload = altered(["summary", "trackingCoverage"], coverage)
    validated = WorkoutSetIn.model_validate(payload)
    assert validated.summary == {key: value for key, value in payload["summary"].items() if key != "cueLog"}


def test_reordered_records_and_partial_attempt_episode_remain_valid():
    payload = make_set_payload(mode="review")
    payload["summary"]["reps"].reverse()
    payload["summary"]["episodes"].reverse()
    assert payload["summary"]["episodes"][0]["attemptIds"][0] not in {r["clientRepId"] for r in payload["reps"]}
    WorkoutSetIn.model_validate(payload)


@pytest.mark.parametrize("view", ["imaginary-view", "overhead"])
def test_exercise_unsupported_view_is_422_without_saved_rows(api, clean_db, view):
    user = register_user(api)
    headers = auth_header(user["accessToken"])
    workout = create_workout(api, user["accessToken"])
    payload = altered(["summary", "view"], view)
    response = api.post(f"/api/workouts/{workout['id']}/sets", json=payload, headers=headers)
    assert response.status_code == 422, response.text
    detail = api.get(f"/api/workouts/{workout['id']}", headers=headers)
    assert detail.json()["sets"] == []


def test_contradictory_summary_api_rejection_preserves_valid_retry(api, clean_db):
    user = register_user(api)
    headers = auth_header(user["accessToken"])
    workout = create_workout(api, user["accessToken"])
    payload = make_set_payload(mode="review")
    endpoint = f"/api/workouts/{workout['id']}/sets"
    bad = copy.deepcopy(payload)
    bad["summary"]["reps"] = []
    assert api.post(endpoint, json=bad, headers=headers).status_code == 422
    accepted = api.post(endpoint, json=payload, headers=headers)
    assert accepted.status_code == 201, accepted.text
    replay = api.post(endpoint, json=copy.deepcopy(payload), headers=headers)
    assert replay.status_code == 200
    assert replay.json() == accepted.json()


def test_linked_unassessed_episode_is_rejected_even_when_both_copies_match():
    payload = make_set_payload(mode="validated-only")
    rep = payload["summary"]["reps"][0]
    episode = payload["summary"]["episodes"][0]
    rep["episodeIds"] = [episode["id"]]
    rep["issueTypes"] = [episode["type"]]
    payload["reps"][0]["issueTypes"] = [episode["type"]]
    payload["formEvents"][0]["repClientIds"] = [rep["id"]]
    with pytest.raises(ValidationError):
        WorkoutSetIn.model_validate(payload)


def test_issue_types_must_match_linked_episode_even_when_both_copies_match():
    payload = make_set_payload(mode="review")
    for rep in (payload["summary"]["reps"][0], payload["reps"][0]):
        rep["issueTypes"] = ["incomplete-rom"]
    with pytest.raises(ValidationError):
        WorkoutSetIn.model_validate(payload)


def test_missing_episode_rules_version_uses_summary_fallback_without_rewriting():
    payload = make_set_payload(mode="review")
    del payload["summary"]["episodes"][0]["rulesVersion"]
    validated = WorkoutSetIn.model_validate(payload)
    assert "rulesVersion" not in validated.summary["episodes"][0]
