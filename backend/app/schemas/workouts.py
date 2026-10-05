"""Workout save/retrieve contract (GB 503, GB 504). See "Agreed persistence contract" in
docs/sprints/sprint-5-STATUS.md. `*Ms` values are ms on the FeatureFrame clock, relative to the set."""

from __future__ import annotations

import math
import uuid
from collections import Counter
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, StringConstraints, ValidationError, model_validator
from pydantic.alias_generators import to_camel

from app.schemas.common import (
    ClientId,
    Fraction,
    InModel,
    NonNegNumber,
    Number,
    OutModel,
    Slug,
    TimezoneName,
    VersionStr,
    WallTime,
    reject_non_finite,
)

SUMMARY_SCHEMA_VERSION = "set-summary-1.0.0"
MAX_REPS_PER_SET = 500
MAX_EVENTS_PER_SET = 2000
SET_BODY_MAX_BYTES = 512 * 1024

# Sprint 4 `UNITS` map of frontend/src/exercises/setSummary.js. The server reads these keys, so a
# summary must declare exactly these units for them (additional keys are allowed).
SUMMARY_UNITS: dict[str, str] = {
    "startedMs": "ms (FeatureFrame.timestampMs clock)",
    "endedMs": "ms (FeatureFrame.timestampMs clock)",
    "trackingCoverage.assessableMs": "ms",
    "trackingCoverage.sessionMs": "ms",
    "trackingCoverage.fraction": "fraction (0-1)",
    "reps.startMs": "ms",
    "reps.endMs": "ms",
    "reps.formCoverage": "fraction (0-1)",
    "episodes.startMs": "ms",
    "episodes.endMs": "ms",
    "episodes.peak": "deg (incomplete-rom: achieved ROM, deg)",
    "noIssueFraction": "fraction (0-1)",
    "completedReps": "count",
    "analyzedReps": "count",
    "issueBearingReps": "count",
    "noIssueReps": "count",
    "interruptedAttempts.total": "count",
    "interruptedAttempts.closedAtFinish": "count",
    "episodeCountsByType": "count",
    "unassessedEpisodeCountsByType": "count",
}

Count = Annotated[StrictInt, Field(ge=0)]
ShortText = Annotated[str, StringConstraints(min_length=1, max_length=64)]


# ---------- requests ----------

class WorkoutCreateIn(InModel):
    client_session_id: ClientId
    exercise_id: Slug
    started_at: WallTime
    timezone: TimezoneName | None = None


class WorkoutFinalizeIn(InModel):
    ended_at: WallTime


class WorkoutPatchIn(InModel):
    notes: Annotated[str, StringConstraints(max_length=1000)] | None


class _SummaryModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, validate_by_alias=True, validate_by_name=False, extra="allow")


class TrackingCoverageIn(_SummaryModel):
    assessable_ms: NonNegNumber | None
    session_ms: NonNegNumber | None
    fraction: Fraction | None


class InterruptedAttemptsIn(_SummaryModel):
    total: Count
    by_reason: dict[ShortText, Count]


class SummaryRepIn(_SummaryModel):
    id: ClientId
    index: Annotated[StrictInt, Field(ge=1)]
    start_ms: Number
    end_ms: Number
    form_coverage: Fraction | None
    analyzed: StrictBool
    issue_bearing: StrictBool
    issue_types: Annotated[list[Slug], Field(max_length=16)]
    episode_ids: Annotated[list[ClientId], Field(max_length=MAX_EVENTS_PER_SET)]


class SummaryEpisodeIn(_SummaryModel):
    id: ClientId
    type: Slug
    start_ms: Number
    end_ms: Number | None
    peak: Number | None
    unit: Annotated[str, StringConstraints(min_length=1, max_length=32)] | None
    assessed: StrictBool
    rules_version: VersionStr | None = None


class SummaryIn(_SummaryModel):
    """The keys of `set-summary-1.0.0` the server reads and stores in columns. Others are kept as sent."""

    schema_version: Literal["set-summary-1.0.0"]
    set_id: ClientId
    set_index: Annotated[StrictInt, Field(ge=1)] | None
    exercise_id: Slug
    side: Literal["left", "right"]
    view: Slug
    analyzer_version: VersionStr
    feature_version: VersionStr
    rules_version: VersionStr
    feedback_version: VersionStr | None
    mode: Literal["validated-only", "review"]
    assessed_rule_types: Annotated[list[ShortText], Field(max_length=64)] | None = None
    min_form_coverage: Fraction | None = None
    completed_reps: Count
    analyzed_reps: Count
    issue_bearing_reps: Count
    no_issue_reps: Count
    no_issue_fraction: Fraction | None
    not_analyzed_reason: ShortText | None
    tracking_coverage: TrackingCoverageIn
    interrupted_attempts: InterruptedAttemptsIn
    episode_counts_by_type: dict[ShortText, Count]
    units: dict[str, str]
    reps: Annotated[list[SummaryRepIn], Field(max_length=MAX_REPS_PER_SET)]
    episodes: Annotated[list[SummaryEpisodeIn], Field(max_length=MAX_EVENTS_PER_SET)]


class RepIn(InModel):
    client_rep_id: ClientId
    rep_index: Annotated[StrictInt, Field(ge=1)]
    start_ms: Number
    end_ms: Number
    duration_ms: NonNegNumber
    min_flexion_deg: Number | None
    max_flexion_deg: Number | None
    rom_deg: Number | None
    form_coverage: Fraction | None
    analyzed: StrictBool
    issue_bearing: StrictBool
    issue_types: Annotated[list[Slug], Field(max_length=16)]

    @model_validator(mode="after")
    def _consistent(self) -> RepIn:
        if self.end_ms < self.start_ms:
            raise ValueError("endMs must be >= startMs")
        if abs(self.duration_ms - (self.end_ms - self.start_ms)) > 1:
            raise ValueError("durationMs must equal endMs - startMs")
        if len(set(self.issue_types)) != len(self.issue_types):
            raise ValueError("issueTypes must be unique")
        if self.issue_bearing and not self.analyzed:
            raise ValueError("an issue-bearing rep must be analyzed")
        if self.issue_bearing and not self.issue_types:
            raise ValueError("an issue-bearing rep must list its issueTypes")
        return self


class FormEventIn(InModel):
    client_event_id: ClientId
    issue_type: Slug
    start_ms: Number
    end_ms: Number | None
    peak: Number | None
    peak_unit: Annotated[str, StringConstraints(min_length=1, max_length=32)] | None
    assessed: StrictBool
    rules_version: VersionStr
    rep_client_ids: Annotated[list[ClientId], Field(max_length=MAX_REPS_PER_SET)]

    @model_validator(mode="after")
    def _consistent(self) -> FormEventIn:
        if self.end_ms is not None and self.end_ms < self.start_ms:
            raise ValueError("endMs must be >= startMs")
        if len(set(self.rep_client_ids)) != len(self.rep_client_ids):
            raise ValueError("repClientIds must be unique")
        return self


class WorkoutSetIn(InModel):
    """One finished set with its reps and form-event episodes (one transaction)."""

    client_set_id: ClientId
    set_index: Annotated[StrictInt, Field(ge=1, le=10_000)]
    started_at: WallTime
    ended_at: WallTime
    summary: dict[str, Any]
    reps: Annotated[list[RepIn], Field(max_length=MAX_REPS_PER_SET)]
    form_events: Annotated[list[FormEventIn], Field(max_length=MAX_EVENTS_PER_SET)]

    @model_validator(mode="before")
    @classmethod
    def _drop_cue_log(cls, data: Any) -> Any:
        # The cue log stays on the device; it is neither stored nor part of the payload hash.
        if isinstance(data, dict) and isinstance(data.get("summary"), dict) and "cueLog" in data["summary"]:
            data = {**data, "summary": {k: v for k, v in data["summary"].items() if k != "cueLog"}}
        return data

    @model_validator(mode="after")
    def _consistent(self) -> WorkoutSetIn:
        reject_non_finite(self.summary)
        try:
            summary = SummaryIn.model_validate(self.summary)
        except ValidationError as exc:
            details = "; ".join(
                f"summary.{'.'.join(str(part) for part in error['loc'])}: {error['msg']}" for error in exc.errors()[:10]
            )
            raise ValueError(details) from None
        problems: list[str] = []
        if summary.set_id != self.client_set_id:
            problems.append("summary.setId must equal clientSetId")
        if summary.set_index is not None and summary.set_index != self.set_index:
            problems.append("summary.setIndex must equal setIndex")
        if self.ended_at < self.started_at:
            problems.append("endedAt must be >= startedAt")
        wrong_units = sorted(k for k, unit in SUMMARY_UNITS.items() if summary.units.get(k) != unit)
        if wrong_units:
            problems.append(f"summary.units must match the set-summary-1.0.0 units for: {', '.join(wrong_units)}")

        rep_ids = [rep.client_rep_id for rep in self.reps]
        if len(set(rep_ids)) != len(rep_ids):
            problems.append("reps[].clientRepId must be unique")
        if len({rep.rep_index for rep in self.reps}) != len(self.reps):
            problems.append("reps[].repIndex must be unique")
        event_ids = [event.client_event_id for event in self.form_events]
        if len(set(event_ids)) != len(event_ids):
            problems.append("formEvents[].clientEventId must be unique")
        known = set(rep_ids)
        if any(rid not in known for event in self.form_events for rid in event.rep_client_ids):
            problems.append("formEvents[].repClientIds must reference reps in this payload")

        # Validate the duplicated representation without rewriting the original summary:
        # valid historical payloads must retain their replay hash and unknown summary fields.
        summary_rep_ids = [rep.id for rep in summary.reps]
        summary_event_ids = [episode.id for episode in summary.episodes]
        if len(set(summary_rep_ids)) != len(summary_rep_ids):
            problems.append("summary.reps[].id must be unique")
        if len(set(summary_event_ids)) != len(summary_event_ids):
            problems.append("summary.episodes[].id must be unique")
        if set(summary_rep_ids) != known:
            problems.append("summary.reps must contain exactly the payload's reps")
        if set(summary_event_ids) != set(event_ids):
            problems.append("summary.episodes must contain exactly the payload's formEvents")
        reps_by_id = {rep.client_rep_id: rep for rep in self.reps}
        events_by_id = {event.client_event_id: event for event in self.form_events}
        episodes_by_id = {episode.id: episode for episode in summary.episodes}
        linked_reps: dict[str, set[str]] = {event_id: set() for event_id in event_ids}
        for rep in summary.reps:
            if len(set(rep.issue_types)) != len(rep.issue_types):
                problems.append(f"summary rep {rep.id}: issueTypes must be unique")
            if len(set(rep.episode_ids)) != len(rep.episode_ids):
                problems.append(f"summary rep {rep.id}: episodeIds must be unique")
            if not set(rep.episode_ids).issubset(events_by_id):
                problems.append(f"summary rep {rep.id}: episodeIds must reference episodes in this payload")
            linked_episodes = [episodes_by_id[event_id] for event_id in rep.episode_ids if event_id in episodes_by_id]
            if any(not episode.assessed for episode in linked_episodes):
                problems.append(f"summary rep {rep.id}: episodeIds must reference assessed episodes")
            if set(rep.issue_types) != {episode.type for episode in linked_episodes}:
                problems.append(f"summary rep {rep.id}: issueTypes must match linked episodes")
            if rep.issue_bearing != (rep.analyzed and bool(rep.episode_ids)):
                problems.append(f"summary rep {rep.id}: issueBearing must match analyzed episode evidence")
            for event_id in rep.episode_ids:
                if event_id in linked_reps:
                    linked_reps[event_id].add(rep.id)
            stored_rep = reps_by_id.get(rep.id)
            if stored_rep is not None:
                fields = ("start_ms", "end_ms", "form_coverage", "analyzed", "issue_bearing")
                if (rep.index != stored_rep.rep_index
                        or any(getattr(rep, field) != getattr(stored_rep, field) for field in fields)
                        or set(rep.issue_types) != set(stored_rep.issue_types)):
                    problems.append(f"summary rep {rep.id} must match its payload rep")
        for episode in summary.episodes:
            event = events_by_id.get(episode.id)
            if event is not None:
                fields = ("start_ms", "end_ms", "peak", "assessed")
                if (episode.type != event.issue_type or episode.unit != event.peak_unit
                        or (episode.rules_version or summary.rules_version) != event.rules_version
                        or any(getattr(episode, field) != getattr(event, field) for field in fields)):
                    problems.append(f"summary episode {episode.id} must match its payload formEvent")
                if linked_reps[episode.id] != set(event.rep_client_ids):
                    problems.append(f"formEvent {episode.id}: repClientIds must match summary reps' episodeIds")
        # Episode attemptIds may refer to partial attempts with no completed rep row;
        # only summary reps' explicit episodeIds define persisted event-to-rep links.

        analyzed = sum(rep.analyzed for rep in self.reps)
        issue_bearing = sum(rep.issue_bearing for rep in self.reps)
        if summary.completed_reps != len(self.reps):
            problems.append("summary.completedReps must equal the number of reps")
        if summary.analyzed_reps != analyzed:
            problems.append("summary.analyzedReps must equal the number of analyzed reps")
        if summary.issue_bearing_reps != issue_bearing:
            problems.append("summary.issueBearingReps must equal the number of issue-bearing reps")
        if summary.no_issue_reps != summary.analyzed_reps - summary.issue_bearing_reps:
            problems.append("summary.noIssueReps must equal analyzedReps - issueBearingReps")
        if summary.analyzed_reps == 0:
            if summary.no_issue_fraction is not None:
                problems.append("summary.noIssueFraction must be null when analyzedReps is 0")
        elif summary.no_issue_fraction is None or not math.isclose(
            summary.no_issue_fraction, summary.no_issue_reps / summary.analyzed_reps, abs_tol=1e-9
        ):
            problems.append("summary.noIssueFraction must equal noIssueReps / analyzedReps")
        coverage = summary.tracking_coverage
        if coverage.assessable_ms is not None and coverage.session_ms is not None and coverage.assessable_ms > coverage.session_ms:
            problems.append("summary.trackingCoverage.assessableMs must be <= sessionMs")
        if coverage.assessable_ms is not None and coverage.session_ms is not None and coverage.session_ms > 0:
            expected_fraction = coverage.assessable_ms / coverage.session_ms
            if coverage.fraction is None or not math.isclose(
                coverage.fraction, expected_fraction, rel_tol=1e-9, abs_tol=1e-9
            ):
                problems.append("summary.trackingCoverage.fraction must equal assessableMs / sessionMs")
        elif coverage.fraction is not None:
            problems.append("summary.trackingCoverage.fraction must be null when coverage cannot be calculated")
        assessed_counts = Counter(event.issue_type for event in self.form_events if event.assessed)
        for issue_type in set(assessed_counts) | set(summary.episode_counts_by_type):
            if assessed_counts.get(issue_type, 0) != summary.episode_counts_by_type.get(issue_type, 0):
                problems.append(f"summary.episodeCountsByType[{issue_type}] must equal the assessed formEvents of that type")
        if problems:
            raise ValueError("; ".join(problems))
        return self


# ---------- responses ----------

class ExerciseOut(OutModel):
    id: str
    name: str
    supported_views: list[str]
    analyzer_version: str


class Totals(OutModel):
    sets: int
    completed_reps: int
    analyzed_reps: int
    issue_bearing_reps: int


class RepOut(OutModel):
    id: uuid.UUID
    client_rep_id: str
    rep_index: int
    start_ms: float
    end_ms: float
    duration_ms: float
    min_flexion_deg: float | None
    max_flexion_deg: float | None
    rom_deg: float | None
    form_coverage: float | None
    analyzed: bool
    issue_bearing: bool
    issue_types: list[str]


class FormEventOut(OutModel):
    id: uuid.UUID
    client_event_id: str
    issue_type: str
    start_ms: float
    end_ms: float | None
    peak: float | None
    peak_unit: str | None
    assessed: bool
    rules_version: str
    rep_client_ids: list[str]


class SetDetail(OutModel):
    id: uuid.UUID
    client_set_id: str
    set_index: int
    side: str
    view: str
    mode: str
    started_at: datetime
    ended_at: datetime
    summary_schema_version: str
    analyzer_version: str
    feature_version: str
    rules_version: str
    feedback_version: str | None
    completed_reps: int
    analyzed_reps: int
    issue_bearing_reps: int
    no_issue_reps: int
    no_issue_fraction: float | None
    not_analyzed_reason: str | None
    tracking_assessable_ms: float | None
    tracking_session_ms: float | None
    tracking_coverage: float | None
    interrupted_attempts: dict[str, Any]
    episode_counts_by_type: dict[str, Any]
    summary: dict[str, Any]
    created_at: datetime
    reps: list[RepOut]
    form_events: list[FormEventOut]


class WorkoutListItem(OutModel):
    id: uuid.UUID
    client_session_id: str
    exercise_id: str
    status: Literal["open", "finalized"]
    started_at: datetime
    ended_at: datetime | None
    totals: Totals


class WorkoutDetail(WorkoutListItem):
    timezone: str | None
    notes: str | None
    sets: list[SetDetail]


class WorkoutList(OutModel):
    items: list[WorkoutListItem]
    next_before: datetime | None
    next_cursor: str | None = None
