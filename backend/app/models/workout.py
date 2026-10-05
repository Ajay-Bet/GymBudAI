"""Exercises, workout sessions, sets, reps and form-event episodes (GB 502)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    CHAR,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Double,
    ForeignKey,
    Index,
    Integer,
    Table,
    Text,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Exercise(Base):
    __tablename__ = "exercises"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    supported_views: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False)
    analyzer_version: Mapped[str] = mapped_column(Text, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))


class WorkoutSession(Base):
    __tablename__ = "workout_sessions"
    __table_args__ = (
        UniqueConstraint("user_id", "client_session_id"),
        CheckConstraint("status IN ('open', 'finalized')", name="status_allowed"),
        CheckConstraint("ended_at IS NULL OR ended_at >= started_at", name="ended_after_started"),
        CheckConstraint("notes IS NULL OR char_length(notes) <= 1000", name="notes_length"),
        Index("ix_workout_sessions_user_id_started_at", "user_id", "started_at"),
        Index("ix_workout_sessions_user_started_id", "user_id", "started_at", "id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    client_session_id: Mapped[str] = mapped_column(Text, nullable=False)
    exercise_id: Mapped[str] = mapped_column(Text, ForeignKey("exercises.id"), nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'open'"))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    timezone: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
    finalized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class WorkoutSet(Base):
    __tablename__ = "workout_sets"
    __table_args__ = (
        UniqueConstraint("session_id", "client_set_id"),
        UniqueConstraint("session_id", "set_index"),
        CheckConstraint("set_index >= 1", name="set_index_positive"),
        CheckConstraint("side IN ('left', 'right')", name="side_allowed"),
        CheckConstraint("mode IN ('validated-only', 'review')", name="mode_allowed"),
        CheckConstraint("ended_at >= started_at", name="ended_after_started"),
        CheckConstraint(
            "completed_reps >= 0 AND analyzed_reps >= 0 AND issue_bearing_reps >= 0 AND no_issue_reps >= 0",
            name="counts_non_negative",
        ),
        CheckConstraint("analyzed_reps <= completed_reps", name="analyzed_le_completed"),
        CheckConstraint("issue_bearing_reps <= analyzed_reps", name="issue_bearing_le_analyzed"),
        CheckConstraint("no_issue_reps = analyzed_reps - issue_bearing_reps", name="no_issue_consistent"),
        CheckConstraint(
            "no_issue_fraction IS NULL OR (no_issue_fraction >= 0 AND no_issue_fraction <= 1)",
            name="no_issue_fraction_range",
        ),
        CheckConstraint(
            "tracking_coverage IS NULL OR (tracking_coverage >= 0 AND tracking_coverage <= 1)",
            name="tracking_coverage_range",
        ),
        CheckConstraint(
            "tracking_assessable_ms IS NULL OR tracking_session_ms IS NULL OR tracking_assessable_ms <= tracking_session_ms",
            name="tracking_assessable_le_session",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("workout_sessions.id", ondelete="CASCADE"), nullable=False
    )
    client_set_id: Mapped[str] = mapped_column(Text, nullable=False)
    set_index: Mapped[int] = mapped_column(Integer, nullable=False)
    side: Mapped[str] = mapped_column(Text, nullable=False)
    view: Mapped[str] = mapped_column(Text, nullable=False)
    mode: Mapped[str] = mapped_column(Text, nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    summary_schema_version: Mapped[str] = mapped_column(Text, nullable=False)
    analyzer_version: Mapped[str] = mapped_column(Text, nullable=False)
    feature_version: Mapped[str] = mapped_column(Text, nullable=False)
    rules_version: Mapped[str] = mapped_column(Text, nullable=False)
    feedback_version: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_reps: Mapped[int] = mapped_column(Integer, nullable=False)
    analyzed_reps: Mapped[int] = mapped_column(Integer, nullable=False)
    issue_bearing_reps: Mapped[int] = mapped_column(Integer, nullable=False)
    no_issue_reps: Mapped[int] = mapped_column(Integer, nullable=False)
    no_issue_fraction: Mapped[float | None] = mapped_column(Double, nullable=True)
    not_analyzed_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    tracking_assessable_ms: Mapped[float | None] = mapped_column(Double, nullable=True)
    tracking_session_ms: Mapped[float | None] = mapped_column(Double, nullable=True)
    tracking_coverage: Mapped[float | None] = mapped_column(Double, nullable=True)
    interrupted_attempts: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    episode_counts_by_type: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    summary: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    payload_sha256: Mapped[str] = mapped_column(CHAR(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class Rep(Base):
    __tablename__ = "reps"
    __table_args__ = (
        UniqueConstraint("set_id", "client_rep_id"),
        UniqueConstraint("set_id", "rep_index"),
        CheckConstraint("rep_index >= 1", name="rep_index_positive"),
        CheckConstraint("end_ms >= start_ms", name="end_after_start"),
        CheckConstraint("duration_ms >= 0", name="duration_non_negative"),
        CheckConstraint("form_coverage IS NULL OR (form_coverage >= 0 AND form_coverage <= 1)", name="form_coverage_range"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    set_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("workout_sets.id", ondelete="CASCADE"), nullable=False)
    client_rep_id: Mapped[str] = mapped_column(Text, nullable=False)
    rep_index: Mapped[int] = mapped_column(Integer, nullable=False)
    start_ms: Mapped[float] = mapped_column(Double, nullable=False)
    end_ms: Mapped[float] = mapped_column(Double, nullable=False)
    duration_ms: Mapped[float] = mapped_column(Double, nullable=False)
    min_flexion_deg: Mapped[float | None] = mapped_column(Double, nullable=True)
    max_flexion_deg: Mapped[float | None] = mapped_column(Double, nullable=True)
    rom_deg: Mapped[float | None] = mapped_column(Double, nullable=True)
    form_coverage: Mapped[float | None] = mapped_column(Double, nullable=True)
    analyzed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    issue_bearing: Mapped[bool] = mapped_column(Boolean, nullable=False)
    issue_types: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False)


class FormEvent(Base):
    """One continuous issue episode (not one frame)."""

    __tablename__ = "form_events"
    __table_args__ = (
        UniqueConstraint("set_id", "client_event_id"),
        CheckConstraint("end_ms IS NULL OR end_ms >= start_ms", name="end_after_start"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    set_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("workout_sets.id", ondelete="CASCADE"), nullable=False)
    client_event_id: Mapped[str] = mapped_column(Text, nullable=False)
    issue_type: Mapped[str] = mapped_column(Text, nullable=False)
    start_ms: Mapped[float] = mapped_column(Double, nullable=False)
    end_ms: Mapped[float | None] = mapped_column(Double, nullable=True)
    peak: Mapped[float | None] = mapped_column(Double, nullable=True)
    peak_unit: Mapped[str | None] = mapped_column(Text, nullable=True)
    assessed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    rules_version: Mapped[str] = mapped_column(Text, nullable=False)


form_event_reps = Table(
    "form_event_reps",
    Base.metadata,
    Column("form_event_id", Uuid, ForeignKey("form_events.id", ondelete="CASCADE"), primary_key=True),
    Column("rep_id", Uuid, ForeignKey("reps.id", ondelete="CASCADE"), primary_key=True),
    Index("ix_form_event_reps_rep_id", "rep_id"),
)
