"""
Demo service unit tests.

Tests demo user creation, seeding, reset, and email detection.
Uses SQLite in-memory database for fast unit testing.
"""

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
    """Tests for demo email generation and detection."""

    def test_demo_email_generation(self):
        assert DemoService.demo_email("demo") == f"demo-demo{DEMO_EMAIL_SUFFIX}"
        assert DemoService.demo_email("blank") == f"demo-blank{DEMO_EMAIL_SUFFIX}"
        assert DemoService.demo_email("encrypted") == f"demo-encrypted{DEMO_EMAIL_SUFFIX}"

    def test_is_demo_user_positive(self):
        assert DemoService.is_demo_user(f"demo-demo{DEMO_EMAIL_SUFFIX}") is True
        assert DemoService.is_demo_user(f"demo-blank{DEMO_EMAIL_SUFFIX}") is True

    def test_is_demo_user_negative(self):
        assert DemoService.is_demo_user("user@gmail.com") is False
        assert DemoService.is_demo_user("admin@whendoist.com") is False
        assert DemoService.is_demo_user("") is False


class TestGetOrCreateDemoUser:
    """Tests for demo user creation."""

    async def test_create_demo_profile(self, db_session: AsyncSession, demo_service: DemoService):
        """Demo profile creates user with domains, active tasks, completed tasks, and instances."""
        user = await demo_service.get_or_create_demo_user("demo")

        assert user.id is not None
        assert user.email == f"demo-demo{DEMO_EMAIL_SUFFIX}"
        assert user.name == "Demo User"
        assert user.wizard_completed is False

        # Verify domains were seeded
        domains_result = await db_session.execute(select(Domain).where(Domain.user_id == user.id))
        domains = list(domains_result.scalars().all())
        assert len(domains) == 4

        # Verify tasks were seeded (active + completed + recurring + thoughts)
        tasks_result = await db_session.execute(select(func.count(Task.id)).where(Task.user_id == user.id))
        task_count = tasks_result.scalar()
        assert task_count is not None
        assert task_count >= 40  # ~17 active + ~28 completed + 4 recurring + 4 thoughts

    async def test_create_blank_profile(self, db_session: AsyncSession, demo_service: DemoService):
        """Blank profile creates user with no data."""
        user = await demo_service.get_or_create_demo_user("blank")

        assert user.email == f"demo-blank{DEMO_EMAIL_SUFFIX}"
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

        assert user.email == f"demo-encrypted{DEMO_EMAIL_SUFFIX}"
        assert user.name == "Encryption Test"

    async def test_idempotent_creation(self, db_session: AsyncSession, demo_service: DemoService):
        """Second call returns the same user, doesn't duplicate."""
        user1 = await demo_service.get_or_create_demo_user("demo")
        user2 = await demo_service.get_or_create_demo_user("demo")

        assert user1.id == user2.id

        # Should still have only 4 domains (not 8)
        domains_result = await db_session.execute(select(func.count(Domain.id)).where(Domain.user_id == user1.id))
        assert domains_result.scalar() == 4

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
        assert completed_count >= 25

    async def test_recurring_instances_seeded(self, db_session: AsyncSession, demo_service: DemoService):
        """Verify recurring task instances were backfilled."""
        user = await demo_service.get_or_create_demo_user("demo")

        result = await db_session.execute(select(func.count(TaskInstance.id)).where(TaskInstance.user_id == user.id))
        instance_count = result.scalar()
        assert instance_count is not None
        assert instance_count >= 20  # 4 recurring tasks x ~5+ instances each

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
        assert after_instance_count >= 20  # Instances re-seeded

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
