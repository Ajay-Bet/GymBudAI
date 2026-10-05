"""Bounded owned SQL aggregates, independent rep/event queries prevent join fanout."""
from __future__ import annotations

import hashlib
import json
from datetime import UTC, date, datetime, time, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.schemas.analytics import AnalyticsMetrics, AnalyticsResponse
from app.services.errors import api_error

MAX_DAYS = 366
MAX_WORKOUTS = 2000

# Only configuration is read from JSON; counts, durations and ROM use normalized rows.
# Unknown legacy configuration remains explicit null and is never comparison eligible.
_SCOPE = """
WITH eligible AS (
 SELECT w.id, w.exercise_id, w.started_at FROM workout_sessions w
 WHERE w.user_id=:owner AND w.started_at>=:start AND w.started_at<:end
 AND w.id=ANY(:eligible_ids) AND w.status='finalized' AND EXISTS (SELECT 1 FROM workout_sets s WHERE s.session_id=w.id)
), scoped AS (
 SELECT s.*, w.started_at AS workout_started_at, jsonb_build_object(
 'exerciseId',w.exercise_id,'view',s.view,'side',s.side,
 'analyzerVersion',s.analyzer_version,'featureVersion',s.feature_version,
 'rulesVersion',s.rules_version,'summarySchemaVersion',s.summary_schema_version,'mode',s.mode,
 'assessedRuleTypes', CASE WHEN jsonb_typeof(s.summary->'assessedRuleTypes')='array'
 AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(
 CASE WHEN jsonb_typeof(s.summary->'assessedRuleTypes')='array' THEN s.summary->'assessedRuleTypes' ELSE '[]'::jsonb END) rule
 WHERE jsonb_typeof(rule)<>'string') THEN
 (SELECT coalesce(jsonb_agg(rule ORDER BY rule),'[]'::jsonb) FROM (SELECT DISTINCT value AS rule
 FROM jsonb_array_elements_text(s.summary->'assessedRuleTypes')) types) ELSE NULL END,
 'minFormCoverage', CASE WHEN jsonb_typeof(s.summary->'minFormCoverage')='number' THEN
 CASE WHEN (s.summary->>'minFormCoverage')::numeric BETWEEN 0 AND 1
 THEN s.summary->'minFormCoverage' ELSE NULL END ELSE NULL END,
 'supportedView',s.view=ANY(e.supported_views)) AS config
 FROM workout_sets s JOIN eligible w ON w.id=s.session_id JOIN exercises e ON e.id=w.exercise_id
)
"""
# Empty arrays must stay [] rather than SQL NULL, to distinguish no assessed rules from unknown.
_GROUP = ' GROUP BY GROUPING SETS ((), (config), (config, session_id))'
_KEYS = 'config, session_id, grouping(config) AS all_configs, grouping(session_id) AS all_sessions'


def _key(row):
    config = None if row['all_configs'] else json.dumps(row['config'], sort_keys=True, separators=(',', ':'))
    return config, None if row['all_sessions'] else row['session_id']


def analytics(db: Session, owner: UUID, start_date: date, end_date: date, timezone: str) -> AnalyticsResponse:
    try:
        tz = ZoneInfo(timezone)
    except (ZoneInfoNotFoundError, ValueError):
        raise api_error(422, 'invalid-timezone', 'Choose a valid IANA timezone.') from None
    if not 1 <= (end_date-start_date).days+1 <= MAX_DAYS or end_date == date.max:
        raise api_error(422, 'invalid-date-range', 'Choose an inclusive date range of 1 to 366 days.')
    try:
        start = datetime.combine(start_date, time.min, tz).astimezone(UTC)
        end = datetime.combine(end_date+timedelta(days=1), time.min, tz).astimezone(UTC)
    except (OverflowError, ValueError):
        raise api_error(422, 'invalid-date-range', 'The selected dates cannot be represented in UTC.') from None
    params = {'owner': owner, 'start': start, 'end': end}
    eligible_ids = list(db.scalars(text("""SELECT w.id FROM workout_sessions w
 WHERE user_id=:owner AND started_at>=:start AND started_at<:end AND status='finalized'
 AND EXISTS (SELECT 1 FROM workout_sets s WHERE s.session_id=w.id)
 ORDER BY started_at, id LIMIT 2001"""), params))
    if len(eligible_ids) > MAX_WORKOUTS:
        raise api_error(422, 'range-too-large', 'More than 2000 workouts match. Choose a smaller date range.')
    params['eligible_ids'] = eligible_ids
    counts = db.execute(text("""SELECT
 count(*) FILTER (WHERE status='open') AS open_workouts,
 count(*) FILTER (WHERE status='finalized' AND NOT EXISTS
 (SELECT 1 FROM workout_sets s WHERE s.session_id=w.id)) AS empty_workouts
 FROM workout_sessions w WHERE user_id=:owner AND started_at>=:start AND started_at<:end"""), params).mappings().one()
    known = 'tracking_assessable_ms IS NOT NULL AND tracking_session_ms IS NOT NULL'
    set_sql = _SCOPE + f"""SELECT {_KEYS}, min(workout_started_at) AS started_at,
 count(DISTINCT session_id) AS workouts, count(*) AS sets,
 sum(completed_reps) AS completed_reps, sum(analyzed_reps) AS analyzed_reps,
 sum(issue_bearing_reps) AS issue_bearing_reps, sum(no_issue_reps) AS no_issue_reps,
 count(*) FILTER (WHERE {known}) AS coverage_known_sets,
 sum(tracking_assessable_ms) FILTER (WHERE {known}) AS tracking_assessable_ms,
 sum(tracking_session_ms) FILTER (WHERE {known}) AS tracking_session_ms
 FROM scoped""" + _GROUP
    metrics = {}
    configs = {}
    dates = {}
    for row in db.execute(text(set_sql), params).mappings():
        key = _key(row)
        values = {name: row[name] for name in ('workouts','sets','completed_reps','analyzed_reps',
                  'issue_bearing_reps','no_issue_reps','coverage_known_sets','tracking_assessable_ms','tracking_session_ms')}
        for name in ('completed_reps','analyzed_reps','issue_bearing_reps','no_issue_reps'):
            values[name] = values[name] or 0
        m = AnalyticsMetrics(**values)
        m.no_issue_fraction = m.no_issue_reps/m.analyzed_reps if m.analyzed_reps else None
        m.coverage_complete = m.sets > 0 and m.coverage_known_sets == m.sets
        m.tracking_coverage = m.tracking_assessable_ms/m.tracking_session_ms if m.tracking_session_ms else None
        metrics[key] = m
        if key[0] is not None:
            configs[key[0]] = row['config']
        if key[1] is not None:
            dates[key[1]] = row['started_at']
    rep_sql = _SCOPE + f"""SELECT {_KEYS}, avg(r.rom_deg) AS average_rom_deg,
 count(r.rom_deg) AS rom_observed_reps,
 percentile_cont(0.5) WITHIN GROUP (ORDER BY r.duration_ms) AS median_duration_ms,
 count(r.duration_ms) AS duration_observed_reps
 FROM scoped JOIN reps r ON r.set_id=scoped.id""" + _GROUP
    for row in db.execute(text(rep_sql), params).mappings():
        m = metrics.get(_key(row))
        if m is not None:
            for name in ('average_rom_deg','rom_observed_reps','median_duration_ms','duration_observed_reps'):
                setattr(m, name, row[name])
    event_sql = _SCOPE + f"""SELECT {_KEYS}, f.issue_type,
 count(*) FILTER (WHERE f.assessed) AS assessed,
 count(*) FILTER (WHERE NOT f.assessed) AS unassessed
 FROM scoped JOIN form_events f ON f.set_id=scoped.id
 GROUP BY GROUPING SETS ((f.issue_type), (config,f.issue_type), (config,session_id,f.issue_type))"""
    for row in db.execute(text(event_sql), params).mappings():
        m = metrics[_key(row)]
        m.assessed_issue_episodes += row['assessed']
        m.unassessed_issue_episodes += row['unassessed']
        if row['assessed']:
            m.episode_counts_by_type[row['issue_type']] = row['assessed']
    groups = []
    for key, config in sorted(configs.items()):
        points = [{'workoutId': workout_id, 'startedAt': dates[workout_id],
                   'localDate': dates[workout_id].astimezone(tz).date(), 'metrics': m}
                  for (group_key, workout_id), m in metrics.items() if group_key==key and workout_id is not None]
        points.sort(key=lambda p: (p['startedAt'], str(p['workoutId'])))
        groups.append({'id': hashlib.sha256(key.encode()).hexdigest(), 'configuration': config,
                       'comparisonEligible': config['supportedView'] and config['assessedRuleTypes'] is not None
                       and config['minFormCoverage'] is not None and len(points)>=2,
                       'metrics': metrics[(key,None)], 'points': points})
    return AnalyticsResponse(range={'startDate':start_date,'endDate':end_date,'timezone':timezone,
                                    'startAt':start,'endBefore':end},
        totals=metrics.get((None,None),AnalyticsMetrics()), groups=groups,
        excluded={'openWorkouts':counts['open_workouts'],'emptyWorkouts':counts['empty_workouts']},
        units={'averageRomDeg':'deg','medianDurationMs':'ms','trackingAssessableMs':'ms',
               'trackingSessionMs':'ms','noIssueFraction':'fraction (0-1)','trackingCoverage':'fraction (0-1)'})
