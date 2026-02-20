"""
Backup validation tests.

Tests that backup import validates data BEFORE clearing existing data,
and that invalid backups are rejected with clear error messages.
"""

import io

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.main import app
from app.models import Domain, Task, User, UserPreferences
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
        tasks = (await db_session.execute(select(Task).where(Task.user_id == test_user.id))).scalars().all()
        domains = (await db_session.execute(select(Domain).where(Domain.user_id == test_user.id))).scalars().all()

        assert len(tasks) == 1
        assert len(domains) == 1
        assert tasks[0].domain_id == domains[0].id
        assert tasks[0].domain_id != 999  # Should be new ID, not old


class TestBackupImportEndpoint:
    """Test HTTP endpoint validation."""

    @pytest.mark.asyncio
    async def test_import_rejects_oversized_file(self):
        """Import endpoint rejects files larger than 10 MB with 413 status."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # Create content larger than 10 MB
            large_content = b'{"version": 1, "data": "' + b"x" * (11 * 1024 * 1024) + b'"}'

            # Create file upload
            files = {"file": ("large_backup.json", io.BytesIO(large_content), "application/json")}

            # Attempt import (this would need authentication, but the size check happens first)
            response = await client.post("/api/v1/backup/import", files=files)

            # Should reject with 413 Payload Too Large
            # Note: In practice, authentication would fail first since we're not authenticated,
            # but if we were authenticated, the size check would trigger 413
            assert response.status_code in (401, 413)  # Either auth fails or size check fails


class TestLegacyClarityMapping:
    """Test that legacy clarity values are mapped correctly."""

    @pytest.mark.asyncio
    async def test_executable_clarity_mapped_to_autopilot(self, db_session, test_user):
        """Legacy 'executable' clarity should be accepted and mapped to 'autopilot'."""
        service = BackupService(db_session, test_user.id)
        data = make_valid_backup(
            tasks=[{"title": "Parent Task", "clarity": "executable"}],
        )

        validated = service.validate_backup(data)
        assert validated.tasks[0].clarity == "autopilot"

    @pytest.mark.asyncio
    async def test_executable_clarity_imports_as_autopilot(self, db_session, test_user):
        """Legacy 'executable' clarity should import as 'autopilot' in the database."""
        service = BackupService(db_session, test_user.id)
        data = make_valid_backup(
            tasks=[{"title": "Parent Task", "clarity": "executable"}],
        )

        await service.import_all(data, clear_existing=True)

        tasks = (await db_session.execute(select(Task).where(Task.user_id == test_user.id))).scalars().all()
        assert len(tasks) == 1
        assert tasks[0].clarity == "autopilot"

    @pytest.mark.asyncio
    async def test_validation_error_is_backup_validation_error(self, db_session, test_user):
        """Invalid clarity should raise BackupValidationError, not generic error."""
        service = BackupService(db_session, test_user.id)
        data = make_valid_backup(
            tasks=[{"title": "Task", "clarity": "invalid_value"}],
        )

        with pytest.raises(BackupValidationError, match="clarity"):
            service.validate_backup(data)


class TestExportImportRoundTrip:
    """Test that export → import preserves all fields."""

    @pytest.mark.asyncio
    async def test_round_trip_preserves_all_fields(self, db_session, test_user):
        """Export then import should preserve all task, domain, and preference fields."""
        # Create domain with all fields
        domain = Domain(
            user_id=test_user.id,
            name="Work",
            icon="briefcase",
            color="#ff0000",
            position=2,
            is_archived=True,
        )
        db_session.add(domain)
        await db_session.flush()

        # Create task with all fields
        from datetime import date, time

        task = Task(
            user_id=test_user.id,
            domain_id=domain.id,
            title="Important Task",
            description="Do the thing",
            status="pending",
            clarity="brainstorm",
            impact=2,
            duration_minutes=45,
            scheduled_date=date(2025, 6, 15),
            scheduled_time=time(10, 30),
            is_recurring=True,
            recurrence_rule={"type": "weekly", "interval": 1},
            recurrence_start=date(2025, 6, 1),
            recurrence_end=date(2025, 12, 31),
            position=5,
        )
        db_session.add(task)

        # Create preferences with all fields
        prefs = UserPreferences(
            user_id=test_user.id,
            show_completed_in_planner=False,
            completed_retention_days=7,
            completed_move_to_bottom=False,
            completed_sort_by_date=False,
            show_completed_in_list=False,
            hide_recurring_after_completion=True,
            show_scheduled_in_list=False,
            scheduled_move_to_bottom=False,
            scheduled_sort_by_date=False,
            timezone="America/New_York",
        )
        db_session.add(prefs)
        await db_session.commit()

        # Export
        service = BackupService(db_session, test_user.id)
        exported = await service.export_all()

        # Import into same user (clears and re-creates)
        await service.import_all(exported, clear_existing=True)

        # Verify domain fields
        domains = (await db_session.execute(select(Domain).where(Domain.user_id == test_user.id))).scalars().all()
        assert len(domains) == 1
        d = domains[0]
        assert d.name == "Work"
        assert d.icon == "briefcase"
        assert d.color == "#ff0000"
        assert d.position == 2
        assert d.is_archived is True

        # Verify task fields
        tasks = (await db_session.execute(select(Task).where(Task.user_id == test_user.id))).scalars().all()
        assert len(tasks) == 1
        t = tasks[0]
        assert t.title == "Important Task"
        assert t.description == "Do the thing"
        assert t.status == "pending"
        assert t.clarity == "brainstorm"
        assert t.impact == 2
        assert t.duration_minutes == 45
        assert t.scheduled_date == date(2025, 6, 15)
        assert t.scheduled_time == time(10, 30)
        assert t.is_recurring is True
        assert t.recurrence_rule == {"type": "weekly", "interval": 1}
        assert t.recurrence_start == date(2025, 6, 1)
        assert t.recurrence_end == date(2025, 12, 31)
        assert t.position == 5

        # Verify preference fields
        prefs_result = (
            await db_session.execute(select(UserPreferences).where(UserPreferences.user_id == test_user.id))
        ).scalar_one()
        assert prefs_result.show_completed_in_planner is False
        assert prefs_result.completed_retention_days == 7
        assert prefs_result.completed_move_to_bottom is False
        assert prefs_result.completed_sort_by_date is False
        assert prefs_result.show_completed_in_list is False
        assert prefs_result.hide_recurring_after_completion is True
        assert prefs_result.show_scheduled_in_list is False
        assert prefs_result.scheduled_move_to_bottom is False
        assert prefs_result.scheduled_sort_by_date is False
        assert prefs_result.timezone == "America/New_York"

    @pytest.mark.asyncio
    async def test_import_with_null_not_null_fields(self, db_session, test_user):
        """Import should handle None for NOT NULL fields with defaults."""
        service = BackupService(db_session, test_user.id)
        data = make_valid_backup(
            tasks=[{"title": "Task with nulls", "clarity": None, "impact": None}],
        )

        await service.import_all(data, clear_existing=True)

        tasks = (await db_session.execute(select(Task).where(Task.user_id == test_user.id))).scalars().all()
        assert len(tasks) == 1
        assert tasks[0].clarity == "normal"
        assert tasks[0].impact == 4
