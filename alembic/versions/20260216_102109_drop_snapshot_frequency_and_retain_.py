"""drop snapshot frequency and retain_count columns

Revision ID: 45a47318a911
Revises: 513ed5400543
Create Date: 2026-02-16 10:21:09.739493+00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "45a47318a911"
down_revision: str | None = "513ed5400543"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("user_preferences", "snapshots_frequency")
    op.drop_column("user_preferences", "snapshots_retain_count")


def downgrade() -> None:
    op.add_column(
        "user_preferences",
        sa.Column("snapshots_retain_count", sa.INTEGER(), server_default=sa.text("10"), nullable=False),
    )
    op.add_column(
        "user_preferences",
        sa.Column(
            "snapshots_frequency",
            sa.VARCHAR(length=10),
            server_default=sa.text("'weekly'::character varying"),
            nullable=False,
        ),
    )
