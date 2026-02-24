"""
User preferences API endpoints.

Provides REST endpoints for managing task display preferences and E2E encryption.
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.rate_limit import ENCRYPTION_LIMIT, limiter
from app.models import User
from app.routers.auth import require_user
from app.services.preferences_service import PreferencesService

router = APIRouter(prefix="/preferences", tags=["preferences"])


# =============================================================================
# Request/Response Models
# =============================================================================


class PreferencesUpdate(BaseModel):
    """Request body for updating preferences."""

    show_completed_in_planner: bool | None = None
    completed_retention_days: Literal[1, 3, 7] | None = None
    show_completed_in_list: bool | None = None
    hide_recurring_after_completion: bool | None = None
    show_scheduled_in_list: bool | None = None
    timezone: str | None = Field(None, max_length=50)  # IANA timezone (e.g., "America/New_York")
    calendar_hour_height: int | None = Field(None, ge=30, le=100)


class PreferencesResponse(BaseModel):
    """Response model for user preferences."""

    model_config = ConfigDict(from_attributes=True)

    show_completed_in_planner: bool
    completed_retention_days: int
    completed_move_to_bottom: bool
    completed_sort_by_date: bool
    show_completed_in_list: bool
    hide_recurring_after_completion: bool
    show_scheduled_in_list: bool
    scheduled_move_to_bottom: bool
    scheduled_sort_by_date: bool
    timezone: str | None = None  # IANA timezone (e.g., "America/New_York")
    calendar_hour_height: int = 60
    gcal_sync_enabled: bool = False


# E2E Encryption Models
class EncryptionStatusResponse(BaseModel):
    """Response model for encryption status."""

    enabled: bool
    salt: str | None = None  # Only returned if encryption is enabled
    test_value: str | None = None  # Encrypted test value for passphrase verification


class EncryptionSetupRequest(BaseModel):
    """Request to set up E2E encryption."""

    salt: str = Field(max_length=64)  # Base64-encoded 32-byte salt (generated client-side)
    test_value: str = Field(max_length=1000)  # Encrypted test value for passphrase verification


class EncryptionSetupResponse(BaseModel):
    """Response after setting up encryption."""

    success: bool
    message: str


# =============================================================================
# Endpoints
# =============================================================================


@router.get("", response_model=PreferencesResponse)
async def get_preferences(
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current user's preferences (creates defaults if missing)."""
    service = PreferencesService(db, user.id)
    prefs = await service.get_preferences()
    await db.commit()  # Commit in case defaults were created
    return prefs


@router.put("", response_model=PreferencesResponse)
async def update_preferences(
    data: PreferencesUpdate,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Update current user's preferences."""
    service = PreferencesService(db, user.id)
    prefs = await service.update_preferences(
        show_completed_in_planner=data.show_completed_in_planner,
        completed_retention_days=data.completed_retention_days,
        show_completed_in_list=data.show_completed_in_list,
        hide_recurring_after_completion=data.hide_recurring_after_completion,
        show_scheduled_in_list=data.show_scheduled_in_list,
        timezone=data.timezone,
        calendar_hour_height=data.calendar_hour_height,
    )
    await db.commit()
    return prefs


# =============================================================================
# E2E Encryption Endpoints
# =============================================================================


@router.get("/encryption", response_model=EncryptionStatusResponse)
async def get_encryption_status(
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get encryption status for current user.

    Returns whether encryption is enabled and the salt (if enabled).
    The salt is needed client-side to derive the decryption key.
    """
    service = PreferencesService(db, user.id)
    prefs = await service.get_preferences()
    await db.commit()

    return EncryptionStatusResponse(
        enabled=prefs.encryption_enabled,
        salt=prefs.encryption_salt if prefs.encryption_enabled else None,
        test_value=prefs.encryption_test_value if prefs.encryption_enabled else None,
    )


@router.post("/encryption/setup", response_model=EncryptionSetupResponse)
@limiter.limit(ENCRYPTION_LIMIT)
async def setup_encryption(
    request: Request,
    data: EncryptionSetupRequest,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Set up E2E encryption for the user.

    The client generates a salt and derives an encryption key from the passphrase.
    The client encrypts a known test value ("WHENDOIST_ENCRYPTION_TEST") and sends
    both the salt and encrypted test value to the server.

    This endpoint stores the salt and test value, and marks encryption as enabled.
    """
    service = PreferencesService(db, user.id)
    prefs = await service.get_preferences()

    if prefs.encryption_enabled:
        raise HTTPException(
            status_code=400,
            detail="Encryption is already enabled. Disable it first to set up new encryption.",
        )

    # Store encryption settings
    await service.setup_encryption(
        salt=data.salt,
        test_value=data.test_value,
    )
    await db.commit()

    return EncryptionSetupResponse(
        success=True,
        message="Encryption enabled. All new data will be encrypted.",
    )


@router.post("/encryption/disable", response_model=EncryptionSetupResponse)
@limiter.limit(ENCRYPTION_LIMIT)
async def disable_encryption(
    request: Request,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Disable E2E encryption for the user.

    WARNING: This does NOT decrypt existing data. Encrypted data will remain
    encrypted but unreadable without the original passphrase.

    To properly disable encryption:
    1. Export all data (backup)
    2. Disable encryption
    3. Import data back (unencrypted)
    """
    service = PreferencesService(db, user.id)
    prefs = await service.get_preferences()

    if not prefs.encryption_enabled:
        raise HTTPException(status_code=400, detail="Encryption is not enabled.")

    await service.disable_encryption()
    await db.commit()

    return EncryptionSetupResponse(
        success=True,
        message="Encryption disabled. Existing encrypted data remains encrypted.",
    )
