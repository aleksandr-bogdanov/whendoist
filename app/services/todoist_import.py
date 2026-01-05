"""
Todoist import service.

Imports projects as domains and tasks from Todoist into native storage.
Uses external_id/external_source to track imported items for idempotency.
"""

import logging
import re
from dataclasses import dataclass, field

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Domain, Task, TaskInstance
from app.services.todoist import TodoistClient, TodoistProject, TodoistTask

logger = logging.getLogger(__name__)


# Todoist color names to hex mapping
TODOIST_COLORS = {
    "berry_red": "#b8255f",
    "red": "#db4035",
    "orange": "#ff9933",
    "yellow": "#fad000",
    "olive_green": "#afb83b",
    "lime_green": "#7ecc49",
    "green": "#299438",
    "mint_green": "#6accbc",
    "teal": "#158fad",
    "sky_blue": "#14aaf5",
    "light_blue": "#96c3eb",
    "blue": "#4073ff",
    "grape": "#884dff",
    "violet": "#af38eb",
    "lavender": "#eb96eb",
    "magenta": "#e05194",
    "salmon": "#ff8d85",
    "charcoal": "#808080",
    "grey": "#b8b8b8",
    "taupe": "#ccac93",
}


@dataclass
class ImportResult:
    """Result of a Todoist import operation."""

    domains_created: int = 0
    domains_skipped: int = 0
    tasks_created: int = 0
    tasks_skipped: int = 0
    errors: list[str] = field(default_factory=list)


class TodoistImportService:
    """
    Service for importing data from Todoist.

    Usage:
        service = TodoistImportService(db, user_id, todoist_token)
        result = await service.import_all()
    """

    def __init__(self, db: AsyncSession, user_id: int, todoist_token: str):
        self.db = db
        self.user_id = user_id
        self.todoist_token = todoist_token

    async def wipe_user_data(self) -> dict:
        """
        Delete all tasks and domains for the current user.

        Returns count of deleted items.
        """
        # Delete task instances first (foreign key constraint)
        instance_result = await self.db.execute(delete(TaskInstance).where(TaskInstance.user_id == self.user_id))
        instances_deleted: int = instance_result.rowcount  # type: ignore[assignment]

        # Delete tasks
        task_result = await self.db.execute(delete(Task).where(Task.user_id == self.user_id))
        tasks_deleted: int = task_result.rowcount  # type: ignore[assignment]

        # Delete domains
        domain_result = await self.db.execute(delete(Domain).where(Domain.user_id == self.user_id))
        domains_deleted: int = domain_result.rowcount  # type: ignore[assignment]

        await self.db.commit()

        return {
            "instances_deleted": instances_deleted,
            "tasks_deleted": tasks_deleted,
            "domains_deleted": domains_deleted,
        }

    async def import_all(self, skip_existing: bool = True) -> ImportResult:
        """
        Import all projects and tasks from Todoist.

        Args:
            skip_existing: If True, skip items that already have matching external_id.
                          If False, will error on duplicate imports.

        Returns:
            ImportResult with counts and any errors.
        """
        result = ImportResult()

        try:
            async with TodoistClient(self.todoist_token) as client:
                # Import projects as domains
                projects = await client.get_projects()
                domain_map = await self._import_projects(projects, result, skip_existing)

                # Import tasks
                tasks = await client.get_all_tasks()
                await self._import_tasks(tasks, domain_map, result, skip_existing)

            await self.db.commit()

        except Exception as e:
            logger.exception("Todoist import failed")
            result.errors.append(str(e))
            await self.db.rollback()

        return result

    async def _import_projects(
        self,
        projects: list[TodoistProject],
        result: ImportResult,
        skip_existing: bool,
    ) -> dict[str, int]:
        """
        Import Todoist projects as domains.

        Returns mapping of Todoist project_id to local domain_id.
        """
        domain_map: dict[str, int] = {}

        # Get existing domains with Todoist external_id
        existing = await self.db.execute(
            select(Domain).where(
                Domain.user_id == self.user_id,
                Domain.external_source == "todoist",
            )
        )
        existing_by_ext_id = {d.external_id: d for d in existing.scalars().all()}

        for project in projects:
            # Skip "Inbox" project - we use domain_id=None for inbox
            if project.name.lower() == "inbox":
                continue

            # Check if already imported
            if project.id in existing_by_ext_id and skip_existing:
                domain_map[project.id] = existing_by_ext_id[project.id].id
                result.domains_skipped += 1
                continue

            # Create domain
            color = TODOIST_COLORS.get(project.color, "#6366f1")
            domain = Domain(
                user_id=self.user_id,
                name=project.name,
                color=color,
                position=project.order,
                external_id=project.id,
                external_source="todoist",
            )
            self.db.add(domain)
            await self.db.flush()

            domain_map[project.id] = domain.id
            result.domains_created += 1

        return domain_map

    async def _import_tasks(
        self,
        tasks: list[TodoistTask],
        domain_map: dict[str, int],
        result: ImportResult,
        skip_existing: bool,
    ) -> None:
        """
        Import Todoist tasks.

        Subtasks are flattened: their title is prefixed with "Parent → "
        and they become independent top-level tasks (no parent_id).
        """
        # Get existing tasks with Todoist external_id
        existing = await self.db.execute(
            select(Task).where(
                Task.user_id == self.user_id,
                Task.external_source == "todoist",
            )
        )
        existing_by_ext_id = {t.external_id: t for t in existing.scalars().all()}

        # Build parent title map for subtask flattening
        parent_titles: dict[str, str] = {t.id: t.content for t in tasks if t.parent_id is None}

        # Identify tasks that have children (these will be skipped)
        tasks_with_children: set[str] = {t.parent_id for t in tasks if t.parent_id is not None}

        # Map of Todoist task ID to local task ID
        task_id_map: dict[str, int] = {}

        # First pass: collect existing task IDs
        for task in tasks:
            if task.id in existing_by_ext_id:
                task_id_map[task.id] = existing_by_ext_id[task.id].id

        for task in tasks:
            # Skip parent tasks that have subtasks (they get flattened into subtasks)
            if task.id in tasks_with_children:
                result.tasks_skipped += 1
                continue
            # Check if already imported
            if task.id in existing_by_ext_id and skip_existing:
                result.tasks_skipped += 1
                continue

            # Map domain
            domain_id = domain_map.get(task.project_id)
            # Note: domain_id can be None for Inbox tasks

            # Flatten subtasks: prefix title with parent name, no parent_id
            task_title = task.content
            if task.parent_id and task.parent_id in parent_titles:
                task_title = f"{parent_titles[task.parent_id]} → {task.content}"

            # No parent_id - all tasks are flat
            # (parent_id field kept in model for potential future use)

            # Map priority: Todoist API returns priority 4 for P1 (highest), 1 for P4 (lowest)
            # Invert to match visual labels: P1→1, P2→2, P3→3, P4→4
            impact = 5 - task.priority  # priority 4 → impact 1, priority 1 → impact 4

            # Parse due date
            due_date = None
            due_time = None
            scheduled_date = None
            scheduled_time = None

            if task.due:
                due_date = task.due.date
                # Always set scheduled_date from due_date (appears in Anytime or calendar)
                scheduled_date = due_date
                if task.due.datetime_:
                    due_time = task.due.datetime_.time()
                    # Also use time as scheduled if specific time provided
                    scheduled_time = due_time

            # Determine clarity from labels
            clarity = self._parse_clarity_from_labels(task.labels)

            # Parse duration from description (d:30m format)
            # Prefer description duration over Todoist's native duration
            parsed_duration, cleaned_description = self._parse_duration_from_description(task.description)
            duration_minutes = parsed_duration or task.duration_minutes

            # Create task (flattened - no parent_id)
            new_task = Task(
                user_id=self.user_id,
                domain_id=domain_id,
                parent_id=None,
                title=task_title,
                description=cleaned_description,
                duration_minutes=duration_minutes,
                impact=impact,
                clarity=clarity,
                due_date=due_date,
                due_time=due_time,
                scheduled_date=scheduled_date,
                scheduled_time=scheduled_time,
                is_recurring=task.due.is_recurring if task.due else False,
                position=task.order,
                external_id=task.id,
                external_source="todoist",
            )
            self.db.add(new_task)
            await self.db.flush()

            task_id_map[task.id] = new_task.id
            result.tasks_created += 1

    def _parse_clarity_from_labels(self, labels: list[str]) -> str | None:
        """
        Extract clarity level from Todoist labels.

        Looks for labels like @executable, @defined, @exploratory.
        """
        label_lower = [label.lower() for label in labels]

        if "executable" in label_lower or "@executable" in label_lower:
            return "executable"
        if "defined" in label_lower or "@defined" in label_lower:
            return "defined"
        if "exploratory" in label_lower or "@exploratory" in label_lower:
            return "exploratory"

        return None

    def _parse_duration_from_description(self, description: str | None) -> tuple[int | None, str | None]:
        """
        Parse duration from description in d: format.

        Supported formats:
        - d:30m or d:30 (30 minutes)
        - d:1h (60 minutes)
        - d:1.5h (90 minutes)
        - d:1h30m (90 minutes)

        Returns:
            Tuple of (duration_minutes, cleaned_description)
        """
        if not description:
            return None, None

        # Pattern matches d:XXm, d:XXh, d:X.Xh, d:XhXXm
        pattern = r"d:(\d+(?:\.\d+)?)(h|m)?(?:(\d+)m)?"
        match = re.search(pattern, description, re.IGNORECASE)

        if not match:
            return None, description

        value = float(match.group(1))
        unit = (match.group(2) or "m").lower()
        extra_minutes = int(match.group(3)) if match.group(3) else 0

        duration_minutes = int(value * 60) + extra_minutes if unit == "h" else int(value)

        # Remove the duration tag from description
        cleaned = re.sub(pattern, "", description, flags=re.IGNORECASE).strip()
        # Clean up any leftover whitespace or punctuation
        cleaned = re.sub(r"\s+", " ", cleaned).strip()

        return duration_minutes, cleaned if cleaned else None
