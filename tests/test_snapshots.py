"""
Tests for the snapshot service.

Tests cover: creation, dedup, listing, retention, restore, multitenancy.
"""

import gzip
import json

import pytest

from app.models import Domain, Task, User, UserPreferences
from app.services.snapshot_service import SnapshotService


@pytest.fixture
async def test_user(db_session):
    """Create a test user with preferences."""
    user = User(email="test@example.com", name="Test User")
    db_session.add(user)
    await db_session.flush()

    prefs = UserPreferences(user_id=user.id, snapshots_enabled=True)
    db_session.add(prefs)
    await db_session.flush()

    return user


@pytest.fixture
async def other_user(db_session):
    """Create a second user for multitenancy tests."""
    user = User(email="other@example.com", name="Other User")
    db_session.add(user)
    await db_session.flush()

    prefs = UserPreferences(user_id=user.id, snapshots_enabled=True)
    db_session.add(prefs)
    await db_session.flush()

    return user


@pytest.fixture
async def user_with_data(db_session, test_user):
    """Create a user with some tasks and domains."""
    domain = Domain(user_id=test_user.id, name="Work", position=0)
    db_session.add(domain)
    await db_session.flush()

    task = Task(
        user_id=test_user.id,
        domain_id=domain.id,
        title="Test task",
        impact=4,
        status="pending",
        position=0,
    )
    db_session.add(task)
    await db_session.flush()

    return test_user


# =============================================================================
# Creation Tests
# =============================================================================


async def test_create_snapshot_stores_compressed_data(db_session, user_with_data):
    """Snapshot stores gzip-compressed JSON data."""
    service = SnapshotService(db_session, user_with_data.id)
    snapshot = await service.create_snapshot(is_manual=True)
    await db_session.commit()

    assert snapshot is not None
    assert snapshot.size_bytes > 0
    assert snapshot.size_bytes == len(snapshot.data)

    # Verify data is valid gzip JSON
    decompressed = gzip.decompress(snapshot.data)
    data = json.loads(decompressed)
    assert "tasks" in data
    assert "domains" in data


async def test_create_snapshot_sets_content_hash(db_session, user_with_data):
    """Snapshot has a 64-char hex SHA-256 hash."""
    service = SnapshotService(db_session, user_with_data.id)
    snapshot = await service.create_snapshot(is_manual=True)
    await db_session.commit()

    assert snapshot is not None
    assert len(snapshot.content_hash) == 64
    assert all(c in "0123456789abcdef" for c in snapshot.content_hash)


async def test_create_snapshot_sets_manual_flag(db_session, user_with_data):
    """Manual flag is correctly set on snapshots."""
    service = SnapshotService(db_session, user_with_data.id)

    manual = await service.create_snapshot(is_manual=True)
    await db_session.commit()
    assert manual is not None
    assert manual.is_manual is True

    # Auto snapshot after manual — same data, but auto would be skipped
    auto = await service.create_snapshot(is_manual=False)
    assert auto is None  # Skipped due to dedup


# =============================================================================
# Dedup Tests
# =============================================================================


async def test_auto_skips_when_no_changes(db_session, user_with_data):
    """Automatic snapshot is skipped when data hasn't changed."""
    service = SnapshotService(db_session, user_with_data.id)

    first = await service.create_snapshot(is_manual=False)
    await db_session.commit()
    assert first is not None

    second = await service.create_snapshot(is_manual=False)
    assert second is None  # Skipped — same hash


async def test_auto_creates_when_data_changes(db_session, user_with_data):
    """Automatic snapshot is created when data has changed."""
    service = SnapshotService(db_session, user_with_data.id)

    first = await service.create_snapshot(is_manual=False)
    await db_session.commit()
    assert first is not None

    # Add another task to change the data
    task2 = Task(
        user_id=user_with_data.id,
        title="New task",
        impact=2,
        status="pending",
        position=1,
    )
    db_session.add(task2)
    await db_session.flush()

    second = await service.create_snapshot(is_manual=False)
    await db_session.commit()
    assert second is not None
    assert second.content_hash != first.content_hash


async def test_manual_always_creates(db_session, user_with_data):
    """Manual snapshot is always created even with same data."""
    service = SnapshotService(db_session, user_with_data.id)

    first = await service.create_snapshot(is_manual=True)
    await db_session.commit()
    assert first is not None

    second = await service.create_snapshot(is_manual=True)
    await db_session.commit()
    assert second is not None
    assert second.id != first.id
    assert second.content_hash == first.content_hash  # Same data


# =============================================================================
# Listing Tests
# =============================================================================


async def test_list_snapshots_newest_first(db_session, user_with_data):
    """Snapshots are listed newest first."""
    service = SnapshotService(db_session, user_with_data.id)

    s1 = await service.create_snapshot(is_manual=True)
    await db_session.commit()

    # Change data so auto doesn't get deduped
    task2 = Task(
        user_id=user_with_data.id,
        title="Another task",
        impact=3,
        status="pending",
        position=2,
    )
    db_session.add(task2)
    await db_session.flush()

    s2 = await service.create_snapshot(is_manual=True)
    await db_session.commit()

    rows = await service.list_snapshots()
    assert len(rows) == 2
    assert rows[0].id == s2.id  # Newest first
    assert rows[1].id == s1.id


async def test_list_snapshots_excludes_data_blob(db_session, user_with_data):
    """Listing returns metadata columns, not the data blob."""
    service = SnapshotService(db_session, user_with_data.id)
    await service.create_snapshot(is_manual=True)
    await db_session.commit()

    rows = await service.list_snapshots()
    assert len(rows) == 1
    row = rows[0]
    # Row should have id, content_hash, size_bytes, is_manual, created_at
    assert hasattr(row, "id")
    assert hasattr(row, "size_bytes")
    assert hasattr(row, "is_manual")
    assert hasattr(row, "created_at")
    # But NOT the data column
    assert not hasattr(row, "data")


# =============================================================================
# Retention Tests
# =============================================================================


async def test_retention_deletes_oldest(db_session, user_with_data):
    """Retention deletes oldest snapshots beyond the limit."""
    service = SnapshotService(db_session, user_with_data.id)

    # Create 3 manual snapshots (all same data, but manual always creates)
    for _ in range(3):
        await service.create_snapshot(is_manual=True)
        await db_session.commit()

    deleted = await service.enforce_retention(retain_count=1)
    await db_session.commit()

    assert deleted == 2
    remaining = await service.list_snapshots()
    assert len(remaining) == 1


async def test_retention_noop_when_under_limit(db_session, user_with_data):
    """Retention does nothing when snapshot count is within limit."""
    service = SnapshotService(db_session, user_with_data.id)

    await service.create_snapshot(is_manual=True)
    await db_session.commit()

    deleted = await service.enforce_retention(retain_count=10)
    assert deleted == 0


# =============================================================================
# Restore Tests
# =============================================================================


async def test_get_snapshot_data_returns_dict(db_session, user_with_data):
    """get_snapshot_data returns a dict compatible with BackupService.import_all."""
    service = SnapshotService(db_session, user_with_data.id)
    snapshot = await service.create_snapshot(is_manual=True)
    await db_session.commit()

    assert snapshot is not None
    data = await service.get_snapshot_data(snapshot.id)
    assert data is not None
    assert isinstance(data, dict)
    assert "version" in data
    assert "exported_at" in data
    assert "tasks" in data
    assert "domains" in data


# =============================================================================
# Multitenancy Tests
# =============================================================================


async def test_list_enforces_user_id(db_session, user_with_data, other_user):
    """Each user only sees their own snapshots."""
    service1 = SnapshotService(db_session, user_with_data.id)
    service2 = SnapshotService(db_session, other_user.id)

    await service1.create_snapshot(is_manual=True)
    await db_session.commit()

    rows1 = await service1.list_snapshots()
    rows2 = await service2.list_snapshots()

    assert len(rows1) == 1
    assert len(rows2) == 0


async def test_get_enforces_user_id(db_session, user_with_data, other_user):
    """Cannot read another user's snapshot data."""
    service1 = SnapshotService(db_session, user_with_data.id)
    service2 = SnapshotService(db_session, other_user.id)

    snapshot = await service1.create_snapshot(is_manual=True)
    await db_session.commit()

    assert snapshot is not None
    # Owner can read
    data = await service1.get_snapshot_data(snapshot.id)
    assert data is not None

    # Other user cannot
    data2 = await service2.get_snapshot_data(snapshot.id)
    assert data2 is None


async def test_delete_enforces_user_id(db_session, user_with_data, other_user):
    """Cannot delete another user's snapshot."""
    service1 = SnapshotService(db_session, user_with_data.id)
    service2 = SnapshotService(db_session, other_user.id)

    snapshot = await service1.create_snapshot(is_manual=True)
    await db_session.commit()

    assert snapshot is not None
    # Other user cannot delete
    deleted = await service2.delete_snapshot(snapshot.id)
    assert deleted is False

    # Owner can delete
    deleted = await service1.delete_snapshot(snapshot.id)
    assert deleted is True


# =============================================================================
# data_version Tests
# =============================================================================


async def test_snapshot_stores_data_version(db_session, user_with_data):
    """Snapshot stores the data_version passed at creation time."""
    service = SnapshotService(db_session, user_with_data.id)
    snapshot = await service.create_snapshot(is_manual=True, data_version=5)
    await db_session.commit()

    assert snapshot is not None
    assert snapshot.snapshot_data_version == 5


async def test_snapshot_data_version_defaults_to_none(db_session, user_with_data):
    """Snapshot without explicit data_version stores None (backward compat)."""
    service = SnapshotService(db_session, user_with_data.id)
    snapshot = await service.create_snapshot(is_manual=True)
    await db_session.commit()

    assert snapshot is not None
    assert snapshot.snapshot_data_version is None
