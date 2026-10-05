"""Workout persistence (GB 503 reliable saves, GB 504 owned history).

Every query filters by the authenticated owner; another user's workout is indistinguishable from a
missing one (404). Idempotency: unique constraints on client ids plus `payload_sha256`, the SHA-256
of the canonical JSON (sorted keys, no whitespace) of the validated set body. Writes to one workout
are serialized with `SELECT ... FOR UPDATE` on its row; a concurrent duplicate that still reaches
the unique constraints is re-read and compared, so a race never returns 500 or duplicates.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, insert, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Exercise, FormEvent, Rep, WorkoutSession, WorkoutSet, form_event_reps
from app.schemas.workouts import (
    FormEventOut,
    RepOut,
    SetDetail,
    Totals,
    WorkoutCreateIn,
    WorkoutDetail,
    WorkoutList,
    WorkoutListItem,
    WorkoutSetIn,
)
from app.services.errors import api_error, not_found, validation_error

LIST_LIMIT_MAX = 100


def _canonical_numbers(value: Any) -> Any:
    # 1.0 and 1 are the same JSON number; hash them the same (affects the hash only, not storage).
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, dict):
        return {key: _canonical_numbers(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_canonical_numbers(item) for item in value]
    return value


def payload_sha256(payload: WorkoutSetIn) -> str:
    body = _canonical_numbers(payload.model_dump(mode="json", by_alias=True))
    canonical = json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def parse_workout_id(raw: str) -> uuid.UUID:
    try:
        return uuid.UUID(raw)
    except (ValueError, AttributeError):
        raise not_found() from None


def _owned(db: Session, user_id: uuid.UUID, workout_id: uuid.UUID, *, lock: bool = False) -> WorkoutSession:
    query = select(WorkoutSession).where(WorkoutSession.id == workout_id, WorkoutSession.user_id == user_id)
    if lock:
        query = query.with_for_update()
    workout = db.scalar(query)
    if workout is None:
        raise not_found()
    return workout


def _conflict(message: str):
    return api_error(409, "conflict", message)


# ---------- exercises ----------

def list_exercises(db: Session) -> list[Exercise]:
    return list(db.scalars(select(Exercise).where(Exercise.active.is_(True)).order_by(Exercise.id)))


# ---------- create ----------

def _same_workout(existing: WorkoutSession, data: WorkoutCreateIn) -> bool:
    return existing.exercise_id == data.exercise_id and existing.started_at == data.started_at


def create_workout(db: Session, user_id: uuid.UUID, data: WorkoutCreateIn) -> tuple[WorkoutSession, bool]:
    """Returns (workout, created). Same owner + clientSessionId + content -> existing (idempotent)."""
    query = select(WorkoutSession).where(
        WorkoutSession.user_id == user_id, WorkoutSession.client_session_id == data.client_session_id
    )
    existing = db.scalar(query)
    if existing is None:
        exercise = db.get(Exercise, data.exercise_id)
        if exercise is None or not exercise.active:
            raise validation_error(["body", "exerciseId"], "Unknown exercise", "unknown_exercise")
        workout = WorkoutSession(
            id=uuid.uuid4(), user_id=user_id, client_session_id=data.client_session_id, exercise_id=data.exercise_id,
            status="open", started_at=data.started_at, timezone=data.timezone,
        )
        db.add(workout)
        try:
            db.commit()
            return workout, True
        except IntegrityError:
            db.rollback()
            existing = db.scalar(query)
            if existing is None:
                raise
    if not _same_workout(existing, data):
        raise _conflict("This clientSessionId was already used for a different workout.")
    db.commit()
    return existing, False


# ---------- submit a set ----------

def _find_set(db: Session, workout_id: uuid.UUID, client_set_id: str) -> WorkoutSet | None:
    return db.scalar(select(WorkoutSet).where(WorkoutSet.session_id == workout_id, WorkoutSet.client_set_id == client_set_id))


def _replay(existing: WorkoutSet, digest: str) -> WorkoutSet:
    if existing.payload_sha256 != digest:
        raise _conflict("This clientSetId was already saved with different content.")
    return existing


def submit_set(db: Session, user_id: uuid.UUID, workout_id: uuid.UUID, data: WorkoutSetIn) -> tuple[WorkoutSet, bool]:
    """Returns (set, created). Identical replay -> (existing, False), also after finalization."""
    digest = payload_sha256(data)
    workout = _owned(db, user_id, workout_id, lock=True)
    existing = _find_set(db, workout.id, data.client_set_id)
    if existing is not None:
        result = _replay(existing, digest)
        db.commit()
        return result, False
    if workout.status == "finalized":
        raise api_error(409, "workout-finalized", "This workout is finished; no more sets can be added.")
    summary = data.summary
    if summary.get("exerciseId") != workout.exercise_id:
        raise validation_error(["body", "summary", "exerciseId"], "summary.exerciseId must equal the workout's exerciseId")
    if db.scalar(select(WorkoutSet.id).where(WorkoutSet.session_id == workout.id, WorkoutSet.set_index == data.set_index)):
        raise _conflict("Another set of this workout already uses this setIndex.")

    coverage = summary["trackingCoverage"]
    workout_set = WorkoutSet(
        id=uuid.uuid4(), session_id=workout.id, client_set_id=data.client_set_id, set_index=data.set_index,
        side=summary["side"], view=summary["view"], mode=summary["mode"],
        started_at=data.started_at, ended_at=data.ended_at,
        summary_schema_version=summary["schemaVersion"], analyzer_version=summary["analyzerVersion"],
        feature_version=summary["featureVersion"], rules_version=summary["rulesVersion"],
        feedback_version=summary["feedbackVersion"],
        completed_reps=summary["completedReps"], analyzed_reps=summary["analyzedReps"],
        issue_bearing_reps=summary["issueBearingReps"], no_issue_reps=summary["noIssueReps"],
        no_issue_fraction=summary["noIssueFraction"], not_analyzed_reason=summary["notAnalyzedReason"],
        tracking_assessable_ms=coverage["assessableMs"], tracking_session_ms=coverage["sessionMs"],
        tracking_coverage=coverage["fraction"],
        interrupted_attempts=summary["interruptedAttempts"], episode_counts_by_type=summary["episodeCountsByType"],
        summary=summary, payload_sha256=digest,
    )
    rep_ids: dict[str, uuid.UUID] = {}
    reps = []
    for rep in data.reps:
        rep_ids[rep.client_rep_id] = uuid.uuid4()
        reps.append(Rep(
            id=rep_ids[rep.client_rep_id], set_id=workout_set.id, client_rep_id=rep.client_rep_id, rep_index=rep.rep_index,
            start_ms=rep.start_ms, end_ms=rep.end_ms, duration_ms=rep.duration_ms,
            min_flexion_deg=rep.min_flexion_deg, max_flexion_deg=rep.max_flexion_deg, rom_deg=rep.rom_deg,
            form_coverage=rep.form_coverage, analyzed=rep.analyzed, issue_bearing=rep.issue_bearing,
            issue_types=list(rep.issue_types),
        ))
    events, links = [], []
    for event in data.form_events:
        event_id = uuid.uuid4()
        events.append(FormEvent(
            id=event_id, set_id=workout_set.id, client_event_id=event.client_event_id, issue_type=event.issue_type,
            start_ms=event.start_ms, end_ms=event.end_ms, peak=event.peak, peak_unit=event.peak_unit,
            assessed=event.assessed, rules_version=event.rules_version,
        ))
        # Links only rows of this set: repClientIds were checked against this payload's reps.
        links.extend({"form_event_id": event_id, "rep_id": rep_ids[rid]} for rid in event.rep_client_ids)

    try:
        db.add(workout_set)
        db.flush()
        db.add_all(reps)
        db.add_all(events)
        db.flush()
        if links:
            db.execute(insert(form_event_reps), links)
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = _find_set(db, workout_id, data.client_set_id)
        if existing is None:
            raise _conflict("Another set of this workout already uses this setIndex.") from None
        result = _replay(existing, digest)
        db.commit()
        return result, False
    return workout_set, True


# ---------- finalize / edit ----------

def finalize_workout(db: Session, user_id: uuid.UUID, workout_id: uuid.UUID, ended_at: datetime) -> WorkoutSession:
    """Idempotent: an already finalized workout is returned unchanged."""
    workout = _owned(db, user_id, workout_id, lock=True)
    if workout.status == "finalized":
        db.commit()
        return workout
    if ended_at < workout.started_at:
        raise validation_error(["body", "endedAt"], "endedAt must be >= the workout's startedAt")
    last_set_end = db.scalar(select(func.max(WorkoutSet.ended_at)).where(WorkoutSet.session_id == workout.id))
    if last_set_end is not None and ended_at < last_set_end:
        raise validation_error(["body", "endedAt"], "endedAt must be >= every set's endedAt")
    workout.status = "finalized"
    workout.ended_at = ended_at
    workout.finalized_at = datetime.now(UTC)
    db.commit()
    return workout


def update_notes(db: Session, user_id: uuid.UUID, workout_id: uuid.UUID, notes: str | None) -> WorkoutSession:
    workout = _owned(db, user_id, workout_id, lock=True)
    workout.notes = notes
    db.commit()
    return workout


# ---------- read ----------

def _totals_query():
    return (
        select(
            WorkoutSet.session_id.label("session_id"),
            func.count(WorkoutSet.id).label("sets"),
            func.coalesce(func.sum(WorkoutSet.completed_reps), 0).label("completed_reps"),
            func.coalesce(func.sum(WorkoutSet.analyzed_reps), 0).label("analyzed_reps"),
            func.coalesce(func.sum(WorkoutSet.issue_bearing_reps), 0).label("issue_bearing_reps"),
        )
        .group_by(WorkoutSet.session_id)
        .subquery()
    )


def _totals(row: Any) -> Totals:
    return Totals(
        sets=row.sets or 0, completed_reps=row.completed_reps or 0,
        analyzed_reps=row.analyzed_reps or 0, issue_bearing_reps=row.issue_bearing_reps or 0,
    )


def _list_item(workout: WorkoutSession, totals: Totals) -> dict[str, Any]:
    return {
        "id": workout.id, "client_session_id": workout.client_session_id, "exercise_id": workout.exercise_id,
        "status": workout.status, "started_at": workout.started_at, "ended_at": workout.ended_at, "totals": totals,
    }


def list_workouts(db: Session, user_id: uuid.UUID, limit: int, before: datetime | None) -> WorkoutList:
    totals = _totals_query()
    query = (
        select(WorkoutSession, totals.c.sets, totals.c.completed_reps, totals.c.analyzed_reps, totals.c.issue_bearing_reps)
        .outerjoin(totals, totals.c.session_id == WorkoutSession.id)
        .where(WorkoutSession.user_id == user_id)
        .order_by(WorkoutSession.started_at.desc(), WorkoutSession.id.desc())
        .limit(limit + 1)
    )
    if before is not None:
        query = query.where(WorkoutSession.started_at < before)
    rows = db.execute(query).all()
    more = len(rows) > limit
    rows = rows[:limit]
    items = [WorkoutListItem(**_list_item(row[0], _totals(row))) for row in rows]
    return WorkoutList(items=items, next_before=rows[-1][0].started_at if more and rows else None)


def workout_detail(db: Session, user_id: uuid.UUID, workout_id: uuid.UUID) -> WorkoutDetail:
    workout = _owned(db, user_id, workout_id)
    return build_detail(db, workout)


def build_detail(db: Session, workout: WorkoutSession) -> WorkoutDetail:
    sets = list(db.scalars(select(WorkoutSet).where(WorkoutSet.session_id == workout.id).order_by(WorkoutSet.set_index)))
    details = build_set_details(db, sets)
    totals = Totals(
        sets=len(sets), completed_reps=sum(s.completed_reps for s in sets),
        analyzed_reps=sum(s.analyzed_reps for s in sets), issue_bearing_reps=sum(s.issue_bearing_reps for s in sets),
    )
    return WorkoutDetail(**_list_item(workout, totals), timezone=workout.timezone, notes=workout.notes, sets=details)


def build_set_details(db: Session, sets: list[WorkoutSet]) -> list[SetDetail]:
    if not sets:
        return []
    set_ids = [s.id for s in sets]
    reps_by_set: dict[uuid.UUID, list[Rep]] = defaultdict(list)
    for rep in db.scalars(select(Rep).where(Rep.set_id.in_(set_ids)).order_by(Rep.rep_index)):
        reps_by_set[rep.set_id].append(rep)
    events_by_set: dict[uuid.UUID, list[FormEvent]] = defaultdict(list)
    for event in db.scalars(
        select(FormEvent).where(FormEvent.set_id.in_(set_ids)).order_by(FormEvent.start_ms, FormEvent.client_event_id)
    ):
        events_by_set[event.set_id].append(event)
    linked: dict[uuid.UUID, list[str]] = defaultdict(list)
    link_rows = db.execute(
        select(form_event_reps.c.form_event_id, Rep.client_rep_id)
        .join(Rep, Rep.id == form_event_reps.c.rep_id)
        .where(Rep.set_id.in_(set_ids))
        .order_by(Rep.rep_index)
    )
    for event_id, client_rep_id in link_rows:
        linked[event_id].append(client_rep_id)

    columns = [name for name in SetDetail.model_fields if name not in ("reps", "form_events")]
    result = []
    for workout_set in sets:
        data = {name: getattr(workout_set, name) for name in columns}
        data["reps"] = [RepOut.model_validate(rep) for rep in reps_by_set[workout_set.id]]
        data["form_events"] = [
            FormEventOut(**{name: getattr(event, name) for name in FormEventOut.model_fields if name != "rep_client_ids"},
                         rep_client_ids=linked[event.id])
            for event in events_by_set[workout_set.id]
        ]
        result.append(SetDetail(**data))
    return result
