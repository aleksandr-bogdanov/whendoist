"""
Recurrence service for task instance generation.

Uses dateutil.rrule to generate occurrence dates from recurrence rules.
Instances are materialized for a rolling window (default 60 days ahead).
"""

import logging
from datetime import UTC, date, datetime, time, timedelta

from dateutil.rrule import DAILY, FR, MO, MONTHLY, SA, SU, TH, TU, WE, WEEKLY, YEARLY, rrule
from sqlalchemy import and_, delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.constants import get_user_today
from app.models import Task, TaskInstance

logger = logging.getLogger("whendoist.recurrence")

# Day of week mapping for rrule
DAY_MAP = {
    "MO": MO,
    "TU": TU,
    "WE": WE,
    "TH": TH,
    "FR": FR,
    "SA": SA,
    "SU": SU,
}

FREQ_MAP = {
    "daily": DAILY,
    "weekly": WEEKLY,
    "monthly": MONTHLY,
    "yearly": YEARLY,
}


class RecurrenceService:
    """Service for managing recurring task instances."""

    def __init__(self, db: AsyncSession, user_id: int, timezone: str | None = None):
        self.db = db
        self.user_id = user_id
        self.timezone = timezone

    def generate_occurrences(
        self,
        rule: dict,
        start_date: date,
        end_date: date,
        default_time: time | None = None,
    ) -> list[date]:
        """
        Generate occurrence dates from a recurrence rule.

        Args:
            rule: Recurrence rule dict with format:
                {
                    "freq": "daily" | "weekly" | "monthly" | "yearly",
                    "interval": 1,
                    "days_of_week": ["MO", "TU", ...],  # for weekly
                    "day_of_month": 15,                  # for monthly
                    "week_of_month": 2,                  # for monthly (2nd week)
                    "month_of_year": 6,                  # for yearly
                }
            start_date: Start generating from this date
            end_date: Stop generating after this date
            default_time: Default time for occurrences

        Returns:
            List of occurrence dates
        """
        if not rule or "freq" not in rule:
            return []

        freq = FREQ_MAP.get(rule["freq"])
        if freq is None:
            return []

        # Build rrule kwargs
        kwargs = {
            "dtstart": datetime.combine(start_date, default_time or time(9, 0)),
            "until": datetime.combine(end_date, time(23, 59, 59)),
            "interval": rule.get("interval", 1),
        }

        # Weekly: days of week
        if rule["freq"] == "weekly" and "days_of_week" in rule:
            days = [DAY_MAP[d] for d in rule["days_of_week"] if d in DAY_MAP]
            if days:
                kwargs["byweekday"] = days

        # Monthly: specific day
        if rule["freq"] == "monthly" and "day_of_month" in rule:
            kwargs["bymonthday"] = rule["day_of_month"]

        # Monthly: nth weekday (e.g., 2nd Monday)
        if rule["freq"] == "monthly" and "week_of_month" in rule and "days_of_week" in rule:
            week = rule["week_of_month"]
            days = rule["days_of_week"]
            if days:
                # rrule uses e.g. MO(2) for "2nd Monday"
                kwargs["byweekday"] = [DAY_MAP[days[0]](week)]

        # Yearly
        if rule["freq"] == "yearly":
            if "month_of_year" in rule:
                kwargs["bymonth"] = rule["month_of_year"]
            if "day_of_month" in rule:
                kwargs["bymonthday"] = rule["day_of_month"]

        # Generate occurrences
        rr = rrule(freq, **kwargs)  # type: ignore[arg-type]
        return [dt.date() for dt in rr]

    async def materialize_instances(
        self,
        task: Task,
        horizon_days: int = 60,
    ) -> list[TaskInstance]:
        """
        Generate and save instances for a recurring task.

        Args:
            task: The recurring task
            horizon_days: How many days ahead to generate

        Returns:
            List of created instances
        """
        if not task.is_recurring or not task.recurrence_rule:
            return []

        # Determine start date (use user's timezone for "today")
        today = get_user_today(self.timezone)
        start_date = task.recurrence_start or today

        # Determine end date
        end_date = today + timedelta(days=horizon_days)
        if task.recurrence_end and task.recurrence_end < end_date:
            end_date = task.recurrence_end

        # Use task.scheduled_time as the single source of truth for time
        default_time = task.scheduled_time

        # Generate occurrence dates
        occurrences = self.generate_occurrences(
            task.recurrence_rule,
            start_date,
            end_date,
            default_time,
        )

        # Get existing instances to avoid duplicates
        result = await self.db.execute(
            select(TaskInstance.instance_date).where(
                TaskInstance.task_id == task.id,
                TaskInstance.instance_date >= start_date,
                TaskInstance.instance_date <= end_date,
            )
        )
        existing_dates = {row[0] for row in result.all()}

        # Create new instances
        instances = []
        for occ_date in occurrences:
            if occ_date not in existing_dates:
                instance = TaskInstance(
                    task_id=task.id,
                    user_id=self.user_id,
                    instance_date=occ_date,
                    scheduled_datetime=(datetime.combine(occ_date, default_time, tzinfo=UTC) if default_time else None),
                )
                self.db.add(instance)

                try:
                    await self.db.flush()
                    instances.append(instance)
                except IntegrityError:
                    # Instance was created by a concurrent process, skip
                    await self.db.rollback()
                    logger.debug(f"Instance already exists for task {task.id} on {occ_date}, skipping")
                    continue

        return instances

    async def regenerate_instances(self, task: Task) -> list[TaskInstance]:
        """
        Delete future pending instances and regenerate.

        Call this when recurrence rule changes.
        """
        # Delete future pending instances (use user's timezone for "today")
        await self.db.execute(
            delete(TaskInstance).where(
                TaskInstance.task_id == task.id,
                TaskInstance.instance_date >= get_user_today(self.timezone),
                TaskInstance.status == "pending",
            )
        )

        # Regenerate
        return await self.materialize_instances(task)

    async def get_instances_for_range(
        self,
        start_date: date,
        end_date: date,
        status: str | None = "pending",
    ) -> list[TaskInstance]:
        """
        Get task instances for a date range.

        Returns instances with their parent task data.
        """
        query = (
            select(TaskInstance)
            .join(Task)
            .where(
                TaskInstance.user_id == self.user_id,
                Task.status != "archived",
                TaskInstance.instance_date >= start_date,
                TaskInstance.instance_date <= end_date,
            )
            .options(selectinload(TaskInstance.task).selectinload(Task.domain))
        )

        if status:
            query = query.where(TaskInstance.status == status)

        query = query.order_by(TaskInstance.instance_date, TaskInstance.scheduled_datetime)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def complete_instance(self, instance_id: int) -> TaskInstance | None:
        """Complete a specific instance."""
        result = await self.db.execute(
            select(TaskInstance)
            .join(Task)
            .where(
                TaskInstance.id == instance_id,
                Task.user_id == self.user_id,
            )
        )
        instance = result.scalar_one_or_none()

        if instance:
            instance.status = "completed"
            instance.completed_at = datetime.now(UTC)
            await self.db.flush()

        return instance

    async def uncomplete_instance(self, instance_id: int) -> TaskInstance | None:
        """Uncomplete a specific instance (mark as pending)."""
        result = await self.db.execute(
            select(TaskInstance)
            .join(Task)
            .where(
                TaskInstance.id == instance_id,
                Task.user_id == self.user_id,
            )
        )
        instance = result.scalar_one_or_none()

        if instance:
            instance.status = "pending"
            instance.completed_at = None
            await self.db.flush()

        return instance

    async def toggle_instance_completion(self, instance_id: int) -> TaskInstance | None:
        """Toggle an instance's completion status."""
        result = await self.db.execute(
            select(TaskInstance)
            .join(Task)
            .where(
                TaskInstance.id == instance_id,
                Task.user_id == self.user_id,
            )
        )
        instance = result.scalar_one_or_none()

        if not instance:
            return None

        if instance.status == "completed":
            return await self.uncomplete_instance(instance_id)
        else:
            return await self.complete_instance(instance_id)

    async def skip_instance(self, instance_id: int) -> TaskInstance | None:
        """Skip a specific instance."""
        result = await self.db.execute(
            select(TaskInstance)
            .join(Task)
            .where(
                TaskInstance.id == instance_id,
                Task.user_id == self.user_id,
            )
        )
        instance = result.scalar_one_or_none()

        if instance:
            instance.status = "skipped"
            await self.db.flush()

        return instance

    async def schedule_instance(
        self,
        instance_id: int,
        scheduled_datetime: datetime | None,
    ) -> TaskInstance | None:
        """Reschedule a specific instance."""
        result = await self.db.execute(
            select(TaskInstance)
            .join(Task)
            .where(
                TaskInstance.id == instance_id,
                Task.user_id == self.user_id,
            )
            .options(selectinload(TaskInstance.task).selectinload(Task.domain))
        )
        instance = result.scalar_one_or_none()

        if instance:
            instance.scheduled_datetime = scheduled_datetime
            await self.db.flush()

        return instance

    async def batch_complete_instances(self, task_id: int, before_date: date) -> int:
        """Complete all pending instances for a task before a given date."""
        result = await self.db.execute(
            select(TaskInstance).where(
                TaskInstance.task_id == task_id,
                TaskInstance.user_id == self.user_id,
                TaskInstance.instance_date < before_date,
                TaskInstance.status == "pending",
            )
        )
        instances = list(result.scalars().all())
        now = datetime.now(UTC)
        for inst in instances:
            inst.status = "completed"
            inst.completed_at = now
        await self.db.flush()
        return len(instances)

    async def count_pending_past_instances(self) -> int:
        """Count pending instances before today across all tasks for this user."""
        today = get_user_today(self.timezone)
        result = await self.db.execute(
            select(func.count(TaskInstance.id)).where(
                TaskInstance.user_id == self.user_id,
                TaskInstance.instance_date < today,
                TaskInstance.status == "pending",
            )
        )
        return result.scalar_one()

    async def batch_complete_all_past_instances(self) -> int:
        """Complete all pending instances before today for all tasks."""
        today = get_user_today(self.timezone)
        result = await self.db.execute(
            select(TaskInstance).where(
                TaskInstance.user_id == self.user_id,
                TaskInstance.instance_date < today,
                TaskInstance.status == "pending",
            )
        )
        instances = list(result.scalars().all())
        now = datetime.now(UTC)
        for inst in instances:
            inst.status = "completed"
            inst.completed_at = now
        await self.db.flush()
        return len(instances)

    async def batch_skip_all_past_instances(self) -> int:
        """Skip all pending instances before today for all tasks."""
        today = get_user_today(self.timezone)
        result = await self.db.execute(
            select(TaskInstance).where(
                TaskInstance.user_id == self.user_id,
                TaskInstance.instance_date < today,
                TaskInstance.status == "pending",
            )
        )
        instances = list(result.scalars().all())
        for inst in instances:
            inst.status = "skipped"
        await self.db.flush()
        return len(instances)

    async def get_next_instances_for_tasks(
        self,
        task_ids: list[int],
    ) -> list[TaskInstance]:
        """
        Get the next pending instance for each task.

        Args:
            task_ids: List of task IDs to get next instances for

        Returns:
            List of TaskInstance objects (one per task, earliest pending)
        """
        if not task_ids:
            return []

        # Subquery to get the minimum instance_date per task (use user's timezone)
        subquery = (
            select(
                TaskInstance.task_id,
                func.min(TaskInstance.instance_date).label("min_date"),
            )
            .where(
                TaskInstance.task_id.in_(task_ids),
                TaskInstance.instance_date >= get_user_today(self.timezone),
                TaskInstance.status == "pending",
            )
            .group_by(TaskInstance.task_id)
            .subquery()
        )

        # Join to get actual instances
        result = await self.db.execute(
            select(TaskInstance).join(
                subquery,
                and_(
                    TaskInstance.task_id == subquery.c.task_id,
                    TaskInstance.instance_date == subquery.c.min_date,
                ),
            )
        )
        return list(result.scalars().all())

    async def get_or_create_today_instance(self, task: Task) -> TaskInstance | None:
        """
        Get or create today's instance for a recurring task.

        Used when completing a recurring task from the task dialog.
        Uses user's timezone to determine "today".
        """
        return await self.get_or_create_instance_for_date(task, get_user_today(self.timezone))

    async def get_or_create_instance_for_date(self, task: Task, target_date: date) -> TaskInstance | None:
        """
        Get or create an instance for a recurring task on a specific date.

        Used when completing a recurring task from the calendar.

        Args:
            task: The recurring task
            target_date: The date to get/create instance for
        """
        if not task.is_recurring:
            return None

        # Check for existing instance
        result = await self.db.execute(
            select(TaskInstance).where(
                TaskInstance.task_id == task.id,
                TaskInstance.instance_date == target_date,
            )
        )
        instance = result.scalar_one_or_none()

        if instance:
            return instance

        # Create a new instance for the target date
        default_time = task.scheduled_time

        instance = TaskInstance(
            task_id=task.id,
            user_id=self.user_id,
            instance_date=target_date,
            scheduled_datetime=(datetime.combine(target_date, default_time, tzinfo=UTC) if default_time else None),
        )
        self.db.add(instance)

        try:
            await self.db.flush()
        except IntegrityError:
            # Race condition: instance was created by concurrent request
            await self.db.rollback()
            # Re-query the instance that was created by the concurrent request
            result = await self.db.execute(
                select(TaskInstance).where(
                    TaskInstance.task_id == task.id,
                    TaskInstance.instance_date == target_date,
                    TaskInstance.user_id == self.user_id,
                )
            )
            instance = result.scalar_one_or_none()
            if instance is None:
                raise  # Something else went wrong
            logger.debug(f"Concurrent instance creation for task {task.id} on {target_date}, using existing")

        return instance

    async def ensure_instances_materialized(
        self,
        horizon_days: int = 60,
    ) -> int:
        """
        Ensure all recurring tasks have instances materialized.

        Called on dashboard load to ensure instances exist.
        Returns count of tasks processed.

        Optimized to use a single GROUP BY query instead of N+1 queries.
        """
        # Find recurring tasks that might need instance generation
        result = await self.db.execute(
            select(Task).where(
                Task.user_id == self.user_id,
                Task.is_recurring == True,
                Task.status == "pending",
            )
        )
        recurring_tasks = list(result.scalars().all())

        if not recurring_tasks:
            return 0

        # Get max(instance_date) for all tasks in a single query
        task_ids = [task.id for task in recurring_tasks]
        result = await self.db.execute(
            select(
                TaskInstance.task_id,
                func.max(TaskInstance.instance_date).label("max_date"),
            )
            .where(TaskInstance.task_id.in_(task_ids))
            .group_by(TaskInstance.task_id)
        )
        latest_dates = {row.task_id: row.max_date for row in result.all()}

        count = 0
        cutoff_date = get_user_today(self.timezone) + timedelta(days=horizon_days - 7)

        # Determine which tasks need instance generation
        for task in recurring_tasks:
            latest = latest_dates.get(task.id)
            if not latest or latest < cutoff_date:
                await self.materialize_instances(task, horizon_days)
                count += 1

        return count

    async def unskip_instance(self, instance_id: int) -> TaskInstance | None:
        """Unskip a specific instance (revert skip, mark as pending)."""
        result = await self.db.execute(
            select(TaskInstance)
            .join(Task)
            .where(
                TaskInstance.id == instance_id,
                Task.user_id == self.user_id,
            )
        )
        instance = result.scalar_one_or_none()

        if instance:
            instance.status = "pending"
            await self.db.flush()

        return instance
