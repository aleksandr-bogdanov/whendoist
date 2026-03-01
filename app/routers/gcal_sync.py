"""
Google Calendar sync API endpoints.

Provides endpoints to enable/disable task sync to Google Calendar,
trigger manual re-syncs, and check sync status.
"""

import asyncio
import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import GCAL_SYNC_CALENDAR_NAME
from app.database import async_session_factory, get_db
from app.middleware.rate_limit import BACKUP_LIMIT, get_user_or_ip, limiter
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
    has_write_scope: bool = False
    reauth_url: str | None = None
    sync_error: str | None = None
    syncing: bool = False


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
# Background Tasks
# =============================================================================

# Per-user lock to prevent concurrent bulk syncs
_bulk_sync_locks: dict[int, asyncio.Lock] = {}

# In-memory progress tracking (visible to status endpoint while sync runs)
_bulk_sync_progress: dict[int, dict] = {}

# Cancellation signal: disable endpoint adds user_id, bulk_sync checks it
_bulk_sync_cancelled: set[int] = set()


def _is_sync_running(user_id: int) -> bool:
    """Check if a bulk sync is currently running for this user."""
    lock = _bulk_sync_locks.get(user_id)
    return lock is not None and lock.locked()


def _get_sync_progress(user_id: int) -> dict | None:
    """Get live progress for a running bulk sync, or None if not running."""
    return _bulk_sync_progress.get(user_id)


def _cancel_sync(user_id: int) -> None:
    """Signal a running bulk sync to stop."""
    _bulk_sync_cancelled.add(user_id)


async def _background_bulk_sync(user_id: int, *, clear_calendar: bool = False) -> None:
    """Run bulk sync in background with its own DB session.

    Uses per-user lock to prevent concurrent syncs (e.g., user clicks enable twice).
    If clear_calendar is True, clears stale events from the calendar before syncing.
    """
    lock = _bulk_sync_locks.setdefault(user_id, asyncio.Lock())
    if lock.locked():
        logger.info(f"Bulk sync already running for user {user_id}, skipping")
        return

    async with lock:
        try:
            async with async_session_factory() as db:
                # Clear stale events from reused calendar before syncing
                if clear_calendar:
                    prefs_service = PreferencesService(db, user_id)
                    prefs = await prefs_service.get_preferences()
                    if prefs and prefs.gcal_sync_calendar_id:
                        token_result = await db.execute(select(GoogleToken).where(GoogleToken.user_id == user_id))
                        google_token = token_result.scalar_one_or_none()
                        if google_token:
                            try:
                                async with GoogleCalendarClient(db, google_token) as client:
                                    cleared = await client.clear_all_events(prefs.gcal_sync_calendar_id)
                                    if cleared:
                                        logger.info(
                                            f"Cleared {cleared} stale events from "
                                            f"calendar {prefs.gcal_sync_calendar_id}"
                                        )
                            except Exception as e:
                                logger.warning(f"Failed to clear stale events for user {user_id}: {e}")

                def on_progress(stats: dict) -> None:
                    _bulk_sync_progress[user_id] = dict(stats)

                def is_cancelled() -> bool:
                    return user_id in _bulk_sync_cancelled

                sync_service = GCalSyncService(db, user_id)
                stats = await sync_service.bulk_sync(
                    on_progress=on_progress,
                    is_cancelled=is_cancelled,
                )
                await db.commit()
                logger.info(f"Background bulk sync for user {user_id}: {stats}")
                if stats.get("error"):
                    logger.warning(f"Background bulk sync error for user {user_id}: {stats['error']}")
        except Exception as e:
            logger.exception(f"Background bulk sync failed for user {user_id}: {type(e).__name__}: {e}")
        finally:
            _bulk_sync_progress.pop(user_id, None)
            _bulk_sync_cancelled.discard(user_id)


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

    syncing = _is_sync_running(user.id)

    # Use in-memory progress when sync is running (DB hasn't committed yet),
    # fall back to DB count for stable state.
    progress = _get_sync_progress(user.id)
    if syncing and progress:
        synced_count = sum(progress.get(k, 0) for k in ("created", "updated", "skipped"))
    else:
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
        has_write_scope=has_write_scope,
        sync_error=prefs.gcal_sync_error,
        syncing=syncing,
    )


@router.post("/enable", response_model=SyncEnableResponse)
@limiter.limit(BACKUP_LIMIT, key_func=get_user_or_ip)
async def enable_sync(
    request: Request,
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

    # Find existing Whendoist calendar or create a new one (also cleans up duplicates)
    try:
        async with GoogleCalendarClient(db, google_token) as client:
            calendar_id, created = await client.find_or_create_calendar(GCAL_SYNC_CALENDAR_NAME)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 403:
            google_token.gcal_write_scope = False
            await db.commit()
            return SyncEnableResponse(
                success=False,
                message="Calendar write access expired. Please re-authorize with Google.",
                needs_reauth=True,
                reauth_url="/auth/google?write_scope=true",
            )
        logger.exception(f"Failed to find/create Whendoist calendar: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail="Failed to create calendar in Google.") from e
    except Exception as e:
        logger.exception(f"Failed to find/create Whendoist calendar: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail="Failed to create calendar in Google.") from e

    # If reusing an existing calendar, stale events will be cleared
    # in the background task before bulk_sync runs (avoids blocking the response).
    clear_stale = not created

    # Always clear sync records — bulk_sync will recreate them from current task state.
    await db.execute(
        delete(GoogleCalendarEventSync).where(
            GoogleCalendarEventSync.user_id == user.id,
        )
    )

    # Enable sync
    prefs.gcal_sync_enabled = True
    prefs.gcal_sync_calendar_id = calendar_id
    await db.commit()

    # Run bulk sync in background so enable returns instantly.
    # If reusing a calendar, clear stale events first.
    asyncio.create_task(_background_bulk_sync(user.id, clear_calendar=clear_stale))

    msg = (
        "Sync enabled. Syncing tasks in background (may take up to 10 min)..."
        if not clear_stale
        else "Sync re-enabled. Syncing tasks in background (may take up to 10 min)..."
    )
    return SyncEnableResponse(
        success=True,
        message=msg,
        calendar_id=calendar_id,
    )


@router.post("/disable", response_model=SyncDisableResponse)
@limiter.limit(BACKUP_LIMIT, key_func=get_user_or_ip)
async def disable_sync(
    request: Request,
    data: SyncDisableRequest | None = None,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Disable Google Calendar sync. Optionally delete all synced events."""
    prefs_service = PreferencesService(db, user.id)
    prefs = await prefs_service.get_preferences()

    if not prefs.gcal_sync_enabled and not prefs.gcal_sync_error:
        return SyncDisableResponse(success=True, message="Sync was already disabled.")

    # Signal any running background sync to stop immediately
    _cancel_sync(user.id)

    deleted_count = 0
    calendar_id = prefs.gcal_sync_calendar_id
    if data and data.delete_events and calendar_id:
        # Delete the entire Whendoist calendar (1 API call) instead of
        # looping through individual events which can take minutes and timeout.
        try:
            token_result = await db.execute(select(GoogleToken).where(GoogleToken.user_id == user.id))
            google_token = token_result.scalar_one_or_none()
            if google_token:
                async with GoogleCalendarClient(db, google_token) as client:
                    await client.delete_calendar(calendar_id)
                # Count sync records for the response message
                count_result = await db.execute(select(func.count()).where(GoogleCalendarEventSync.user_id == user.id))
                deleted_count = count_result.scalar() or 0
        except Exception:
            logger.exception(f"Failed to delete Whendoist calendar for user {user.id}")

    # Always clean up sync records
    await db.execute(delete(GoogleCalendarEventSync).where(GoogleCalendarEventSync.user_id == user.id))

    prefs.gcal_sync_enabled = False
    prefs.gcal_sync_calendar_id = None
    prefs.gcal_sync_error = None
    await db.commit()

    msg = f"Sync disabled. {deleted_count} events deleted." if deleted_count else "Sync disabled."
    return SyncDisableResponse(success=True, message=msg, deleted_count=deleted_count)


@router.post("/full-sync", response_model=BulkSyncResponse)
@limiter.limit(BACKUP_LIMIT, key_func=get_user_or_ip)
async def full_sync(
    request: Request,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Trigger a full re-sync of all tasks (runs in background)."""
    prefs_service = PreferencesService(db, user.id)
    prefs = await prefs_service.get_preferences()

    if not prefs.gcal_sync_enabled:
        raise HTTPException(status_code=400, detail="Sync is not enabled.")

    if _is_sync_running(user.id):
        return BulkSyncResponse(success=True, error="Sync already in progress.")

    # Clear all sync records so bulk_sync recreates every event from scratch,
    # instead of skipping tasks whose hash hasn't changed.
    await db.execute(
        delete(GoogleCalendarEventSync).where(
            GoogleCalendarEventSync.user_id == user.id,
        )
    )
    await db.commit()

    asyncio.create_task(_background_bulk_sync(user.id, clear_calendar=True))

    return BulkSyncResponse(success=True)
