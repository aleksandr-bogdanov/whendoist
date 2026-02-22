"""
Backup and restore service.

Exports/imports user data as JSON for backup purposes.
"""

import re
from datetime import UTC, date, datetime, time
from typing import Any

from pydantic import BaseModel, ValidationError, field_validator
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app import __version__
from app.constants import (
    DOMAIN_NAME_MAX_LENGTH,
    TASK_DESCRIPTION_MAX_LENGTH,
    TASK_TITLE_MAX_LENGTH,
)
from app.models import Domain, Task, TaskInstance, UserPreferences
from app.services.data_version import bump_data_version

# Regex to match control characters except \n (newline) and \t (tab)
CONTROL_CHAR_PATTERN = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def _strip_control_chars(value: str) -> str:
    """Strip control characters except newline and tab."""
    return CONTROL_CHAR_PATTERN.sub("", value)


# =============================================================================
# Validation Schemas
# =============================================================================


class BackupInstanceSchema(BaseModel):
    """Schema for task instance in backup."""

    instance_date: str
    status: str = "pending"
    scheduled_datetime: str | None = None
    completed_at: str | None = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in ("pending", "completed", "skipped"):
            raise ValueError("Instance status must be pending, completed, or skipped")
        return v


class BackupTaskSchema(BaseModel):
    """Schema for task in backup."""

    title: str
    id: int | None = None
    domain_id: int | None = None
    parent_id: int | None = None
    description: str | None = None
    status: str = "pending"
    clarity: str | None = None
    impact: int | None = None
    duration_minutes: int | None = None
    scheduled_date: str | None = None
    scheduled_time: str | None = None
    is_recurring: bool = False
    recurrence_rule: dict | None = None
    recurrence_start: str | None = None
    recurrence_end: str | None = None
    position: int = 0
    completed_at: str | None = None
    external_id: str | None = None
    external_source: str | None = None
    external_created_at: str | None = None
    instances: list[BackupInstanceSchema] = []

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        v = _strip_control_chars(v).strip()
        if not v:
            raise ValueError("Task title cannot be empty")
        if len(v) > TASK_TITLE_MAX_LENGTH:
            raise ValueError(f"Task title cannot exceed {TASK_TITLE_MAX_LENGTH} characters")
        return v

    @field_validator("description")
    @classmethod
    def validate_description(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = _strip_control_chars(v)
        if len(v) > TASK_DESCRIPTION_MAX_LENGTH:
            raise ValueError(f"Task description cannot exceed {TASK_DESCRIPTION_MAX_LENGTH} characters")
        return v

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in ("pending", "completed", "archived"):
            raise ValueError("Task status must be pending, completed, or archived")
        return v

    @field_validator("clarity")
    @classmethod
    def validate_clarity(cls, v: str | None) -> str | None:
        if v is not None:
            # Map legacy values from older backups
            legacy_map = {"executable": "autopilot"}
            v = legacy_map.get(v, v)
            if v not in ("autopilot", "normal", "brainstorm"):
                raise ValueError("Task clarity must be autopilot, normal, or brainstorm")
        return v

    @field_validator("impact")
    @classmethod
    def validate_impact(cls, v: int | None) -> int | None:
        if v is not None and (v < 1 or v > 4):
            raise ValueError("Task impact must be between 1 and 4")
        return v


class BackupDomainSchema(BaseModel):
    """Schema for domain in backup."""

    name: str
    id: int | None = None
    icon: str | None = None
    color: str | None = None
    position: int = 0
    is_archived: bool = False
    external_id: str | None = None
    external_source: str | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = _strip_control_chars(v).strip()
        if not v:
            raise ValueError("Domain name cannot be empty")
        if len(v) > DOMAIN_NAME_MAX_LENGTH:
            raise ValueError(f"Domain name cannot exceed {DOMAIN_NAME_MAX_LENGTH} characters")
        return v


class BackupPreferencesSchema(BaseModel):
    """Schema for preferences in backup."""

    show_completed_in_planner: bool = True
    completed_retention_days: int = 3
    completed_move_to_bottom: bool = True
    completed_sort_by_date: bool = True
    show_completed_in_list: bool = True
    hide_recurring_after_completion: bool = False
    show_scheduled_in_list: bool = True
    scheduled_move_to_bottom: bool = True
    scheduled_sort_by_date: bool = True
    timezone: str | None = None


class BackupSchema(BaseModel):
    """Top-level backup schema."""

    version: str
    exported_at: str
    domains: list[BackupDomainSchema] = []
    tasks: list[BackupTaskSchema] = []
    preferences: BackupPreferencesSchema | None = None


class BackupValidationError(ValueError):
    """Raised when backup data fails validation."""

    pass


class BackupService:
    """Service for exporting and importing user data."""

    VERSION = __version__

    def __init__(self, db: AsyncSession, user_id: int):
        self.db = db
        self.user_id = user_id

    async def export_all(self) -> dict[str, Any]:
        """
        Export all user data as a dictionary.

        Returns a JSON-serializable dict with all user data.
        """
        # Get domains
        domains_result = await self.db.execute(select(Domain).where(Domain.user_id == self.user_id).order_by(Domain.id))
        domains = list(domains_result.scalars().all())

        # Get tasks with instances
        tasks_result = await self.db.execute(
            select(Task).where(Task.user_id == self.user_id).options(selectinload(Task.instances)).order_by(Task.id)
        )
        tasks = list(tasks_result.scalars().all())

        # Get preferences
        prefs_result = await self.db.execute(select(UserPreferences).where(UserPreferences.user_id == self.user_id))
        preferences = prefs_result.scalar_one_or_none()

        return {
            "version": self.VERSION,
            "exported_at": datetime.now(UTC).isoformat(),
            "domains": [self._serialize_domain(d) for d in domains],
            "tasks": [self._serialize_task(t) for t in tasks],
            "preferences": self._serialize_preferences(preferences) if preferences else None,
        }

    def validate_backup(self, data: dict[str, Any]) -> BackupSchema:
        """
        Validate backup data before import.

        Args:
            data: The backup data dictionary

        Returns:
            Validated BackupSchema

        Raises:
            BackupValidationError: If validation fails
        """
        try:
            return BackupSchema.model_validate(data)
        except ValidationError as e:
            # Convert Pydantic errors to user-friendly message
            errors = []
            for err in e.errors():
                loc = ".".join(str(x) for x in err["loc"])
                errors.append(f"{loc}: {err['msg']}")
            raise BackupValidationError(f"Invalid backup format: {'; '.join(errors)}") from e

    async def import_all(self, data: dict[str, Any], clear_existing: bool = True) -> dict[str, int]:
        """
        Import user data from a backup.

        IMPORTANT: Validates entire backup BEFORE clearing existing data.
        Uses savepoint for transaction safety on partial failure.

        Args:
            data: The backup data dictionary
            clear_existing: If True, delete existing data before import

        Returns:
            Dict with counts of imported items

        Raises:
            BackupValidationError: If backup data is invalid
        """
        # STEP 1: Validate entire backup BEFORE any mutations
        validated = self.validate_backup(data)

        # STEP 2: Use savepoint so we can roll back on partial failure
        async with self.db.begin_nested():
            # STEP 3: Only now clear existing data (inside savepoint)
            if clear_existing:
                await self._clear_user_data()

            # STEP 4: Import validated data
            domain_id_map: dict[int, int] = {}  # old_id -> new_id

            # Import domains
            for domain_data in validated.domains:
                old_id = domain_data.id
                domain = Domain(
                    user_id=self.user_id,
                    name=domain_data.name,
                    icon=domain_data.icon,
                    color=domain_data.color,
                    position=domain_data.position,
                    is_archived=domain_data.is_archived,
                    external_id=domain_data.external_id,
                    external_source=domain_data.external_source,
                )
                self.db.add(domain)
                await self.db.flush()
                if old_id:
                    domain_id_map[old_id] = domain.id

            # Import tasks (pass 1: create all tasks, build ID map)
            task_id_map: dict[int, int] = {}
            tasks_with_parents: list[tuple[int, int]] = []  # (old_id, old_parent_id)

            for task_data in validated.tasks:
                old_domain_id = task_data.domain_id
                new_domain_id = domain_id_map.get(old_domain_id) if old_domain_id else None

                task = Task(
                    user_id=self.user_id,
                    domain_id=new_domain_id,
                    title=task_data.title,
                    description=task_data.description,
                    status=task_data.status,
                    clarity=task_data.clarity or "normal",
                    impact=task_data.impact if task_data.impact is not None else 4,
                    duration_minutes=task_data.duration_minutes,
                    scheduled_date=self._parse_date(task_data.scheduled_date),
                    scheduled_time=self._parse_time(task_data.scheduled_time),
                    is_recurring=task_data.is_recurring,
                    recurrence_rule=task_data.recurrence_rule,
                    recurrence_start=self._parse_date(task_data.recurrence_start),
                    recurrence_end=self._parse_date(task_data.recurrence_end),
                    position=task_data.position,
                    completed_at=self._parse_datetime(task_data.completed_at),
                    external_id=task_data.external_id,
                    external_source=task_data.external_source,
                    external_created_at=self._parse_datetime(task_data.external_created_at),
                )
                self.db.add(task)
                await self.db.flush()

                # Track old→new ID mapping for parent assignment
                old_id = task_data.id
                if old_id is not None:
                    task_id_map[old_id] = task.id
                if old_id is not None and task_data.parent_id is not None:
                    tasks_with_parents.append((old_id, task_data.parent_id))

                # Import task instances
                for instance_data in task_data.instances:
                    instance = TaskInstance(
                        task_id=task.id,
                        user_id=self.user_id,
                        instance_date=self._parse_date(instance_data.instance_date),
                        status=instance_data.status,
                        scheduled_datetime=self._parse_datetime(instance_data.scheduled_datetime),
                        completed_at=self._parse_datetime(instance_data.completed_at),
                    )
                    self.db.add(instance)

            # Import tasks (pass 2: assign parent_id using ID map)
            for old_id, old_parent_id in tasks_with_parents:
                new_id = task_id_map.get(old_id)
                new_parent_id = task_id_map.get(old_parent_id)
                if new_id is not None and new_parent_id is not None:
                    result = await self.db.execute(select(Task).where(Task.id == new_id, Task.user_id == self.user_id))
                    task = result.scalar_one_or_none()
                    if task:
                        task.parent_id = new_parent_id

            # Validate no circular parent references
            for old_id, old_parent_id in tasks_with_parents:
                new_id = task_id_map.get(old_id)
                new_parent_id = task_id_map.get(old_parent_id)
                if new_id is not None and new_parent_id is not None:
                    # Check for cycles by walking parent chain
                    visited = {new_id}
                    current = new_parent_id
                    while current is not None:
                        if current in visited:
                            # Cycle detected — break it by nullifying this parent
                            result = await self.db.execute(
                                select(Task).where(Task.id == new_id, Task.user_id == self.user_id)
                            )
                            task = result.scalar_one_or_none()
                            if task:
                                task.parent_id = None
                            break
                        visited.add(current)
                        parent_result = await self.db.execute(
                            select(Task.parent_id).where(Task.id == current, Task.user_id == self.user_id)
                        )
                        current = parent_result.scalar_one_or_none()

            await self.db.flush()
            await bump_data_version(self.db, self.user_id)

            # Import preferences
            if validated.preferences:
                prefs_data = validated.preferences
                preferences = UserPreferences(
                    user_id=self.user_id,
                    show_completed_in_planner=prefs_data.show_completed_in_planner,
                    completed_retention_days=prefs_data.completed_retention_days,
                    completed_move_to_bottom=prefs_data.completed_move_to_bottom,
                    completed_sort_by_date=prefs_data.completed_sort_by_date,
                    show_completed_in_list=prefs_data.show_completed_in_list,
                    hide_recurring_after_completion=prefs_data.hide_recurring_after_completion,
                    show_scheduled_in_list=prefs_data.show_scheduled_in_list,
                    scheduled_move_to_bottom=prefs_data.scheduled_move_to_bottom,
                    scheduled_sort_by_date=prefs_data.scheduled_sort_by_date,
                    timezone=prefs_data.timezone,
                )
                self.db.add(preferences)

        await self.db.commit()

        return {
            "domains": len(validated.domains),
            "tasks": len(validated.tasks),
            "preferences": 1 if validated.preferences else 0,
        }

    async def _clear_user_data(self) -> None:
        """Delete all user data before import."""
        # Delete instances for user's tasks first (foreign key constraint)
        await self.db.execute(
            delete(TaskInstance).where(TaskInstance.task_id.in_(select(Task.id).where(Task.user_id == self.user_id)))
        )
        await self.db.execute(delete(Task).where(Task.user_id == self.user_id))
        await self.db.execute(delete(Domain).where(Domain.user_id == self.user_id))
        await self.db.execute(delete(UserPreferences).where(UserPreferences.user_id == self.user_id))

    def _serialize_domain(self, domain: Domain) -> dict[str, Any]:
        return {
            "id": domain.id,
            "name": domain.name,
            "icon": domain.icon,
            "color": domain.color,
            "position": domain.position,
            "is_archived": domain.is_archived,
            "external_id": domain.external_id,
            "external_source": domain.external_source,
        }

    def _serialize_task(self, task: Task) -> dict[str, Any]:
        return {
            "id": task.id,
            "domain_id": task.domain_id,
            "parent_id": task.parent_id,
            "title": task.title,
            "description": task.description,
            "status": task.status,
            "clarity": task.clarity,
            "impact": task.impact,
            "duration_minutes": task.duration_minutes,
            "scheduled_date": task.scheduled_date.isoformat() if task.scheduled_date else None,
            "scheduled_time": task.scheduled_time.isoformat() if task.scheduled_time else None,
            "is_recurring": task.is_recurring,
            "recurrence_rule": task.recurrence_rule,
            "recurrence_start": task.recurrence_start.isoformat() if task.recurrence_start else None,
            "recurrence_end": task.recurrence_end.isoformat() if task.recurrence_end else None,
            "position": task.position,
            "completed_at": task.completed_at.isoformat() if task.completed_at else None,
            "external_id": task.external_id,
            "external_source": task.external_source,
            "external_created_at": task.external_created_at.isoformat() if task.external_created_at else None,
            "instances": [self._serialize_instance(i) for i in task.instances],
        }

    def _serialize_instance(self, instance: TaskInstance) -> dict[str, Any]:
        return {
            "instance_date": instance.instance_date.isoformat(),
            "status": instance.status,
            "scheduled_datetime": instance.scheduled_datetime.isoformat() if instance.scheduled_datetime else None,
            "completed_at": instance.completed_at.isoformat() if instance.completed_at else None,
        }

    def _serialize_preferences(self, prefs: UserPreferences) -> dict[str, Any]:
        return {
            "show_completed_in_planner": prefs.show_completed_in_planner,
            "completed_retention_days": prefs.completed_retention_days,
            "completed_move_to_bottom": prefs.completed_move_to_bottom,
            "completed_sort_by_date": prefs.completed_sort_by_date,
            "show_completed_in_list": prefs.show_completed_in_list,
            "hide_recurring_after_completion": prefs.hide_recurring_after_completion,
            "show_scheduled_in_list": prefs.show_scheduled_in_list,
            "scheduled_move_to_bottom": prefs.scheduled_move_to_bottom,
            "scheduled_sort_by_date": prefs.scheduled_sort_by_date,
            "timezone": prefs.timezone,
        }

    def _parse_date(self, value: str | None) -> date | None:
        if not value:
            return None
        return date.fromisoformat(value)

    def _parse_time(self, value: str | None) -> time | None:
        if not value:
            return None
        return time.fromisoformat(value)

    def _parse_datetime(self, value: str | None) -> datetime | None:
        if not value:
            return None
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
