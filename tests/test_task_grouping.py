"""
Task Grouping Service Tests.

Tests for build_native_task_item() function in app/services/task_grouping.py.

Test Category: Unit (async, uses in-memory SQLite)
Related Code: app/services/task_grouping.py

Note: Comprehensive tests for group_tasks_by_domain() are in test_task_sorting.py.
This file focuses on build_native_task_item() functionality.

v0.15.0: Architecture Cleanup
"""

from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Domain, Task, User
from app.services.task_grouping import build_native_task_item

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
async def test_user(db_session: AsyncSession) -> User:
    """Create a test user."""
    user = User(email="test@example.com")
    db_session.add(user)
    await db_session.flush()
    return user


@pytest.fixture
async def test_domain(db_session: AsyncSession, test_user: User) -> Domain:
    """Create a test domain."""
    domain = Domain(user_id=test_user.id, name="Work")
    db_session.add(domain)
    await db_session.flush()
    return domain


# =============================================================================
# Build Native Task Item Tests
# =============================================================================


class TestBuildNativeTaskItem:
    """Tests for build_native_task_item function."""

    async def test_basic_task_item_structure(self, db_session: AsyncSession, test_user: User, test_domain: Domain):
        """Task item has correct structure with all expected keys."""
        task = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Test Task",
            impact=2,
            clarity="defined",
        )
        db_session.add(task)
        await db_session.flush()

        item = build_native_task_item(task)

        assert "task" in item
        assert "clarity_display" in item
        assert "next_occurrence" in item
        assert "next_instance_id" in item
        assert "subtasks" in item
        assert "parent_name" in item
        assert "subtask_count" in item
        assert "completion_age_class" in item
        assert "instance_completed_at" in item

    async def test_task_reference(self, db_session: AsyncSession, test_user: User, test_domain: Domain):
        """Task item contains reference to original task."""
        task = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Test Task",
        )
        db_session.add(task)
        await db_session.flush()

        item = build_native_task_item(task)

        assert item["task"] is task
        assert item["task"].title == "Test Task"

    async def test_clarity_display_for_defined(self, db_session: AsyncSession, test_user: User, test_domain: Domain):
        """Clarity display shows 'Defined' for defined tasks."""
        task = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Test Task",
            clarity="defined",
        )
        db_session.add(task)
        await db_session.flush()

        item = build_native_task_item(task)

        assert item["clarity_display"] == "Defined"

    async def test_clarity_display_for_executable(self, db_session: AsyncSession, test_user: User, test_domain: Domain):
        """Clarity display shows 'Executable' for executable tasks."""
        task = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Test Task",
            clarity="executable",
        )
        db_session.add(task)
        await db_session.flush()

        item = build_native_task_item(task)

        assert item["clarity_display"] == "Executable"

    async def test_clarity_display_for_exploratory(
        self, db_session: AsyncSession, test_user: User, test_domain: Domain
    ):
        """Clarity display shows 'Exploratory' for exploratory tasks."""
        task = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Test Task",
            clarity="exploratory",
        )
        db_session.add(task)
        await db_session.flush()

        item = build_native_task_item(task)

        assert item["clarity_display"] == "Exploratory"

    async def test_clarity_display_for_no_clarity(self, db_session: AsyncSession, test_user: User, test_domain: Domain):
        """Clarity display is empty for tasks without clarity."""
        task = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Test Task",
            clarity=None,
        )
        db_session.add(task)
        await db_session.flush()

        item = build_native_task_item(task)

        assert item["clarity_display"] == ""

    async def test_clarity_display_for_invalid_clarity(
        self, db_session: AsyncSession, test_user: User, test_domain: Domain
    ):
        """Clarity display handles invalid clarity values gracefully."""
        task = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Test Task",
            clarity="invalid_value",
        )
        db_session.add(task)
        await db_session.flush()

        item = build_native_task_item(task)

        # Should not raise, should return empty string
        assert item["clarity_display"] == ""

    async def test_non_recurring_task_has_no_next_occurrence(
        self, db_session: AsyncSession, test_user: User, test_domain: Domain
    ):
        """Non-recurring tasks have no next occurrence."""
        task = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Test Task",
            is_recurring=False,
        )
        db_session.add(task)
        await db_session.flush()

        item = build_native_task_item(task)

        assert item["next_occurrence"] is None
        assert item["next_instance_id"] is None

    async def test_recurring_task_with_next_instances(
        self, db_session: AsyncSession, test_user: User, test_domain: Domain
    ):
        """Recurring tasks get next occurrence from next_instances dict."""
        task = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Recurring Task",
            is_recurring=True,
        )
        db_session.add(task)
        await db_session.flush()

        tomorrow = date.today() + timedelta(days=1)
        next_instances = {task.id: {"date": tomorrow, "id": 123}}

        item = build_native_task_item(task, next_instances=next_instances)

        assert item["next_occurrence"] == tomorrow
        assert item["next_instance_id"] == 123

    async def test_recurring_task_without_next_instances(
        self, db_session: AsyncSession, test_user: User, test_domain: Domain
    ):
        """Recurring tasks without entries in next_instances have None."""
        task = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Recurring Task",
            is_recurring=True,
        )
        db_session.add(task)
        await db_session.flush()

        item = build_native_task_item(task, next_instances={})

        assert item["next_occurrence"] is None
        assert item["next_instance_id"] is None

    async def test_pending_task_has_no_completion_age_class(
        self, db_session: AsyncSession, test_user: User, test_domain: Domain
    ):
        """Pending tasks have no completion age class."""
        task = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Test Task",
            status="pending",
        )
        db_session.add(task)
        await db_session.flush()

        item = build_native_task_item(task)

        # Empty string means no completion styling
        assert item["completion_age_class"] == ""

    async def test_completed_today_task_has_completion_age_class(
        self, db_session: AsyncSession, test_user: User, test_domain: Domain
    ):
        """Tasks completed today have 'completed' age class."""
        now = datetime.now(tz=UTC)
        task = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Test Task",
            status="completed",
            completed_at=now,
        )
        db_session.add(task)
        await db_session.flush()

        item = build_native_task_item(task)

        assert item["completion_age_class"] == "completed"

    async def test_completed_older_task_has_completion_age_class(
        self, db_session: AsyncSession, test_user: User, test_domain: Domain
    ):
        """Tasks completed before today have 'completed' age class."""
        yesterday = datetime.now(tz=UTC) - timedelta(days=1)
        task = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Test Task",
            status="completed",
            completed_at=yesterday,
        )
        db_session.add(task)
        await db_session.flush()

        item = build_native_task_item(task)

        assert item["completion_age_class"] == "completed"

    async def test_recurring_task_uses_instance_completed_at(
        self, db_session: AsyncSession, test_user: User, test_domain: Domain
    ):
        """Recurring tasks use instance_completed_at for age class."""
        now = datetime.now(tz=UTC)
        task = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Recurring Task",
            is_recurring=True,
            status="pending",  # Parent task not completed
        )
        db_session.add(task)
        await db_session.flush()

        item = build_native_task_item(task, instance_completed_at=now)

        # Instance completion should be reflected
        assert item["instance_completed_at"] == now
        assert item["completion_age_class"] == "completed"

    async def test_subtasks_empty_by_default(self, db_session: AsyncSession, test_user: User, test_domain: Domain):
        """Tasks without loaded subtasks have empty subtasks list."""
        task = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Test Task",
        )
        db_session.add(task)
        await db_session.flush()

        item = build_native_task_item(task)

        assert item["subtasks"] == []

    async def test_parent_name_none_for_top_level_task(
        self, db_session: AsyncSession, test_user: User, test_domain: Domain
    ):
        """Top-level tasks have parent_name=None."""
        task = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Top Level Task",
        )
        db_session.add(task)
        await db_session.flush()

        item = build_native_task_item(task)

        assert item["parent_name"] is None

    async def test_subtask_count_default_zero(self, db_session: AsyncSession, test_user: User, test_domain: Domain):
        """Tasks without subtask_count parameter have count=0."""
        task = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Test Task",
        )
        db_session.add(task)
        await db_session.flush()

        item = build_native_task_item(task)

        assert item["subtask_count"] == 0

    async def test_subtask_count_passed_through(self, db_session: AsyncSession, test_user: User, test_domain: Domain):
        """Subtask count is passed through to task item."""
        task = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Parent Task",
        )
        db_session.add(task)
        await db_session.flush()

        item = build_native_task_item(task, subtask_count=3)

        assert item["subtask_count"] == 3

    async def test_parent_name_from_eagerly_loaded_parent(
        self, db_session: AsyncSession, test_user: User, test_domain: Domain
    ):
        """Subtask with eagerly loaded parent shows parent_name."""
        parent = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Parent Task",
        )
        db_session.add(parent)
        await db_session.flush()

        child = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Child Task",
            parent_id=parent.id,
        )
        db_session.add(child)
        await db_session.flush()

        # Eagerly load the parent relationship
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload

        result = await db_session.execute(select(Task).where(Task.id == child.id).options(selectinload(Task.parent)))
        loaded_child = result.scalar_one()

        item = build_native_task_item(loaded_child)

        assert item["parent_name"] == "Parent Task"
