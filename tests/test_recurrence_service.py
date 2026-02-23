"""
Tests for RecurrenceService — timezone conversion, regeneration cleanup.

Uses SQLite in-memory DB via the db_session fixture from conftest.py.
"""

from datetime import UTC, date, datetime, time

import pytest

from app.models import Task, TaskInstance, User
from app.services.recurrence_service import RecurrenceService


@pytest.fixture
async def user(db_session):
    """Create a test user."""
    user = User(email="test@example.com", name="Test")
    db_session.add(user)
    await db_session.flush()
    return user


@pytest.fixture
async def recurring_task(db_session, user):
    """Create a recurring task with 9:00 AM scheduled time and daily rule."""
    task = Task(
        user_id=user.id,
        title="Daily standup",
        status="pending",
        impact=2,
        is_recurring=True,
        recurrence_rule={"freq": "daily", "interval": 1},
        recurrence_start=date(2026, 2, 20),
        scheduled_time=time(9, 0),
    )
    db_session.add(task)
    await db_session.flush()
    return task


@pytest.mark.unit
@pytest.mark.asyncio
async def test_timezone_aware_scheduled_datetime(db_session, user, recurring_task):
    """Verify 9:00 AM America/New_York → 14:00 UTC."""
    service = RecurrenceService(db_session, user.id, timezone="America/New_York")

    # Test the helper directly
    result = service._to_utc_datetime(date(2026, 2, 23), time(9, 0))
    # Feb 23, 2026 is EST (UTC-5)
    assert result.hour == 14
    assert result.minute == 0
    assert result.tzinfo == UTC


@pytest.mark.unit
@pytest.mark.asyncio
async def test_timezone_utc_fallback(db_session, user, recurring_task):
    """Without timezone, time is treated as UTC."""
    service = RecurrenceService(db_session, user.id, timezone=None)

    result = service._to_utc_datetime(date(2026, 2, 23), time(9, 0))
    assert result.hour == 9
    assert result.minute == 0


@pytest.mark.unit
@pytest.mark.asyncio
async def test_materialize_uses_timezone(db_session, user, recurring_task):
    """Materialized instances should have timezone-adjusted scheduled_datetime."""
    service = RecurrenceService(db_session, user.id, timezone="America/New_York")
    instances = await service.materialize_instances(recurring_task, horizon_days=3)

    assert len(instances) > 0
    for inst in instances:
        if inst.scheduled_datetime:
            # 9 AM ET = 14:00 UTC (EST, no DST in Feb)
            assert inst.scheduled_datetime.hour == 14


@pytest.mark.unit
@pytest.mark.asyncio
async def test_regenerate_deletes_past_pending(db_session, user, recurring_task):
    """Regeneration should delete ALL pending instances, including past ones."""
    from sqlalchemy import func, select

    past_date = date(2026, 1, 15)  # Well in the past

    # Create a past pending instance manually
    past_instance = TaskInstance(
        task_id=recurring_task.id,
        user_id=user.id,
        instance_date=past_date,
        status="pending",
    )
    db_session.add(past_instance)
    await db_session.flush()

    # Expunge so the ORM identity map doesn't re-insert it on autoflush
    db_session.expunge(past_instance)

    service = RecurrenceService(db_session, user.id, timezone="America/New_York")
    await service.regenerate_instances(recurring_task)

    # The specific past instance should no longer exist
    result = await db_session.execute(
        select(func.count())
        .select_from(TaskInstance)
        .where(
            TaskInstance.task_id == recurring_task.id,
            TaskInstance.instance_date == past_date,
        )
    )
    assert result.scalar_one() == 0


@pytest.mark.unit
@pytest.mark.asyncio
async def test_regenerate_preserves_completed(db_session, user, recurring_task):
    """Completed instances should survive regeneration."""
    completed_instance = TaskInstance(
        task_id=recurring_task.id,
        user_id=user.id,
        instance_date=date(2026, 2, 21),
        status="completed",
        completed_at=datetime.now(UTC),
    )
    db_session.add(completed_instance)
    await db_session.flush()
    completed_id = completed_instance.id

    service = RecurrenceService(db_session, user.id, timezone="America/New_York")
    await service.regenerate_instances(recurring_task)

    # Completed instance should still exist
    from sqlalchemy import select

    result = await db_session.execute(select(TaskInstance).where(TaskInstance.id == completed_id))
    instance = result.scalar_one_or_none()
    assert instance is not None
    assert instance.status == "completed"
