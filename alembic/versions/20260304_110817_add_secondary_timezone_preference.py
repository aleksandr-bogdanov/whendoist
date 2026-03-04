"""add secondary timezone preference

Revision ID: 37388bf4b212
Revises: d0b8784b5b22
Create Date: 2026-03-04 11:08:17.900189+00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "37388bf4b212"
down_revision: str | None = "d0b8784b5b22"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user_preferences",
        sa.Column("secondary_timezone", sa.String(length=50), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("user_preferences", "secondary_timezone")
