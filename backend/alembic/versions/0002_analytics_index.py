"""Stable owner/time/id history access (Sprint 6)."""
from alembic import op

revision = '0002_analytics_index'
down_revision = '0001_initial'
branch_labels = None
depends_on = None


def upgrade():
    op.create_index('ix_workout_sessions_user_started_id', 'workout_sessions', ['user_id', 'started_at', 'id'])


def downgrade():
    op.drop_index('ix_workout_sessions_user_started_id', table_name='workout_sessions')
