"""
Task service integration tests.

These tests verify task service operations with PostgreSQL for production parity.
They cover the critical path of task CRUD operations with real database behavior.

Marked with @pytest.mark.integration to run against PostgreSQL in CI.
"""

from datetime import date, time

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.services.task_service import TaskService


@pytest.fixture
async def test_user(pg_session: AsyncSession) -> User:
    """Create a test user for integration tests."""
    user = User(email="integration@example.com", name="Integration Test User")
    pg_session.add(user)
    await pg_session.commit()
    await pg_session.refresh(user)
    return user


@pytest.fixture
async def task_service(pg_session: AsyncSession, test_user: User) -> TaskService:
    """Create task service instance for the test user."""
    return TaskService(pg_session, test_user.id)


@pytest.mark.integration
class TestTaskCRUD:
    """Task CRUD operations with PostgreSQL."""

    async def test_create_task(self, pg_session: AsyncSession, task_service: TaskService):
        """Create a task and verify it's persisted."""
        task = await task_service.create_task(
            title="Integration Test Task",
            description="Testing with PostgreSQL",
            impact=3,
            clarity="defined",
        )
        await pg_session.commit()

        assert task.id is not None
        assert task.title == "Integration Test Task"
        assert task.description == "Testing with PostgreSQL"
        assert task.impact == 3
        assert task.clarity == "defined"
        assert task.status == "pending"

    async def test_get_task(self, pg_session: AsyncSession, task_service: TaskService):
        """Retrieve a task by ID."""
        created = await task_service.create_task(title="Get Task Test")
        await pg_session.commit()

        fetched = await task_service.get_task(created.id)

        assert fetched is not None
        assert fetched.id == created.id
        assert fetched.title == "Get Task Test"

    async def test_update_task(self, pg_session: AsyncSession, task_service: TaskService):
        """Update task fields."""
        task = await task_service.create_task(title="Original Title", impact=4)
        await pg_session.commit()

        updated = await task_service.update_task(
            task.id,
            title="Updated Title",
            impact=2,
            description="New description",
        )
        await pg_session.commit()

        assert updated is not None
        assert updated.title == "Updated Title"
        assert updated.impact == 2
        assert updated.description == "New description"

    async def test_delete_task(self, pg_session: AsyncSession, task_service: TaskService):
        """Permanently delete a task."""
        task = await task_service.create_task(title="Delete Me")
        await pg_session.commit()
        task_id = task.id

        result = await task_service.delete_task(task_id)
        await pg_session.commit()

        assert result is True
        assert await task_service.get_task(task_id) is None

    async def test_complete_task(self, pg_session: AsyncSession, task_service: TaskService):
        """Complete a task and verify completed_at is set."""
        task = await task_service.create_task(title="Complete Me")
        await pg_session.commit()

        completed = await task_service.complete_task(task.id)
        await pg_session.commit()

        assert completed is not None
        assert completed.status == "completed"
        assert completed.completed_at is not None

    async def test_uncomplete_task(self, pg_session: AsyncSession, task_service: TaskService):
        """Uncomplete a task and verify completed_at is cleared."""
        task = await task_service.create_task(title="Uncomplete Me")
        await task_service.complete_task(task.id)
        await pg_session.commit()

        uncompleted = await task_service.uncomplete_task(task.id)
        await pg_session.commit()

        assert uncompleted is not None
        assert uncompleted.status == "pending"
        assert uncompleted.completed_at is None


@pytest.mark.integration
class TestDomainCRUD:
    """Domain CRUD operations with PostgreSQL."""

    async def test_create_domain(self, pg_session: AsyncSession, task_service: TaskService):
        """Create a domain and verify it's persisted."""
        domain = await task_service.create_domain(
            name="Work Projects",
            color="#FF5733",
            icon="briefcase",
        )
        await pg_session.commit()

        assert domain.id is not None
        assert domain.name == "Work Projects"
        assert domain.color == "#FF5733"
        assert domain.icon == "briefcase"

    async def test_get_domain(self, pg_session: AsyncSession, task_service: TaskService):
        """Retrieve a domain by ID."""
        created = await task_service.create_domain(name="Get Domain Test")
        await pg_session.commit()

        fetched = await task_service.get_domain(created.id)

        assert fetched is not None
        assert fetched.id == created.id
        assert fetched.name == "Get Domain Test"

    async def test_update_domain(self, pg_session: AsyncSession, task_service: TaskService):
        """Update domain fields."""
        domain = await task_service.create_domain(name="Original")
        await pg_session.commit()

        updated = await task_service.update_domain(
            domain.id,
            name="Updated",
            icon="folder",
        )
        await pg_session.commit()

        assert updated is not None
        assert updated.name == "Updated"
        assert updated.icon == "folder"

    async def test_archive_domain(self, pg_session: AsyncSession, task_service: TaskService):
        """Archive a domain."""
        domain = await task_service.create_domain(name="Archive Me")
        await pg_session.commit()

        archived = await task_service.archive_domain(domain.id)
        await pg_session.commit()

        assert archived is not None
        assert archived.is_archived is True

    async def test_create_domain_idempotent(self, pg_session: AsyncSession, task_service: TaskService):
        """Creating domain with same name returns existing domain."""
        first = await task_service.create_domain(name="Unique Domain")
        second = await task_service.create_domain(name="Unique Domain")
        await pg_session.commit()

        assert first.id == second.id


@pytest.mark.integration
class TestTaskDomainRelation:
    """Task-domain relationship tests with PostgreSQL."""

    async def test_task_belongs_to_domain(self, pg_session: AsyncSession, task_service: TaskService):
        """Task can be associated with a domain."""
        domain = await task_service.create_domain(name="Test Domain")
        await pg_session.commit()

        task = await task_service.create_task(
            title="Task in Domain",
            domain_id=domain.id,
        )
        await pg_session.commit()

        fetched = await task_service.get_task(task.id)
        assert fetched is not None
        assert fetched.domain_id == domain.id
        assert fetched.domain is not None
        assert fetched.domain.name == "Test Domain"

    async def test_get_tasks_by_domain(self, pg_session: AsyncSession, task_service: TaskService):
        """Filter tasks by domain."""
        domain1 = await task_service.create_domain(name="Domain 1")
        domain2 = await task_service.create_domain(name="Domain 2")
        await pg_session.commit()

        await task_service.create_task(title="Task in D1", domain_id=domain1.id)
        await task_service.create_task(title="Task in D2", domain_id=domain2.id)
        await task_service.create_task(title="Inbox Task")  # No domain
        await pg_session.commit()

        d1_tasks = await task_service.get_tasks(domain_id=domain1.id)
        assert len(d1_tasks) == 1
        assert d1_tasks[0].title == "Task in D1"

        inbox_tasks = await task_service.get_tasks(has_domain=False)
        assert len(inbox_tasks) == 1
        assert inbox_tasks[0].title == "Inbox Task"


@pytest.mark.integration
class TestSubtasks:
    """Subtask hierarchy tests with PostgreSQL."""

    async def test_create_subtask(self, pg_session: AsyncSession, task_service: TaskService):
        """Create a subtask under a parent task."""
        parent = await task_service.create_task(title="Parent Task")
        await pg_session.commit()

        subtask = await task_service.create_task(
            title="Subtask",
            parent_id=parent.id,
        )
        await pg_session.commit()

        assert subtask.parent_id == parent.id

        # Verify subtask appears in parent's subtasks
        fetched_parent = await task_service.get_task(parent.id)
        assert fetched_parent is not None
        assert len(fetched_parent.subtasks) == 1
        assert fetched_parent.subtasks[0].title == "Subtask"

    async def test_subtask_inherits_domain(self, pg_session: AsyncSession, task_service: TaskService):
        """Subtask inherits domain from parent."""
        domain = await task_service.create_domain(name="Domain")
        await pg_session.commit()

        parent = await task_service.create_task(title="Parent", domain_id=domain.id)
        await pg_session.commit()

        subtask = await task_service.create_task(
            title="Subtask",
            parent_id=parent.id,
        )
        await pg_session.commit()

        assert subtask.domain_id == domain.id

    async def test_archive_cascades_to_subtasks(self, pg_session: AsyncSession, task_service: TaskService):
        """Archiving a parent archives its subtasks."""
        parent = await task_service.create_task(title="Parent")
        await pg_session.commit()

        subtask = await task_service.create_task(title="Subtask", parent_id=parent.id)
        await pg_session.commit()

        await task_service.archive_task(parent.id)
        await pg_session.commit()

        # Refresh subtask to get updated status
        await pg_session.refresh(subtask)
        assert subtask.status == "archived"


@pytest.mark.integration
class TestScheduling:
    """Task scheduling tests with PostgreSQL."""

    async def test_task_with_schedule(self, pg_session: AsyncSession, task_service: TaskService):
        """Create task with scheduled date and time."""
        task = await task_service.create_task(
            title="Scheduled Task",
            scheduled_date=date(2025, 3, 15),
            scheduled_time=time(10, 30),
        )
        await pg_session.commit()

        assert task.scheduled_date == date(2025, 3, 15)
        assert task.scheduled_time == time(10, 30)

    async def test_task_with_due_date(self, pg_session: AsyncSession, task_service: TaskService):
        """Create task with due date and time."""
        task = await task_service.create_task(
            title="Due Task",
            due_date=date(2025, 3, 20),
            due_time=time(17, 0),
        )
        await pg_session.commit()

        assert task.due_date == date(2025, 3, 20)
        assert task.due_time == time(17, 0)

    async def test_get_scheduled_tasks_for_range(self, pg_session: AsyncSession, task_service: TaskService):
        """Get tasks scheduled within a date range."""
        await task_service.create_task(
            title="In Range",
            scheduled_date=date(2025, 3, 15),
        )
        await task_service.create_task(
            title="Out of Range",
            scheduled_date=date(2025, 4, 1),
        )
        await task_service.create_task(title="No Schedule")
        await pg_session.commit()

        tasks = await task_service.get_scheduled_tasks_for_range(
            start_date=date(2025, 3, 1),
            end_date=date(2025, 3, 31),
        )

        assert len(tasks) == 1
        assert tasks[0].title == "In Range"


@pytest.mark.integration
class TestMultitenancy:
    """Multitenancy isolation tests with PostgreSQL."""

    async def test_user_cannot_access_other_users_task(self, pg_session: AsyncSession, test_user: User):
        """User A cannot read User B's task."""
        # Create User B
        user_b = User(email="userb@example.com", name="User B")
        pg_session.add(user_b)
        await pg_session.commit()
        await pg_session.refresh(user_b)

        # User B creates a task
        service_b = TaskService(pg_session, user_b.id)
        task_b = await service_b.create_task(title="User B's Private Task")
        await pg_session.commit()

        # User A tries to access User B's task
        service_a = TaskService(pg_session, test_user.id)
        result = await service_a.get_task(task_b.id)

        assert result is None, "User A should not see User B's task"

    async def test_user_cannot_update_other_users_task(self, pg_session: AsyncSession, test_user: User):
        """User A cannot modify User B's task."""
        user_b = User(email="userb@example.com", name="User B")
        pg_session.add(user_b)
        await pg_session.commit()
        await pg_session.refresh(user_b)

        service_b = TaskService(pg_session, user_b.id)
        task_b = await service_b.create_task(title="Original Title")
        await pg_session.commit()
        original_title = task_b.title

        service_a = TaskService(pg_session, test_user.id)
        result = await service_a.update_task(task_b.id, title="Hacked!")
        await pg_session.commit()

        assert result is None, "Update should fail for other user's task"

        await pg_session.refresh(task_b)
        assert task_b.title == original_title, "Task should remain unchanged"

    async def test_user_cannot_delete_other_users_task(self, pg_session: AsyncSession, test_user: User):
        """User A cannot delete User B's task."""
        user_b = User(email="userb@example.com", name="User B")
        pg_session.add(user_b)
        await pg_session.commit()
        await pg_session.refresh(user_b)

        service_b = TaskService(pg_session, user_b.id)
        task_b = await service_b.create_task(title="Don't Delete Me")
        await pg_session.commit()
        task_id = task_b.id

        service_a = TaskService(pg_session, test_user.id)
        result = await service_a.delete_task(task_id)
        await pg_session.commit()

        assert result is False, "Delete should fail for other user's task"

        # Verify task still exists
        still_exists = await service_b.get_task(task_id)
        assert still_exists is not None, "Task should still exist"
