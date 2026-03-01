"""add_gcal_sync_unique_constraints

Revision ID: eb49fa918b23
Revises: b1c305c4bc97
Create Date: 2026-03-01 03:56:41.677645+00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "eb49fa918b23"
down_revision: str | None = "b1c305c4bc97"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Clean up any duplicate sync records before adding unique constraints.
    # Keep the most recently synced record for each (user_id, task_id) pair.
    op.execute(
        sa.text("""
        DELETE FROM google_calendar_event_syncs
        WHERE id NOT IN (
            SELECT DISTINCT ON (user_id, task_id) id
            FROM google_calendar_event_syncs
            WHERE task_id IS NOT NULL
            ORDER BY user_id, task_id, last_synced_at DESC
        )
        AND task_id IS NOT NULL
    """)
    )

    op.execute(
        sa.text("""
        DELETE FROM google_calendar_event_syncs
        WHERE id NOT IN (
            SELECT DISTINCT ON (user_id, task_instance_id) id
            FROM google_calendar_event_syncs
            WHERE task_instance_id IS NOT NULL
            ORDER BY user_id, task_instance_id, last_synced_at DESC
        )
        AND task_instance_id IS NOT NULL
    """)
    )

    op.create_unique_constraint(
        "uq_gcal_sync_user_instance", "google_calendar_event_syncs", ["user_id", "task_instance_id"]
    )
    op.create_unique_constraint("uq_gcal_sync_user_task", "google_calendar_event_syncs", ["user_id", "task_id"])


def downgrade() -> None:
    op.drop_constraint("uq_gcal_sync_user_task", "google_calendar_event_syncs", type_="unique")
    op.drop_constraint("uq_gcal_sync_user_instance", "google_calendar_event_syncs", type_="unique")
