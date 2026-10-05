"""Observed workout analytics; fractions use explicit denominators, never form scores."""
from datetime import date, datetime
from uuid import UUID

from app.schemas.common import OutModel


class AnalyticsMetrics(OutModel):
    workouts: int = 0
    sets: int = 0
    completed_reps: int = 0
    analyzed_reps: int = 0
    issue_bearing_reps: int = 0
    no_issue_reps: int = 0
    no_issue_fraction: float | None = None
    assessed_issue_episodes: int = 0
    unassessed_issue_episodes: int = 0
    episode_counts_by_type: dict[str, int] = {}
    average_rom_deg: float | None = None
    rom_observed_reps: int = 0
    median_duration_ms: float | None = None
    duration_observed_reps: int = 0
    tracking_assessable_ms: float | None = None
    tracking_session_ms: float | None = None
    tracking_coverage: float | None = None
    coverage_known_sets: int = 0
    coverage_complete: bool = False


class AnalyticsConfiguration(OutModel):
    exercise_id: str
    view: str
    side: str
    analyzer_version: str
    feature_version: str
    rules_version: str
    summary_schema_version: str
    mode: str
    assessed_rule_types: list[str] | None
    min_form_coverage: float | None
    supported_view: bool


class AnalyticsPoint(OutModel):
    workout_id: UUID
    started_at: datetime
    local_date: date
    metrics: AnalyticsMetrics


class AnalyticsGroup(OutModel):
    id: str
    configuration: AnalyticsConfiguration
    comparison_eligible: bool
    metrics: AnalyticsMetrics
    points: list[AnalyticsPoint]


class AnalyticsRange(OutModel):
    start_date: date
    end_date: date
    timezone: str
    start_at: datetime
    end_before: datetime


class AnalyticsExcluded(OutModel):
    open_workouts: int
    empty_workouts: int


class AnalyticsResponse(OutModel):
    range: AnalyticsRange
    totals: AnalyticsMetrics
    groups: list[AnalyticsGroup]
    excluded: AnalyticsExcluded
    units: dict[str, str]
