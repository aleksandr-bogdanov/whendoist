"""add_oauth_client_and_authorization_code_tables

Revision ID: 8f3a2b1c4d5e
Revises: 1e2661d9806d
Create Date: 2026-03-13 15:00:00.000000+00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "8f3a2b1c4d5e"
down_revision: str | None = "1e2661d9806d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # OAuth clients (dynamic registration)
    op.create_table(
        "oauth_clients",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("client_id", sa.String(64), unique=True, index=True, nullable=False),
        sa.Column("client_secret_hash", sa.String(64), nullable=False),
        sa.Column("client_name", sa.String(255), nullable=False),
        sa.Column("redirect_uris", JSON(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # OAuth authorization codes (temporary, 10-min TTL)
    op.create_table(
        "oauth_authorization_codes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code_hash", sa.String(64), unique=True, index=True, nullable=False),
        sa.Column("client_id", sa.String(64), index=True, nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("redirect_uri", sa.Text(), nullable=False),
        sa.Column("code_challenge", sa.String(128), nullable=False),
        sa.Column("code_challenge_method", sa.String(10), nullable=False, server_default="S256"),
        sa.Column("scope", sa.String(50), nullable=False, server_default="tasks"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("oauth_authorization_codes")
    op.drop_table("oauth_clients")
