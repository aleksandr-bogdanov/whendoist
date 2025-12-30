"""
Database models for Whendoist.

Includes User, OAuth tokens (Todoist/Google), and calendar selections.
Tokens are encrypted at rest using Fernet symmetric encryption.
"""

import base64
import hashlib
from datetime import datetime
from functools import lru_cache

from cryptography.fernet import Fernet
from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
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
