"""Add Google Calendar sync models and fields.

Revision ID: 0003_gcal_sync
Revises: 0002_external_id_index
Create Date: 2026-02-02

Phase 0: Backfill duration_minutes for tasks with scheduled_time but no duration.
Phase 1: Add gcal_write_scope to google_tokens.
Phase 2: Add gcal sync preferences to user_preferences and new sync tracking table.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003_gcal_sync"
down_revision: str | None = "0002_external_id_index"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Phase 0: Backfill duration_minutes where scheduled_time is set but duration is NULL
    op.execute("UPDATE tasks SET duration_minutes = 30 WHERE scheduled_time IS NOT NULL AND duration_minutes IS NULL")

    # Phase 1: Add gcal_write_scope to google_tokens
    op.add_column("google_tokens", sa.Column("gcal_write_scope", sa.Boolean(), nullable=False, server_default="false"))

    # Phase 2: Add gcal sync preferences to user_preferences
    op.add_column(
        "user_preferences",
        sa.Column("gcal_sync_enabled", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "user_preferences",
        sa.Column("gcal_sync_calendar_id", sa.String(255), nullable=True),
    )
    op.add_column(
        "user_preferences",
        sa.Column("gcal_sync_all_day", sa.Boolean(), nullable=False, server_default="true"),
    )

    # Phase 2: Create google_calendar_event_syncs table
    op.create_table(
        "google_calendar_event_syncs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("task_id", sa.Integer(), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True),
        sa.Column(
            "task_instance_id",
            sa.Integer(),
            sa.ForeignKey("task_instances.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("google_event_id", sa.String(255), nullable=False),
        sa.Column("sync_hash", sa.String(64), nullable=False),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint(
            "(task_id IS NOT NULL AND task_instance_id IS NULL) OR (task_id IS NULL AND task_instance_id IS NOT NULL)",
            name="ck_gcal_sync_one_reference",
        ),
    )
    op.create_index("ix_gcal_sync_user_id", "google_calendar_event_syncs", ["user_id"])
    op.create_index("ix_gcal_sync_user_task", "google_calendar_event_syncs", ["user_id", "task_id"])
    op.create_index("ix_gcal_sync_user_instance", "google_calendar_event_syncs", ["user_id", "task_instance_id"])


def downgrade() -> None:
    op.drop_table("google_calendar_event_syncs")
    op.drop_column("user_preferences", "gcal_sync_all_day")
    op.drop_column("user_preferences", "gcal_sync_calendar_id")
    op.drop_column("user_preferences", "gcal_sync_enabled")
    op.drop_column("google_tokens", "gcal_write_scope")
