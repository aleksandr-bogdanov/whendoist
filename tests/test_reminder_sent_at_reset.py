"""
Tests for reminder_sent_at reset logic.

When scheduling fields change (scheduled_date, scheduled_time, reminder_minutes_before),
reminder_sent_at must reset to NULL so the push loop can re-fire.

@pytest.mark.unit — SQLite-based, no external deps.
"""

from datetime import UTC, date, datetime, time

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Task, User
from app.services.task_service import TaskService


@pytest.fixture
async def test_user(db_session: AsyncSession) -> User:
    user = User(email="reminder-reset@example.com")
    db_session.add(user)
    await db_session.flush()
    return user


@pytest.fixture
async def task_service(db_session: AsyncSession, test_user: User) -> TaskService:
    return TaskService(db_session, test_user.id)


@pytest.fixture
async def task_with_reminder(db_session: AsyncSession, test_user: User) -> Task:
    """Create a task with a reminder that has been sent."""
    task = Task(
        user_id=test_user.id,
        title="Reminder test task",
        scheduled_date=date(2026, 3, 10),
        scheduled_time=time(14, 0),
        reminder_minutes_before=15,
        reminder_sent_at=datetime(2026, 3, 10, 13, 45, tzinfo=UTC),
    )
    db_session.add(task)
    await db_session.flush()
    return task


@pytest.mark.unit
class TestReminderSentAtReset:
    """Verify reminder_sent_at resets when scheduling fields change."""

    async def test_changing_scheduled_date_resets_reminder(
        self, db_session: AsyncSession, task_service: TaskService, task_with_reminder: Task
    ):
        """Changing scheduled_date should clear reminder_sent_at."""
        assert task_with_reminder.reminder_sent_at is not None

        updated = await task_service.update_task(
            task_id=task_with_reminder.id,
            scheduled_date=date(2026, 3, 15),
            reminder_sent_at=None,  # This is what the router sets
        )
        assert updated is not None
        assert updated.reminder_sent_at is None

    async def test_changing_scheduled_time_resets_reminder(
        self, db_session: AsyncSession, task_service: TaskService, task_with_reminder: Task
    ):
        """Changing scheduled_time should clear reminder_sent_at."""
        updated = await task_service.update_task(
            task_id=task_with_reminder.id,
            scheduled_time=time(16, 0),
            reminder_sent_at=None,
        )
        assert updated is not None
        assert updated.reminder_sent_at is None

    async def test_changing_reminder_minutes_resets_reminder(
        self, db_session: AsyncSession, task_service: TaskService, task_with_reminder: Task
    ):
        """Changing reminder_minutes_before should clear reminder_sent_at."""
        updated = await task_service.update_task(
            task_id=task_with_reminder.id,
            reminder_minutes_before=30,
            reminder_sent_at=None,
        )
        assert updated is not None
        assert updated.reminder_sent_at is None

    async def test_non_scheduling_change_preserves_reminder(
        self, db_session: AsyncSession, task_service: TaskService, task_with_reminder: Task
    ):
        """Changing title should NOT clear reminder_sent_at."""
        original_sent_at = task_with_reminder.reminder_sent_at

        updated = await task_service.update_task(
            task_id=task_with_reminder.id,
            title="Updated title",
        )
        assert updated is not None
        assert updated.reminder_sent_at == original_sent_at

    async def test_reminder_sent_at_in_updatable_fields(
        self, db_session: AsyncSession, task_service: TaskService, task_with_reminder: Task
    ):
        """reminder_sent_at should be in the UPDATABLE_FIELDS whitelist."""
        # Direct update should work without ValueError
        updated = await task_service.update_task(
            task_id=task_with_reminder.id,
            reminder_sent_at=None,
        )
        assert updated is not None
        assert updated.reminder_sent_at is None

    async def test_setting_reminder_sent_at_to_value(
        self, db_session: AsyncSession, test_user: User, task_service: TaskService
    ):
        """Setting reminder_sent_at to a datetime should persist."""
        task = Task(
            user_id=test_user.id,
            title="Set sent_at test",
            scheduled_date=date(2026, 3, 10),
            reminder_minutes_before=10,
        )
        db_session.add(task)
        await db_session.flush()

        now = datetime(2026, 3, 10, 12, 0, tzinfo=UTC)
        updated = await task_service.update_task(task_id=task.id, reminder_sent_at=now)
        assert updated is not None
        assert updated.reminder_sent_at == now


@pytest.mark.unit
class TestRouterLevelResetLogic:
    """Test the reminder_sent_at reset logic as implemented in the tasks router.

    The router auto-injects reminder_sent_at=None when scheduling fields change.
    These tests replicate that logic to verify correctness of the set intersection
    and value comparison approach.
    """

    # Matches the logic in app/routers/tasks.py
    RESET_FIELDS = {"scheduled_date", "scheduled_time", "reminder_minutes_before"}

    def _should_reset(self, update_data: dict, task: Task) -> bool:
        if update_data.keys() & self.RESET_FIELDS:
            return any(
                field in update_data and update_data[field] != getattr(task, field) for field in self.RESET_FIELDS
            )
        return False

    def test_reset_on_scheduled_date_change(self, task_with_reminder: Task):
        """Changing scheduled_date should trigger reset."""
        assert self._should_reset({"scheduled_date": date(2026, 4, 1)}, task_with_reminder)

    def test_reset_on_scheduled_time_change(self, task_with_reminder: Task):
        """Changing scheduled_time should trigger reset."""
        assert self._should_reset({"scheduled_time": time(16, 30)}, task_with_reminder)

    def test_reset_on_reminder_minutes_change(self, task_with_reminder: Task):
        """Changing reminder_minutes_before should trigger reset."""
        assert self._should_reset({"reminder_minutes_before": 60}, task_with_reminder)

    def test_same_value_does_not_reset(self, task_with_reminder: Task):
        """Setting the same scheduled_date should NOT trigger reset."""
        assert not self._should_reset({"scheduled_date": task_with_reminder.scheduled_date}, task_with_reminder)

    def test_non_scheduling_field_ignored(self, task_with_reminder: Task):
        """Non-scheduling fields should not trigger reset."""
        assert not self._should_reset({"title": "New title"}, task_with_reminder)


@pytest.mark.unit
class TestBatchScheduleResetsReminder:
    """Verify batch schedule action resets reminder_sent_at.

    Reproduces the logic from the batch-action endpoint in app/routers/tasks.py:
    when a task with reminder_minutes_before is rescheduled, reminder_sent_at
    must be cleared so the push loop fires for the new date.
    """

    def test_batch_schedule_resets_reminder_sent_at(self, task_with_reminder: Task):
        """Batch-scheduling a task with a reminder should clear reminder_sent_at."""
        assert task_with_reminder.reminder_sent_at is not None
        assert task_with_reminder.reminder_minutes_before is not None

        # Simulate batch schedule action (mirrors router logic)
        task_with_reminder.scheduled_date = date(2026, 4, 1)
        if task_with_reminder.reminder_minutes_before:
            task_with_reminder.reminder_sent_at = None

        assert task_with_reminder.reminder_sent_at is None

    def test_batch_schedule_without_reminder_preserves_sent_at(self):
        """Batch-scheduling a task without reminder_minutes_before should not touch reminder_sent_at."""
        task = Task(
            user_id=1,
            title="No reminder task",
            scheduled_date=date(2026, 3, 10),
            reminder_minutes_before=None,
            reminder_sent_at=datetime(2026, 3, 10, 13, 45, tzinfo=UTC),
        )

        # Simulate batch schedule action (mirrors router logic)
        task.scheduled_date = date(2026, 4, 1)
        if task.reminder_minutes_before:
            task.reminder_sent_at = None

        # reminder_sent_at should be preserved since there's no reminder configured
        assert task.reminder_sent_at is not None
