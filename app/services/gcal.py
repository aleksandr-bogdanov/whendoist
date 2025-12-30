"""
Google Calendar API client.

Provides async access to calendars and events via Google Calendar API v3.
Handles automatic token refresh when access tokens expire.
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime

import httpx

from app.auth.google import refresh_access_token
from app.models import GoogleToken

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

    Automatically refreshes expired access tokens using the refresh token.

    Usage:
        async with GoogleCalendarClient(google_token) as client:
            calendars = await client.list_calendars()

    Note: After using the client, commit the database session to persist
    any token refreshes.
    """

    def __init__(self, google_token: GoogleToken):
        self.google_token = google_token
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> "GoogleCalendarClient":
        await self._ensure_valid_token()
        self._client = httpx.AsyncClient(
            base_url=GOOGLE_CALENDAR_API,
            headers={"Authorization": f"Bearer {self.google_token.access_token}"},
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

    async def _ensure_valid_token(self) -> None:
        """Refresh token if expired."""
        if (
            self.google_token.expires_at
            and self.google_token.expires_at <= datetime.now(UTC)
            and self.google_token.refresh_token
        ):
            tokens = await refresh_access_token(self.google_token.refresh_token)
            self.google_token.access_token = tokens["access_token"]
            if "refresh_token" in tokens:
                self.google_token.refresh_token = tokens["refresh_token"]
            # Note: caller needs to commit the session to persist

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
    ) -> list[GoogleEvent]:
        """Fetch events from a calendar within a time range."""
        client = self._ensure_client()
        params = {
            "timeMin": time_min.isoformat(),
            "timeMax": time_max.isoformat(),
            "singleEvents": "true",
            "orderBy": "startTime",
            "maxResults": 250,
        }

        response = await client.get(f"/calendars/{calendar_id}/events", params=params)
        response.raise_for_status()
        data = response.json()

        events = []
        for item in data.get("items", []):
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

            events.append(
                GoogleEvent(
                    id=item["id"],
                    summary=item.get("summary", "Untitled"),
                    description=item.get("description"),
                    start=start_dt,
                    end=end_dt,
                    all_day=all_day,
                    calendar_id=calendar_id,
                )
            )

        return events
