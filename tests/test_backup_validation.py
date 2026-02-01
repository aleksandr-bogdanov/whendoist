"""
Backup validation tests.

Tests that backup import validates data BEFORE clearing existing data,
and that invalid backups are rejected with clear error messages.
"""

import pytest

from app.models import Domain, Task, User
from app.services.backup_service import BackupService, BackupValidationError


@pytest.fixture
async def test_user(db_session):
    """Create a test user."""
    user = User(email="test@example.com", name="Test User")
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
async def existing_data(db_session, test_user):
    """Create existing data that should be preserved if import fails."""
    domain = Domain(user_id=test_user.id, name="Existing Domain")
    db_session.add(domain)
    await db_session.flush()

    task = Task(user_id=test_user.id, domain_id=domain.id, title="Existing Task")
    db_session.add(task)
    await db_session.commit()

    return {"domain": domain, "task": task}


def make_valid_backup(domains=None, tasks=None):
    """Create a valid backup structure."""
    return {
        "version": "0.11.0",
        "exported_at": "2025-01-22T00:00:00",
        "domains": domains or [],
        "tasks": tasks or [],
        "preferences": None,
    }


class TestBackupValidation:
    """Test backup validation logic."""

    @pytest.mark.asyncio
    async def test_validate_rejects_empty_object(self, db_session, test_user):
        """Empty object should fail validation."""
        service = BackupService(db_session, test_user.id)

        with pytest.raises(BackupValidationError, match="Invalid backup format"):
            service.validate_backup({})

    @pytest.mark.asyncio
    async def test_validate_rejects_missing_version(self, db_session, test_user):
        """Backup without version should fail."""
        service = BackupService(db_session, test_user.id)
        data = {"exported_at": "2025-01-22T00:00:00", "domains": [], "tasks": []}

        with pytest.raises(BackupValidationError, match="version"):
            service.validate_backup(data)

    @pytest.mark.asyncio
    async def test_validate_rejects_empty_task_title(self, db_session, test_user):
        """Task with empty title should fail."""
        service = BackupService(db_session, test_user.id)
        data = make_valid_backup(tasks=[{"title": ""}])

        with pytest.raises(BackupValidationError, match="title"):
            service.validate_backup(data)

    @pytest.mark.asyncio
    async def test_validate_rejects_empty_domain_name(self, db_session, test_user):
        """Domain with empty name should fail."""
        service = BackupService(db_session, test_user.id)
        data = make_valid_backup(domains=[{"name": ""}])

        with pytest.raises(BackupValidationError, match="name"):
            service.validate_backup(data)

    @pytest.mark.asyncio
    async def test_validate_accepts_minimal_valid_backup(self, db_session, test_user):
        """Minimal valid backup should pass."""
        service = BackupService(db_session, test_user.id)
        data = make_valid_backup()

        validated = service.validate_backup(data)
        assert validated.version == "0.11.0"

    @pytest.mark.asyncio
    async def test_validate_accepts_full_backup(self, db_session, test_user):
        """Full backup with all fields should pass."""
        service = BackupService(db_session, test_user.id)
        data = make_valid_backup(
            domains=[{"id": 1, "name": "Work", "icon": "briefcase"}],
            tasks=[
                {
                    "id": 1,
                    "title": "Task 1",
                    "domain_id": 1,
                    "status": "pending",
                    "impact": 2,
                    "instances": [{"instance_date": "2025-01-22", "status": "pending"}],
                }
            ],
        )

        validated = service.validate_backup(data)
        assert len(validated.domains) == 1
        assert len(validated.tasks) == 1
        assert len(validated.tasks[0].instances) == 1


class TestImportPreservesDataOnValidationFailure:
    """Test that existing data is NOT cleared when validation fails."""

    @pytest.mark.asyncio
    async def test_import_does_not_clear_on_invalid_format(self, db_session, test_user, existing_data):
        """Existing data should remain if backup format is invalid."""
        service = BackupService(db_session, test_user.id)

        # Attempt import with completely invalid data
        with pytest.raises(BackupValidationError):
            await service.import_all({"garbage": "data"}, clear_existing=True)

        # Verify existing data still present
        from sqlalchemy import select

        domains = (await db_session.execute(select(Domain).where(Domain.user_id == test_user.id))).scalars().all()
        tasks = (await db_session.execute(select(Task).where(Task.user_id == test_user.id))).scalars().all()

        assert len(domains) == 1
        assert domains[0].name == "Existing Domain"
        assert len(tasks) == 1
        assert tasks[0].title == "Existing Task"

    @pytest.mark.asyncio
    async def test_import_does_not_clear_on_invalid_task(self, db_session, test_user, existing_data):
        """Existing data should remain if a task in backup is invalid."""
        service = BackupService(db_session, test_user.id)

        # Valid structure but task with empty title
        data = make_valid_backup(tasks=[{"title": ""}])

        with pytest.raises(BackupValidationError):
            await service.import_all(data, clear_existing=True)

        # Verify existing data still present
        from sqlalchemy import select

        domains = (await db_session.execute(select(Domain).where(Domain.user_id == test_user.id))).scalars().all()
        assert len(domains) == 1


class TestSuccessfulImport:
    """Test successful import scenarios."""

    @pytest.mark.asyncio
    async def test_import_valid_backup_clears_existing(self, db_session, test_user, existing_data):
        """Valid backup should clear existing data when clear_existing=True."""
        service = BackupService(db_session, test_user.id)

        data = make_valid_backup(
            domains=[{"name": "New Domain"}],
            tasks=[{"title": "New Task"}],
        )

        result = await service.import_all(data, clear_existing=True)

        assert result["domains"] == 1
        assert result["tasks"] == 1

        # Verify old data gone, new data present
        from sqlalchemy import select

        domains = (await db_session.execute(select(Domain).where(Domain.user_id == test_user.id))).scalars().all()
        assert len(domains) == 1
        assert domains[0].name == "New Domain"

    @pytest.mark.asyncio
    async def test_import_valid_backup_preserves_existing(self, db_session, test_user, existing_data):
        """Valid backup should preserve existing data when clear_existing=False."""
        service = BackupService(db_session, test_user.id)

        data = make_valid_backup(
            domains=[{"name": "New Domain"}],
            tasks=[{"title": "New Task"}],
        )

        result = await service.import_all(data, clear_existing=False)

        assert result["domains"] == 1
        assert result["tasks"] == 1

        # Verify both old and new data present
        from sqlalchemy import select

        domains = (await db_session.execute(select(Domain).where(Domain.user_id == test_user.id))).scalars().all()
        assert len(domains) == 2  # Old + new


class TestDomainIdMapping:
    """Test that domain IDs are correctly mapped during import."""

    @pytest.mark.asyncio
    async def test_task_domain_id_mapped_correctly(self, db_session, test_user):
        """Tasks should reference newly created domain IDs, not old ones."""
        service = BackupService(db_session, test_user.id)

        data = make_valid_backup(
            domains=[{"id": 999, "name": "Domain from backup"}],
            tasks=[{"title": "Task from backup", "domain_id": 999}],
        )

        await service.import_all(data, clear_existing=True)

        # Verify task is linked to the new domain
        from sqlalchemy import select

        tasks = (await db_session.execute(select(Task).where(Task.user_id == test_user.id))).scalars().all()
        domains = (await db_session.execute(select(Domain).where(Domain.user_id == test_user.id))).scalars().all()

        assert len(tasks) == 1
        assert len(domains) == 1
        assert tasks[0].domain_id == domains[0].id
        assert tasks[0].domain_id != 999  # Should be new ID, not old
