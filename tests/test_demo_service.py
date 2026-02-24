"""
Demo service unit tests.

Tests demo user creation, seeding, reset, cleanup, and email detection.
Uses SQLite in-memory database for fast unit testing.
"""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import DEMO_EMAIL_SUFFIX
from app.models import Domain, Task, TaskInstance, User
from app.services.demo_service import DemoService


@pytest.fixture
async def demo_service(db_session: AsyncSession) -> DemoService:
    """Create a DemoService instance."""
    return DemoService(db_session)


class TestDemoEmail:
    """Tests for demo email detection and profile extraction."""

    def test_is_demo_user_positive(self):
        assert DemoService.is_demo_user(f"demo-demo-abc12345{DEMO_EMAIL_SUFFIX}") is True
        assert DemoService.is_demo_user(f"demo-blank-xyz99999{DEMO_EMAIL_SUFFIX}") is True
        # Legacy format
        assert DemoService.is_demo_user(f"demo-demo{DEMO_EMAIL_SUFFIX}") is True

    def test_is_demo_user_negative(self):
        assert DemoService.is_demo_user("user@gmail.com") is False
        assert DemoService.is_demo_user("admin@whendoist.com") is False
        assert DemoService.is_demo_user("") is False

    def test_extract_profile(self):
        assert DemoService.extract_profile(f"demo-demo-abc12345{DEMO_EMAIL_SUFFIX}") == "demo"
        assert DemoService.extract_profile(f"demo-blank-xyz{DEMO_EMAIL_SUFFIX}") == "blank"
        assert DemoService.extract_profile(f"demo-encrypted-123{DEMO_EMAIL_SUFFIX}") == "encrypted"
        # Legacy format
        assert DemoService.extract_profile(f"demo-demo{DEMO_EMAIL_SUFFIX}") == "demo"

    def test_extract_profile_invalid(self):
        assert DemoService.extract_profile("user@gmail.com") is None
        assert DemoService.extract_profile(f"notdemo-demo{DEMO_EMAIL_SUFFIX}") is None
        assert DemoService.extract_profile("") is None


class TestGetOrCreateDemoUser:
    """Tests for demo user creation."""

    async def test_create_demo_profile(self, db_session: AsyncSession, demo_service: DemoService):
        """Demo profile creates user with domains, active tasks, completed tasks, and instances."""
        user = await demo_service.get_or_create_demo_user("demo")

        assert user.id is not None
        assert user.email.startswith("demo-demo-")
        assert user.email.endswith(DEMO_EMAIL_SUFFIX)
        assert user.name == "Demo User"
        assert user.wizard_completed is False

        # Verify 5 domains were seeded
        domains_result = await db_session.execute(select(Domain).where(Domain.user_id == user.id))
        domains = list(domains_result.scalars().all())
        assert len(domains) == 5

        # Verify tasks were seeded (active + completed + recurring + archived + thoughts + subtasks)
        tasks_result = await db_session.execute(select(func.count(Task.id)).where(Task.user_id == user.id))
        task_count = tasks_result.scalar()
        assert task_count is not None
        assert task_count >= 70  # ~35 active + ~30 completed + 8 recurring + 6 archived + 6 thoughts + 5 subtasks

    async def test_create_blank_profile(self, db_session: AsyncSession, demo_service: DemoService):
        """Blank profile creates user with no data."""
        user = await demo_service.get_or_create_demo_user("blank")

        assert user.email.startswith("demo-blank-")
        assert user.email.endswith(DEMO_EMAIL_SUFFIX)
        assert user.name == "Blank Slate"
        assert user.wizard_completed is False

        # No domains or tasks
        domains_result = await db_session.execute(select(func.count(Domain.id)).where(Domain.user_id == user.id))
        assert domains_result.scalar() == 0

        tasks_result = await db_session.execute(select(func.count(Task.id)).where(Task.user_id == user.id))
        assert tasks_result.scalar() == 0

    async def test_create_encrypted_profile(self, db_session: AsyncSession, demo_service: DemoService):
        """Encrypted profile creates user with no data."""
        user = await demo_service.get_or_create_demo_user("encrypted")

        assert user.email.startswith("demo-encrypted-")
        assert user.email.endswith(DEMO_EMAIL_SUFFIX)
        assert user.name == "Encryption Test"

    async def test_each_call_creates_unique_user(self, db_session: AsyncSession, demo_service: DemoService):
        """Two calls create two different users with isolated data."""
        user1 = await demo_service.get_or_create_demo_user("demo")
        user2 = await demo_service.get_or_create_demo_user("demo")

        assert user1.id != user2.id
        assert user1.email != user2.email

        # Each should have their own 5 domains
        for user in (user1, user2):
            domains_result = await db_session.execute(select(func.count(Domain.id)).where(Domain.user_id == user.id))
            assert domains_result.scalar() == 5

    async def test_invalid_profile_raises(self, demo_service: DemoService):
        """Invalid profile name raises ValueError."""
        with pytest.raises(ValueError, match="Invalid demo profile"):
            await demo_service.get_or_create_demo_user("nonexistent")


class TestSeedDataQuality:
    """Tests for seed data richness and analytics population."""

    async def test_completed_tasks_seeded(self, db_session: AsyncSession, demo_service: DemoService):
        """Verify completed tasks exist for analytics."""
        user = await demo_service.get_or_create_demo_user("demo")

        result = await db_session.execute(
            select(func.count(Task.id)).where(Task.user_id == user.id, Task.status == "completed")
        )
        completed_count = result.scalar()
        assert completed_count is not None
        assert completed_count >= 28

    async def test_archived_tasks_seeded(self, db_session: AsyncSession, demo_service: DemoService):
        """Verify archived tasks exist."""
        user = await demo_service.get_or_create_demo_user("demo")

        result = await db_session.execute(
            select(func.count(Task.id)).where(Task.user_id == user.id, Task.status == "archived")
        )
        archived_count = result.scalar()
        assert archived_count is not None
        assert archived_count >= 6

    async def test_subtasks_seeded(self, db_session: AsyncSession, demo_service: DemoService):
        """Verify subtasks exist under parent tasks."""
        user = await demo_service.get_or_create_demo_user("demo")

        result = await db_session.execute(
            select(func.count(Task.id)).where(Task.user_id == user.id, Task.parent_id.isnot(None))
        )
        subtask_count = result.scalar()
        assert subtask_count is not None
        assert subtask_count >= 5  # 3 for PRD + 2 for investor update

    async def test_recurring_instances_seeded(self, db_session: AsyncSession, demo_service: DemoService):
        """Verify recurring task instances were backfilled."""
        user = await demo_service.get_or_create_demo_user("demo")

        result = await db_session.execute(select(func.count(TaskInstance.id)).where(TaskInstance.user_id == user.id))
        instance_count = result.scalar()
        assert instance_count is not None
        assert instance_count >= 40  # 8 recurring tasks with 14 days of backfill

    async def test_five_domains_seeded(self, db_session: AsyncSession, demo_service: DemoService):
        """Verify all 5 domains are created."""
        user = await demo_service.get_or_create_demo_user("demo")

        result = await db_session.execute(select(Domain).where(Domain.user_id == user.id))
        domains = list(result.scalars().all())
        assert len(domains) == 5
        domain_names = {d.name for d in domains}
        assert domain_names == {"Work", "Health & Fitness", "Personal", "Side Project", "Learning"}

    async def test_analytics_data_populated(self, db_session: AsyncSession, demo_service: DemoService):
        """Verify completed tasks have varied hours and multiple impact levels for charts."""
        user = await demo_service.get_or_create_demo_user("demo")

        # Check multiple impact levels exist in completed tasks
        result = await db_session.execute(
            select(Task.impact).where(Task.user_id == user.id, Task.status == "completed").distinct()
        )
        impacts = {row[0] for row in result.all()}
        assert len(impacts) >= 3  # At least P1, P2, P3 represented

        # Check completed_at hours span multiple time periods
        result = await db_session.execute(
            select(Task.completed_at).where(
                Task.user_id == user.id,
                Task.status == "completed",
                Task.completed_at.isnot(None),
            )
        )
        hours = {row[0].hour for row in result.all() if row[0] is not None}
        assert len(hours) >= 5  # At least 5 distinct hours for "Active Hours" chart

    async def test_deterministic_seeding(self, db_session: AsyncSession, demo_service: DemoService):
        """Verify two demo users with same user_id pattern produce same instance statuses."""
        user = await demo_service.get_or_create_demo_user("demo")

        # Get all instance statuses ordered by date
        result = await db_session.execute(
            select(TaskInstance.status)
            .where(TaskInstance.user_id == user.id)
            .order_by(TaskInstance.instance_date, TaskInstance.id)
        )
        statuses_first = [row[0] for row in result.all()]

        # Reset same user — should produce identical data
        await demo_service.reset_demo_user(user.id)

        result = await db_session.execute(
            select(TaskInstance.status)
            .where(TaskInstance.user_id == user.id)
            .order_by(TaskInstance.instance_date, TaskInstance.id)
        )
        statuses_second = [row[0] for row in result.all()]

        assert statuses_first == statuses_second

    async def test_thoughts_seeded(self, db_session: AsyncSession, demo_service: DemoService):
        """Verify thoughts (tasks with no domain) are created."""
        user = await demo_service.get_or_create_demo_user("demo")

        result = await db_session.execute(
            select(func.count(Task.id)).where(
                Task.user_id == user.id,
                Task.domain_id.is_(None),
                Task.parent_id.is_(None),
                Task.status == "pending",
            )
        )
        thought_count = result.scalar()
        assert thought_count is not None
        assert thought_count >= 6

    async def test_overdue_tasks_seeded(self, db_session: AsyncSession, demo_service: DemoService):
        """Verify overdue tasks exist (past-dated, still pending)."""
        user = await demo_service.get_or_create_demo_user("demo")

        from app.constants import get_user_today

        today = get_user_today(None)
        result = await db_session.execute(
            select(func.count(Task.id)).where(
                Task.user_id == user.id,
                Task.status == "pending",
                Task.scheduled_date < today,
                Task.is_recurring.is_(False),
            )
        )
        overdue_count = result.scalar()
        assert overdue_count is not None
        assert overdue_count >= 3


class TestResetDemoUser:
    """Tests for demo user data reset."""

    async def test_reset_clears_and_reseeds(self, db_session: AsyncSession, demo_service: DemoService):
        """Reset clears custom data and re-seeds for demo profile."""
        user = await demo_service.get_or_create_demo_user("demo")

        # Add an extra task (simulating user activity)
        from app.services.task_service import TaskService

        task_service = TaskService(db_session, user.id)
        await task_service.create_task(title="User-created task")
        await db_session.commit()

        # Count tasks and instances before reset
        before_result = await db_session.execute(select(func.count(Task.id)).where(Task.user_id == user.id))
        before_count = before_result.scalar()

        before_instances = await db_session.execute(
            select(func.count(TaskInstance.id)).where(TaskInstance.user_id == user.id)
        )
        before_instance_count = before_instances.scalar()

        # Reset
        await demo_service.reset_demo_user(user.id)

        # Count tasks after reset (should be back to seed count, not seed + 1)
        after_result = await db_session.execute(select(func.count(Task.id)).where(Task.user_id == user.id))
        after_count = after_result.scalar()

        assert after_count is not None
        assert before_count is not None
        assert after_count < before_count  # Extra task was removed

        # Verify instances were also re-created
        after_instances = await db_session.execute(
            select(func.count(TaskInstance.id)).where(TaskInstance.user_id == user.id)
        )
        after_instance_count = after_instances.scalar()
        assert after_instance_count is not None
        assert before_instance_count is not None
        assert after_instance_count >= 40  # Instances re-seeded

    async def test_reset_blank_stays_empty(self, db_session: AsyncSession, demo_service: DemoService):
        """Reset on blank profile clears data and stays empty."""
        user = await demo_service.get_or_create_demo_user("blank")

        # Add a task
        from app.services.task_service import TaskService

        task_service = TaskService(db_session, user.id)
        await task_service.create_task(title="Should be deleted")
        await db_session.commit()

        # Reset
        await demo_service.reset_demo_user(user.id)

        # Should be empty again
        tasks_result = await db_session.execute(select(func.count(Task.id)).where(Task.user_id == user.id))
        assert tasks_result.scalar() == 0

    async def test_reset_noop_for_real_user(self, db_session: AsyncSession, demo_service: DemoService):
        """Reset is a no-op for non-demo users."""
        real_user = User(email="real@gmail.com", name="Real User")
        db_session.add(real_user)
        await db_session.commit()
        await db_session.refresh(real_user)

        # Should do nothing (not raise)
        await demo_service.reset_demo_user(real_user.id)

    async def test_reset_noop_for_missing_user(self, db_session: AsyncSession, demo_service: DemoService):
        """Reset is a no-op for non-existent user IDs."""
        await demo_service.reset_demo_user(99999)  # Should not raise


class TestCleanupStaleUsers:
    """Tests for stale demo user cleanup."""

    async def test_cleanup_deletes_old_users(self, db_session: AsyncSession, demo_service: DemoService):
        """Cleanup deletes demo users older than max_age_hours."""
        # Create a demo user and backdate its created_at
        user = User(
            email=f"demo-demo-old12345{DEMO_EMAIL_SUFFIX}",
            name="Old Demo",
            created_at=datetime.now(UTC) - timedelta(hours=48),
        )
        db_session.add(user)
        await db_session.commit()

        deleted = await demo_service.cleanup_stale_users(max_age_hours=24)
        await db_session.commit()

        assert deleted == 1

        # Verify user is gone
        result = await db_session.execute(select(User).where(User.id == user.id))
        assert result.scalar_one_or_none() is None

    async def test_cleanup_keeps_recent_users(self, db_session: AsyncSession, demo_service: DemoService):
        """Cleanup keeps demo users newer than max_age_hours."""
        user = await demo_service.get_or_create_demo_user("blank")

        deleted = await demo_service.cleanup_stale_users(max_age_hours=24)
        await db_session.commit()

        assert deleted == 0

        # Verify user still exists
        result = await db_session.execute(select(User).where(User.id == user.id))
        assert result.scalar_one_or_none() is not None

    async def test_cleanup_ignores_real_users(self, db_session: AsyncSession, demo_service: DemoService):
        """Cleanup never touches non-demo users regardless of age."""
        real_user = User(
            email="old@gmail.com",
            name="Old Real User",
            created_at=datetime.now(UTC) - timedelta(hours=48),
        )
        db_session.add(real_user)
        await db_session.commit()

        deleted = await demo_service.cleanup_stale_users(max_age_hours=24)
        await db_session.commit()

        assert deleted == 0

        # Real user still exists
        result = await db_session.execute(select(User).where(User.id == real_user.id))
        assert result.scalar_one_or_none() is not None

    async def test_cleanup_deletes_user_data(self, db_session: AsyncSession, demo_service: DemoService):
        """Cleanup deletes all associated data (tasks, domains, etc.)."""
        # Create a demo user with seed data
        user = await demo_service.get_or_create_demo_user("demo")
        user_id = user.id

        # Verify data exists
        tasks_before = await db_session.execute(select(func.count(Task.id)).where(Task.user_id == user_id))
        assert tasks_before.scalar() > 0

        # Backdate user to be stale
        user.created_at = datetime.now(UTC) - timedelta(hours=48)
        await db_session.commit()

        deleted = await demo_service.cleanup_stale_users(max_age_hours=24)
        await db_session.commit()

        assert deleted == 1

        # All data should be gone
        tasks_after = await db_session.execute(select(func.count(Task.id)).where(Task.user_id == user_id))
        assert tasks_after.scalar() == 0

        domains_after = await db_session.execute(select(func.count(Domain.id)).where(Domain.user_id == user_id))
        assert domains_after.scalar() == 0

    async def test_cleanup_runs_on_demo_login(self, db_session: AsyncSession, demo_service: DemoService):
        """Creating a demo user triggers cleanup of stale users."""
        # Create a stale user directly
        stale_user = User(
            email=f"demo-demo-stale123{DEMO_EMAIL_SUFFIX}",
            name="Stale Demo",
            created_at=datetime.now(UTC) - timedelta(hours=48),
        )
        db_session.add(stale_user)
        await db_session.commit()
        stale_email = stale_user.email

        # Creating a new demo user should trigger cleanup (default max_age=24h)
        new_user = await demo_service.get_or_create_demo_user("blank")

        # Stale user should be gone (use email match to avoid identity map caching)
        result = await db_session.execute(select(func.count(User.id)).where(User.email == stale_email))
        assert result.scalar() == 0

        # New user should exist
        result = await db_session.execute(select(func.count(User.id)).where(User.id == new_user.id))
        assert result.scalar() == 1
