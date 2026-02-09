"""add calendar_hour_height preference

Revision ID: 21cf09aaf852
Revises: 62901ea0eea8
Create Date: 2026-02-09 18:43:26.206082+00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "21cf09aaf852"
down_revision: str | None = "62901ea0eea8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user_preferences",
        sa.Column("calendar_hour_height", sa.Integer(), nullable=False, server_default="60"),
    )


def downgrade() -> None:
    op.drop_column("user_preferences", "calendar_hour_height")
