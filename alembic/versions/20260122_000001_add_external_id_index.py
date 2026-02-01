"""Add index on (user_id, external_id) for faster Todoist imports.

Revision ID: 0002_external_id_index
Revises: 0001_initial
Create Date: 2026-01-22

This index significantly improves performance when looking up tasks
by their Todoist external_id during import operations.
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002_external_id_index"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Add composite index on (user_id, external_id) for Task table
    # This speeds up lookups when importing from Todoist
    op.create_index(
        "ix_task_user_external",
        "tasks",
        ["user_id", "external_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_task_user_external", table_name="tasks")
