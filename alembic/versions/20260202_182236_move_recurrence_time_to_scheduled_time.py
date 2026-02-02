"""move_recurrence_time_to_scheduled_time

Move recurrence_rule.time to task.scheduled_time and strip the time key
from the JSON rule. This unifies time handling so recurrence rules only
define patterns, and the task's scheduled_time is the single source of truth.

Revision ID: f70641cd1228
Revises: 22fd714eb4ad
Create Date: 2026-02-02 18:22:36.235159+00:00

"""

from collections.abc import Sequence

from sqlalchemy import text

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f70641cd1228"
down_revision: str | None = "22fd714eb4ad"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Move rule.time → task.scheduled_time for tasks that have a time in their
    # recurrence rule but no scheduled_time set on the task itself.
    # Then strip the "time" key from all recurrence_rule JSON objects.
    conn = op.get_bind()

    # Step 1: Copy rule.time to scheduled_time where scheduled_time is NULL
    conn.execute(
        text("""
            UPDATE tasks
            SET scheduled_time = (recurrence_rule->>'time')::time
            WHERE is_recurring = true
              AND recurrence_rule IS NOT NULL
              AND recurrence_rule->>'time' IS NOT NULL
              AND scheduled_time IS NULL
        """)
    )

    # Step 2: Remove the "time" key from all recurrence_rule JSON objects
    # Note: cast to jsonb because the column is json type, and the ? (key exists)
    # and - (key removal) operators only work with jsonb in PostgreSQL.
    conn.execute(
        text("""
            UPDATE tasks
            SET recurrence_rule = (recurrence_rule::jsonb - 'time')::json
            WHERE is_recurring = true
              AND recurrence_rule IS NOT NULL
              AND recurrence_rule::jsonb ? 'time'
        """)
    )


def downgrade() -> None:
    # Copy task.scheduled_time back to rule.time for recurring tasks
    conn = op.get_bind()
    conn.execute(
        text("""
            UPDATE tasks
            SET recurrence_rule = jsonb_set(
                recurrence_rule::jsonb,
                '{time}',
                to_jsonb(to_char(scheduled_time, 'HH24:MI'))
            )
            WHERE is_recurring = true
              AND recurrence_rule IS NOT NULL
              AND scheduled_time IS NOT NULL
        """)
    )
