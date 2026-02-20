"""add composite index ix_task_user_parent

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-02-20 00:00:01.000000+00:00

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6a7"
down_revision: str | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index("ix_task_user_parent", "tasks", ["user_id", "parent_id"])


def downgrade() -> None:
    op.drop_index("ix_task_user_parent", table_name="tasks")
