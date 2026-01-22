"""
Native task management service.

Provides CRUD operations for tasks and domains.
All operations are user-scoped (multi-tenant).
"""

from datetime import UTC, date, datetime, time

from sqlalchemy import case, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Domain, Task


class TaskService:
    """Async service for task and domain operations."""

    def __init__(self, db: AsyncSession, user_id: int):
        self.db = db
        self.user_id = user_id

    # =========================================================================
    # Domain Operations
    # =========================================================================

    async def get_domains(self, include_archived: bool = False) -> list[Domain]:
        """Get all domains for current user, ordered by position."""
        query = select(Domain).where(Domain.user_id == self.user_id)
        if not include_archived:
            query = query.where(Domain.is_archived == False)
        query = query.order_by(Domain.position, Domain.name)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_domain(self, domain_id: int) -> Domain | None:
        """Get a single domain by ID."""
        result = await self.db.execute(select(Domain).where(Domain.id == domain_id, Domain.user_id == self.user_id))
        return result.scalar_one_or_none()

    async def create_domain(
        self,
        name: str,
        color: str | None = None,
        icon: str | None = None,
    ) -> Domain:
        """
        Create a new domain or return existing one with same name.

        Idempotent: if a domain with the same name already exists for this user,
        return the existing domain (optionally updating icon/color if provided).
        """
        # Check if domain with same name already exists
        result = await self.db.execute(select(Domain).where(Domain.user_id == self.user_id, Domain.name == name))
        existing = result.scalar_one_or_none()

        if existing:
            # Update icon/color if provided and different
            if icon and existing.icon != icon:
                existing.icon = icon
            if color and existing.color != color:
                existing.color = color
            await self.db.flush()
            return existing

        # Get max position for ordering
        result = await self.db.execute(
            select(Domain.position).where(Domain.user_id == self.user_id).order_by(Domain.position.desc()).limit(1)
        )
        max_pos = result.scalar_one_or_none() or 0

        domain = Domain(
            user_id=self.user_id,
            name=name,
            color=color,
            icon=icon,
            position=max_pos + 1,
        )
        self.db.add(domain)
        await self.db.flush()
        return domain

    async def update_domain(
        self,
        domain_id: int,
        name: str | None = None,
        color: str | None = None,
        icon: str | None = None,
        position: int | None = None,
    ) -> Domain | None:
        """Update a domain."""
        domain = await self.get_domain(domain_id)
        if not domain:
            return None

        if name is not None:
            domain.name = name
        if color is not None:
            domain.color = color
        if icon is not None:
            domain.icon = icon
        if position is not None:
            domain.position = position

        await self.db.flush()
        return domain

    async def archive_domain(self, domain_id: int) -> Domain | None:
        """Archive a domain (soft delete)."""
        domain = await self.get_domain(domain_id)
        if not domain:
            return None

        domain.is_archived = True
        await self.db.flush()
        return domain

    # =========================================================================
    # Task Operations
    # =========================================================================

    async def get_tasks(
        self,
        domain_id: int | None = None,
        parent_id: int | None = None,
        status: str | None = "pending",
        scheduled_date: date | None = None,
        is_recurring: bool | None = None,
        clarity: str | None = None,
        include_subtasks: bool = True,
        top_level_only: bool = True,
        has_domain: bool | None = None,
        exclude_statuses: list[str] | None = None,
    ) -> list[Task]:
        """
        Get tasks with optional filtering.

        Args:
            domain_id: Filter by domain (None = no domain / inbox)
            parent_id: Filter by parent task (for subtasks)
            status: Filter by status (pending/completed/archived)
            scheduled_date: Filter by scheduled date
            is_recurring: Filter recurring/non-recurring
            clarity: Filter by clarity (executable/defined/exploratory/none)
            include_subtasks: Eager load subtasks
            top_level_only: Only return top-level tasks (parent_id is None)
            has_domain: True = only tasks WITH a domain, False = only tasks WITHOUT (inbox)
            exclude_statuses: List of statuses to exclude (e.g., ["deleted", "archived"])
        """
        query = select(Task).where(Task.user_id == self.user_id)

        # Filter by domain presence (has_domain takes precedence over domain_id)
        if has_domain is True:
            query = query.where(Task.domain_id.isnot(None))
        elif has_domain is False:
            query = query.where(Task.domain_id.is_(None))
        elif domain_id is not None:
            # Only apply domain_id filter if has_domain is not specified
            query = query.where(Task.domain_id == domain_id)

        # Exclude specific statuses
        if exclude_statuses:
            query = query.where(Task.status.notin_(exclude_statuses))

        # Filter by parent
        if top_level_only and parent_id is None:
            query = query.where(Task.parent_id.is_(None))
        elif parent_id is not None:
            query = query.where(Task.parent_id == parent_id)

        # Filter by status
        if status:
            query = query.where(Task.status == status)

        # Filter by scheduled date
        if scheduled_date:
            query = query.where(Task.scheduled_date == scheduled_date)

        # Filter by recurrence
        if is_recurring is not None:
            query = query.where(Task.is_recurring == is_recurring)

        # Filter by clarity
        if clarity == "none":
            query = query.where(Task.clarity.is_(None))
        elif clarity is not None:
            query = query.where(Task.clarity == clarity)

        # Eager load subtasks and domain
        if include_subtasks:
            query = query.options(
                selectinload(Task.subtasks),
                selectinload(Task.domain),
            )
        else:
            query = query.options(selectinload(Task.domain))

        # Order: unscheduled first, scheduled second, completed last
        # Then by impact (highest first), then position
        # Note: scheduled_date alone (without time) counts as "scheduled" for separation
        schedule_order = case(
            (Task.status == "completed", 2),  # Completed last
            (Task.scheduled_date.isnot(None), 1),  # Scheduled second (date only or date+time)
            else_=0,  # Unscheduled first
        )
        query = query.order_by(schedule_order, Task.impact.asc(), Task.position, Task.created_at)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_task(self, task_id: int) -> Task | None:
        """Get a single task with subtasks."""
        result = await self.db.execute(
            select(Task)
            .where(Task.id == task_id, Task.user_id == self.user_id)
            .options(
                selectinload(Task.subtasks),
                selectinload(Task.domain),
                selectinload(Task.instances),
            )
        )
        return result.scalar_one_or_none()

    async def create_task(
        self,
        title: str,
        description: str | None = None,
        domain_id: int | None = None,
        parent_id: int | None = None,
        duration_minutes: int | None = None,
        impact: int = 4,
        clarity: str = "defined",  # Default to "defined" - all tasks must have clarity
        due_date: date | None = None,
        due_time: time | None = None,
        scheduled_date: date | None = None,
        scheduled_time: time | None = None,
        is_recurring: bool = False,
        recurrence_rule: dict | None = None,
        recurrence_start: date | None = None,
        recurrence_end: date | None = None,
    ) -> Task:
        """Create a new task."""
        # If parent_id is provided, inherit domain from parent
        if parent_id:
            parent = await self.get_task(parent_id)
            if parent:
                domain_id = parent.domain_id

        # Get max position for ordering within domain
        result = await self.db.execute(
            select(Task.position)
            .where(
                Task.user_id == self.user_id,
                Task.domain_id == domain_id,
                Task.parent_id == parent_id,
            )
            .order_by(Task.position.desc())
            .limit(1)
        )
        max_pos = result.scalar_one_or_none() or 0

        task = Task(
            user_id=self.user_id,
            domain_id=domain_id,
            parent_id=parent_id,
            title=title,
            description=description,
            duration_minutes=duration_minutes,
            impact=impact,
            clarity=clarity,
            due_date=due_date,
            due_time=due_time,
            scheduled_date=scheduled_date,
            scheduled_time=scheduled_time,
            is_recurring=is_recurring,
            recurrence_rule=recurrence_rule,
            recurrence_start=recurrence_start or (scheduled_date if is_recurring else None),
            recurrence_end=recurrence_end,
            position=max_pos + 1,
        )
        self.db.add(task)
        await self.db.flush()
        return task

    async def update_task(self, task_id: int, **kwargs) -> Task | None:
        """
        Update a task with provided fields.

        Accepts any Task field as keyword argument. Only updates fields that are
        explicitly provided, allowing None to clear optional fields.
        """
        # Whitelist of fields that can be updated
        UPDATABLE_FIELDS = {
            "title",
            "description",
            "domain_id",
            "duration_minutes",
            "impact",
            "clarity",
            "due_date",
            "due_time",
            "scheduled_date",
            "scheduled_time",
            "is_recurring",
            "recurrence_rule",
            "recurrence_start",
            "recurrence_end",
            "position",
            "status",
        }

        task = await self.get_task(task_id)
        if not task:
            return None

        # Update only whitelisted fields that were explicitly provided
        for field, value in kwargs.items():
            if field in UPDATABLE_FIELDS:
                setattr(task, field, value)

        await self.db.flush()
        return task

    async def complete_task(self, task_id: int) -> Task | None:
        """Mark a non-recurring task as completed."""
        task = await self.get_task(task_id)
        if not task:
            return None

        task.status = "completed"
        task.completed_at = datetime.now(UTC)
        await self.db.flush()
        return task

    async def uncomplete_task(self, task_id: int) -> Task | None:
        """Mark a completed task as pending again."""
        task = await self.get_task(task_id)
        if not task:
            return None

        task.status = "pending"
        task.completed_at = None
        await self.db.flush()
        return task

    async def toggle_task_completion(self, task_id: int) -> Task | None:
        """Toggle a task's completion status."""
        task = await self.get_task(task_id)
        if not task:
            return None

        if task.status == "completed":
            return await self.uncomplete_task(task_id)
        else:
            return await self.complete_task(task_id)

    async def archive_task(self, task_id: int) -> Task | None:
        """Archive a task and all its subtasks (soft delete)."""
        task = await self.get_task(task_id)
        if not task:
            return None

        # Archive all subtasks recursively
        await self._archive_subtasks(task_id)

        task.status = "archived"
        await self.db.flush()
        return task

    async def _archive_subtasks(self, parent_id: int) -> None:
        """Recursively archive all subtasks of a task."""
        result = await self.db.execute(
            select(Task).where(
                Task.parent_id == parent_id,
                Task.user_id == self.user_id,
                Task.status != "archived",
            )
        )
        subtasks = list(result.scalars().all())

        for subtask in subtasks:
            # Recursively archive children first
            await self._archive_subtasks(subtask.id)
            subtask.status = "archived"

    async def restore_task(self, task_id: int) -> Task | None:
        """Restore an archived task back to pending status."""
        task = await self.get_task(task_id)
        if not task or task.status != "archived":
            return None

        # Restore subtasks recursively
        await self._restore_subtasks(task_id)

        task.status = "pending"
        task.completed_at = None
        await self.db.flush()
        return task

    async def _restore_subtasks(self, parent_id: int) -> None:
        """Recursively restore all subtasks of a task."""
        result = await self.db.execute(
            select(Task).where(
                Task.parent_id == parent_id,
                Task.user_id == self.user_id,
                Task.status == "archived",
            )
        )
        subtasks = list(result.scalars().all())

        for subtask in subtasks:
            # Recursively restore children first
            await self._restore_subtasks(subtask.id)
            subtask.status = "pending"
            subtask.completed_at = None

    async def get_archived_tasks(self) -> list[Task]:
        """Get all archived tasks for the user."""
        return await self.get_tasks(status="archived", top_level_only=True)

    async def delete_task(self, task_id: int) -> bool:
        """Permanently delete a task."""
        task = await self.get_task(task_id)
        if not task:
            return False

        await self.db.delete(task)
        await self.db.flush()
        return True

    # =========================================================================
    # Dashboard Query Helpers
    # =========================================================================

    async def get_tasks_grouped_by_domain(
        self,
        status: str = "pending",
    ) -> dict[int | None, list[Task]]:
        """
        Get all tasks grouped by domain for dashboard display.

        Returns a dict with domain_id as key (None for inbox) and tasks as value.
        """
        tasks = await self.get_tasks(status=status, top_level_only=True)

        grouped: dict[int | None, list[Task]] = {}
        for task in tasks:
            domain_id = task.domain_id
            if domain_id not in grouped:
                grouped[domain_id] = []
            grouped[domain_id].append(task)

        return grouped

    async def get_scheduled_tasks_for_range(
        self,
        start_date: date,
        end_date: date,
    ) -> list[Task]:
        """Get non-recurring tasks scheduled within a date range (includes completed)."""
        result = await self.db.execute(
            select(Task)
            .where(
                Task.user_id == self.user_id,
                Task.is_recurring == False,
                Task.scheduled_date >= start_date,
                Task.scheduled_date <= end_date,
            )
            .options(selectinload(Task.domain))
            .order_by(Task.scheduled_date, Task.scheduled_time)
        )
        return list(result.scalars().all())

    # =========================================================================
    # Completion Filtering Helpers
    # =========================================================================

    @staticmethod
    def get_completion_age_class(completed_at: datetime | None, status: str | None = None) -> str:
        """
        Get CSS class for completed tasks.

        Args:
            completed_at: When task was completed (datetime)
            status: Task status string (for fallback if completed_at is None)

        Returns:
            'completed' - Task is completed (grey text with strikethrough)
            '' - Not completed
        """
        if completed_at or status == "completed":
            return "completed"
        return ""

    @staticmethod
    def is_within_retention_window(completed_at: datetime | None, retention_days: int) -> bool:
        """
        Check if a completed task is within the retention window.

        Args:
            completed_at: When task was completed
            retention_days: Number of days to keep completed tasks (1, 3, or 7)

        Returns:
            True if task should be shown, False if it should be filtered out
        """
        if not completed_at:
            return True  # Pending tasks always visible

        now = datetime.now(UTC)
        today = now.date()
        completed_date = completed_at.date()

        days_ago = (today - completed_date).days
        return days_ago < retention_days
