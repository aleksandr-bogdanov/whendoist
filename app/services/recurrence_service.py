"""
Recurrence service for task instance generation.

Uses dateutil.rrule to generate occurrence dates from recurrence rules.
Instances are materialized for a rolling window (default 60 days ahead).
"""

from datetime import UTC, date, datetime, time, timedelta

from dateutil.rrule import DAILY, FR, MO, MONTHLY, SA, SU, TH, TU, WE, WEEKLY, YEARLY, rrule
from sqlalchemy import and_, delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Task, TaskInstance

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

    def __init__(self, db: AsyncSession, user_id: int):
        self.db = db
        self.user_id = user_id

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
                    "time": "09:00"                      # default time
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

        # Determine start date
        start_date = task.recurrence_start or date.today()
        if start_date < date.today():
            start_date = date.today()

        # Determine end date
        end_date = date.today() + timedelta(days=horizon_days)
        if task.recurrence_end and task.recurrence_end < end_date:
            end_date = task.recurrence_end

        # Parse time from rule or use scheduled_time
        default_time = task.scheduled_time
        if "time" in task.recurrence_rule:
            try:
                h, m = map(int, task.recurrence_rule["time"].split(":"))
                default_time = time(h, m)
            except (ValueError, KeyError):
                pass

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
                instances.append(instance)

        await self.db.flush()
        return instances

    async def regenerate_instances(self, task: Task) -> list[TaskInstance]:
        """
        Delete future pending instances and regenerate.

        Call this when recurrence rule changes.
        """
        # Delete future pending instances
        await self.db.execute(
            delete(TaskInstance).where(
                TaskInstance.task_id == task.id,
                TaskInstance.instance_date >= date.today(),
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
        scheduled_datetime: datetime,
    ) -> TaskInstance | None:
        """Reschedule a specific instance."""
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
            instance.scheduled_datetime = scheduled_datetime
            await self.db.flush()

        return instance

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

        # Subquery to get the minimum instance_date per task
        from sqlalchemy import func as sqlfunc

        subquery = (
            select(
                TaskInstance.task_id,
                sqlfunc.min(TaskInstance.instance_date).label("min_date"),
            )
            .where(
                TaskInstance.task_id.in_(task_ids),
                TaskInstance.instance_date >= date.today(),
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

    async def ensure_instances_materialized(
        self,
        horizon_days: int = 60,
    ) -> int:
        """
        Ensure all recurring tasks have instances materialized.

        Called on dashboard load to ensure instances exist.
        Returns count of tasks processed.
        """
        # Find recurring tasks that might need instance generation
        result = await self.db.execute(
            select(Task).where(
                Task.user_id == self.user_id,
                Task.is_recurring == True,
                Task.status == "pending",
            )
        )
        recurring_tasks = result.scalars().all()

        count = 0
        cutoff_date = date.today() + timedelta(days=horizon_days - 7)

        for task in recurring_tasks:
            # Check if we need more instances
            result = await self.db.execute(
                select(TaskInstance.instance_date)
                .where(TaskInstance.task_id == task.id)
                .order_by(TaskInstance.instance_date.desc())
                .limit(1)
            )
            latest = result.scalar_one_or_none()

            if not latest or latest < cutoff_date:
                await self.materialize_instances(task, horizon_days)
                count += 1

        return count
