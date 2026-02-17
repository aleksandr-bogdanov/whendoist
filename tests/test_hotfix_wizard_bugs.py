"""
Hotfix Tests - Wizard Bug Fixes.

These tests verify the fixes for the following issues:
1. Google user name only updated when user.name was empty
2. Domain creation allowed duplicates (not idempotent)

Test Category: Unit + Contract
Related Issues:
- User name shows email username instead of Google name
- Domains duplicated when wizard re-run

See tests/README.md for full test architecture.

Note: Wizard encryption tests were removed in v0.9 when the encryption step
was removed from the wizard to reduce onboarding friction. Encryption setup
is still available in Settings.
"""

from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User

# =============================================================================
# Google User Name Update Tests
# =============================================================================


class TestGoogleUserNameUpdate:
    """
    Verify Google OAuth callback always updates user name.

    Bug Fix: Previously auth.py only updated name when user.name was empty,
    leaving existing users with outdated names.
    """

    def test_callback_always_updates_name(self):
        """Google OAuth callback must always update name when available."""
        auth_file = Path(__file__).parent.parent / "app" / "routers" / "auth.py"
        source = auth_file.read_text()

        # Find google_callback function
        callback_section = source.split("async def google_callback")[1].split("async def")[0]

        # Must update name unconditionally (not "and not user.name")
        assert "elif name:" in callback_section
        # Should NOT have the old condition that only updates when empty
        assert "and not user.name" not in callback_section


# =============================================================================
# Idempotent Domain Creation Tests
# =============================================================================


class TestIdempotentDomainCreation:
    """
    Verify domain creation is idempotent (doesn't create duplicates).

    Bug Fix: Previously create_domain would always create new domains,
    causing duplicates when wizard was re-run.
    """

    def test_create_domain_checks_existing(self):
        """create_domain must check if domain already exists."""
        service_file = Path(__file__).parent.parent / "app" / "services" / "task_service.py"
        source = service_file.read_text()

        # Find create_domain function
        create_section = source.split("async def create_domain")[1].split("async def")[0]

        # Must check for existing domain with same name
        assert "Domain.name == name" in create_section or "name == name" in create_section

    def test_create_domain_returns_existing_if_found(self):
        """create_domain must return existing domain if found."""
        service_file = Path(__file__).parent.parent / "app" / "services" / "task_service.py"
        source = service_file.read_text()

        create_section = source.split("async def create_domain")[1].split("async def")[0]

        # Must have logic to return existing
        assert "if existing:" in create_section or "existing = result.scalar_one_or_none()" in create_section
        assert "return existing" in create_section


@pytest.mark.asyncio
class TestIdempotentDomainCreationIntegration:
    """Integration tests for idempotent domain creation."""

    async def test_create_domain_twice_returns_same(self, db_session: AsyncSession):
        """Creating a domain with same name twice returns the same domain."""
        from app.services.task_service import TaskService

        user = User(email="test@example.com")
        db_session.add(user)
        await db_session.flush()

        service = TaskService(db_session, user.id)

        # Create domain first time
        domain1 = await service.create_domain(name="Work", icon="💼")
        await db_session.flush()

        # Create domain with same name again
        domain2 = await service.create_domain(name="Work", icon="💼")
        await db_session.flush()

        # Should return same domain
        assert domain1.id == domain2.id

    async def test_create_domain_updates_icon_on_duplicate(self, db_session: AsyncSession):
        """Creating existing domain with new icon updates the icon."""
        from app.services.task_service import TaskService

        user = User(email="test@example.com")
        db_session.add(user)
        await db_session.flush()

        service = TaskService(db_session, user.id)

        # Create domain first time
        domain1 = await service.create_domain(name="Work", icon="📁")
        await db_session.flush()

        # Create domain with same name but different icon
        domain2 = await service.create_domain(name="Work", icon="💼")
        await db_session.flush()

        # Should return same domain with updated icon
        assert domain1.id == domain2.id
        assert domain2.icon == "💼"

    async def test_create_domain_preserves_tasks_on_duplicate(self, db_session: AsyncSession):
        """Creating duplicate domain does not affect existing tasks."""
        from app.services.task_service import TaskService

        user = User(email="test@example.com")
        db_session.add(user)
        await db_session.flush()

        service = TaskService(db_session, user.id)

        # Create domain and add tasks
        domain1 = await service.create_domain(name="Work", icon="💼")
        await db_session.flush()

        task1 = await service.create_task(title="Task 1", domain_id=domain1.id)
        task2 = await service.create_task(title="Task 2", domain_id=domain1.id)
        await db_session.flush()

        # Verify tasks exist
        tasks_before = await service.get_tasks(status=None, top_level_only=True)
        domain_tasks_before = [t for t in tasks_before if t.domain_id == domain1.id]
        assert len(domain_tasks_before) == 2

        # Create domain with same name again
        domain2 = await service.create_domain(name="Work", icon="💼")
        await db_session.flush()

        # Verify it's the same domain
        assert domain1.id == domain2.id

        # Verify tasks are still there
        tasks_after = await service.get_tasks(status=None, top_level_only=True)
        domain_tasks_after = [t for t in tasks_after if t.domain_id == domain1.id]
        assert len(domain_tasks_after) == 2
        assert task1.id in [t.id for t in domain_tasks_after]
        assert task2.id in [t.id for t in domain_tasks_after]

    async def test_custom_domain_with_emoji_dedup(self, db_session: AsyncSession):
        """Custom domain with custom emoji is deduplicated correctly."""
        from app.services.task_service import TaskService

        user = User(email="test@example.com")
        db_session.add(user)
        await db_session.flush()

        service = TaskService(db_session, user.id)

        # Create custom domain with emoji
        domain1 = await service.create_domain(name="Side Project", icon="🚀")
        await db_session.flush()

        # Add a task to make it "in use"
        await service.create_task(title="Build MVP", domain_id=domain1.id)
        await db_session.flush()

        # Try to create same domain again (like wizard re-run)
        domain2 = await service.create_domain(name="Side Project", icon="🚀")
        await db_session.flush()

        # Should return same domain
        assert domain1.id == domain2.id

        # Tasks should still be there
        tasks = await service.get_tasks(status=None, top_level_only=True)
        domain_tasks = [t for t in tasks if t.domain_id == domain1.id]
        assert len(domain_tasks) == 1
        assert domain_tasks[0].title == "Build MVP"

    async def test_multiple_users_can_have_same_domain_name(self, db_session: AsyncSession):
        """Different users can have domains with the same name."""
        from app.services.task_service import TaskService

        # Create two users
        user1 = User(email="user1@example.com")
        user2 = User(email="user2@example.com")
        db_session.add_all([user1, user2])
        await db_session.flush()

        service1 = TaskService(db_session, user1.id)
        service2 = TaskService(db_session, user2.id)

        # Both users create "Work" domain
        domain1 = await service1.create_domain(name="Work", icon="💼")
        domain2 = await service2.create_domain(name="Work", icon="💼")
        await db_session.flush()

        # Should be different domains (different IDs)
        assert domain1.id != domain2.id
        assert domain1.user_id == user1.id
        assert domain2.user_id == user2.id

    async def test_dedup_is_case_sensitive(self, db_session: AsyncSession):
        """Domain deduplication is case-sensitive."""
        from app.services.task_service import TaskService

        user = User(email="test@example.com")
        db_session.add(user)
        await db_session.flush()

        service = TaskService(db_session, user.id)

        # Create "Work" domain
        domain1 = await service.create_domain(name="Work", icon="💼")
        await db_session.flush()

        # Create "work" (lowercase) domain - should be different
        domain2 = await service.create_domain(name="work", icon="💼")
        await db_session.flush()

        # Should be different domains (case-sensitive)
        assert domain1.id != domain2.id

    async def test_dedup_with_whitespace_variants(self, db_session: AsyncSession):
        """Domain names with different whitespace are treated as different."""
        from app.services.task_service import TaskService

        user = User(email="test@example.com")
        db_session.add(user)
        await db_session.flush()

        service = TaskService(db_session, user.id)

        # Create "Work" domain
        domain1 = await service.create_domain(name="Work", icon="💼")
        await db_session.flush()

        # Create " Work" (leading space) - should be different
        domain2 = await service.create_domain(name=" Work", icon="💼")
        await db_session.flush()

        # Should be different domains
        assert domain1.id != domain2.id
