"""add data_version to users and snapshots

Revision ID: ea143101df03
Revises: d219269fd776
Create Date: 2026-02-22 23:36:39.550106+00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "ea143101df03"
down_revision: str | None = "d219269fd776"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("data_version", sa.Integer(), server_default=sa.text("0"), nullable=False))
    op.add_column("export_snapshots", sa.Column("snapshot_data_version", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("export_snapshots", "snapshot_data_version")
    op.drop_column("users", "data_version")
