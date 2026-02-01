"""
Google Calendar service tests.

Tests for:
- Event pagination handling
- Token refresh with database locking
- Retry with exponential backoff
- Proactive token refresh

v0.21.0: Google Calendar Robustness
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.auth.google import TokenRefreshError, refresh_access_token
from app.constants import (
    GCAL_MAX_EVENTS,
    GCAL_PAGE_SIZE,
    TOKEN_REFRESH_BUFFER_SECONDS,
)
from app.models import GoogleToken, User
from app.services.gcal import GoogleCalendarClient, GoogleEvent


@pytest.fixture
async def test_user(db_session):
    """Create a test user."""
    user = User(email="test@example.com", name="Test User")
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
async def google_token(db_session, test_user):
    """Create a Google token for the test user."""
    # Token that expires in 1 hour (not needing refresh)
    token = GoogleToken(
        user_id=test_user.id,
        access_token="test_access_token",
        refresh_token="test_refresh_token",
        expires_at=datetime.now(UTC) + timedelta(hours=1),
    )
    db_session.add(token)
    await db_session.commit()
    await db_session.refresh(token)
    return token


@pytest.fixture
async def expired_token(db_session, test_user):
    """Create an expired Google token."""
    token = GoogleToken(
        user_id=test_user.id,
        access_token="expired_access_token",
        refresh_token="test_refresh_token",
        expires_at=datetime.now(UTC) - timedelta(minutes=5),
    )
    db_session.add(token)
    await db_session.commit()
    await db_session.refresh(token)
    return token


@pytest.fixture
async def expiring_soon_token(db_session, test_user):
    """Create a token that expires within the buffer period."""
    token = GoogleToken(
        user_id=test_user.id,
        access_token="expiring_access_token",
        refresh_token="test_refresh_token",
        # Expires in 3 minutes (within 5 min buffer)
        expires_at=datetime.now(UTC) + timedelta(minutes=3),
    )
    db_session.add(token)
    await db_session.commit()
    await db_session.refresh(token)
    return token


def make_event_item(event_id: str, summary: str, start_time: datetime) -> dict:
    """Create a mock Google Calendar event item."""
    end_time = start_time + timedelta(hours=1)
    return {
        "id": event_id,
        "summary": summary,
        "start": {"dateTime": start_time.isoformat()},
        "end": {"dateTime": end_time.isoformat()},
    }


def make_events_response(events: list[dict], next_page_token: str | None = None) -> dict:
    """Create a mock Google Calendar events response."""
    response = {"items": events}
    if next_page_token:
        response["nextPageToken"] = next_page_token
    return response


class TestPagination:
    """Test event pagination handling."""

    @pytest.mark.asyncio
    async def test_single_page_events(self, db_session, google_token):
        """Events fitting in one page should be returned directly."""
        events = [make_event_item(f"event_{i}", f"Event {i}", datetime.now(UTC)) for i in range(5)]

        with patch("app.services.gcal.httpx.AsyncClient") as mock_client_class:
            mock_client = MagicMock()
            mock_client_class.return_value = mock_client

            mock_response = MagicMock()
            mock_response.json.return_value = make_events_response(events)
            mock_response.raise_for_status = MagicMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client.aclose = AsyncMock()

            async with GoogleCalendarClient(db_session, google_token) as client:
                result = await client.get_events(
                    "calendar_id",
                    datetime.now(UTC),
                    datetime.now(UTC) + timedelta(days=7),
                )

            assert len(result) == 5
            assert all(isinstance(e, GoogleEvent) for e in result)

    @pytest.mark.asyncio
    async def test_multi_page_events(self, db_session, google_token):
        """Events spanning multiple pages should all be fetched."""
        page1_events = [make_event_item(f"event_{i}", f"Event {i}", datetime.now(UTC)) for i in range(250)]
        page2_events = [make_event_item(f"event_{i}", f"Event {i}", datetime.now(UTC)) for i in range(250, 400)]

        responses = [
            make_events_response(page1_events, next_page_token="token_page2"),
            make_events_response(page2_events),
        ]
        response_iter = iter(responses)

        with patch("app.services.gcal.httpx.AsyncClient") as mock_client_class:
            mock_client = MagicMock()
            mock_client_class.return_value = mock_client

            async def get_next_response(*args, **kwargs):
                mock_response = MagicMock()
                mock_response.json.return_value = next(response_iter)
                mock_response.raise_for_status = MagicMock()
                return mock_response

            mock_client.get = AsyncMock(side_effect=get_next_response)
            mock_client.aclose = AsyncMock()

            async with GoogleCalendarClient(db_session, google_token) as client:
                result = await client.get_events(
                    "calendar_id",
                    datetime.now(UTC),
                    datetime.now(UTC) + timedelta(days=30),
                )

            assert len(result) == 400
            # Verify pagination was used (2 API calls)
            assert mock_client.get.call_count == 2

    @pytest.mark.asyncio
    async def test_max_events_limit_respected(self, db_session, google_token):
        """Should stop fetching when max_events is reached."""
        # Create more events than we want to fetch
        page1_events = [make_event_item(f"event_{i}", f"Event {i}", datetime.now(UTC)) for i in range(250)]

        with patch("app.services.gcal.httpx.AsyncClient") as mock_client_class:
            mock_client = MagicMock()
            mock_client_class.return_value = mock_client

            mock_response = MagicMock()
            mock_response.json.return_value = make_events_response(page1_events, next_page_token="more_pages")
            mock_response.raise_for_status = MagicMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client.aclose = AsyncMock()

            async with GoogleCalendarClient(db_session, google_token) as client:
                result = await client.get_events(
                    "calendar_id",
                    datetime.now(UTC),
                    datetime.now(UTC) + timedelta(days=30),
                    max_events=100,  # Limit to 100
                )

            assert len(result) == 100
            # Should only make 1 request since we got enough events
            assert mock_client.get.call_count == 1

    @pytest.mark.asyncio
    async def test_default_max_events(self, db_session, google_token):
        """Default max_events should be GCAL_MAX_EVENTS (1000)."""
        # Verify the default parameter
        assert GCAL_MAX_EVENTS == 1000
        assert GCAL_PAGE_SIZE == 250


class TestProactiveRefresh:
    """Test proactive token refresh."""

    @pytest.mark.asyncio
    async def test_token_not_expiring_no_refresh(self, db_session, google_token):
        """Token with plenty of time left should not trigger refresh."""
        client = GoogleCalendarClient(db_session, google_token)
        assert not client._needs_refresh()

    @pytest.mark.asyncio
    async def test_token_expiring_within_buffer_triggers_refresh(self, db_session, expiring_soon_token):
        """Token expiring within 5 minutes should trigger refresh."""
        client = GoogleCalendarClient(db_session, expiring_soon_token)
        assert client._needs_refresh()

    @pytest.mark.asyncio
    async def test_expired_token_triggers_refresh(self, db_session, expired_token):
        """Expired token should trigger refresh."""
        client = GoogleCalendarClient(db_session, expired_token)
        assert client._needs_refresh()

    @pytest.mark.asyncio
    async def test_buffer_period_is_5_minutes(self):
        """Verify buffer period is 5 minutes (300 seconds)."""
        assert TOKEN_REFRESH_BUFFER_SECONDS == 300


class TestTokenRefreshRetry:
    """Test retry logic with exponential backoff."""

    @pytest.mark.asyncio
    async def test_successful_refresh_on_first_try(self):
        """Successful refresh should return tokens immediately."""
        with patch("app.services.gcal.httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value.__aenter__.return_value = mock_client

            mock_response = MagicMock()
            mock_response.json.return_value = {
                "access_token": "new_token",
                "expires_in": 3600,
            }
            mock_response.raise_for_status = MagicMock()
            mock_client.post.return_value = mock_response

            result = await refresh_access_token("refresh_token")

            assert result["access_token"] == "new_token"
            assert mock_client.post.call_count == 1

    @pytest.mark.asyncio
    async def test_retry_on_server_error(self):
        """Should retry on 5xx server errors."""
        with patch("app.services.gcal.httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value.__aenter__.return_value = mock_client

            # First two calls fail with 500, third succeeds
            error_response = MagicMock()
            error_response.status_code = 500
            error_response.raise_for_status.side_effect = httpx.HTTPStatusError(
                "Server Error", request=MagicMock(), response=error_response
            )

            success_response = MagicMock()
            success_response.json.return_value = {"access_token": "new_token", "expires_in": 3600}
            success_response.raise_for_status = MagicMock()

            mock_client.post.side_effect = [error_response, error_response, success_response]

            with patch("asyncio.sleep", new_callable=AsyncMock):
                result = await refresh_access_token("refresh_token")

            assert result["access_token"] == "new_token"
            assert mock_client.post.call_count == 3

    @pytest.mark.asyncio
    async def test_no_retry_on_client_error(self):
        """Should not retry on 4xx client errors (except 429)."""
        with patch("app.services.gcal.httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value.__aenter__.return_value = mock_client

            error_response = MagicMock()
            error_response.status_code = 400
            error_response.raise_for_status.side_effect = httpx.HTTPStatusError(
                "Bad Request", request=MagicMock(), response=error_response
            )
            mock_client.post.return_value = error_response

            with pytest.raises(TokenRefreshError, match="400"):
                await refresh_access_token("refresh_token")

            # Should only try once for client errors
            assert mock_client.post.call_count == 1

    @pytest.mark.asyncio
    async def test_retry_on_rate_limit(self):
        """Should retry on 429 rate limit errors."""
        with patch("app.services.gcal.httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value.__aenter__.return_value = mock_client

            rate_limit_response = MagicMock()
            rate_limit_response.status_code = 429
            rate_limit_response.raise_for_status.side_effect = httpx.HTTPStatusError(
                "Too Many Requests", request=MagicMock(), response=rate_limit_response
            )

            success_response = MagicMock()
            success_response.json.return_value = {"access_token": "new_token", "expires_in": 3600}
            success_response.raise_for_status = MagicMock()

            mock_client.post.side_effect = [rate_limit_response, success_response]

            with patch("asyncio.sleep", new_callable=AsyncMock):
                result = await refresh_access_token("refresh_token")

            assert result["access_token"] == "new_token"
            assert mock_client.post.call_count == 2

    @pytest.mark.asyncio
    async def test_fails_after_max_retries(self):
        """Should raise TokenRefreshError after max retries."""
        with patch("app.services.gcal.httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value.__aenter__.return_value = mock_client

            # All attempts fail with timeout
            mock_client.post.side_effect = httpx.TimeoutException("Timeout")

            with patch("asyncio.sleep", new_callable=AsyncMock), pytest.raises(TokenRefreshError, match="failed after"):
                await refresh_access_token("refresh_token")

            # Should try 3 times (TOKEN_REFRESH_MAX_RETRIES)
            assert mock_client.post.call_count == 3

    @pytest.mark.asyncio
    async def test_refresh_token_rotation_handled(self):
        """Should handle Google rotating the refresh token."""
        with patch("app.services.gcal.httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value.__aenter__.return_value = mock_client

            mock_response = MagicMock()
            mock_response.json.return_value = {
                "access_token": "new_access_token",
                "refresh_token": "new_refresh_token",  # Rotated!
                "expires_in": 3600,
            }
            mock_response.raise_for_status = MagicMock()
            mock_client.post.return_value = mock_response

            result = await refresh_access_token("old_refresh_token")

            assert result["access_token"] == "new_access_token"
            assert result["refresh_token"] == "new_refresh_token"


class TestDatabaseLocking:
    """Test database-based locking for concurrent refresh."""

    @pytest.mark.asyncio
    async def test_client_needs_db_session(self, db_session, google_token):
        """GoogleCalendarClient should require db session."""
        # This should work
        client = GoogleCalendarClient(db_session, google_token)
        assert client.db is db_session
        assert client.google_token is google_token

    @pytest.mark.asyncio
    async def test_lock_prevents_concurrent_refresh(self, db_session, expired_token):
        """When token is locked, other requests should wait and retry."""
        # This test verifies the locking behavior conceptually
        # In practice, the FOR UPDATE SKIP LOCKED returns None when locked
        client = GoogleCalendarClient(db_session, expired_token)

        # Simulate the lock being held by another request
        with patch.object(client, "_try_acquire_lock_and_refresh", new_callable=AsyncMock) as mock_lock:
            # First call returns False (locked), second returns True (refreshed by other)
            mock_lock.side_effect = [False, True]

            with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
                # Set _needs_refresh to return True initially, then False after "refresh"
                call_count = [0]

                def mock_needs_refresh():
                    call_count[0] += 1
                    return call_count[0] <= 2

                client._needs_refresh = mock_needs_refresh

                await client._ensure_valid_token()

                # Should have called sleep at least once while waiting
                assert mock_sleep.called


class TestEventParsing:
    """Test event parsing handles edge cases."""

    @pytest.mark.asyncio
    async def test_all_day_event_parsing(self, db_session, google_token):
        """All-day events should be parsed correctly."""
        all_day_event = {
            "id": "all_day_1",
            "summary": "All Day Event",
            "start": {"date": "2025-01-22"},
            "end": {"date": "2025-01-23"},
        }

        with patch("app.services.gcal.httpx.AsyncClient") as mock_client_class:
            mock_client = MagicMock()
            mock_client_class.return_value = mock_client

            mock_response = MagicMock()
            mock_response.json.return_value = make_events_response([all_day_event])
            mock_response.raise_for_status = MagicMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client.aclose = AsyncMock()

            async with GoogleCalendarClient(db_session, google_token) as client:
                result = await client.get_events(
                    "calendar_id",
                    datetime.now(UTC),
                    datetime.now(UTC) + timedelta(days=7),
                )

            assert len(result) == 1
            assert result[0].all_day is True
            assert result[0].summary == "All Day Event"

    @pytest.mark.asyncio
    async def test_malformed_event_skipped(self, db_session, google_token):
        """Malformed events should be skipped with warning."""
        events = [
            {
                "id": "good_event",
                "summary": "Good",
                "start": {"dateTime": datetime.now(UTC).isoformat()},
                "end": {"dateTime": (datetime.now(UTC) + timedelta(hours=1)).isoformat()},
            },
            {"id": "bad_event"},  # Missing start/end
            {
                "id": "good_event_2",
                "summary": "Good 2",
                "start": {"dateTime": datetime.now(UTC).isoformat()},
                "end": {"dateTime": (datetime.now(UTC) + timedelta(hours=1)).isoformat()},
            },
        ]

        with patch("app.services.gcal.httpx.AsyncClient") as mock_client_class:
            mock_client = MagicMock()
            mock_client_class.return_value = mock_client

            mock_response = MagicMock()
            mock_response.json.return_value = make_events_response(events)
            mock_response.raise_for_status = MagicMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client.aclose = AsyncMock()

            async with GoogleCalendarClient(db_session, google_token) as client:
                result = await client.get_events(
                    "calendar_id",
                    datetime.now(UTC),
                    datetime.now(UTC) + timedelta(days=7),
                )

            # Should have 2 good events, bad one skipped
            assert len(result) == 2

    @pytest.mark.asyncio
    async def test_event_without_summary_gets_default(self, db_session, google_token):
        """Events without summary should get 'Untitled' as default."""
        event = {
            "id": "no_summary",
            # No "summary" field
            "start": {"dateTime": datetime.now(UTC).isoformat()},
            "end": {"dateTime": (datetime.now(UTC) + timedelta(hours=1)).isoformat()},
        }

        with patch("app.services.gcal.httpx.AsyncClient") as mock_client_class:
            mock_client = MagicMock()
            mock_client_class.return_value = mock_client

            mock_response = MagicMock()
            mock_response.json.return_value = make_events_response([event])
            mock_response.raise_for_status = MagicMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client.aclose = AsyncMock()

            async with GoogleCalendarClient(db_session, google_token) as client:
                result = await client.get_events(
                    "calendar_id",
                    datetime.now(UTC),
                    datetime.now(UTC) + timedelta(days=7),
                )

            assert len(result) == 1
            assert result[0].summary == "Untitled"
