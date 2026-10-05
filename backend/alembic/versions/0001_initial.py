"""Initial schema (Sprint 5, GB 502): accounts, sessions, exercises, workouts, sets, reps, form events.

Seeds the `dumbbell-curl` exercise. PostgreSQL only.

Revision ID: 0001_initial
Revises:
Create Date: 2026-10-04
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0001_initial'
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('exercises',
    sa.Column('id', sa.Text(), nullable=False),
    sa.Column('name', sa.Text(), nullable=False),
    sa.Column('supported_views', postgresql.ARRAY(sa.Text()), nullable=False),
    sa.Column('analyzer_version', sa.Text(), nullable=False),
    sa.Column('active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_exercises'))
    )
    op.create_table('users',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('email', sa.Text(), nullable=False),
    sa.Column('password_hash', sa.Text(), nullable=False),
    sa.Column('display_name', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('email = lower(email)', name=op.f('ck_users_email_lower_case')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_users')),
    sa.UniqueConstraint('email', name=op.f('uq_users_email'))
    )
    op.create_table('auth_sessions',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('token_hash', sa.CHAR(length=64), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_auth_sessions_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_auth_sessions')),
    sa.UniqueConstraint('token_hash', name=op.f('uq_auth_sessions_token_hash'))
    )
    op.create_index('ix_auth_sessions_user_id', 'auth_sessions', ['user_id'], unique=False)
    op.create_table('workout_sessions',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('client_session_id', sa.Text(), nullable=False),
    sa.Column('exercise_id', sa.Text(), nullable=False),
    sa.Column('status', sa.Text(), server_default=sa.text("'open'"), nullable=False),
    sa.Column('started_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('ended_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('timezone', sa.Text(), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('finalized_at', sa.DateTime(timezone=True), nullable=True),
    sa.CheckConstraint("status IN ('open', 'finalized')", name=op.f('ck_workout_sessions_status_allowed')),
    sa.CheckConstraint('ended_at IS NULL OR ended_at >= started_at', name=op.f('ck_workout_sessions_ended_after_started')),
    sa.CheckConstraint('notes IS NULL OR char_length(notes) <= 1000', name=op.f('ck_workout_sessions_notes_length')),
    sa.ForeignKeyConstraint(['exercise_id'], ['exercises.id'], name=op.f('fk_workout_sessions_exercise_id_exercises')),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_workout_sessions_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_workout_sessions')),
    sa.UniqueConstraint('user_id', 'client_session_id', name=op.f('uq_workout_sessions_user_id_client_session_id'))
    )
    op.create_index('ix_workout_sessions_user_id_started_at', 'workout_sessions', ['user_id', 'started_at'], unique=False)
    op.create_table('workout_sets',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('session_id', sa.Uuid(), nullable=False),
    sa.Column('client_set_id', sa.Text(), nullable=False),
    sa.Column('set_index', sa.Integer(), nullable=False),
    sa.Column('side', sa.Text(), nullable=False),
    sa.Column('view', sa.Text(), nullable=False),
    sa.Column('mode', sa.Text(), nullable=False),
    sa.Column('started_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('ended_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('summary_schema_version', sa.Text(), nullable=False),
    sa.Column('analyzer_version', sa.Text(), nullable=False),
    sa.Column('feature_version', sa.Text(), nullable=False),
    sa.Column('rules_version', sa.Text(), nullable=False),
    sa.Column('feedback_version', sa.Text(), nullable=True),
    sa.Column('completed_reps', sa.Integer(), nullable=False),
    sa.Column('analyzed_reps', sa.Integer(), nullable=False),
    sa.Column('issue_bearing_reps', sa.Integer(), nullable=False),
    sa.Column('no_issue_reps', sa.Integer(), nullable=False),
    sa.Column('no_issue_fraction', sa.Double(), nullable=True),
    sa.Column('not_analyzed_reason', sa.Text(), nullable=True),
    sa.Column('tracking_assessable_ms', sa.Double(), nullable=True),
    sa.Column('tracking_session_ms', sa.Double(), nullable=True),
    sa.Column('tracking_coverage', sa.Double(), nullable=True),
    sa.Column('interrupted_attempts', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('episode_counts_by_type', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('summary', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('payload_sha256', sa.CHAR(length=64), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("mode IN ('validated-only', 'review')", name=op.f('ck_workout_sets_mode_allowed')),
    sa.CheckConstraint("side IN ('left', 'right')", name=op.f('ck_workout_sets_side_allowed')),
    sa.CheckConstraint('analyzed_reps <= completed_reps', name=op.f('ck_workout_sets_analyzed_le_completed')),
    sa.CheckConstraint('completed_reps >= 0 AND analyzed_reps >= 0 AND issue_bearing_reps >= 0 AND no_issue_reps >= 0', name=op.f('ck_workout_sets_counts_non_negative')),
    sa.CheckConstraint('ended_at >= started_at', name=op.f('ck_workout_sets_ended_after_started')),
    sa.CheckConstraint('issue_bearing_reps <= analyzed_reps', name=op.f('ck_workout_sets_issue_bearing_le_analyzed')),
    sa.CheckConstraint('no_issue_fraction IS NULL OR (no_issue_fraction >= 0 AND no_issue_fraction <= 1)', name=op.f('ck_workout_sets_no_issue_fraction_range')),
    sa.CheckConstraint('no_issue_reps = analyzed_reps - issue_bearing_reps', name=op.f('ck_workout_sets_no_issue_consistent')),
    sa.CheckConstraint('set_index >= 1', name=op.f('ck_workout_sets_set_index_positive')),
    sa.CheckConstraint('tracking_assessable_ms IS NULL OR tracking_session_ms IS NULL OR tracking_assessable_ms <= tracking_session_ms', name=op.f('ck_workout_sets_tracking_assessable_le_session')),
    sa.CheckConstraint('tracking_coverage IS NULL OR (tracking_coverage >= 0 AND tracking_coverage <= 1)', name=op.f('ck_workout_sets_tracking_coverage_range')),
    sa.ForeignKeyConstraint(['session_id'], ['workout_sessions.id'], name=op.f('fk_workout_sets_session_id_workout_sessions'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_workout_sets')),
    sa.UniqueConstraint('session_id', 'client_set_id', name=op.f('uq_workout_sets_session_id_client_set_id')),
    sa.UniqueConstraint('session_id', 'set_index', name=op.f('uq_workout_sets_session_id_set_index'))
    )
    op.create_table('form_events',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('set_id', sa.Uuid(), nullable=False),
    sa.Column('client_event_id', sa.Text(), nullable=False),
    sa.Column('issue_type', sa.Text(), nullable=False),
    sa.Column('start_ms', sa.Double(), nullable=False),
    sa.Column('end_ms', sa.Double(), nullable=True),
    sa.Column('peak', sa.Double(), nullable=True),
    sa.Column('peak_unit', sa.Text(), nullable=True),
    sa.Column('assessed', sa.Boolean(), nullable=False),
    sa.Column('rules_version', sa.Text(), nullable=False),
    sa.CheckConstraint('end_ms IS NULL OR end_ms >= start_ms', name=op.f('ck_form_events_end_after_start')),
    sa.ForeignKeyConstraint(['set_id'], ['workout_sets.id'], name=op.f('fk_form_events_set_id_workout_sets'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_form_events')),
    sa.UniqueConstraint('set_id', 'client_event_id', name=op.f('uq_form_events_set_id_client_event_id'))
    )
    op.create_table('reps',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('set_id', sa.Uuid(), nullable=False),
    sa.Column('client_rep_id', sa.Text(), nullable=False),
    sa.Column('rep_index', sa.Integer(), nullable=False),
    sa.Column('start_ms', sa.Double(), nullable=False),
    sa.Column('end_ms', sa.Double(), nullable=False),
    sa.Column('duration_ms', sa.Double(), nullable=False),
    sa.Column('min_flexion_deg', sa.Double(), nullable=True),
    sa.Column('max_flexion_deg', sa.Double(), nullable=True),
    sa.Column('rom_deg', sa.Double(), nullable=True),
    sa.Column('form_coverage', sa.Double(), nullable=True),
    sa.Column('analyzed', sa.Boolean(), nullable=False),
    sa.Column('issue_bearing', sa.Boolean(), nullable=False),
    sa.Column('issue_types', postgresql.ARRAY(sa.Text()), nullable=False),
    sa.CheckConstraint('duration_ms >= 0', name=op.f('ck_reps_duration_non_negative')),
    sa.CheckConstraint('end_ms >= start_ms', name=op.f('ck_reps_end_after_start')),
    sa.CheckConstraint('form_coverage IS NULL OR (form_coverage >= 0 AND form_coverage <= 1)', name=op.f('ck_reps_form_coverage_range')),
    sa.CheckConstraint('rep_index >= 1', name=op.f('ck_reps_rep_index_positive')),
    sa.ForeignKeyConstraint(['set_id'], ['workout_sets.id'], name=op.f('fk_reps_set_id_workout_sets'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_reps')),
    sa.UniqueConstraint('set_id', 'client_rep_id', name=op.f('uq_reps_set_id_client_rep_id')),
    sa.UniqueConstraint('set_id', 'rep_index', name=op.f('uq_reps_set_id_rep_index'))
    )
    op.create_table('form_event_reps',
    sa.Column('form_event_id', sa.Uuid(), nullable=False),
    sa.Column('rep_id', sa.Uuid(), nullable=False),
    sa.ForeignKeyConstraint(['form_event_id'], ['form_events.id'], name=op.f('fk_form_event_reps_form_event_id_form_events'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['rep_id'], ['reps.id'], name=op.f('fk_form_event_reps_rep_id_reps'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('form_event_id', 'rep_id', name=op.f('pk_form_event_reps'))
    )
    op.create_index('ix_form_event_reps_rep_id', 'form_event_reps', ['rep_id'], unique=False)

    exercises = sa.table(
        'exercises',
        sa.column('id', sa.Text()),
        sa.column('name', sa.Text()),
        sa.column('supported_views', postgresql.ARRAY(sa.Text())),
        sa.column('analyzer_version', sa.Text()),
        sa.column('active', sa.Boolean()),
    )
    op.bulk_insert(exercises, [
        {'id': 'dumbbell-curl', 'name': 'Dumbbell curl', 'supported_views': ['side'],
         'analyzer_version': 'curl-1.1.0', 'active': True},
    ])


def downgrade() -> None:
    op.drop_index('ix_form_event_reps_rep_id', table_name='form_event_reps')
    op.drop_table('form_event_reps')
    op.drop_table('reps')
    op.drop_table('form_events')
    op.drop_table('workout_sets')
    op.drop_index('ix_workout_sessions_user_id_started_at', table_name='workout_sessions')
    op.drop_table('workout_sessions')
    op.drop_index('ix_auth_sessions_user_id', table_name='auth_sessions')
    op.drop_table('auth_sessions')
    op.drop_table('users')
    op.drop_table('exercises')
