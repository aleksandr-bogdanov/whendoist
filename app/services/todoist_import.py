"""
Todoist import service.

Imports projects as domains and tasks from Todoist into native storage.
Uses external_id/external_source to track imported items for idempotency.
"""

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime

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
    domains_skipped: int = 0  # Already existed (duplicate)
    tasks_created: int = 0
    tasks_skipped: int = 0  # Already existed (duplicate)
    tasks_completed: int = 0  # Completed tasks imported
    parent_tasks_imported: int = 0  # Parent tasks imported with children
    tasks_need_clarity: int = 0  # Tasks imported without clarity label
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

    async def import_all(
        self, skip_existing: bool = True, include_completed: bool = True, completed_limit: int = 200
    ) -> ImportResult:
        """
        Import all projects and tasks from Todoist.

        Args:
            skip_existing: If True, skip items that already have matching external_id.
                          If False, will error on duplicate imports.
            include_completed: If True, also import recently completed tasks.
            completed_limit: Max number of completed tasks to import.

        Returns:
            ImportResult with counts and any errors.
        """
        result = ImportResult()

        try:
            async with TodoistClient(self.todoist_token) as client:
                # Import projects as domains
                projects = await client.get_projects()
                domain_map = await self._import_projects(projects, result, skip_existing)

                # Import active tasks
                tasks = await client.get_all_tasks()
                await self._import_tasks(tasks, domain_map, result, skip_existing)

                # Import completed tasks for analytics
                if include_completed:
                    completed = await client.get_completed_tasks(limit=completed_limit)

                    # Build parent mapping from response data. Each completed task
                    # item includes parent_id directly (null for top-level tasks).
                    completed_child_to_parent: dict[str, str] = {}
                    for item in completed:
                        child_id = str(item.get("id") or item.get("task_id") or "")
                        parent_id = item.get("parent_id")
                        if child_id and parent_id:
                            completed_child_to_parent[child_id] = str(parent_id)

                    await self._import_completed_tasks(
                        completed, tasks, completed_child_to_parent, domain_map, result, skip_existing
                    )

            await self.db.commit()

        except Exception:
            logger.exception("Todoist import failed")
            result.errors.append("Import failed due to an unexpected error")
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
        Import Todoist tasks preserving parent-child hierarchy.

        Two-pass import: top-level tasks first, then subtasks with parent_id mapped.
        Subtasks inherit domain_id from their parent task.
        """
        # Get existing tasks with Todoist external_id
        existing = await self.db.execute(
            select(Task).where(
                Task.user_id == self.user_id,
                Task.external_source == "todoist",
            )
        )
        existing_by_ext_id = {t.external_id: t for t in existing.scalars().all()}

        # Identify tasks that have children (for counter tracking)
        tasks_with_children: set[str] = {t.parent_id for t in tasks if t.parent_id is not None}

        # Map of Todoist task ID to local task ID
        task_id_map: dict[str, int] = {}

        # First pass: collect existing task IDs
        for task in tasks:
            if task.id in existing_by_ext_id:
                task_id_map[task.id] = existing_by_ext_id[task.id].id

        # Two-pass import: top-level tasks first, then subtasks
        top_level = [t for t in tasks if t.parent_id is None]
        subtasks = [t for t in tasks if t.parent_id is not None]

        for task in top_level + subtasks:
            # Check if already imported
            if task.id in existing_by_ext_id and skip_existing:
                result.tasks_skipped += 1
                continue

            # Map domain: subtasks inherit parent's domain, top-level use project mapping
            if task.parent_id and task.parent_id in task_id_map:
                # Subtask: look up parent's domain from domain_map via project_id
                domain_id = domain_map.get(task.project_id)
            else:
                domain_id = domain_map.get(task.project_id)
            # Note: domain_id can be None for Inbox tasks

            # Resolve parent_id: map Todoist parent_id to local task ID
            local_parent_id = None
            if task.parent_id:
                local_parent_id = task_id_map.get(task.parent_id)
                # If parent wasn't imported (skipped/error), task becomes top-level

            # Track parent tasks
            if task.id in tasks_with_children:
                result.parent_tasks_imported += 1

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

            # Determine clarity from labels; parent tasks default to "autopilot"
            clarity = self._parse_clarity_from_labels(task.labels)
            if not clarity and task.id in tasks_with_children:
                clarity = "autopilot"

            # Parse duration from description (d:30m format)
            # Prefer description duration over Todoist's native duration
            parsed_duration, cleaned_description = self._parse_duration_from_description(task.description)
            duration_minutes = parsed_duration or task.duration_minutes

            # Parse recurrence from Todoist string
            is_recurring = task.due.is_recurring if task.due else False
            recurrence_rule = None
            if is_recurring and task.due and task.due.string:
                recurrence_rule = self._parse_recurrence_string(task.due.string)

            # Create task with parent_id preserving hierarchy
            new_task = Task(
                user_id=self.user_id,
                domain_id=domain_id,
                parent_id=local_parent_id,
                title=task.content,
                description=cleaned_description,
                duration_minutes=duration_minutes,
                impact=impact,
                clarity=clarity,
                due_date=due_date,
                due_time=due_time,
                scheduled_date=scheduled_date,
                scheduled_time=scheduled_time,
                is_recurring=is_recurring,
                recurrence_rule=recurrence_rule,
                position=task.order,
                external_id=task.id,
                external_source="todoist",
                external_created_at=task.created_at,
            )
            self.db.add(new_task)
            await self.db.flush()

            task_id_map[task.id] = new_task.id
            result.tasks_created += 1
            if clarity is None:
                result.tasks_need_clarity += 1

    def _parse_clarity_from_content(self, content: str) -> tuple[str | None, str]:
        """
        Parse clarity from content string and return cleaned title.

        Completed tasks have labels embedded in content like "Task title @executable".
        Returns (clarity, cleaned_title).
        """
        clarity = None
        clean_title = content

        # Check for clarity/mode labels in content (legacy and new names)
        content_lower = content.lower()
        if "@executable" in content_lower or "@autopilot" in content_lower or "@clear" in content_lower:
            clarity = "autopilot"
            clean_title = re.sub(r"\s*@(?:executable|autopilot|clear)\s*", " ", content, flags=re.IGNORECASE).strip()
        elif "@defined" in content_lower or "@normal" in content_lower:
            clarity = "normal"
            clean_title = re.sub(r"\s*@(?:defined|normal)\s*", " ", content, flags=re.IGNORECASE).strip()
        elif "@exploratory" in content_lower or "@brainstorm" in content_lower or "@open" in content_lower:
            clarity = "brainstorm"
            clean_title = re.sub(r"\s*@(?:exploratory|brainstorm|open)\s*", " ", content, flags=re.IGNORECASE).strip()

        return clarity, clean_title

    def _parse_clarity_from_labels(self, labels: list[str]) -> str | None:
        """
        Extract mode level from Todoist labels.

        Looks for labels like @executable/@autopilot/@clear, @defined/@normal, @exploratory/@brainstorm/@open.
        """
        label_lower = [label.lower() for label in labels]

        autopilot_names = {"executable", "@executable", "autopilot", "@autopilot", "clear", "@clear"}
        normal_names = {"defined", "@defined", "normal", "@normal"}
        brainstorm_names = {"exploratory", "@exploratory", "brainstorm", "@brainstorm", "open", "@open"}

        if autopilot_names & set(label_lower):
            return "autopilot"
        if normal_names & set(label_lower):
            return "normal"
        if brainstorm_names & set(label_lower):
            return "brainstorm"

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

    def _parse_recurrence_string(self, recurrence_str: str | None) -> dict | None:
        """
        Parse Todoist recurrence string into our recurrence_rule format.

        Handles common Todoist patterns:
        - "every day", "daily", "every morning/evening/night"
        - "every N days"
        - "every other day" (interval: 2)
        - "every week", "weekly"
        - "every weekday", "every workday" (Mon-Fri)
        - "every weekend" (Sat-Sun)
        - "every Monday", "every Mon, Wed, Fri"
        - "every other week", "every 2 weeks"
        - "every month", "monthly"
        - "every N months", "every other month"
        - "every year", "yearly"
        - "every!" patterns (completion-based, treated same as regular)
        """
        if not recurrence_str:
            return None

        # Normalize: lowercase, strip, remove "every!" -> "every"
        s = recurrence_str.lower().strip()
        s = s.replace("every!", "every")

        # Remove time specifiers for now (we don't store time in recurrence)
        s = re.sub(r"\s+at\s+\d+[:\d]*\s*(am|pm)?", "", s)
        s = re.sub(r"\s+in the (morning|afternoon|evening|night)", "", s)
        s = re.sub(r"\s+(morning|afternoon|evening|night)$", "", s)
        s = re.sub(r"\s+starting.*$", "", s)
        s = re.sub(r"\s+ending.*$", "", s)
        s = re.sub(r"\s+until.*$", "", s)
        s = re.sub(r"\s+from.*$", "", s)
        s = s.strip()

        # Day name mapping
        day_map = {
            "monday": "MO",
            "mon": "MO",
            "tuesday": "TU",
            "tue": "TU",
            "tues": "TU",
            "wednesday": "WE",
            "wed": "WE",
            "thursday": "TH",
            "thu": "TH",
            "thurs": "TH",
            "friday": "FR",
            "fri": "FR",
            "saturday": "SA",
            "sat": "SA",
            "sunday": "SU",
            "sun": "SU",
        }

        # === DAILY patterns ===
        if s in ("every day", "daily", "every morning", "every evening", "every night", "every afternoon"):
            return {"freq": "daily", "interval": 1}

        if s == "every other day":
            return {"freq": "daily", "interval": 2}

        match = re.match(r"every (\d+) days?", s)
        if match:
            return {"freq": "daily", "interval": int(match.group(1))}

        # === WEEKLY patterns ===
        if s in ("every week", "weekly"):
            return {"freq": "weekly", "interval": 1}

        if s in ("every weekday", "every workday"):
            return {"freq": "weekly", "interval": 1, "days_of_week": ["MO", "TU", "WE", "TH", "FR"]}

        if s == "every weekend":
            return {"freq": "weekly", "interval": 1, "days_of_week": ["SA", "SU"]}

        if s == "every other week":
            return {"freq": "weekly", "interval": 2}

        match = re.match(r"every (\d+) weeks?", s)
        if match:
            return {"freq": "weekly", "interval": int(match.group(1))}

        # "every other <day>" e.g., "every other friday"
        match = re.match(r"every other (\w+)", s)
        if match:
            day = match.group(1)
            if day in day_map:
                return {"freq": "weekly", "interval": 2, "days_of_week": [day_map[day]]}

        # === MONTHLY patterns ===
        if s in ("every month", "monthly"):
            return {"freq": "monthly", "interval": 1}

        if s == "every other month":
            return {"freq": "monthly", "interval": 2}

        match = re.match(r"every (\d+) months?", s)
        if match:
            return {"freq": "monthly", "interval": int(match.group(1))}

        if s == "every quarter" or s == "quarterly":
            return {"freq": "monthly", "interval": 3}

        # "every last day" - monthly on last day
        if s == "every last day":
            return {"freq": "monthly", "interval": 1}

        # === YEARLY patterns ===
        if s in ("every year", "yearly", "annually"):
            return {"freq": "yearly", "interval": 1}

        match = re.match(r"every (\d+) years?", s)
        if match:
            return {"freq": "yearly", "interval": int(match.group(1))}

        # === Day-specific patterns ===
        # "every <day name>" or "every <day>, <day>, ..."
        if s.startswith("every "):
            rest = s[6:].strip()
            # Remove ordinal patterns like "1st", "2nd", "3rd", "last" for monthly
            rest = re.sub(r"\d+(st|nd|rd|th)", "", rest).strip()

            # Split by comma, &, and
            parts = re.split(r"[,&]|\band\b", rest)
            days = []
            for part in parts:
                part = part.strip()
                # Check each word in the part for day names
                for word in part.split():
                    if word in day_map:
                        days.append(day_map[word])
            if days:
                return {"freq": "weekly", "interval": 1, "days_of_week": days}

        # Fallback: couldn't parse, return None
        logger.debug(f"Could not parse recurrence string: {recurrence_str}")
        return None

    async def _import_completed_tasks(
        self,
        completed_tasks: list[dict],
        active_tasks: list[TodoistTask],
        completed_child_to_parent: dict[str, str],
        domain_map: dict[str, int],
        result: ImportResult,
        skip_existing: bool,
    ) -> None:
        """
        Import completed tasks from Todoist API v1 preserving hierarchy.

        These tasks are marked as completed with their completed_at timestamp.
        Parent-child relationships are preserved using completed_child_to_parent
        mapping (built from parent_id in the by_completion_date response).
        """
        # Get existing tasks with Todoist external_id (includes active tasks just imported)
        existing = await self.db.execute(
            select(Task).where(
                Task.user_id == self.user_id,
                Task.external_source == "todoist",
            )
        )
        existing_by_ext_id = {t.external_id: t for t in existing.scalars().all()}

        # Build task_id_map from existing tasks (includes active tasks just imported)
        task_id_map: dict[str, int] = {t.external_id: t.id for t in existing_by_ext_id.values() if t.external_id}

        # Identify completed tasks that have children (for counter tracking and clarity default)
        tasks_with_children: set[str] = set(completed_child_to_parent.values())

        # Two-pass: tasks without parents first, then subtasks
        without_parent: list[dict] = []
        with_parent: list[dict] = []

        for item in completed_tasks:
            task_id = item.get("id") or item.get("task_id")
            if not task_id:
                continue
            if str(task_id) in completed_child_to_parent:
                with_parent.append(item)
            else:
                without_parent.append(item)

        for item in without_parent + with_parent:
            task_id = item.get("id") or item.get("task_id")
            if not task_id:
                continue

            # Ensure task_id is string (API v1 may return integers)
            task_id = str(task_id)

            # Check if already imported
            if task_id in existing_by_ext_id:
                existing_task = existing_by_ext_id[task_id]
                # Update to completed if not already
                if existing_task.status != "completed":
                    existing_task.status = "completed"
                    completed_at_str = item.get("completed_at")
                    if completed_at_str:
                        existing_task.completed_at = datetime.fromisoformat(completed_at_str.replace("Z", "+00:00"))
                    result.tasks_completed += 1
                continue

            # Create new completed task
            content = item.get("content", "")
            project_id = item.get("project_id")

            # Resolve parent_id from completed_child_to_parent (built from
            # parent_id field in the by_completion_date API response).
            todoist_parent_id = completed_child_to_parent.get(task_id)
            local_parent_id = None
            if todoist_parent_id:
                local_parent_id = task_id_map.get(str(todoist_parent_id))
                # If parent wasn't imported, task becomes top-level

            # Track parent tasks
            if task_id in tasks_with_children:
                result.parent_tasks_imported += 1

            # Parse clarity from content (completed tasks have labels embedded like "@executable")
            clarity, clean_title = self._parse_clarity_from_content(content)

            # Parent tasks default to "autopilot", others to "normal"
            is_parent = task_id in tasks_with_children
            if not clarity:
                clarity = "autopilot" if is_parent else "normal"

            # Map priority: Todoist API returns priority 4 for P1 (highest), 1 for P4 (lowest)
            priority = item.get("priority", 1)
            impact = 5 - priority  # priority 4 → impact 1, priority 1 → impact 4

            # Ensure project_id is string for domain_map lookup
            if project_id:
                project_id = str(project_id)
            domain_id = domain_map.get(project_id) if project_id else None

            # Parse completed_at and created_at
            completed_at = None
            completed_at_str = item.get("completed_at")
            if completed_at_str:
                completed_at = datetime.fromisoformat(completed_at_str.replace("Z", "+00:00"))

            # Parse created_at for task age analytics
            external_created_at = None
            created_at_str = item.get("added_at") or item.get("created_at")
            if created_at_str:
                external_created_at = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))

            new_task = Task(
                user_id=self.user_id,
                domain_id=domain_id,
                parent_id=local_parent_id,
                title=clean_title,
                status="completed",
                completed_at=completed_at,
                impact=impact,
                clarity=clarity,
                external_id=task_id,
                external_source="todoist",
                external_created_at=external_created_at,
            )
            self.db.add(new_task)
            await self.db.flush()

            task_id_map[task_id] = new_task.id
            result.tasks_completed += 1
