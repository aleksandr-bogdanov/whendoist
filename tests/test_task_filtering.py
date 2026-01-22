"""
Task filtering tests.

Tests for the SQL-based task filtering parameters.

Performance optimization (v0.14.0)
"""

import pytest

from app.models import Domain, Task, User
from app.services.task_service import TaskService


@pytest.fixture
async def test_user(db_session):
    """Create a test user."""
    user = User(
        email="test@example.com",
        name="Test User",
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest.mark.asyncio
class TestHasDomainFilter:
    """Tests for the has_domain filter parameter."""

    async def test_has_domain_true_returns_tasks_with_domain(self, db_session, test_user):
        """has_domain=True should only return tasks with a domain."""
        # Create a domain
        domain = Domain(user_id=test_user.id, name="Work", position=1)
        db_session.add(domain)
        await db_session.flush()

        # Create tasks with and without domain
        task_with_domain = Task(
            user_id=test_user.id,
            title="Task with domain",
            domain_id=domain.id,
        )
        task_without_domain = Task(
            user_id=test_user.id,
            title="Task without domain",
            domain_id=None,
        )
        db_session.add_all([task_with_domain, task_without_domain])
        await db_session.flush()

        # Query with has_domain=True
        service = TaskService(db_session, test_user.id)
        tasks = await service.get_tasks(has_domain=True)

        assert len(tasks) == 1
        assert tasks[0].title == "Task with domain"
        assert tasks[0].domain_id == domain.id

    async def test_has_domain_false_returns_inbox_tasks(self, db_session, test_user):
        """has_domain=False should only return tasks without a domain (inbox)."""
        # Create a domain
        domain = Domain(user_id=test_user.id, name="Work", position=1)
        db_session.add(domain)
        await db_session.flush()

        # Create tasks with and without domain
        task_with_domain = Task(
            user_id=test_user.id,
            title="Task with domain",
            domain_id=domain.id,
        )
        task_without_domain = Task(
            user_id=test_user.id,
            title="Task without domain",
            domain_id=None,
        )
        db_session.add_all([task_with_domain, task_without_domain])
        await db_session.flush()

        # Query with has_domain=False
        service = TaskService(db_session, test_user.id)
        tasks = await service.get_tasks(has_domain=False)

        assert len(tasks) == 1
        assert tasks[0].title == "Task without domain"
        assert tasks[0].domain_id is None

    async def test_has_domain_none_returns_all_tasks(self, db_session, test_user):
        """has_domain=None (default) should return all tasks."""
        # Create a domain
        domain = Domain(user_id=test_user.id, name="Work", position=1)
        db_session.add(domain)
        await db_session.flush()

        # Create tasks with and without domain
        task_with_domain = Task(
            user_id=test_user.id,
            title="Task with domain",
            domain_id=domain.id,
        )
        task_without_domain = Task(
            user_id=test_user.id,
            title="Task without domain",
            domain_id=None,
        )
        db_session.add_all([task_with_domain, task_without_domain])
        await db_session.flush()

        # Query without has_domain filter
        service = TaskService(db_session, test_user.id)
        tasks = await service.get_tasks(has_domain=None)

        assert len(tasks) == 2


@pytest.mark.asyncio
class TestExcludeStatusesFilter:
    """Tests for the exclude_statuses filter parameter."""

    async def test_exclude_statuses_filters_out_specified(self, db_session, test_user):
        """exclude_statuses should filter out tasks with specified statuses."""
        # Create tasks with different statuses
        pending_task = Task(
            user_id=test_user.id,
            title="Pending task",
            status="pending",
        )
        completed_task = Task(
            user_id=test_user.id,
            title="Completed task",
            status="completed",
        )
        archived_task = Task(
            user_id=test_user.id,
            title="Archived task",
            status="archived",
        )
        db_session.add_all([pending_task, completed_task, archived_task])
        await db_session.flush()

        # Query excluding archived
        service = TaskService(db_session, test_user.id)
        tasks = await service.get_tasks(status=None, exclude_statuses=["archived"])

        assert len(tasks) == 2
        task_statuses = {t.status for t in tasks}
        assert "archived" not in task_statuses
        assert "pending" in task_statuses
        assert "completed" in task_statuses

    async def test_exclude_multiple_statuses(self, db_session, test_user):
        """exclude_statuses should filter out multiple specified statuses."""
        # Create tasks with different statuses
        pending_task = Task(
            user_id=test_user.id,
            title="Pending task",
            status="pending",
        )
        completed_task = Task(
            user_id=test_user.id,
            title="Completed task",
            status="completed",
        )
        archived_task = Task(
            user_id=test_user.id,
            title="Archived task",
            status="archived",
        )
        db_session.add_all([pending_task, completed_task, archived_task])
        await db_session.flush()

        # Query excluding both archived and completed
        service = TaskService(db_session, test_user.id)
        tasks = await service.get_tasks(status=None, exclude_statuses=["archived", "completed"])

        assert len(tasks) == 1
        assert tasks[0].status == "pending"

    async def test_exclude_statuses_empty_list_returns_all(self, db_session, test_user):
        """Empty exclude_statuses should return all tasks."""
        pending_task = Task(
            user_id=test_user.id,
            title="Pending task",
            status="pending",
        )
        archived_task = Task(
            user_id=test_user.id,
            title="Archived task",
            status="archived",
        )
        db_session.add_all([pending_task, archived_task])
        await db_session.flush()

        service = TaskService(db_session, test_user.id)
        tasks = await service.get_tasks(status=None, exclude_statuses=[])

        assert len(tasks) == 2


@pytest.mark.asyncio
class TestCombinedFilters:
    """Tests for combining has_domain and exclude_statuses filters."""

    async def test_has_domain_and_exclude_statuses_combined(self, db_session, test_user):
        """Should be able to combine has_domain and exclude_statuses."""
        # Create a domain
        domain = Domain(user_id=test_user.id, name="Work", position=1)
        db_session.add(domain)
        await db_session.flush()

        # Create tasks
        pending_with_domain = Task(
            user_id=test_user.id,
            title="Pending with domain",
            status="pending",
            domain_id=domain.id,
        )
        archived_with_domain = Task(
            user_id=test_user.id,
            title="Archived with domain",
            status="archived",
            domain_id=domain.id,
        )
        pending_without_domain = Task(
            user_id=test_user.id,
            title="Pending without domain",
            status="pending",
            domain_id=None,
        )
        db_session.add_all([pending_with_domain, archived_with_domain, pending_without_domain])
        await db_session.flush()

        # Query with both filters
        service = TaskService(db_session, test_user.id)
        tasks = await service.get_tasks(
            status=None,
            has_domain=True,
            exclude_statuses=["archived"],
        )

        assert len(tasks) == 1
        assert tasks[0].title == "Pending with domain"
        assert tasks[0].domain_id == domain.id
        assert tasks[0].status == "pending"
