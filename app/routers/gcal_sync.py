"""
Google Calendar sync API endpoints.

Provides endpoints to enable/disable task sync to Google Calendar,
trigger manual re-syncs, and check sync status.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import GCAL_SYNC_CALENDAR_NAME
from app.database import get_db
from app.models import GoogleCalendarEventSync, GoogleToken, User
from app.routers.auth import require_user
from app.services.gcal import GoogleCalendarClient
from app.services.gcal_sync import GCalSyncService
from app.services.preferences_service import PreferencesService

logger = logging.getLogger("whendoist.gcal_sync")

router = APIRouter(prefix="/gcal-sync", tags=["gcal-sync"])


# =============================================================================
# Response Models
# =============================================================================


class SyncStatusResponse(BaseModel):
    enabled: bool
    calendar_id: str | None = None
    synced_count: int = 0
    sync_all_day: bool = True
    has_write_scope: bool = False
    reauth_url: str | None = None
    sync_error: str | None = None


class SyncEnableResponse(BaseModel):
    success: bool
    message: str
    calendar_id: str | None = None
    needs_reauth: bool = False
    reauth_url: str | None = None


class SyncDisableRequest(BaseModel):
    delete_events: bool = False


class SyncDisableResponse(BaseModel):
    success: bool
    message: str
    deleted_count: int = 0


class BulkSyncResponse(BaseModel):
    success: bool
    created: int = 0
    updated: int = 0
    deleted: int = 0
    skipped: int = 0
    error: str | None = None


# =============================================================================
# Endpoints
# =============================================================================


@router.get("/status", response_model=SyncStatusResponse)
async def get_sync_status(
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current Google Calendar sync status."""
    prefs_service = PreferencesService(db, user.id)
    prefs = await prefs_service.get_preferences()

    # Check write scope
    token_result = await db.execute(select(GoogleToken).where(GoogleToken.user_id == user.id))
    google_token = token_result.scalar_one_or_none()
    has_write_scope = google_token.gcal_write_scope if google_token else False

    # Count synced events
    count_result = await db.execute(
        select(func.count(GoogleCalendarEventSync.id)).where(
            GoogleCalendarEventSync.user_id == user.id,
        )
    )
    synced_count = count_result.scalar() or 0

    return SyncStatusResponse(
        enabled=prefs.gcal_sync_enabled,
        calendar_id=prefs.gcal_sync_calendar_id,
        synced_count=synced_count,
        sync_all_day=prefs.gcal_sync_all_day,
        has_write_scope=has_write_scope,
        sync_error=prefs.gcal_sync_error,
    )


@router.post("/enable", response_model=SyncEnableResponse)
async def enable_sync(
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Enable Google Calendar sync.

    If the user's token doesn't have write scope, returns a re-auth URL.
    If scope is OK, creates the "Whendoist" calendar and runs initial sync.
    """
    prefs_service = PreferencesService(db, user.id)
    prefs = await prefs_service.get_preferences()

    # Check if encryption is enabled
    if prefs.encryption_enabled:
        raise HTTPException(
            status_code=400,
            detail="Cannot enable sync when E2E encryption is enabled. Task titles would be synced as encrypted text.",
        )

    # Check Google token
    token_result = await db.execute(select(GoogleToken).where(GoogleToken.user_id == user.id))
    google_token = token_result.scalar_one_or_none()
    if not google_token:
        raise HTTPException(status_code=400, detail="Google Calendar not connected.")

    # Check write scope
    if not google_token.gcal_write_scope:
        return SyncEnableResponse(
            success=False,
            message="Calendar write access required. Please re-authorize with Google.",
            needs_reauth=True,
            reauth_url="/auth/google?write_scope=true",
        )

    # Clear any previous sync error
    prefs.gcal_sync_error = None

    # Create "Whendoist" calendar (always create fresh — old one may be deleted)
    try:
        async with GoogleCalendarClient(db, google_token) as client:
            calendar_id = await client.create_calendar(GCAL_SYNC_CALENDAR_NAME)
    except Exception as e:
        logger.error(f"Failed to create Whendoist calendar: {e}")
        raise HTTPException(status_code=500, detail="Failed to create calendar in Google.") from e

    # Enable sync
    prefs.gcal_sync_enabled = True
    prefs.gcal_sync_calendar_id = calendar_id
    await db.commit()

    # Run initial bulk sync
    try:
        sync_service = GCalSyncService(db, user.id)
        stats = await sync_service.bulk_sync()
        await db.commit()
        logger.info(f"Initial sync for user {user.id}: {stats}")
    except Exception as e:
        logger.error(f"Initial bulk sync failed for user {user.id}: {e}")
        # Don't fail the enable - sync will catch up on next mutation

    return SyncEnableResponse(
        success=True,
        message=f"Sync enabled. Calendar created: {GCAL_SYNC_CALENDAR_NAME}",
        calendar_id=calendar_id,
    )


@router.post("/disable", response_model=SyncDisableResponse)
async def disable_sync(
    data: SyncDisableRequest | None = None,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Disable Google Calendar sync. Optionally delete all synced events."""
    prefs_service = PreferencesService(db, user.id)
    prefs = await prefs_service.get_preferences()

    if not prefs.gcal_sync_enabled and not prefs.gcal_sync_error:
        return SyncDisableResponse(success=True, message="Sync was already disabled.")

    deleted_count = 0
    if data and data.delete_events:
        try:
            sync_service = GCalSyncService(db, user.id)
            deleted_count = await sync_service.delete_all_synced_events()
        except Exception as e:
            logger.error(f"Failed to delete synced events for user {user.id}: {e}")

    prefs.gcal_sync_enabled = False
    prefs.gcal_sync_error = None
    await db.commit()

    msg = f"Sync disabled. {deleted_count} events deleted." if deleted_count else "Sync disabled."
    return SyncDisableResponse(success=True, message=msg, deleted_count=deleted_count)


@router.post("/full-sync", response_model=BulkSyncResponse)
async def full_sync(
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Manually trigger a full re-sync of all tasks."""
    prefs_service = PreferencesService(db, user.id)
    prefs = await prefs_service.get_preferences()

    if not prefs.gcal_sync_enabled:
        raise HTTPException(status_code=400, detail="Sync is not enabled.")

    sync_service = GCalSyncService(db, user.id)
    stats = await sync_service.bulk_sync()
    await db.commit()

    error = stats.get("error")
    return BulkSyncResponse(
        success=error is None,
        created=stats["created"],
        updated=stats["updated"],
        deleted=stats["deleted"],
        skipped=stats["skipped"],
        error=error,
    )
