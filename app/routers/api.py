"""
API endpoints for Whendoist.

Provides JSON API for Todoist projects, Google Calendar events, and calendar management.
"""

import logging
from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import get_user_today
from app.database import get_db
from app.models import GoogleCalendarSelection, GoogleToken, TodoistToken, User
from app.routers.auth import require_user
from app.services.calendar_cache import get_calendar_cache
from app.services.gcal import GoogleCalendarClient
from app.services.preferences_service import PreferencesService
from app.services.todoist import TodoistClient

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["api"])


# =============================================================================
# Response Models
# =============================================================================


class ProjectResponse(BaseModel):
    """Todoist project information."""

    id: str
    name: str
    color: str


class EventResponse(BaseModel):
    """Google Calendar event."""

    id: str
    summary: str
    description: str | None
    start: datetime
    end: datetime
    all_day: bool
    calendar_id: str
    html_link: str | None


class CalendarResponse(BaseModel):
    """Google Calendar with enabled status."""

    id: str
    summary: str
    primary: bool
    background_color: str
    enabled: bool


# =============================================================================
# Endpoints
# =============================================================================


@router.get("/projects", response_model=list[ProjectResponse])
async def get_projects(
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all projects."""
    result = await db.execute(select(TodoistToken).where(TodoistToken.user_id == user.id))
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=400, detail="Todoist not connected")

    async with TodoistClient(token.access_token) as client:
        projects = await client.get_projects()

    return [ProjectResponse(id=p.id, name=p.name, color=p.color) for p in projects]


@router.get("/events", response_model=list[EventResponse])
async def get_events(
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
    start_date: date = Query(default=None),
    end_date: date = Query(default=None),
):
    """Get calendar events for enabled calendars."""
    # Default to today and tomorrow (using user's timezone)
    if not start_date:
        prefs_service = PreferencesService(db, user.id)
        timezone = await prefs_service.get_timezone()
        start_date = get_user_today(timezone)
    if not end_date:
        end_date = start_date + timedelta(days=2)

    # Get Google token
    result = await db.execute(select(GoogleToken).where(GoogleToken.user_id == user.id))
    google_token = result.scalar_one_or_none()
    if not google_token:
        raise HTTPException(status_code=400, detail="Google Calendar not connected")

    # Get enabled calendars
    result = await db.execute(
        select(GoogleCalendarSelection).where(
            GoogleCalendarSelection.user_id == user.id,
            GoogleCalendarSelection.enabled == True,
        )
    )
    selections = result.scalars().all()

    if not selections:
        return []

    time_min = datetime.combine(start_date, datetime.min.time(), tzinfo=UTC)
    time_max = datetime.combine(end_date, datetime.max.time(), tzinfo=UTC)

    all_events = []
    async with GoogleCalendarClient(db, google_token) as client:
        for selection in selections:
            try:
                events = await client.get_events(selection.calendar_id, time_min, time_max)
                all_events.extend(events)
            except Exception as e:
                # Skip calendars that fail (might have been deleted or permissions changed)
                logger.debug(f"Failed to fetch calendar {selection.calendar_id}: {e}")
                continue

    # Token refresh commits internally; no explicit commit needed here

    # Sort by start time
    all_events.sort(key=lambda e: e.start)

    return [
        EventResponse(
            id=e.id,
            summary=e.summary,
            description=e.description,
            start=e.start,
            end=e.end,
            all_day=e.all_day,
            calendar_id=e.calendar_id,
            html_link=e.html_link,
        )
        for e in all_events
    ]


@router.get("/calendars", response_model=list[CalendarResponse])
async def get_calendars(
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all available calendars with their enabled status."""
    # Get Google token
    result = await db.execute(select(GoogleToken).where(GoogleToken.user_id == user.id))
    google_token = result.scalar_one_or_none()
    if not google_token:
        raise HTTPException(status_code=400, detail="Google Calendar not connected")

    # Get current selections
    result = await db.execute(select(GoogleCalendarSelection).where(GoogleCalendarSelection.user_id == user.id))
    selections = {s.calendar_id: s for s in result.scalars().all()}

    async with GoogleCalendarClient(db, google_token) as client:
        calendars = await client.list_calendars()

    # Token refresh commits internally; no explicit commit needed here

    responses = []
    for cal in calendars:
        selection = selections.get(cal.id)
        responses.append(
            CalendarResponse(
                id=cal.id,
                summary=cal.summary,
                primary=cal.primary,
                background_color=cal.background_color,
                enabled=selection.enabled if selection else False,
            )
        )

    return responses


@router.post("/calendars/{calendar_id}/toggle")
async def toggle_calendar(
    calendar_id: str,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Toggle a calendar's enabled status."""
    # Get Google token to verify connection and get calendar info
    result = await db.execute(select(GoogleToken).where(GoogleToken.user_id == user.id))
    google_token = result.scalar_one_or_none()
    if not google_token:
        raise HTTPException(status_code=400, detail="Google Calendar not connected")

    # Get or create selection
    result = await db.execute(
        select(GoogleCalendarSelection).where(
            GoogleCalendarSelection.user_id == user.id,
            GoogleCalendarSelection.calendar_id == calendar_id,
        )
    )
    selection = result.scalar_one_or_none()

    if selection:
        selection.enabled = not selection.enabled
    else:
        # Need to get calendar name
        async with GoogleCalendarClient(db, google_token) as client:
            calendars = await client.list_calendars()
        cal = next((c for c in calendars if c.id == calendar_id), None)
        if not cal:
            raise HTTPException(status_code=404, detail="Calendar not found")

        selection = GoogleCalendarSelection(
            user_id=user.id,
            calendar_id=calendar_id,
            calendar_name=cal.summary,
            enabled=True,
        )
        db.add(selection)

    await db.commit()

    # Invalidate calendar cache when selection changes
    get_calendar_cache().invalidate_user(user.id)

    return {"enabled": selection.enabled}


class CalendarSelectionsRequest(BaseModel):
    """Request body for bulk calendar selections."""

    calendar_ids: list[str] = Field(max_length=100)


@router.post("/calendars/selections")
async def set_calendar_selections(
    request: CalendarSelectionsRequest,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Set which calendars are enabled (from wizard)."""
    # Get Google token to verify connection and get calendar info
    result = await db.execute(select(GoogleToken).where(GoogleToken.user_id == user.id))
    google_token = result.scalar_one_or_none()
    if not google_token:
        raise HTTPException(status_code=400, detail="Google Calendar not connected")

    # Get all available calendars
    async with GoogleCalendarClient(db, google_token) as client:
        calendars = await client.list_calendars()
    calendar_map = {c.id: c for c in calendars}

    # Get existing selections
    result = await db.execute(select(GoogleCalendarSelection).where(GoogleCalendarSelection.user_id == user.id))
    existing = {s.calendar_id: s for s in result.scalars().all()}

    # Update/create selections
    for cal_id in request.calendar_ids:
        if cal_id not in calendar_map:
            continue  # Skip invalid calendar IDs

        cal = calendar_map[cal_id]
        if cal_id in existing:
            existing[cal_id].enabled = True
        else:
            selection = GoogleCalendarSelection(
                user_id=user.id,
                calendar_id=cal_id,
                calendar_name=cal.summary,
                enabled=True,
            )
            db.add(selection)

    # Disable calendars not in the selection list
    for cal_id, selection in existing.items():
        if cal_id not in request.calendar_ids:
            selection.enabled = False

    await db.commit()

    # Invalidate calendar cache when selections change
    get_calendar_cache().invalidate_user(user.id)

    return {"success": True, "enabled_count": len(request.calendar_ids)}
