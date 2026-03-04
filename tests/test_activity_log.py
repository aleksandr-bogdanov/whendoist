"""
Activity log unit tests.

Verifies that service mutations create expected activity log entries.
Uses SQLite in-memory database for fast execution.
"""

import pytest
from sqlalchemy import select

from app.models import ActivityLog, Domain, User, UserPreferences
from app.services.recurrence_service import RecurrenceService
from app.services.task_service import TaskService


@pytest.fixture
async def test_user(db_session):
    """Create a test user with preferences."""
    user = User(email="activity@test.com", name="Activity Test")
    db_session.add(user)
    await db_session.flush()
    prefs = UserPreferences(user_id=user.id)
    db_session.add(prefs)
    await db_session.flush()
    return user


@pytest.fixture
async def service(db_session, test_user):
    """Create a TaskService for the test user."""
    return TaskService(db_session, test_user.id)


@pytest.fixture
async def domain(db_session, test_user):
    """Create a test domain."""
    d = Domain(user_id=test_user.id, name="Work", position=0)
    db_session.add(d)
    await db_session.flush()
    return d


async def _get_entries(db_session, user_id, event_type=None):
    """Helper to query activity log entries."""
    q = select(ActivityLog).where(ActivityLog.user_id == user_id)
    if event_type:
        q = q.where(ActivityLog.event_type == event_type)
    result = await db_session.execute(q.order_by(ActivityLog.id))
    return list(result.scalars().all())


# =============================================================================
# Task Events
# =============================================================================


async def test_create_task_logs_event(db_session, test_user, service):
    """Creating a task logs a task_created event."""
    task = await service.create_task(title="Test Task")
    await db_session.flush()

    entries = await _get_entries(db_session, test_user.id, "task_created")
    assert len(entries) == 1
    assert entries[0].task_id == task.id
    assert entries[0].field_name is None


async def test_complete_task_logs_event(db_session, test_user, service):
    """Completing a task logs a task_completed event."""
    task = await service.create_task(title="Complete Me")
    await db_session.flush()

    await service.complete_task(task.id)
    await db_session.flush()

    entries = await _get_entries(db_session, test_user.id, "task_completed")
    assert len(entries) == 1
    assert entries[0].task_id == task.id


async def test_complete_task_cascades_to_subtasks(db_session, test_user, service, domain):
    """Completing a parent task logs events for cascaded subtasks too."""
    parent = await service.create_task(title="Parent", domain_id=domain.id)
    await db_session.flush()
    child = await service.create_task(title="Child", parent_id=parent.id)
    await db_session.flush()

    await service.complete_task(parent.id)
    await db_session.flush()

    entries = await _get_entries(db_session, test_user.id, "task_completed")
    assert len(entries) == 2
    task_ids = {e.task_id for e in entries}
    assert parent.id in task_ids
    assert child.id in task_ids


async def test_uncomplete_task_logs_event(db_session, test_user, service):
    """Uncompleting a task logs a task_uncompleted event."""
    task = await service.create_task(title="Uncomplete Me")
    await db_session.flush()
    await service.complete_task(task.id)
    await db_session.flush()
    await service.uncomplete_task(task.id)
    await db_session.flush()

    entries = await _get_entries(db_session, test_user.id, "task_uncompleted")
    assert len(entries) == 1


async def test_archive_task_logs_event(db_session, test_user, service):
    """Archiving a task logs a task_archived event."""
    task = await service.create_task(title="Archive Me")
    await db_session.flush()
    await service.archive_task(task.id)
    await db_session.flush()

    entries = await _get_entries(db_session, test_user.id, "task_archived")
    assert len(entries) == 1
    assert entries[0].task_id == task.id


async def test_restore_task_logs_event(db_session, test_user, service):
    """Restoring a task logs a task_restored event."""
    task = await service.create_task(title="Restore Me")
    await db_session.flush()
    await service.archive_task(task.id)
    await db_session.flush()
    await service.restore_task(task.id)
    await db_session.flush()

    entries = await _get_entries(db_session, test_user.id, "task_restored")
    assert len(entries) == 1


async def test_delete_task_logs_event(db_session, test_user, service):
    """Deleting a task logs a task_deleted event (task_id becomes NULL via FK SET NULL)."""
    task = await service.create_task(title="Delete Me")
    await db_session.flush()
    task_id = task.id

    await service.delete_task(task_id)
    await db_session.flush()

    entries = await _get_entries(db_session, test_user.id, "task_deleted")
    assert len(entries) == 1
    # task_id is SET NULL after cascade delete
    assert entries[0].task_id is None


# =============================================================================
# Field Change Events
# =============================================================================


async def test_update_task_logs_field_changes(db_session, test_user, service):
    """Updating non-encrypted fields logs task_field_changed with old/new values."""
    task = await service.create_task(title="Update Me", impact=4)
    await db_session.flush()

    await service.update_task(task.id, impact=1)
    await db_session.flush()

    entries = await _get_entries(db_session, test_user.id, "task_field_changed")
    assert len(entries) == 1
    assert entries[0].field_name == "impact"
    assert entries[0].old_value == "4"
    assert entries[0].new_value == "1"


async def test_encrypted_field_logs_no_values(db_session, test_user, service):
    """Updating encrypted fields (title) logs event without old/new values."""
    task = await service.create_task(title="Old Title")
    await db_session.flush()

    await service.update_task(task.id, title="New Title")
    await db_session.flush()

    entries = await _get_entries(db_session, test_user.id, "task_field_changed")
    title_entries = [e for e in entries if e.field_name == "title"]
    assert len(title_entries) == 1
    assert title_entries[0].old_value is None
    assert title_entries[0].new_value is None


async def test_no_log_when_value_unchanged(db_session, test_user, service):
    """No field_changed event when the value didn't actually change."""
    task = await service.create_task(title="Same", impact=4)
    await db_session.flush()

    await service.update_task(task.id, impact=4)
    await db_session.flush()

    entries = await _get_entries(db_session, test_user.id, "task_field_changed")
    assert len(entries) == 0


# =============================================================================
# Domain Events
# =============================================================================


async def test_create_domain_logs_event(db_session, test_user, service):
    """Creating a domain logs a domain_created event."""
    domain = await service.create_domain(name="New Domain")
    await db_session.flush()

    entries = await _get_entries(db_session, test_user.id, "domain_created")
    assert len(entries) == 1
    assert entries[0].domain_id == domain.id


async def test_archive_domain_logs_event(db_session, test_user, service):
    """Archiving a domain logs a domain_archived event."""
    domain = await service.create_domain(name="Archive Domain")
    await db_session.flush()
    await service.archive_domain(domain.id)
    await db_session.flush()

    entries = await _get_entries(db_session, test_user.id, "domain_archived")
    assert len(entries) == 1
    assert entries[0].domain_id == domain.id


# =============================================================================
# Instance Events
# =============================================================================


async def test_complete_instance_logs_event(db_session, test_user):
    """Completing an instance logs instance_completed with task_id and instance_id."""
    svc = TaskService(db_session, test_user.id)
    task = await svc.create_task(
        title="Recurring",
        is_recurring=True,
        recurrence_rule={"freq": "daily", "interval": 1},
        recurrence_start=None,
    )
    await db_session.flush()

    rec = RecurrenceService(db_session, test_user.id)
    instances = await rec.materialize_instances(task)
    await db_session.flush()
    assert len(instances) > 0

    inst = instances[0]
    await rec.complete_instance(inst.id)
    await db_session.flush()

    entries = await _get_entries(db_session, test_user.id, "instance_completed")
    assert len(entries) == 1
    assert entries[0].task_id == task.id
    assert entries[0].instance_id == inst.id


# =============================================================================
# Multitenancy Isolation
# =============================================================================


async def test_multitenancy_isolation(db_session):
    """User A's activity is isolated from User B."""
    user_a = User(email="a@test.com", name="A")
    user_b = User(email="b@test.com", name="B")
    db_session.add_all([user_a, user_b])
    await db_session.flush()

    svc_a = TaskService(db_session, user_a.id)
    svc_b = TaskService(db_session, user_b.id)

    await svc_a.create_task(title="A's task")
    await svc_b.create_task(title="B's task")
    await db_session.flush()

    a_entries = await _get_entries(db_session, user_a.id)
    b_entries = await _get_entries(db_session, user_b.id)

    assert len(a_entries) == 1
    assert len(b_entries) == 1
    assert a_entries[0].user_id == user_a.id
    assert b_entries[0].user_id == user_b.id


# =============================================================================
# Archive/Restore Cascading to Subtasks
# =============================================================================


async def test_archive_task_cascades_to_subtasks(db_session, test_user, service, domain):
    """Archiving a parent task logs task_archived for each cascaded subtask."""
    parent = await service.create_task(title="Parent", domain_id=domain.id)
    await db_session.flush()
    child = await service.create_task(title="Child", parent_id=parent.id)
    await db_session.flush()

    await service.archive_task(parent.id)
    await db_session.flush()

    entries = await _get_entries(db_session, test_user.id, "task_archived")
    assert len(entries) == 2
    task_ids = {e.task_id for e in entries}
    assert parent.id in task_ids
    assert child.id in task_ids


# =============================================================================
# Domain Update Events
# =============================================================================


async def test_update_domain_logs_field_changes(db_session, test_user, service):
    """Updating domain non-encrypted fields logs old/new values."""
    domain = await service.create_domain(name="Old Color Domain", color="#ff0000")
    await db_session.flush()

    await service.update_domain(domain.id, color="#00ff00")
    await db_session.flush()

    entries = await _get_entries(db_session, test_user.id, "domain_updated")
    assert len(entries) == 1
    assert entries[0].field_name == "color"
    assert entries[0].old_value == "#ff0000"
    assert entries[0].new_value == "#00ff00"


async def test_update_domain_encrypted_name_logs_no_values(db_session, test_user, service):
    """Updating domain name (encrypted field) logs event without old/new values."""
    domain = await service.create_domain(name="Old Name")
    await db_session.flush()

    await service.update_domain(domain.id, name="New Name")
    await db_session.flush()

    entries = await _get_entries(db_session, test_user.id, "domain_updated")
    name_entries = [e for e in entries if e.field_name == "name"]
    assert len(name_entries) == 1
    assert name_entries[0].old_value is None
    assert name_entries[0].new_value is None


# =============================================================================
# Batch Instance Events
# =============================================================================


async def test_batch_complete_instances_logs_event(db_session, test_user):
    """Batch completing instances logs a single instance_batch_completed event."""
    from datetime import date, timedelta

    svc = TaskService(db_session, test_user.id)
    task = await svc.create_task(
        title="Batch Recurring",
        is_recurring=True,
        recurrence_rule={"freq": "daily", "interval": 1},
        recurrence_start=None,
    )
    await db_session.flush()

    rec = RecurrenceService(db_session, test_user.id)
    instances = await rec.materialize_instances(task)
    await db_session.flush()
    assert len(instances) > 0

    # batch_complete_instances takes task_id and a before_date cutoff
    future = date.today() + timedelta(days=365)
    completed = await rec.batch_complete_instances(task.id, future)
    await db_session.flush()

    entries = await _get_entries(db_session, test_user.id, "instance_batch_completed")
    assert len(entries) == 1
    assert entries[0].task_id == task.id
    assert entries[0].new_value == str(completed)
