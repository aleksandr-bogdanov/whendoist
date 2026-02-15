"""add export snapshots

Revision ID: 513ed5400543
Revises: 21cf09aaf852
Create Date: 2026-02-15 19:57:58.005240+00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "513ed5400543"
down_revision: str | None = "21cf09aaf852"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "export_snapshots",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("is_manual", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_export_snapshots_user_id"), "export_snapshots", ["user_id"], unique=False)
    op.create_index("ix_snapshot_user_created", "export_snapshots", ["user_id", "created_at"], unique=False)
    op.add_column(
        "user_preferences",
        sa.Column("snapshots_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "user_preferences",
        sa.Column("snapshots_frequency", sa.String(length=10), nullable=False, server_default=sa.text("'weekly'")),
    )
    op.add_column(
        "user_preferences",
        sa.Column("snapshots_retain_count", sa.Integer(), nullable=False, server_default=sa.text("10")),
    )


def downgrade() -> None:
    op.drop_column("user_preferences", "snapshots_retain_count")
    op.drop_column("user_preferences", "snapshots_frequency")
    op.drop_column("user_preferences", "snapshots_enabled")
    op.drop_index("ix_snapshot_user_created", table_name="export_snapshots")
    op.drop_index(op.f("ix_export_snapshots_user_id"), table_name="export_snapshots")
    op.drop_table("export_snapshots")
