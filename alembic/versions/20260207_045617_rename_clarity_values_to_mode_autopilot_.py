"""rename clarity values to mode autopilot normal brainstorm

Revision ID: 62901ea0eea8
Revises: 19c84fcb100b
Create Date: 2026-02-07 04:56:17.002658+00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "62901ea0eea8"
down_revision: str | None = "19c84fcb100b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Rename values: clear→autopilot, defined→normal, open→brainstorm
    op.execute("UPDATE tasks SET clarity = 'autopilot' WHERE clarity = 'clear'")
    op.execute("UPDATE tasks SET clarity = 'normal' WHERE clarity = 'defined'")
    op.execute("UPDATE tasks SET clarity = 'brainstorm' WHERE clarity = 'open'")
    # 2. Backfill NULLs
    op.execute("UPDATE tasks SET clarity = 'normal' WHERE clarity IS NULL")
    # 3. Make NOT NULL with default
    op.alter_column(
        "tasks",
        "clarity",
        existing_type=sa.String(20),
        nullable=False,
        server_default="normal",
    )


def downgrade() -> None:
    op.alter_column(
        "tasks",
        "clarity",
        existing_type=sa.String(20),
        nullable=True,
        server_default=None,
    )
    op.execute("UPDATE tasks SET clarity = 'clear' WHERE clarity = 'autopilot'")
    op.execute("UPDATE tasks SET clarity = 'defined' WHERE clarity = 'normal'")
    op.execute("UPDATE tasks SET clarity = 'open' WHERE clarity = 'brainstorm'")
