"""drop_due_date_due_time

Revision ID: d219269fd776
Revises: b2c3d4e5f6a7
Create Date: 2026-02-20 23:41:51.506692+00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d219269fd776"
down_revision: str | None = "b2c3d4e5f6a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("tasks", "due_date")
    op.drop_column("tasks", "due_time")


def downgrade() -> None:
    op.add_column("tasks", sa.Column("due_time", sa.Time(), nullable=True))
    op.add_column("tasks", sa.Column("due_date", sa.Date(), nullable=True))
