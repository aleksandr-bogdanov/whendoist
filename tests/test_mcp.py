"""
MCP (Model Context Protocol) endpoint tests.

Verifies:
- MCP endpoint is reachable at /mcp (both with and without trailing slash)
- Authentication via Bearer token is enforced
- POST, GET, DELETE methods are accepted (not 405)
- SPA catch-all does not intercept /mcp paths
- Tool-level integration tests for all MCP tools (SQLite)
"""

from datetime import UTC, date, datetime, time

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.main import app
from app.models import Task, TaskInstance, User
from app.routers.device_auth import _create_access_token
from app.services.preferences_service import PreferencesService
from app.services.recurrence_service import RecurrenceService
from app.services.task_service import TaskService


@pytest.fixture
async def client():
    """Create an async test client for the FastAPI app."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest.fixture
def auth_headers():
    """Create valid Bearer token headers for user_id=1."""
    token = _create_access_token(user_id=1)
    return {"Authorization": f"Bearer {token}"}


# =============================================================================
# Routing: /mcp must not return 405 (Method Not Allowed)
# =============================================================================


class TestMCPRouting:
    """Verify /mcp requests reach the MCP handler, not the SPA catch-all."""

    @pytest.mark.asyncio
    async def test_post_mcp_no_trailing_slash_not_405(self, client: AsyncClient):
        """POST /mcp must not return 405 — this was the original bug."""
        response = await client.post("/mcp")
        assert response.status_code != 405, "POST /mcp returned 405 — SPA catch-all is intercepting"

    @pytest.mark.asyncio
    async def test_post_mcp_trailing_slash_not_405(self, client: AsyncClient):
        """POST /mcp/ must not return 405."""
        response = await client.post("/mcp/")
        assert response.status_code != 405, "POST /mcp/ returned 405"

    @pytest.mark.asyncio
    async def test_get_mcp_not_html(self, client: AsyncClient):
        """GET /mcp must not return the SPA HTML page."""
        response = await client.get("/mcp")
        content_type = response.headers.get("content-type", "")
        assert "text/html" not in content_type, "GET /mcp returned HTML — SPA catch-all is intercepting"

    @pytest.mark.asyncio
    async def test_delete_mcp_not_405(self, client: AsyncClient):
        """DELETE /mcp must not return 405."""
        response = await client.delete("/mcp")
        assert response.status_code != 405, "DELETE /mcp returned 405"


# =============================================================================
# Authentication: Bearer token required
# =============================================================================


class TestMCPAuthentication:
    """Verify MCP endpoint enforces Bearer token authentication."""

    @pytest.mark.asyncio
    async def test_post_without_auth_returns_401(self, client: AsyncClient):
        """POST /mcp without Authorization header must return 401."""
        response = await client.post("/mcp", json={"jsonrpc": "2.0", "method": "initialize", "id": 1})
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_post_without_auth_returns_bearer_challenge(self, client: AsyncClient):
        """401 response must include WWW-Authenticate: Bearer header."""
        response = await client.post("/mcp")
        assert "WWW-Authenticate" in response.headers
        assert "Bearer" in response.headers["WWW-Authenticate"]

    @pytest.mark.asyncio
    async def test_post_with_invalid_token_returns_401(self, client: AsyncClient):
        """POST /mcp with an invalid Bearer token must return 401."""
        response = await client.post(
            "/mcp",
            headers={"Authorization": "Bearer invalid-token-here"},
            json={"jsonrpc": "2.0", "method": "initialize", "id": 1},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_post_with_valid_token_not_401(self, auth_headers: dict):
        """POST /mcp with a valid Bearer token must not return 401.

        Uses raise_app_exceptions=False because FastMCP's session manager
        requires lifespan initialization (which httpx doesn't send). The
        RuntimeError would propagate as a Python exception otherwise. We
        only care that auth succeeded (not 401), even if MCP itself errors.
        """
        transport = ASGITransport(app=app, raise_app_exceptions=False)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.post(
                "/mcp",
                headers=auth_headers,
                json={"jsonrpc": "2.0", "method": "initialize", "id": 1},
            )
        assert response.status_code != 401, "Valid token was rejected"

    @pytest.mark.asyncio
    async def test_trailing_slash_without_auth_returns_401(self, client: AsyncClient):
        """POST /mcp/ without auth must also return 401 (not 405)."""
        response = await client.post("/mcp/")
        assert response.status_code == 401


# =============================================================================
# Tool-level integration tests (SQLite)
# =============================================================================


@pytest.fixture
async def user(db_session: AsyncSession) -> User:
    """Create a test user for MCP tool tests."""
    user = User(email="mcp-test@example.com", name="MCP Test User")
    db_session.add(user)
    await db_session.flush()
    return user


@pytest.fixture
async def task_svc(db_session: AsyncSession, user: User) -> TaskService:
    """Create a TaskService for the test user."""
    return TaskService(db_session, user.id)


@pytest.fixture
async def recurrence_svc(db_session: AsyncSession, user: User) -> RecurrenceService:
    """Create a RecurrenceService for the test user."""
    return RecurrenceService(db_session, user.id)


@pytest.fixture
async def prefs_svc(db_session: AsyncSession, user: User) -> PreferencesService:
    """Create a PreferencesService for the test user."""
    return PreferencesService(db_session, user.id)


@pytest.mark.unit
class TestTaskLifecycle:
    """Test archive/restore round-trip via service layer (same code MCP tools call)."""

    @pytest.mark.asyncio
    async def test_archive_and_restore_round_trip(self, db_session: AsyncSession, task_svc: TaskService):
        """Create → archive → verify hidden → restore → verify visible."""
        task = await task_svc.create_task(title="Archivable task")
        await db_session.flush()
        task_id = task.id

        # Archive
        archived = await task_svc.archive_task(task_id)
        assert archived is not None
        assert archived.status == "archived"

        # Should not appear in pending list
        pending = await task_svc.get_tasks(status="pending")
        assert all(t.id != task_id for t in pending)

        # Should appear in archived list
        archived_tasks = await task_svc.get_tasks(status="archived")
        assert any(t.id == task_id for t in archived_tasks)

        # Restore
        restored = await task_svc.restore_task(task_id)
        assert restored is not None
        assert restored.status == "pending"

        # Should appear in pending list again
        pending = await task_svc.get_tasks(status="pending")
        assert any(t.id == task_id for t in pending)

    @pytest.mark.asyncio
    async def test_archive_nonexistent_task(self, task_svc: TaskService):
        """Archiving a non-existent task returns None."""
        result = await task_svc.archive_task(99999)
        assert result is None

    @pytest.mark.asyncio
    async def test_restore_non_archived_task(self, db_session: AsyncSession, task_svc: TaskService):
        """Restoring a pending (not archived) task returns None."""
        task = await task_svc.create_task(title="Not archived")
        await db_session.flush()

        result = await task_svc.restore_task(task.id)
        assert result is None


@pytest.mark.unit
class TestBatchOperations:
    """Test batch update and complete patterns."""

    @pytest.mark.asyncio
    async def test_batch_update_impact(self, db_session: AsyncSession, task_svc: TaskService):
        """Batch update impact on multiple tasks."""
        t1 = await task_svc.create_task(title="Task A", impact=4)
        t2 = await task_svc.create_task(title="Task B", impact=4)
        await db_session.flush()

        # Update both to high impact
        for tid in [t1.id, t2.id]:
            updated = await task_svc.update_task(tid, impact=1)
            assert updated is not None
            assert updated.impact == 1

    @pytest.mark.asyncio
    async def test_batch_complete(self, db_session: AsyncSession, task_svc: TaskService):
        """Batch complete multiple tasks."""
        t1 = await task_svc.create_task(title="Complete me A")
        t2 = await task_svc.create_task(title="Complete me B")
        await db_session.flush()

        for tid in [t1.id, t2.id]:
            completed = await task_svc.complete_task(tid)
            assert completed is not None
            assert completed.status == "completed"

    @pytest.mark.asyncio
    async def test_batch_update_with_invalid_id(self, task_svc: TaskService):
        """Updating a non-existent task returns None (not an error)."""
        result = await task_svc.update_task(99999, impact=1)
        assert result is None


@pytest.mark.unit
class TestRecurringInstances:
    """Test skip/unskip/reschedule on recurring task instances."""

    @pytest.fixture
    async def recurring_task_with_instance(self, db_session: AsyncSession, user: User) -> tuple[Task, TaskInstance]:
        """Create a recurring task and manually add an instance."""
        task = Task(
            user_id=user.id,
            title="Daily standup",
            status="pending",
            impact=2,
            is_recurring=True,
            recurrence_rule={"freq": "daily", "interval": 1},
            recurrence_start=date(2026, 3, 1),
            scheduled_time=time(9, 0),
        )
        db_session.add(task)
        await db_session.flush()

        instance = TaskInstance(
            task_id=task.id,
            user_id=user.id,
            instance_date=date(2026, 3, 15),
            status="pending",
        )
        db_session.add(instance)
        await db_session.flush()

        return task, instance

    @pytest.mark.asyncio
    async def test_skip_instance(
        self,
        db_session: AsyncSession,
        recurrence_svc: RecurrenceService,
        recurring_task_with_instance: tuple[Task, TaskInstance],
    ):
        """Skip an instance and verify status changes."""
        _, instance = recurring_task_with_instance
        result = await recurrence_svc.skip_instance(instance.id)
        assert result is not None
        assert result.status == "skipped"

    @pytest.mark.asyncio
    async def test_unskip_instance(
        self,
        db_session: AsyncSession,
        recurrence_svc: RecurrenceService,
        recurring_task_with_instance: tuple[Task, TaskInstance],
    ):
        """Skip then unskip an instance — should be pending again."""
        _, instance = recurring_task_with_instance

        await recurrence_svc.skip_instance(instance.id)
        result = await recurrence_svc.unskip_instance(instance.id)
        assert result is not None
        assert result.status == "pending"

    @pytest.mark.asyncio
    async def test_reschedule_instance(
        self,
        db_session: AsyncSession,
        recurrence_svc: RecurrenceService,
        recurring_task_with_instance: tuple[Task, TaskInstance],
    ):
        """Reschedule an instance to a new datetime."""
        _, instance = recurring_task_with_instance
        new_dt = datetime(2026, 3, 20, 14, 0, tzinfo=UTC)
        result = await recurrence_svc.schedule_instance(instance.id, new_dt)
        assert result is not None
        assert result.scheduled_datetime is not None

    @pytest.mark.asyncio
    async def test_skip_nonexistent_instance(self, recurrence_svc: RecurrenceService):
        """Skipping a non-existent instance returns None."""
        result = await recurrence_svc.skip_instance(99999)
        assert result is None


@pytest.mark.unit
class TestDomainManagement:
    """Test domain update and archive via service layer."""

    @pytest.mark.asyncio
    async def test_update_domain(self, db_session: AsyncSession, task_svc: TaskService):
        """Update domain name and icon."""
        domain = await task_svc.create_domain(name="Old Name")
        await db_session.flush()

        updated = await task_svc.update_domain(domain.id, name="New Name", icon="🚀")
        assert updated is not None
        assert updated.name == "New Name"
        assert updated.icon == "🚀"

    @pytest.mark.asyncio
    async def test_archive_domain(self, db_session: AsyncSession, task_svc: TaskService):
        """Archive a domain."""
        domain = await task_svc.create_domain(name="Archive Me")
        await db_session.flush()

        archived = await task_svc.archive_domain(domain.id)
        assert archived is not None
        assert archived.is_archived is True

    @pytest.mark.asyncio
    async def test_update_nonexistent_domain(self, task_svc: TaskService):
        """Updating a non-existent domain returns None."""
        result = await task_svc.update_domain(99999, name="Ghost")
        assert result is None

    @pytest.mark.asyncio
    async def test_archive_nonexistent_domain(self, task_svc: TaskService):
        """Archiving a non-existent domain returns None."""
        result = await task_svc.archive_domain(99999)
        assert result is None


@pytest.mark.unit
class TestPreferences:
    """Test preferences retrieval (same pattern as get_preferences MCP tool)."""

    @pytest.mark.asyncio
    async def test_get_preferences_creates_defaults(self, db_session: AsyncSession, prefs_svc: PreferencesService):
        """Getting preferences for a new user creates defaults."""
        prefs = await prefs_svc.get_preferences()
        assert prefs is not None
        assert prefs.encryption_enabled is False

    @pytest.mark.asyncio
    async def test_get_timezone_default_none(self, prefs_svc: PreferencesService):
        """Default timezone is None."""
        tz = await prefs_svc.get_timezone()
        assert tz is None


@pytest.mark.unit
class TestRecentCompletions:
    """Test recent completions query (same pattern as get_recent_completions tool)."""

    @pytest.mark.asyncio
    async def test_complete_task_appears_in_recent(self, db_session: AsyncSession, task_svc: TaskService, user: User):
        """A completed task should appear in recent completions."""
        task = await task_svc.create_task(title="Finish report")
        await db_session.flush()

        await task_svc.complete_task(task.id)
        await db_session.flush()

        from app.services.analytics_service import AnalyticsService

        analytics = AnalyticsService(db_session, user.id)
        completions = await analytics.get_recent_completions(limit=10)

        assert len(completions) >= 1
        titles = [c["title"] for c in completions]
        assert "Finish report" in titles

    @pytest.mark.asyncio
    async def test_no_completions_returns_empty(self, db_session: AsyncSession, user: User):
        """No completions returns empty list."""
        from app.services.analytics_service import AnalyticsService

        analytics = AnalyticsService(db_session, user.id)
        completions = await analytics.get_recent_completions(limit=10)
        assert completions == []
