"""
Tests for data_version tracking.

Verifies that data_version is bumped on user-initiated mutations
and NOT bumped on system-initiated changes (auto-materialization).
"""

import pytest
from sqlalchemy import select

from app.models import Domain, User, UserPreferences
from app.services.data_version import bump_data_version
from app.services.recurrence_service import RecurrenceService
from app.services.task_service import TaskService


@pytest.fixture
async def test_user(db_session):
    """Create a test user."""
    user = User(email="test@example.com", name="Test User")
    db_session.add(user)
    await db_session.flush()

    prefs = UserPreferences(user_id=user.id)
    db_session.add(prefs)
    await db_session.flush()

    return user


@pytest.fixture
async def user_with_domain(db_session, test_user):
    """Create a user with a domain."""
    domain = Domain(user_id=test_user.id, name="Work", position=0)
    db_session.add(domain)
    await db_session.flush()
    return test_user, domain


# =============================================================================
# bump_data_version utility
# =============================================================================


async def test_bump_increments_version(db_session, test_user):
    """bump_data_version atomically increments the counter."""
    assert test_user.data_version == 0

    await bump_data_version(db_session, test_user.id)
    await db_session.flush()

    # Re-query to get updated value
    result = await db_session.execute(select(User).where(User.id == test_user.id))
    user = result.scalar_one()
    assert user.data_version == 1

    await bump_data_version(db_session, test_user.id)
    await db_session.flush()

    result = await db_session.execute(select(User).where(User.id == test_user.id))
    user = result.scalar_one()
    assert user.data_version == 2


# =============================================================================
# TaskService bumps
# =============================================================================


async def _get_version(db_session, user_id: int) -> int:
    """Helper to re-query user's data_version."""
    result = await db_session.execute(select(User.data_version).where(User.id == user_id))
    return result.scalar_one()


async def test_bump_on_task_create(db_session, user_with_domain):
    """Creating a task bumps data_version."""
    user, domain = user_with_domain
    service = TaskService(db_session, user.id)

    assert await _get_version(db_session, user.id) == 0

    await service.create_task(title="Test task", domain_id=domain.id)
    await db_session.flush()

    assert await _get_version(db_session, user.id) == 1


async def test_bump_on_task_update(db_session, user_with_domain):
    """Updating a task bumps data_version."""
    user, domain = user_with_domain
    service = TaskService(db_session, user.id)

    task = await service.create_task(title="Test task", domain_id=domain.id)
    await db_session.flush()
    v1 = await _get_version(db_session, user.id)

    await service.update_task(task.id, title="Updated")
    await db_session.flush()

    assert await _get_version(db_session, user.id) == v1 + 1


async def test_bump_on_task_complete(db_session, user_with_domain):
    """Completing a task bumps data_version."""
    user, domain = user_with_domain
    service = TaskService(db_session, user.id)

    task = await service.create_task(title="Test task", domain_id=domain.id)
    await db_session.flush()
    v1 = await _get_version(db_session, user.id)

    await service.complete_task(task.id)
    await db_session.flush()

    assert await _get_version(db_session, user.id) == v1 + 1


async def test_bump_on_task_delete(db_session, user_with_domain):
    """Deleting a task bumps data_version."""
    user, domain = user_with_domain
    service = TaskService(db_session, user.id)

    task = await service.create_task(title="Test task", domain_id=domain.id)
    await db_session.flush()
    v1 = await _get_version(db_session, user.id)

    await service.delete_task(task.id)
    await db_session.flush()

    assert await _get_version(db_session, user.id) == v1 + 1


async def test_bump_on_domain_create(db_session, test_user):
    """Creating a domain bumps data_version."""
    service = TaskService(db_session, test_user.id)

    assert await _get_version(db_session, test_user.id) == 0

    await service.create_domain(name="New Domain")
    await db_session.flush()

    assert await _get_version(db_session, test_user.id) == 1


# =============================================================================
# RecurrenceService — user-initiated vs auto-materialization
# =============================================================================


async def test_no_bump_on_materialize_instances(db_session, user_with_domain):
    """Auto-materialization does NOT bump data_version."""
    user, domain = user_with_domain
    task_service = TaskService(db_session, user.id)

    task = await task_service.create_task(
        title="Recurring task",
        domain_id=domain.id,
        is_recurring=True,
        recurrence_rule={"freq": "daily", "interval": 1},
    )
    await db_session.flush()
    v_after_create = await _get_version(db_session, user.id)

    # Materialize instances (system-initiated) — should NOT bump
    recurrence_service = RecurrenceService(db_session, user.id)
    instances = await recurrence_service.materialize_instances(task, horizon_days=7)
    await db_session.flush()

    assert len(instances) > 0
    assert await _get_version(db_session, user.id) == v_after_create


async def test_bump_on_instance_complete(db_session, user_with_domain):
    """Completing an instance (user action) bumps data_version."""
    user, domain = user_with_domain
    task_service = TaskService(db_session, user.id)

    task = await task_service.create_task(
        title="Recurring task",
        domain_id=domain.id,
        is_recurring=True,
        recurrence_rule={"freq": "daily", "interval": 1},
    )
    await db_session.flush()

    recurrence_service = RecurrenceService(db_session, user.id)
    instances = await recurrence_service.materialize_instances(task, horizon_days=7)
    await db_session.flush()
    v_before = await _get_version(db_session, user.id)

    # Complete an instance (user-initiated) — should bump
    await recurrence_service.complete_instance(instances[0].id)
    await db_session.flush()

    assert await _get_version(db_session, user.id) == v_before + 1


async def test_bump_on_instance_skip(db_session, user_with_domain):
    """Skipping an instance (user action) bumps data_version."""
    user, domain = user_with_domain
    task_service = TaskService(db_session, user.id)

    task = await task_service.create_task(
        title="Recurring task",
        domain_id=domain.id,
        is_recurring=True,
        recurrence_rule={"freq": "daily", "interval": 1},
    )
    await db_session.flush()

    recurrence_service = RecurrenceService(db_session, user.id)
    instances = await recurrence_service.materialize_instances(task, horizon_days=7)
    await db_session.flush()
    v_before = await _get_version(db_session, user.id)

    await recurrence_service.skip_instance(instances[0].id)
    await db_session.flush()

    assert await _get_version(db_session, user.id) == v_before + 1
