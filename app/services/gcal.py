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
import logging
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.google import TokenRefreshError, refresh_access_token
from app.constants import (
    GCAL_MAX_EVENTS,
    GCAL_PAGE_SIZE,
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
