"""
Backup and restore service.

Exports/imports user data as JSON for backup purposes.
"""

from datetime import date, datetime, time
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Domain, Task, TaskInstance, UserPreferences


class BackupService:
    """Service for exporting and importing user data."""

    VERSION = "0.8.0"

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
            "exported_at": datetime.utcnow().isoformat(),
            "domains": [self._serialize_domain(d) for d in domains],
            "tasks": [self._serialize_task(t) for t in tasks],
            "preferences": self._serialize_preferences(preferences) if preferences else None,
        }

    async def import_all(self, data: dict[str, Any], clear_existing: bool = True) -> dict[str, int]:
        """
        Import user data from a backup.

        Args:
            data: The backup data dictionary
            clear_existing: If True, delete existing data before import

        Returns:
            Dict with counts of imported items
        """
        if clear_existing:
            await self._clear_user_data()

        # Import in order: domains first (for foreign keys), then tasks
        domain_id_map: dict[int, int] = {}  # old_id -> new_id

        # Import domains
        for domain_data in data.get("domains", []):
            old_id = domain_data.get("id")
            domain = Domain(
                user_id=self.user_id,
                name=domain_data["name"],
                icon=domain_data.get("icon"),
                color=domain_data.get("color"),
                external_id=domain_data.get("external_id"),
                external_source=domain_data.get("external_source"),
            )
            self.db.add(domain)
            await self.db.flush()
            if old_id:
                domain_id_map[old_id] = domain.id

        # Import tasks
        for task_data in data.get("tasks", []):
            old_domain_id = task_data.get("domain_id")
            new_domain_id = domain_id_map.get(old_domain_id) if old_domain_id else None

            task = Task(
                user_id=self.user_id,
                domain_id=new_domain_id,
                title=task_data["title"],
                description=task_data.get("description"),
                status=task_data.get("status", "pending"),
                clarity=task_data.get("clarity"),
                impact=task_data.get("impact"),
                duration_minutes=task_data.get("duration_minutes"),
                scheduled_date=self._parse_date(task_data.get("scheduled_date")),
                scheduled_time=self._parse_time(task_data.get("scheduled_time")),
                due_date=self._parse_date(task_data.get("due_date")),
                is_recurring=task_data.get("is_recurring", False),
                recurrence_rule=task_data.get("recurrence_rule"),
                completed_at=self._parse_datetime(task_data.get("completed_at")),
                external_id=task_data.get("external_id"),
                external_source=task_data.get("external_source"),
                external_created_at=self._parse_datetime(task_data.get("external_created_at")),
            )
            self.db.add(task)
            await self.db.flush()

            # Import task instances
            for instance_data in task_data.get("instances", []):
                instance = TaskInstance(
                    task_id=task.id,
                    user_id=self.user_id,
                    instance_date=self._parse_date(instance_data["instance_date"]),
                    status=instance_data.get("status", "pending"),
                    scheduled_datetime=self._parse_datetime(instance_data.get("scheduled_datetime")),
                    completed_at=self._parse_datetime(instance_data.get("completed_at")),
                )
                self.db.add(instance)

        # Import preferences
        if data.get("preferences"):
            prefs_data = data["preferences"]
            preferences = UserPreferences(
                user_id=self.user_id,
                show_completed_in_planner=prefs_data.get("show_completed_in_planner", True),
                completed_retention_days=prefs_data.get("completed_retention_days", 3),
                completed_move_to_bottom=prefs_data.get("completed_move_to_bottom", True),
                show_completed_in_list=prefs_data.get("show_completed_in_list", True),
                hide_recurring_after_completion=prefs_data.get("hide_recurring_after_completion", False),
            )
            self.db.add(preferences)

        await self.db.commit()

        return {
            "domains": len(data.get("domains", [])),
            "tasks": len(data.get("tasks", [])),
            "preferences": 1 if data.get("preferences") else 0,
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
            "external_id": domain.external_id,
            "external_source": domain.external_source,
        }

    def _serialize_task(self, task: Task) -> dict[str, Any]:
        return {
            "id": task.id,
            "domain_id": task.domain_id,
            "title": task.title,
            "description": task.description,
            "status": task.status,
            "clarity": task.clarity,
            "impact": task.impact,
            "duration_minutes": task.duration_minutes,
            "scheduled_date": task.scheduled_date.isoformat() if task.scheduled_date else None,
            "scheduled_time": task.scheduled_time.isoformat() if task.scheduled_time else None,
            "due_date": task.due_date.isoformat() if task.due_date else None,
            "is_recurring": task.is_recurring,
            "recurrence_rule": task.recurrence_rule,
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
            "show_completed_in_list": prefs.show_completed_in_list,
            "hide_recurring_after_completion": prefs.hide_recurring_after_completion,
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
