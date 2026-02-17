"""flatten subtask depth and strip parent recurrence

Revision ID: a1b2c3d4e5f6
Revises: 45a47318a911
Create Date: 2026-02-17 00:00:01.000000+00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "45a47318a911"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Flatten deep nesting to depth-1: reparent any task whose parent
    # also has a parent. Loop until no more grandchildren exist.
    conn = op.get_bind()
    while True:
        result = conn.execute(
            sa.text("""
                UPDATE tasks t
                SET parent_id = parent_task.parent_id
                FROM tasks parent_task
                WHERE t.parent_id = parent_task.id
                  AND parent_task.parent_id IS NOT NULL
            """)
        )
        if result.rowcount == 0:
            break

    # Strip recurrence from tasks that have children (containers can't recur)
    conn.execute(
        sa.text("""
            UPDATE tasks SET is_recurring = false, recurrence_rule = NULL
            WHERE id IN (
                SELECT DISTINCT parent_id FROM tasks WHERE parent_id IS NOT NULL
            )
            AND is_recurring = true
        """)
    )


def downgrade() -> None:
    # Data migration — cannot be automatically reversed.
    # The original nesting depth and parent recurrence values are lost.
    pass
