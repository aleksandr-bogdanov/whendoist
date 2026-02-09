"""
Database models for Whendoist.

Includes User, OAuth tokens (Todoist/Google), and calendar selections.
Tokens are encrypted at rest using Fernet symmetric encryption.
"""

import base64
import hashlib
from datetime import date, datetime, time
from functools import lru_cache

from cryptography.fernet import Fernet
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    Time,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.config import get_settings
from app.database import Base


@lru_cache(maxsize=1)
def _get_fernet() -> Fernet:
    """
    Create a Fernet instance for token encryption/decryption.

    Uses SHA-256 hash of SECRET_KEY to derive a valid 32-byte Fernet key.
    Cached to avoid repeated key derivation.
    """
    key = get_settings().secret_key.encode()
    key_hash = hashlib.sha256(key).digest()
    fernet_key = base64.urlsafe_b64encode(key_hash)
    return Fernet(fernet_key)


def encrypt_token(token: str) -> str:
    """Encrypt an OAuth token for secure database storage."""
    return _get_fernet().encrypt(token.encode()).decode()


def decrypt_token(encrypted: str) -> str:
    """Decrypt an OAuth token retrieved from the database."""
    return _get_fernet().decrypt(encrypted.encode()).decode()


class User(Base):
    """
    Application user identified by email.

    Users authenticate via Todoist OAuth and can optionally connect Google Calendar.
    """

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)  # Display name from Google
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Wizard tracking
    wizard_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    wizard_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    todoist_token: Mapped["TodoistToken | None"] = relationship(back_populates="user", uselist=False)
    google_token: Mapped["GoogleToken | None"] = relationship(back_populates="user", uselist=False)
    calendar_selections: Mapped[list["GoogleCalendarSelection"]] = relationship(back_populates="user")

    # Native task management
    domains: Mapped[list["Domain"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    tasks: Mapped[list["Task"]] = relationship(back_populates="user", cascade="all, delete-orphan")

    # User preferences
    preferences: Mapped["UserPreferences | None"] = relationship(back_populates="user", uselist=False)

    # Passkeys for E2E encryption unlock
    passkeys: Mapped[list["UserPasskey"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class TodoistToken(Base):
    """
    Encrypted Todoist OAuth access token.

    Todoist tokens don't expire, so no refresh token is needed.
    """

    __tablename__ = "todoist_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    access_token_encrypted: Mapped[str] = mapped_column(Text)

    user: Mapped["User"] = relationship(back_populates="todoist_token")

    @property
    def access_token(self) -> str:
        """Decrypt and return the access token."""
        return decrypt_token(self.access_token_encrypted)

    @access_token.setter
    def access_token(self, value: str) -> None:
        """Encrypt and store the access token."""
        self.access_token_encrypted = encrypt_token(value)


class GoogleToken(Base):
    """
    Encrypted Google OAuth tokens with expiration tracking.

    Google tokens expire after ~1 hour and require refresh using the refresh_token.
    """

    __tablename__ = "google_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    access_token_encrypted: Mapped[str] = mapped_column(Text)
    refresh_token_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    gcal_write_scope: Mapped[bool] = mapped_column(Boolean, default=False)

    user: Mapped["User"] = relationship(back_populates="google_token")

    @property
    def access_token(self) -> str:
        """Decrypt and return the access token."""
        return decrypt_token(self.access_token_encrypted)

    @access_token.setter
    def access_token(self, value: str) -> None:
        """Encrypt and store the access token."""
        self.access_token_encrypted = encrypt_token(value)

    @property
    def refresh_token(self) -> str | None:
        """Decrypt and return the refresh token, if present."""
        if self.refresh_token_encrypted:
            return decrypt_token(self.refresh_token_encrypted)
        return None

    @refresh_token.setter
    def refresh_token(self, value: str | None) -> None:
        """Encrypt and store the refresh token."""
        if value:
            self.refresh_token_encrypted = encrypt_token(value)
        else:
            self.refresh_token_encrypted = None


class GoogleCalendarSelection(Base):
    """
    User's Google Calendar visibility preferences.

    Tracks which calendars should be displayed on the dashboard.
    """

    __tablename__ = "google_calendar_selections"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    calendar_id: Mapped[str] = mapped_column(String(255))
    calendar_name: Mapped[str] = mapped_column(String(255))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    user: Mapped["User"] = relationship(back_populates="calendar_selections")


class UserPreferences(Base):
    """
    User preferences for task display and behavior.

    Each user has exactly one preferences record (created on demand).
    """

    __tablename__ = "user_preferences"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)

    # Task Display preferences
    show_completed_in_planner: Mapped[bool] = mapped_column(Boolean, default=True)
    completed_retention_days: Mapped[int] = mapped_column(Integer, default=3)  # 1, 3, or 7
    completed_move_to_bottom: Mapped[bool] = mapped_column(Boolean, default=True)
    completed_sort_by_date: Mapped[bool] = mapped_column(Boolean, default=True)  # False = sort by active column
    show_completed_in_list: Mapped[bool] = mapped_column(Boolean, default=True)  # False = calendar only
    hide_recurring_after_completion: Mapped[bool] = mapped_column(Boolean, default=False)
    show_scheduled_in_list: Mapped[bool] = mapped_column(Boolean, default=True)  # False = calendar only
    scheduled_move_to_bottom: Mapped[bool] = mapped_column(Boolean, default=True)
    scheduled_sort_by_date: Mapped[bool] = mapped_column(Boolean, default=True)  # False = sort by active column

    # E2E Encryption settings
    encryption_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    encryption_salt: Mapped[str | None] = mapped_column(String(64), nullable=True)  # Base64-encoded 32-byte salt
    # Encrypted known value for verification (e.g., encrypted "WHENDOIST_ENCRYPTION_TEST")
    encryption_test_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Unlock method: 'passphrase', 'passkey', or 'both' (default: passphrase when encryption is first enabled)
    encryption_unlock_method: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Timezone preference (IANA format: "America/New_York", "Europe/London", etc.)
    timezone: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Calendar hour height in pixels (zoom level)
    calendar_hour_height: Mapped[int] = mapped_column(Integer, default=60)

    # Google Calendar Sync preferences
    gcal_sync_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    gcal_sync_calendar_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    gcal_sync_error: Mapped[str | None] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="preferences")


# =============================================================================
# Native Task Management Models (v0.4)
# =============================================================================


class Domain(Base):
    """
    Task grouping container (replaces Todoist Projects).

    Domains organize tasks by area of responsibility or context.
    Each user can have multiple domains.

    Note: Domain names are encrypted client-side when encryption_enabled is true
    on UserPreferences. No per-record flag is needed.
    """

    __tablename__ = "domains"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # NOTE: Using Text instead of String(255) because encrypted values are ~1.4x larger
    name: Mapped[str] = mapped_column(Text)
    color: Mapped[str | None] = mapped_column(String(7), nullable=True)  # hex color
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)  # emoji
    position: Mapped[int] = mapped_column(Integer, default=0)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # For import tracking (Todoist, Things, etc.)
    external_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    external_source: Mapped[str | None] = mapped_column(String(50), nullable=True)

    user: Mapped["User"] = relationship(back_populates="domains")
    tasks: Mapped[list["Task"]] = relationship(back_populates="domain")


class Task(Base):
    """
    Native task with hierarchical support.

    Tasks can have subtasks via parent_id, creating a tree structure.
    Recurrence is defined via recurrence_rule JSON; instances are materialized separately.

    Note: Task title and description are encrypted client-side when encryption_enabled
    is true on UserPreferences. No per-record flags are needed.
    """

    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    domain_id: Mapped[int | None] = mapped_column(ForeignKey("domains.id", ondelete="SET NULL"), nullable=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True)

    # Content (encrypted client-side when user has encryption enabled)
    # NOTE: Using Text instead of String(500) because encrypted values are ~1.4x larger
    # (base64 encoding + IV + auth tag overhead)
    title: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Attributes
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    impact: Mapped[int] = mapped_column(Integer, default=4)  # P1=1 (highest), P4=4 (lowest)
    clarity: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="normal"
    )  # autopilot/normal/brainstorm

    # Scheduling (non-recurring)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    due_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    scheduled_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    scheduled_time: Mapped[time | None] = mapped_column(Time, nullable=True)

    # Recurrence
    is_recurring: Mapped[bool] = mapped_column(Boolean, default=False)
    recurrence_rule: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # JSONB for recurrence pattern
    recurrence_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    recurrence_end: Mapped[date | None] = mapped_column(Date, nullable=True)  # NULL = forever

    # Status
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending/completed/archived
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Ordering
    position: Mapped[int] = mapped_column(Integer, default=0)

    # Metadata
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # For import tracking (Todoist, Things, etc.)
    external_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    external_source: Mapped[str | None] = mapped_column(String(50), nullable=True)
    external_created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    user: Mapped["User"] = relationship(back_populates="tasks")
    domain: Mapped["Domain | None"] = relationship(back_populates="tasks")
    parent: Mapped["Task | None"] = relationship(back_populates="subtasks", remote_side=[id])
    subtasks: Mapped[list["Task"]] = relationship(back_populates="parent", cascade="all, delete-orphan")
    instances: Mapped[list["TaskInstance"]] = relationship(back_populates="task", cascade="all, delete-orphan")

    __table_args__ = (
        # Performance indexes for common query patterns
        Index("ix_task_user_status", "user_id", "status"),
        Index("ix_task_user_scheduled", "user_id", "scheduled_date"),
        Index("ix_task_user_domain", "user_id", "domain_id"),
        Index("ix_task_parent", "parent_id"),
    )


class TaskInstance(Base):
    """
    Materialized occurrence of a recurring task.

    Each instance represents a specific date when a recurring task occurs.
    Instances can be individually completed, skipped, or rescheduled.
    """

    __tablename__ = "task_instances"

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)  # denormalized

    # The specific occurrence date
    instance_date: Mapped[date] = mapped_column(Date)
    scheduled_datetime: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Status for this instance
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending/completed/skipped
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Metadata
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    task: Mapped["Task"] = relationship(back_populates="instances")

    __table_args__ = (
        UniqueConstraint("task_id", "instance_date", name="uq_task_instance_date"),
        # Performance indexes for common query patterns
        Index("ix_instance_task_date", "task_id", "instance_date"),
        Index("ix_instance_user_status", "user_id", "status"),
        Index("ix_instance_user_date", "user_id", "instance_date"),
    )


# =============================================================================
# Passkey Models (v0.8.4)
# =============================================================================


class WebAuthnChallenge(Base):
    """
    Temporary storage for WebAuthn challenges.

    Challenges have a short TTL (5 minutes) and are consumed on use.
    This replaces in-memory challenge storage to support multiple workers.
    """

    __tablename__ = "webauthn_challenges"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    challenge: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (Index("ix_challenge_user_expires", "user_id", "expires_at"),)


class UserPasskey(Base):
    """
    WebAuthn passkey credential for E2E encryption unlock.

    Each passkey stores a wrapped (encrypted) copy of the master encryption key.
    The PRF output from authentication is used to unwrap the master key.

    Architecture:
    - Master key = PBKDF2(passphrase) or PRF output from first passkey
    - Each passkey's PRF output → wrapping key → wraps master key
    - All passkeys unwrap to the SAME master key
    - Master key decrypts actual data
    """

    __tablename__ = "user_passkeys"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    # WebAuthn credential data
    credential_id: Mapped[bytes] = mapped_column(LargeBinary)  # Unique credential identifier
    public_key: Mapped[bytes] = mapped_column(LargeBinary)  # COSE public key
    sign_count: Mapped[int] = mapped_column(Integer, default=0)
    transports: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)  # ["usb", "nfc", "ble", "internal"]

    # User-friendly metadata
    name: Mapped[str] = mapped_column(String(100))  # e.g., "1Password", "Touch ID", "YubiKey"
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # For PRF-based key wrapping
    prf_salt: Mapped[str] = mapped_column(String(64))  # Salt used in PRF input
    wrapped_key: Mapped[str] = mapped_column(Text)  # Master key wrapped (encrypted) with PRF-derived key

    user: Mapped["User"] = relationship(back_populates="passkeys")


# =============================================================================
# Google Calendar Sync Models (v0.31.0)
# =============================================================================


class GoogleCalendarEventSync(Base):
    """
    Maps Whendoist tasks/instances to Google Calendar events.

    Tracks the sync state between a task (or task instance) and its
    corresponding Google Calendar event. Used for one-way sync
    (Whendoist -> Google Calendar).
    """

    __tablename__ = "google_calendar_event_syncs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True)
    task_instance_id: Mapped[int | None] = mapped_column(
        ForeignKey("task_instances.id", ondelete="CASCADE"), nullable=True
    )
    google_event_id: Mapped[str] = mapped_column(String(255))
    sync_hash: Mapped[str] = mapped_column(String(64))
    last_synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        # Exactly one of task_id or task_instance_id must be set
        CheckConstraint(
            "(task_id IS NOT NULL AND task_instance_id IS NULL) OR (task_id IS NULL AND task_instance_id IS NOT NULL)",
            name="ck_gcal_sync_one_reference",
        ),
        Index("ix_gcal_sync_user_task", "user_id", "task_id"),
        Index("ix_gcal_sync_user_instance", "user_id", "task_instance_id"),
    )
