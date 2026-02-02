"""
Google Calendar API client.

Provides async access to calendars and events via Google Calendar API v3.
Handles automatic token refresh with:
- Database-based locking to prevent race conditions
- Proactive refresh before expiration
- Retry with exponential backoff
- Pagination for large result sets
"""

import asyncio
import hashlib
import json
import logging
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.google import TokenRefreshError, refresh_access_token
from app.constants import (
    GCAL_MAX_EVENTS,
    GCAL_PAGE_SIZE,
    GCAL_SYNC_DEFAULT_DURATION_MINUTES,
    TOKEN_REFRESH_BACKOFF_BASE,
    TOKEN_REFRESH_BUFFER_SECONDS,
    TOKEN_REFRESH_MAX_RETRIES,
)
from app.models import GoogleToken

logger = logging.getLogger("whendoist.gcal")

GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3"


@dataclass
class GoogleCalendar:
    """Google Calendar metadata."""

    id: str
    summary: str
    primary: bool
    background_color: str


@dataclass
class GoogleEvent:
    """Google Calendar event."""

    id: str
    summary: str
    description: str | None
    start: datetime
    end: datetime
    all_day: bool
    calendar_id: str


class GoogleCalendarClient:
    """
    Async Google Calendar API client.

    Automatically refreshes expired access tokens using the refresh token,
    with database-based locking to prevent race conditions when multiple
    requests trigger refresh simultaneously.

    Usage:
        async with GoogleCalendarClient(db, google_token) as client:
            calendars = await client.list_calendars()

    Note: The database session is used for token refresh locking and
    will be committed after refresh. The caller should handle their
    own transactions for other operations.
    """

    def __init__(self, db: AsyncSession, google_token: GoogleToken):
        """
        Initialize the client.

        Args:
            db: Database session for token refresh locking
            google_token: The user's Google token (must be attached to session)
        """
        self.db = db
        self.google_token = google_token
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> "GoogleCalendarClient":
        await self._ensure_valid_token()
        self._client = httpx.AsyncClient(
            base_url=GOOGLE_CALENDAR_API,
            headers={"Authorization": f"Bearer {self.google_token.access_token}"},
            timeout=30.0,
        )
        return self

    async def __aexit__(self, *args) -> None:
        if self._client:
            await self._client.aclose()

    def _ensure_client(self) -> httpx.AsyncClient:
        """Return the HTTP client, raising if not initialized."""
        if self._client is None:
            raise RuntimeError("Client not initialized. Use 'async with GoogleCalendarClient(...) as client:'")
        return self._client

    def _needs_refresh(self) -> bool:
        """Check if token needs refresh (expired or expiring within buffer)."""
        if not self.google_token.expires_at:
            return False
        if not self.google_token.refresh_token:
            return False

        # Proactive refresh: refresh if expiring within 5 minutes
        buffer = timedelta(seconds=TOKEN_REFRESH_BUFFER_SECONDS)
        now = datetime.now(UTC)

        # Handle both timezone-aware and naive datetimes (SQLite strips timezone)
        expires_at = self.google_token.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)

        return expires_at <= now + buffer

    async def _try_acquire_lock_and_refresh(self) -> bool:
        """
        Try to acquire lock on token row and refresh.

        Uses FOR UPDATE SKIP LOCKED to avoid blocking if another
        request is already refreshing.

        Returns:
            True if we refreshed the token, False if locked by another request
        """
        # Try to lock the token row
        # SKIP LOCKED returns empty result if row is locked
        stmt = select(GoogleToken).where(GoogleToken.id == self.google_token.id).with_for_update(skip_locked=True)
        result = await self.db.execute(stmt)
        locked_token = result.scalar_one_or_none()

        if locked_token is None:
            # Row is locked by another request
            logger.debug(f"Token {self.google_token.id} locked by another request")
            return False

        # We have the lock - check if still needs refresh
        # (another request might have refreshed it before we got the lock)
        if not self._needs_refresh():
            logger.debug(f"Token {self.google_token.id} already refreshed by another request")
            return True

        # Perform the refresh
        try:
            # refresh_token is guaranteed non-None here (checked in _needs_refresh)
            assert self.google_token.refresh_token is not None
            tokens = await refresh_access_token(self.google_token.refresh_token)

            # Update token - use locked_token which is attached to session
            locked_token.access_token = tokens["access_token"]
            if "refresh_token" in tokens:
                # Google may rotate refresh tokens
                locked_token.refresh_token = tokens["refresh_token"]
            if "expires_in" in tokens:
                locked_token.expires_at = datetime.now(UTC) + timedelta(seconds=tokens["expires_in"])

            # Commit to release lock and persist changes
            await self.db.commit()

            # Update our reference to match
            self.google_token.access_token_encrypted = locked_token.access_token_encrypted
            if "refresh_token" in tokens:
                self.google_token.refresh_token_encrypted = locked_token.refresh_token_encrypted
            self.google_token.expires_at = locked_token.expires_at

            logger.info(f"Token {self.google_token.id} refreshed successfully")
            return True

        except TokenRefreshError:
            # Rollback to release lock
            await self.db.rollback()
            raise

    async def _ensure_valid_token(self) -> None:
        """
        Ensure access token is valid, refreshing if needed.

        Uses database locking to prevent race conditions when multiple
        concurrent requests need to refresh the same token.

        Implements retry with backoff when another request holds the lock.
        """
        if not self._needs_refresh():
            return

        for attempt in range(TOKEN_REFRESH_MAX_RETRIES):
            # Re-check after potential wait
            if not self._needs_refresh():
                return

            if await self._try_acquire_lock_and_refresh():
                return

            # Another request is refreshing - wait and retry
            backoff = TOKEN_REFRESH_BACKOFF_BASE * (2**attempt)
            logger.debug(f"Waiting {backoff}s for token refresh by another request")
            await asyncio.sleep(backoff)

            # Reload token to see if it was refreshed
            await self.db.refresh(self.google_token)

        # If we get here, we couldn't refresh after retries
        # Last attempt - force refresh even if we don't get lock
        logger.warning("Forcing token refresh after lock acquisition timeout")
        try:
            # refresh_token is guaranteed non-None here (checked in _needs_refresh)
            assert self.google_token.refresh_token is not None
            tokens = await refresh_access_token(self.google_token.refresh_token)
            self.google_token.access_token = tokens["access_token"]
            if "refresh_token" in tokens:
                self.google_token.refresh_token = tokens["refresh_token"]
            if "expires_in" in tokens:
                self.google_token.expires_at = datetime.now(UTC) + timedelta(seconds=tokens["expires_in"])
            await self.db.commit()
        except TokenRefreshError:
            await self.db.rollback()
            raise

    async def list_calendars(self) -> list[GoogleCalendar]:
        """List all calendars the user has access to."""
        client = self._ensure_client()
        response = await client.get("/users/me/calendarList")
        response.raise_for_status()
        data = response.json()

        calendars = []
        for item in data.get("items", []):
            calendars.append(
                GoogleCalendar(
                    id=item["id"],
                    summary=item.get("summary", "Untitled"),
                    primary=item.get("primary", False),
                    background_color=item.get("backgroundColor", "#000000"),
                )
            )
        return calendars

    async def get_events(
        self,
        calendar_id: str,
        time_min: datetime,
        time_max: datetime,
        max_events: int = GCAL_MAX_EVENTS,
    ) -> list[GoogleEvent]:
        """
        Fetch events from a calendar within a time range.

        Handles pagination automatically to fetch all events up to max_events.

        Args:
            calendar_id: The calendar to fetch from
            time_min: Start of time range
            time_max: End of time range
            max_events: Maximum events to return (default: 1000)

        Returns:
            List of GoogleEvent objects sorted by start time
        """
        client = self._ensure_client()
        events: list[GoogleEvent] = []
        page_token: str | None = None

        while len(events) < max_events:
            # Calculate how many more we need
            remaining = max_events - len(events)
            page_size = min(GCAL_PAGE_SIZE, remaining)

            params: dict[str, str | int] = {
                "timeMin": time_min.isoformat(),
                "timeMax": time_max.isoformat(),
                "singleEvents": "true",
                "orderBy": "startTime",
                "maxResults": page_size,
            }
            if page_token:
                params["pageToken"] = page_token

            response = await client.get(f"/calendars/{calendar_id}/events", params=params)
            response.raise_for_status()
            data = response.json()

            # Process events from this page
            for item in data.get("items", []):
                if len(events) >= max_events:
                    break
                event = self._parse_event(item, calendar_id)
                if event:
                    events.append(event)

            # Check for more pages
            page_token = data.get("nextPageToken")
            if not page_token:
                break

            logger.debug(f"Fetched page of {len(data.get('items', []))} events, total: {len(events)}")

        return events

    def _parse_event(self, item: dict, calendar_id: str) -> GoogleEvent | None:
        """Parse a Google Calendar event item into GoogleEvent."""
        try:
            start_data = item.get("start", {})
            end_data = item.get("end", {})

            # Check if all-day event
            if "date" in start_data:
                # All-day event
                start_date = date.fromisoformat(start_data["date"])
                end_date = date.fromisoformat(end_data["date"])
                start_dt = datetime.combine(start_date, datetime.min.time(), tzinfo=UTC)
                end_dt = datetime.combine(end_date, datetime.min.time(), tzinfo=UTC)
                all_day = True
            else:
                # Timed event
                start_dt = datetime.fromisoformat(start_data["dateTime"].replace("Z", "+00:00"))
                end_dt = datetime.fromisoformat(end_data["dateTime"].replace("Z", "+00:00"))
                all_day = False

            return GoogleEvent(
                id=item["id"],
                summary=item.get("summary", "Untitled"),
                description=item.get("description"),
                start=start_dt,
                end=end_dt,
                all_day=all_day,
                calendar_id=calendar_id,
            )
        except (KeyError, ValueError) as e:
            logger.warning(f"Failed to parse event {item.get('id')}: {e}")
            return None

    # =========================================================================
    # Write Methods (for Google Calendar Sync)
    # =========================================================================

    async def create_calendar(self, name: str = "Whendoist") -> str:
        """Create a new secondary calendar. Returns the calendar_id."""
        client = self._ensure_client()
        response = await client.post(
            "/calendars",
            json={"summary": name},
        )
        response.raise_for_status()
        data = response.json()
        return data["id"]

    async def find_or_create_calendar(self, name: str = "Whendoist") -> tuple[str, bool]:
        """Find existing calendar by name or create a new one.

        Returns (calendar_id, created) where created is True if a new calendar was made.
        If multiple calendars with the same name exist, reuses the first and deletes the rest.
        """
        calendars = await self.list_calendars()
        matches = [c for c in calendars if c.summary == name and not c.primary]

        if matches:
            # Reuse first match, clean up duplicates
            calendar_id = matches[0].id
            for dup in matches[1:]:
                try:
                    await self.delete_calendar(dup.id)
                    logger.info(f"Deleted duplicate '{name}' calendar: {dup.id}")
                except Exception:
                    logger.warning(f"Failed to delete duplicate calendar {dup.id}")
            return calendar_id, False

        # No existing calendar found, create one
        calendar_id = await self.create_calendar(name)
        return calendar_id, True

    async def delete_calendar(self, calendar_id: str) -> None:
        """Delete a secondary calendar. Silently ignores 404/410."""
        client = self._ensure_client()
        try:
            response = await client.delete(f"/calendars/{calendar_id}")
            if response.status_code not in (204, 404, 410):
                response.raise_for_status()
        except httpx.HTTPStatusError as e:
            if e.response.status_code not in (404, 410):
                raise

    async def clear_all_events(self, calendar_id: str) -> int:
        """Delete all events from a calendar. Returns count of deleted events.

        Fetches all event IDs via pagination, then deletes each one.
        Silently ignores 404/410 for individual events.
        """
        client = self._ensure_client()
        event_ids: list[str] = []
        page_token: str | None = None

        # Collect all event IDs
        while True:
            params: dict[str, str | int] = {"maxResults": 250}
            if page_token:
                params["pageToken"] = page_token
            response = await client.get(f"/calendars/{calendar_id}/events", params=params)
            response.raise_for_status()
            data = response.json()
            for item in data.get("items", []):
                if "id" in item:
                    event_ids.append(item["id"])
            page_token = data.get("nextPageToken")
            if not page_token:
                break

        # Delete each event
        for event_id in event_ids:
            try:
                await self.delete_event(calendar_id, event_id)
            except Exception:
                logger.debug(f"Failed to clear event {event_id} from calendar {calendar_id}")

        return len(event_ids)

    async def create_event(self, calendar_id: str, event: dict) -> str:
        """Create an event in the specified calendar. Returns the event_id."""
        client = self._ensure_client()
        response = await client.post(
            f"/calendars/{calendar_id}/events",
            json=event,
        )
        response.raise_for_status()
        data = response.json()
        return data["id"]

    async def update_event(self, calendar_id: str, event_id: str, event: dict) -> None:
        """Update an existing event."""
        client = self._ensure_client()
        response = await client.put(
            f"/calendars/{calendar_id}/events/{event_id}",
            json=event,
        )
        response.raise_for_status()

    async def delete_event(self, calendar_id: str, event_id: str) -> None:
        """Delete an event. Silently ignores 404/410 (already deleted)."""
        client = self._ensure_client()
        try:
            response = await client.delete(
                f"/calendars/{calendar_id}/events/{event_id}",
            )
            # 204 No Content is success, 404/410 means already deleted
            if response.status_code not in (204, 404, 410):
                response.raise_for_status()
        except httpx.HTTPStatusError as e:
            if e.response.status_code in (404, 410):
                logger.debug(f"Event {event_id} already deleted from Google Calendar")
            else:
                raise


def build_event_data(
    title: str,
    description: str | None,
    scheduled_date: date,
    scheduled_time: time | None,
    duration_minutes: int | None,
    impact: int,
    is_completed: bool,
    user_timezone: str,
) -> dict:
    """
    Build a Google Calendar event payload from task fields.

    Args:
        title: Task title (plaintext)
        description: Task description
        scheduled_date: The date the task is scheduled for
        scheduled_time: Optional time of day
        duration_minutes: Duration in minutes (used for timed events)
        impact: Priority level (1-4)
        is_completed: Whether the task is completed
        user_timezone: IANA timezone string
    """
    summary = f"\u2713 {title}" if is_completed else title

    event: dict = {
        "summary": summary,
        "description": description or "",
    }

    if scheduled_time:
        # Timed event
        start_dt = datetime.combine(scheduled_date, scheduled_time)
        duration = duration_minutes or GCAL_SYNC_DEFAULT_DURATION_MINUTES
        end_dt = start_dt + timedelta(minutes=duration)
        event["start"] = {"dateTime": start_dt.isoformat(), "timeZone": user_timezone}
        event["end"] = {"dateTime": end_dt.isoformat(), "timeZone": user_timezone}
    else:
        # All-day event
        event["start"] = {"date": scheduled_date.isoformat()}
        end_date = scheduled_date + timedelta(days=1)
        event["end"] = {"date": end_date.isoformat()}

    # No colorId — events inherit the Whendoist calendar's color
    # (user can set this in Google Calendar settings)

    return event


def compute_sync_hash(
    title: str,
    description: str | None,
    scheduled_date: date,
    scheduled_time: time | None,
    duration_minutes: int | None,
    impact: int,
    status: str,
) -> str:
    """Compute a hash of syncable fields to detect changes."""
    data = json.dumps(
        {
            "title": title,
            "description": description or "",
            "scheduled_date": scheduled_date.isoformat(),
            "scheduled_time": scheduled_time.isoformat() if scheduled_time else None,
            "duration_minutes": duration_minutes,
            "impact": impact,
            "status": status,
        },
        sort_keys=True,
    )
    return hashlib.sha256(data.encode()).hexdigest()[:16]
