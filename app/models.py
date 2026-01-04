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
from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, Time, UniqueConstraint, func
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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    todoist_token: Mapped["TodoistToken | None"] = relationship(back_populates="user", uselist=False)
    google_token: Mapped["GoogleToken | None"] = relationship(back_populates="user", uselist=False)
    calendar_selections: Mapped[list["GoogleCalendarSelection"]] = relationship(back_populates="user")

    # Native task management
    domains: Mapped[list["Domain"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    tasks: Mapped[list["Task"]] = relationship(back_populates="user", cascade="all, delete-orphan")


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


# =============================================================================
# Native Task Management Models (v0.4)
# =============================================================================


class Domain(Base):
    """
    Task grouping container (replaces Todoist Projects).

    Domains organize tasks by area of responsibility or context.
    Each user can have multiple domains.
    """

    __tablename__ = "domains"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255))
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
    """

    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    domain_id: Mapped[int | None] = mapped_column(ForeignKey("domains.id", ondelete="SET NULL"), nullable=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True)

    # Content
    title: Mapped[str] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Attributes
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    impact: Mapped[int] = mapped_column(Integer, default=4)  # P1=1 (highest), P4=4 (lowest)
    clarity: Mapped[str | None] = mapped_column(String(20), nullable=True)  # executable/defined/exploratory

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

    # Relationships
    user: Mapped["User"] = relationship(back_populates="tasks")
    domain: Mapped["Domain | None"] = relationship(back_populates="tasks")
    parent: Mapped["Task | None"] = relationship(back_populates="subtasks", remote_side=[id])
    subtasks: Mapped[list["Task"]] = relationship(back_populates="parent", cascade="all, delete-orphan")
    instances: Mapped[list["TaskInstance"]] = relationship(back_populates="task", cascade="all, delete-orphan")


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

    __table_args__ = (UniqueConstraint("task_id", "instance_date", name="uq_task_instance_date"),)
