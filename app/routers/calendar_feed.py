"""
iCal calendar subscription feed endpoints.

Provides an unauthenticated .ics feed URL for calendar app subscriptions
(Apple Calendar, Google Calendar, Outlook) and authenticated management
endpoints to enable/disable/regenerate the feed.
"""

import logging
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.constants import DEFAULT_TIMEZONE
from app.database import get_db
from app.middleware.rate_limit import BACKUP_LIMIT, get_user_or_ip, limiter
from app.models import User, UserPreferences
from app.routers.auth import require_user
from app.services.calendar_feed import generate_feed
from app.services.preferences_service import PreferencesService

logger = logging.getLogger("whendoist.calendar_feed")

router = APIRouter(prefix="/calendar-feed", tags=["calendar-feed"])

# In-memory cache: user_id → (data_version, ics_bytes)
_feed_cache: dict[int, tuple[int, bytes]] = {}


# =============================================================================
# Response Models
# =============================================================================


class FeedStatusResponse(BaseModel):
    enabled: bool
    feed_url: str | None = None
    gcal_sync_enabled: bool = False
    encryption_enabled: bool = False


class FeedEnableResponse(BaseModel):
    success: bool
    message: str
    feed_url: str | None = None


class FeedDisableResponse(BaseModel):
    success: bool
    message: str


class FeedRegenerateResponse(BaseModel):
    success: bool
    message: str
    feed_url: str | None = None


# =============================================================================
# Helper
# =============================================================================


def _build_feed_url(token: str) -> str:
    """Build the full feed URL from a token."""
    base_url = get_settings().base_url
    return f"{base_url}/api/v1/calendar-feed/{token}.ics"


# =============================================================================
# Unauthenticated Feed Endpoint
# =============================================================================


@router.get("/{token}.ics", include_in_schema=False)
@limiter.limit("30/minute")
async def get_feed(
    request: Request,
    token: str,
    db: AsyncSession = Depends(get_db),
) -> Response:
    """
    Serve the iCal feed for calendar app subscriptions.

    Unauthenticated — token in URL is the auth mechanism.
    Rate limited by IP to prevent abuse.
    """
    # Look up user by feed_token
    result = await db.execute(select(UserPreferences).where(UserPreferences.feed_token == token))
    prefs = result.scalar_one_or_none()
    if not prefs:
        raise HTTPException(status_code=404, detail="Not found")

    # Block if encryption is enabled
    if prefs.encryption_enabled:
        raise HTTPException(
            status_code=403,
            detail="Calendar feed is unavailable when E2E encryption is enabled.",
        )

    user_id = prefs.user_id
    timezone = prefs.timezone or DEFAULT_TIMEZONE

    # Look up current data_version
    user_result = await db.execute(select(User.data_version).where(User.id == user_id))
    row = user_result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    data_version = row[0]

    # Check in-memory cache
    cached = _feed_cache.get(user_id)
    if cached and cached[0] == data_version:
        ics_bytes = cached[1]
    else:
        # Generate fresh feed
        ics_bytes = await generate_feed(db, user_id, timezone)
        _feed_cache[user_id] = (data_version, ics_bytes)

    return Response(
        content=ics_bytes,
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": 'inline; filename="whendoist.ics"',
            "Referrer-Policy": "no-referrer",
            "ETag": f'"{data_version}"',
            "Cache-Control": "no-cache",
        },
    )


# =============================================================================
# Authenticated Management Endpoints
# =============================================================================


@router.get("/status", response_model=FeedStatusResponse)
async def get_feed_status(
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> FeedStatusResponse:
    """Get calendar feed status for the current user."""
    prefs_service = PreferencesService(db, user.id)
    prefs = await prefs_service.get_preferences()

    feed_url = _build_feed_url(prefs.feed_token) if prefs.feed_token else None

    return FeedStatusResponse(
        enabled=prefs.feed_token is not None,
        feed_url=feed_url,
        gcal_sync_enabled=prefs.gcal_sync_enabled,
        encryption_enabled=prefs.encryption_enabled,
    )


@router.post("/enable", response_model=FeedEnableResponse)
@limiter.limit(BACKUP_LIMIT, key_func=get_user_or_ip)
async def enable_feed(
    request: Request,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> FeedEnableResponse:
    """Enable the calendar feed and generate a token."""
    prefs_service = PreferencesService(db, user.id)
    prefs = await prefs_service.get_preferences()

    if prefs.encryption_enabled:
        raise HTTPException(
            status_code=400,
            detail="Cannot enable calendar feed when E2E encryption is enabled.",
        )

    if prefs.feed_token:
        return FeedEnableResponse(
            success=True,
            message="Calendar feed is already enabled.",
            feed_url=_build_feed_url(prefs.feed_token),
        )

    token = secrets.token_urlsafe(32)
    prefs.feed_token = token
    await db.commit()

    feed_url = _build_feed_url(token)
    logger.info(f"Calendar feed enabled for user {user.id}")

    return FeedEnableResponse(
        success=True,
        message="Calendar feed enabled.",
        feed_url=feed_url,
    )


@router.post("/disable", response_model=FeedDisableResponse)
@limiter.limit(BACKUP_LIMIT, key_func=get_user_or_ip)
async def disable_feed(
    request: Request,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> FeedDisableResponse:
    """Disable the calendar feed and clear the token."""
    prefs_service = PreferencesService(db, user.id)
    prefs = await prefs_service.get_preferences()

    prefs.feed_token = None
    await db.commit()

    # Clear cache
    _feed_cache.pop(user.id, None)

    logger.info(f"Calendar feed disabled for user {user.id}")
    return FeedDisableResponse(success=True, message="Calendar feed disabled.")


@router.post("/regenerate", response_model=FeedRegenerateResponse)
@limiter.limit(BACKUP_LIMIT, key_func=get_user_or_ip)
async def regenerate_feed(
    request: Request,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> FeedRegenerateResponse:
    """Generate a new feed token. The old URL stops working immediately."""
    prefs_service = PreferencesService(db, user.id)
    prefs = await prefs_service.get_preferences()

    if prefs.encryption_enabled:
        raise HTTPException(
            status_code=400,
            detail="Cannot regenerate calendar feed when E2E encryption is enabled.",
        )

    token = secrets.token_urlsafe(32)
    prefs.feed_token = token
    await db.commit()

    # Clear cache (old token is invalid)
    _feed_cache.pop(user.id, None)

    feed_url = _build_feed_url(token)
    logger.info(f"Calendar feed token regenerated for user {user.id}")

    return FeedRegenerateResponse(
        success=True,
        message="Feed URL regenerated. The old URL no longer works.",
        feed_url=feed_url,
    )
