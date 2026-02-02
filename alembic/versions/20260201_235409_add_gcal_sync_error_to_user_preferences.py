"""add gcal_sync_error to user_preferences

Revision ID: d4792085f030
Revises: 0003_gcal_sync
Create Date: 2026-02-01 23:54:09.790141+00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d4792085f030"
down_revision: str | None = "0003_gcal_sync"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("user_preferences", sa.Column("gcal_sync_error", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("user_preferences", "gcal_sync_error")
