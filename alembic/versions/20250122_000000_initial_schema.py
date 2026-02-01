"""Initial schema - baseline migration for existing database.

Revision ID: 0001_initial
Revises: None
Create Date: 2025-01-22

This migration represents the schema as of v0.12.0.
For existing databases, run: alembic stamp 0001_initial
For new databases, run: alembic upgrade head
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Users table
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("name", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("wizard_completed", sa.Boolean(), default=False, nullable=False),
        sa.Column("wizard_completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # Todoist tokens
    op.create_table(
        "todoist_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("access_token_encrypted", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )

    # Google tokens
    op.create_table(
        "google_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("access_token_encrypted", sa.Text(), nullable=False),
        sa.Column("refresh_token_encrypted", sa.Text(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )

    # Google calendar selections
    op.create_table(
        "google_calendar_selections",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("calendar_id", sa.String(255), nullable=False),
        sa.Column("calendar_name", sa.String(255), nullable=False),
        sa.Column("enabled", sa.Boolean(), default=True, nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # User preferences
    op.create_table(
        "user_preferences",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        # Task display
        sa.Column("show_completed_in_planner", sa.Boolean(), default=True, nullable=False),
        sa.Column("completed_retention_days", sa.Integer(), default=3, nullable=False),
        sa.Column("completed_move_to_bottom", sa.Boolean(), default=True, nullable=False),
        sa.Column("completed_sort_by_date", sa.Boolean(), default=True, nullable=False),
        sa.Column("show_completed_in_list", sa.Boolean(), default=True, nullable=False),
        sa.Column("hide_recurring_after_completion", sa.Boolean(), default=False, nullable=False),
        sa.Column("show_scheduled_in_list", sa.Boolean(), default=True, nullable=False),
        sa.Column("scheduled_move_to_bottom", sa.Boolean(), default=True, nullable=False),
        sa.Column("scheduled_sort_by_date", sa.Boolean(), default=True, nullable=False),
        # Encryption
        sa.Column("encryption_enabled", sa.Boolean(), default=False, nullable=False),
        sa.Column("encryption_salt", sa.String(64), nullable=True),
        sa.Column("encryption_test_value", sa.Text(), nullable=True),
        sa.Column("encryption_unlock_method", sa.String(20), nullable=True),
        # Timezone preference (IANA format)
        sa.Column("timezone", sa.String(50), nullable=True),
        # Timestamps
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )

    # Domains
    op.create_table(
        "domains",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("color", sa.String(7), nullable=True),
        sa.Column("icon", sa.String(50), nullable=True),
        sa.Column("position", sa.Integer(), default=0, nullable=False),
        sa.Column("is_archived", sa.Boolean(), default=False, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("external_id", sa.String(255), nullable=True),
        sa.Column("external_source", sa.String(50), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_domains_user_id", "domains", ["user_id"])

    # Tasks
    op.create_table(
        "tasks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("domain_id", sa.Integer(), nullable=True),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        # Content
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        # Attributes
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
        sa.Column("impact", sa.Integer(), default=4, nullable=False),
        sa.Column("clarity", sa.String(20), nullable=True),
        # Scheduling
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("due_time", sa.Time(), nullable=True),
        sa.Column("scheduled_date", sa.Date(), nullable=True),
        sa.Column("scheduled_time", sa.Time(), nullable=True),
        # Recurrence
        sa.Column("is_recurring", sa.Boolean(), default=False, nullable=False),
        sa.Column("recurrence_rule", postgresql.JSON(), nullable=True),
        sa.Column("recurrence_start", sa.Date(), nullable=True),
        sa.Column("recurrence_end", sa.Date(), nullable=True),
        # Status
        sa.Column("status", sa.String(20), default="pending", nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        # Ordering
        sa.Column("position", sa.Integer(), default=0, nullable=False),
        # Metadata
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("external_id", sa.String(255), nullable=True),
        sa.Column("external_source", sa.String(50), nullable=True),
        sa.Column("external_created_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["domain_id"], ["domains.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["parent_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tasks_user_id", "tasks", ["user_id"])
    op.create_index("ix_task_user_status", "tasks", ["user_id", "status"])
    op.create_index("ix_task_user_scheduled", "tasks", ["user_id", "scheduled_date"])
    op.create_index("ix_task_user_domain", "tasks", ["user_id", "domain_id"])
    op.create_index("ix_task_parent", "tasks", ["parent_id"])

    # Task instances
    op.create_table(
        "task_instances",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("task_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("instance_date", sa.Date(), nullable=False),
        sa.Column("scheduled_datetime", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(20), default="pending", nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("task_id", "instance_date", name="uq_task_instance_date"),
    )
    op.create_index("ix_task_instances_task_id", "task_instances", ["task_id"])
    op.create_index("ix_task_instances_user_id", "task_instances", ["user_id"])
    op.create_index("ix_instance_task_date", "task_instances", ["task_id", "instance_date"])
    op.create_index("ix_instance_user_status", "task_instances", ["user_id", "status"])
    op.create_index("ix_instance_user_date", "task_instances", ["user_id", "instance_date"])

    # WebAuthn challenges
    op.create_table(
        "webauthn_challenges",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("challenge", sa.LargeBinary(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_webauthn_challenges_user_id", "webauthn_challenges", ["user_id"])
    op.create_index("ix_challenge_user_expires", "webauthn_challenges", ["user_id", "expires_at"])

    # User passkeys
    op.create_table(
        "user_passkeys",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("credential_id", sa.LargeBinary(), nullable=False),
        sa.Column("public_key", sa.LargeBinary(), nullable=False),
        sa.Column("sign_count", sa.Integer(), default=0, nullable=False),
        sa.Column("transports", postgresql.JSON(), nullable=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("prf_salt", sa.String(64), nullable=False),
        sa.Column("wrapped_key", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_user_passkeys_user_id", "user_passkeys", ["user_id"])


def downgrade() -> None:
    # Drop tables in reverse order (respecting foreign key dependencies)
    op.drop_table("user_passkeys")
    op.drop_table("webauthn_challenges")
    op.drop_table("task_instances")
    op.drop_table("tasks")
    op.drop_table("domains")
    op.drop_table("user_preferences")
    op.drop_table("google_calendar_selections")
    op.drop_table("google_tokens")
    op.drop_table("todoist_tokens")
    op.drop_table("users")
