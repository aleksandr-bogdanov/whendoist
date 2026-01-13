"""
Analytics service for task completion statistics.

Provides comprehensive queries for completion stats, trends, patterns, and insights.
"""

from collections import defaultdict
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import Date, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Domain, Task, TaskInstance


class AnalyticsService:
    """Async service for analytics queries."""

    def __init__(self, db: AsyncSession, user_id: int):
        self.db = db
        self.user_id = user_id

    async def get_comprehensive_stats(
        self,
        start_date: date,
        end_date: date,
    ) -> dict:
        """
        Get comprehensive analytics for the dashboard.

        Returns dict with all metrics for ApexCharts visualization.
        """
        range_start = datetime.combine(start_date, datetime.min.time())
        range_end = datetime.combine(end_date + timedelta(days=1), datetime.min.time())

        # Gather all completion timestamps for analysis
        all_completions = await self._get_all_completions(range_start, range_end)

        # Basic stats
        total_completed = len(all_completions)
        total_pending = await self._get_pending_count()
        total = total_completed + total_pending
        completion_rate = round((total_completed / total * 100) if total > 0 else 0, 1)

        # Daily completions for bar chart
        daily_completions = self._aggregate_by_date(all_completions, start_date, end_date)

        # By domain breakdown
        by_domain = await self._get_domain_breakdown(range_start, range_end)

        # Day of week distribution (0=Monday, 6=Sunday)
        by_day_of_week = self._aggregate_by_day_of_week(all_completions)

        # Hour of day distribution
        by_hour = self._aggregate_by_hour(all_completions)

        # Impact distribution
        impact_distribution = await self._get_impact_distribution(range_start, range_end)

        # Streaks
        streaks = await self._calculate_streaks()

        # Heatmap data (last 12 weeks regardless of selected range)
        heatmap_data = await self._get_heatmap_data()

        # Weekly comparison
        week_comparison = await self._get_week_comparison()

        # Velocity (7-day rolling average for last 30 days)
        velocity_data = await self._get_velocity_data()

        # Recurring task stats
        recurring_stats = await self._get_recurring_stats(range_start, range_end)

        # Task aging stats
        aging_stats = await self._get_aging_stats()

        return {
            # Overview
            "total_completed": total_completed,
            "total_pending": total_pending,
            "completion_rate": completion_rate,
            # Charts data
            "daily_completions": daily_completions,
            "by_domain": by_domain,
            "by_day_of_week": by_day_of_week,
            "by_hour": by_hour,
            "impact_distribution": impact_distribution,
            "heatmap_data": heatmap_data,
            "velocity_data": velocity_data,
            # Insights
            "streaks": streaks,
            "week_comparison": week_comparison,
            "recurring_stats": recurring_stats,
            "aging_stats": aging_stats,
        }

    async def _get_all_completions(self, range_start: datetime, range_end: datetime) -> list[dict]:
        """Get all completion timestamps with metadata."""
        completions = []

        # Tasks
        task_query = select(Task.completed_at, Task.impact, Task.domain_id).where(
            Task.user_id == self.user_id,
            Task.status == "completed",
            Task.completed_at >= range_start,
            Task.completed_at < range_end,
        )
        result = await self.db.execute(task_query)
        for row in result:
            if row.completed_at:
                completions.append(
                    {
                        "completed_at": row.completed_at,
                        "impact": row.impact,
                        "domain_id": row.domain_id,
                        "is_instance": False,
                    }
                )

        # Instances
        instance_query = (
            select(TaskInstance.completed_at, Task.impact, Task.domain_id)
            .select_from(TaskInstance)
            .join(Task, TaskInstance.task_id == Task.id)
            .where(
                TaskInstance.user_id == self.user_id,
                TaskInstance.status == "completed",
                TaskInstance.completed_at >= range_start,
                TaskInstance.completed_at < range_end,
            )
        )
        result = await self.db.execute(instance_query)
        for row in result:
            if row.completed_at:
                completions.append(
                    {
                        "completed_at": row.completed_at,
                        "impact": row.impact,
                        "domain_id": row.domain_id,
                        "is_instance": True,
                    }
                )

        return completions

    async def _get_pending_count(self) -> int:
        """Get count of pending tasks."""
        query = (
            select(func.count())
            .select_from(Task)
            .where(
                Task.user_id == self.user_id,
                Task.status == "pending",
            )
        )
        result = await self.db.execute(query)
        return result.scalar() or 0

    def _aggregate_by_date(self, completions: list[dict], start_date: date, end_date: date) -> list[dict]:
        """Aggregate completions by date."""
        counts: dict[date, int] = defaultdict(int)
        for c in completions:
            if c["completed_at"]:
                d = c["completed_at"].date()
                counts[d] += 1

        result = []
        current = start_date
        while current <= end_date:
            result.append(
                {
                    "date": current.isoformat(),
                    "count": counts.get(current, 0),
                }
            )
            current += timedelta(days=1)
        return result

    def _aggregate_by_day_of_week(self, completions: list[dict]) -> list[dict]:
        """Aggregate completions by day of week."""
        counts = [0] * 7  # Mon-Sun
        for c in completions:
            if c["completed_at"]:
                dow = c["completed_at"].weekday()
                counts[dow] += 1

        days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        return [{"day": days[i], "count": counts[i]} for i in range(7)]

    def _aggregate_by_hour(self, completions: list[dict]) -> list[dict]:
        """Aggregate completions by hour of day."""
        counts = [0] * 24
        for c in completions:
            if c["completed_at"]:
                hour = c["completed_at"].hour
                counts[hour] += 1

        return [{"hour": i, "count": counts[i]} for i in range(24)]

    async def _get_domain_breakdown(self, range_start: datetime, range_end: datetime) -> list[dict]:
        """Get completion counts by domain."""
        domain_counts: dict[int | None, int] = defaultdict(int)

        # Tasks
        task_query = (
            select(Task.domain_id, func.count().label("count"))
            .where(
                Task.user_id == self.user_id,
                Task.status == "completed",
                Task.completed_at >= range_start,
                Task.completed_at < range_end,
            )
            .group_by(Task.domain_id)
        )
        result = await self.db.execute(task_query)
        for row in result:
            domain_id, cnt = row[0], row[1]
            domain_counts[domain_id] += int(cnt)

        # Instances
        instance_query = (
            select(Task.domain_id, func.count().label("count"))
            .select_from(TaskInstance)
            .join(Task, TaskInstance.task_id == Task.id)
            .where(
                TaskInstance.user_id == self.user_id,
                TaskInstance.status == "completed",
                TaskInstance.completed_at >= range_start,
                TaskInstance.completed_at < range_end,
            )
            .group_by(Task.domain_id)
        )
        result = await self.db.execute(instance_query)
        for row in result:
            domain_id, cnt = row[0], row[1]
            domain_counts[domain_id] += int(cnt)

        # Get domain details
        domains_query = select(Domain).where(Domain.user_id == self.user_id)
        domains_result = await self.db.execute(domains_query)
        domains_map = {d.id: d for d in domains_result.scalars().all()}

        by_domain = []
        for domain_id, count in sorted(domain_counts.items(), key=lambda x: -x[1]):
            # Skip Inbox (domain_id is None)
            if domain_id is None:
                continue
            domain = domains_map.get(domain_id)
            if domain:
                by_domain.append(
                    {
                        "domain_id": domain_id,
                        "domain_name": domain.name,
                        "domain_icon": domain.icon or "📁",
                        "count": count,
                    }
                )

        return by_domain

    async def _get_impact_distribution(self, range_start: datetime, range_end: datetime) -> list[dict]:
        """Get completion counts by impact level."""
        impact_counts = {1: 0, 2: 0, 3: 0, 4: 0}

        # Tasks
        task_query = (
            select(Task.impact, func.count().label("count"))
            .where(
                Task.user_id == self.user_id,
                Task.status == "completed",
                Task.completed_at >= range_start,
                Task.completed_at < range_end,
            )
            .group_by(Task.impact)
        )
        result = await self.db.execute(task_query)
        for row in result:
            impact, cnt = row[0], row[1]
            if impact in impact_counts:
                impact_counts[impact] += int(cnt)

        # Instances
        instance_query = (
            select(Task.impact, func.count().label("count"))
            .select_from(TaskInstance)
            .join(Task, TaskInstance.task_id == Task.id)
            .where(
                TaskInstance.user_id == self.user_id,
                TaskInstance.status == "completed",
                TaskInstance.completed_at >= range_start,
                TaskInstance.completed_at < range_end,
            )
            .group_by(Task.impact)
        )
        result = await self.db.execute(instance_query)
        for row in result:
            impact, cnt = row[0], row[1]
            if impact in impact_counts:
                impact_counts[impact] += int(cnt)

        labels = {1: "Critical", 2: "High", 3: "Medium", 4: "Low"}
        colors = {1: "#dc2626", 2: "#f97316", 3: "#eab308", 4: "#22c55e"}

        return [
            {
                "impact": i,
                "label": labels[i],
                "count": impact_counts[i],
                "color": colors[i],
            }
            for i in [1, 2, 3, 4]
        ]

    async def _calculate_streaks(self) -> dict:
        """Calculate current and longest completion streaks."""
        # Get all unique completion dates
        task_dates_query = select(cast(Task.completed_at, Date).distinct()).where(
            Task.user_id == self.user_id,
            Task.status == "completed",
            Task.completed_at.isnot(None),
        )
        instance_dates_query = select(cast(TaskInstance.completed_at, Date).distinct()).where(
            TaskInstance.user_id == self.user_id,
            TaskInstance.status == "completed",
            TaskInstance.completed_at.isnot(None),
        )

        task_result = await self.db.execute(task_dates_query)
        instance_result = await self.db.execute(instance_dates_query)

        all_dates = set()
        for row in task_result:
            if row[0]:
                all_dates.add(row[0])
        for row in instance_result:
            if row[0]:
                all_dates.add(row[0])

        if not all_dates:
            return {"current": 0, "longest": 0, "this_week": 0}

        sorted_dates = sorted(all_dates)
        today = date.today()

        # Current streak (counting back from today or yesterday)
        current_streak = 0
        check_date = today
        # Allow for today not being complete yet
        if check_date not in all_dates:
            check_date = today - timedelta(days=1)

        while check_date in all_dates:
            current_streak += 1
            check_date -= timedelta(days=1)

        # Longest streak ever
        longest_streak = 0
        streak = 0
        prev_date = None

        for d in sorted_dates:
            if prev_date and (d - prev_date).days == 1:
                streak += 1
            else:
                streak = 1
            longest_streak = max(longest_streak, streak)
            prev_date = d

        # Days with completions this week
        week_start = today - timedelta(days=today.weekday())
        this_week = sum(1 for d in all_dates if d >= week_start and d <= today)

        return {
            "current": current_streak,
            "longest": longest_streak,
            "this_week": this_week,
        }

    async def _get_heatmap_data(self) -> list[dict]:
        """Get completion data for GitHub-style heatmap (last 12 weeks)."""
        today = date.today()
        # Start from 12 weeks ago, aligned to Sunday (week start for heatmap)
        start = today - timedelta(days=today.weekday() + 7 * 12)
        range_start = datetime.combine(start, datetime.min.time())
        range_end = datetime.combine(today + timedelta(days=1), datetime.min.time())

        # Get daily counts
        daily_counts: dict[date, int] = defaultdict(int)

        task_query = (
            select(
                cast(Task.completed_at, Date).label("d"),
                func.count().label("count"),
            )
            .where(
                Task.user_id == self.user_id,
                Task.status == "completed",
                Task.completed_at >= range_start,
                Task.completed_at < range_end,
            )
            .group_by(cast(Task.completed_at, Date))
        )
        result = await self.db.execute(task_query)
        for row in result:
            d, cnt = row[0], row[1]
            if d:
                daily_counts[d] += int(cnt)

        instance_query = (
            select(
                cast(TaskInstance.completed_at, Date).label("d"),
                func.count().label("count"),
            )
            .where(
                TaskInstance.user_id == self.user_id,
                TaskInstance.status == "completed",
                TaskInstance.completed_at >= range_start,
                TaskInstance.completed_at < range_end,
            )
            .group_by(cast(TaskInstance.completed_at, Date))
        )
        result = await self.db.execute(instance_query)
        for row in result:
            d, cnt = row[0], row[1]
            if d:
                daily_counts[d] += int(cnt)

        # Build heatmap series (for ApexCharts heatmap)
        # Format: [{x: date, y: count}, ...]
        heatmap = []
        current = start
        while current <= today:
            heatmap.append(
                {
                    "x": current.isoformat(),
                    "y": daily_counts.get(current, 0),
                }
            )
            current += timedelta(days=1)

        return heatmap

    async def _get_week_comparison(self) -> dict:
        """Compare this week vs last week."""
        today = date.today()
        this_week_start = today - timedelta(days=today.weekday())
        last_week_start = this_week_start - timedelta(days=7)

        # This week
        tw_start = datetime.combine(this_week_start, datetime.min.time())
        tw_end = datetime.combine(today + timedelta(days=1), datetime.min.time())

        tw_task = await self.db.execute(
            select(func.count())
            .select_from(Task)
            .where(
                Task.user_id == self.user_id,
                Task.status == "completed",
                Task.completed_at >= tw_start,
                Task.completed_at < tw_end,
            )
        )
        tw_instance = await self.db.execute(
            select(func.count())
            .select_from(TaskInstance)
            .where(
                TaskInstance.user_id == self.user_id,
                TaskInstance.status == "completed",
                TaskInstance.completed_at >= tw_start,
                TaskInstance.completed_at < tw_end,
            )
        )
        this_week_count = (tw_task.scalar() or 0) + (tw_instance.scalar() or 0)

        # Last week (same days)
        days_into_week = today.weekday() + 1
        lw_start = datetime.combine(last_week_start, datetime.min.time())
        lw_end = datetime.combine(last_week_start + timedelta(days=days_into_week), datetime.min.time())

        lw_task = await self.db.execute(
            select(func.count())
            .select_from(Task)
            .where(
                Task.user_id == self.user_id,
                Task.status == "completed",
                Task.completed_at >= lw_start,
                Task.completed_at < lw_end,
            )
        )
        lw_instance = await self.db.execute(
            select(func.count())
            .select_from(TaskInstance)
            .where(
                TaskInstance.user_id == self.user_id,
                TaskInstance.status == "completed",
                TaskInstance.completed_at >= lw_start,
                TaskInstance.completed_at < lw_end,
            )
        )
        last_week_count = (lw_task.scalar() or 0) + (lw_instance.scalar() or 0)

        # Calculate change
        if last_week_count > 0:
            change_pct = round((this_week_count - last_week_count) / last_week_count * 100)
        else:
            change_pct = 100 if this_week_count > 0 else 0

        return {
            "this_week": this_week_count,
            "last_week": last_week_count,
            "change_pct": change_pct,
        }

    async def _get_velocity_data(self) -> list[dict]:
        """Get 7-day rolling average for last 30 days."""
        today = date.today()
        start = today - timedelta(days=36)  # Extra days for rolling calc
        range_start = datetime.combine(start, datetime.min.time())
        range_end = datetime.combine(today + timedelta(days=1), datetime.min.time())

        # Get daily counts
        daily_counts: dict[date, int] = defaultdict(int)

        task_query = (
            select(
                cast(Task.completed_at, Date).label("d"),
                func.count().label("count"),
            )
            .where(
                Task.user_id == self.user_id,
                Task.status == "completed",
                Task.completed_at >= range_start,
                Task.completed_at < range_end,
            )
            .group_by(cast(Task.completed_at, Date))
        )
        result = await self.db.execute(task_query)
        for row in result:
            d, cnt = row[0], row[1]
            if d:
                daily_counts[d] += int(cnt)

        instance_query = (
            select(
                cast(TaskInstance.completed_at, Date).label("d"),
                func.count().label("count"),
            )
            .where(
                TaskInstance.user_id == self.user_id,
                TaskInstance.status == "completed",
                TaskInstance.completed_at >= range_start,
                TaskInstance.completed_at < range_end,
            )
            .group_by(cast(TaskInstance.completed_at, Date))
        )
        result = await self.db.execute(instance_query)
        for row in result:
            d, cnt = row[0], row[1]
            if d:
                daily_counts[d] += int(cnt)

        # Calculate 7-day rolling average for last 30 days
        velocity = []
        for i in range(30):
            d = today - timedelta(days=29 - i)
            # Sum of last 7 days
            week_sum = sum(daily_counts.get(d - timedelta(days=j), 0) for j in range(7))
            avg = round(week_sum / 7, 1)
            velocity.append(
                {
                    "date": d.isoformat(),
                    "count": daily_counts.get(d, 0),
                    "avg": avg,
                }
            )

        return velocity

    async def _get_recurring_stats(self, range_start: datetime, range_end: datetime) -> list[dict]:
        """Get completion rates for recurring tasks.

        Shows ALL recurring tasks, even those without instances in the date range.
        Tasks without instances show 0/0 with 0% rate.
        """
        # Get recurring tasks
        recurring_query = select(Task).where(
            Task.user_id == self.user_id,
            Task.is_recurring == True,
            Task.status != "archived",
        )
        result = await self.db.execute(recurring_query)
        recurring_tasks = list(result.scalars().all())

        stats = []
        for task in recurring_tasks[:10]:  # Limit to top 10
            # Count completed instances in range
            completed_query = (
                select(func.count())
                .select_from(TaskInstance)
                .where(
                    TaskInstance.task_id == task.id,
                    TaskInstance.status == "completed",
                    TaskInstance.completed_at >= range_start,
                    TaskInstance.completed_at < range_end,
                )
            )
            completed_result = await self.db.execute(completed_query)
            completed_count = completed_result.scalar() or 0

            # Count total instances in range
            total_query = (
                select(func.count())
                .select_from(TaskInstance)
                .where(
                    TaskInstance.task_id == task.id,
                    TaskInstance.instance_date >= range_start.date(),
                    TaskInstance.instance_date <= range_end.date(),
                )
            )
            total_result = await self.db.execute(total_query)
            total_count = total_result.scalar() or 0

            # Include ALL recurring tasks, even those without instances
            rate = round(completed_count / total_count * 100) if total_count > 0 else 0
            stats.append(
                {
                    "task_id": task.id,
                    "title": task.title[:40] + ("..." if len(task.title) > 40 else ""),
                    "completed": completed_count,
                    "total": total_count,
                    "rate": rate,
                }
            )

        # Sort by completion rate (descending), then by title
        stats.sort(key=lambda x: (-x["rate"], x["title"]))
        return stats

    async def _get_aging_stats(self) -> dict:
        """Get task resolution time statistics.

        Calculates time from task creation to completion for completed tasks.
        Uses external_created_at (Todoist creation date) if available,
        otherwise falls back to created_at (database creation date).
        """
        # Get completed tasks with creation and completion dates
        completed_query = select(
            Task.created_at,
            Task.external_created_at,
            Task.completed_at,
        ).where(
            Task.user_id == self.user_id,
            Task.status == "completed",
            Task.completed_at.isnot(None),
        )
        result = await self.db.execute(completed_query)

        # Resolution time buckets (days from open to close)
        resolution_buckets = {
            "same_day": 0,      # Completed same day as created
            "within_week": 0,   # 1-7 days
            "within_month": 0,  # 8-30 days
            "over_month": 0,    # 30+ days
        }

        resolution_times = []

        for row in result:
            # Prefer external_created_at (Todoist original date) over created_at (import date)
            created_at = row.external_created_at or row.created_at
            completed_at = row.completed_at

            if created_at and completed_at:
                created_date = created_at.date() if hasattr(created_at, "date") else created_at
                completed_date = completed_at.date() if hasattr(completed_at, "date") else completed_at
                resolution_days = (completed_date - created_date).days

                resolution_times.append(resolution_days)

                if resolution_days == 0:
                    resolution_buckets["same_day"] += 1
                elif resolution_days <= 7:
                    resolution_buckets["within_week"] += 1
                elif resolution_days <= 30:
                    resolution_buckets["within_month"] += 1
                else:
                    resolution_buckets["over_month"] += 1

        # Calculate averages
        avg_resolution = round(sum(resolution_times) / len(resolution_times), 1) if resolution_times else 0
        median_resolution = sorted(resolution_times)[len(resolution_times) // 2] if resolution_times else 0

        return {
            "buckets": resolution_buckets,
            "avg_days": avg_resolution,
            "median_days": median_resolution,
            "total_completed": len(resolution_times),
        }

    async def get_recent_completions(self, limit: int = 20) -> list[dict]:
        """Get most recent completed tasks."""
        # Get recent completed tasks
        task_query = (
            select(Task)
            .where(
                Task.user_id == self.user_id,
                Task.status == "completed",
                Task.completed_at.isnot(None),
            )
            .order_by(Task.completed_at.desc())
            .limit(limit)
        )
        task_result = await self.db.execute(task_query)
        tasks = list(task_result.scalars().all())

        # Get recent completed instances
        instance_query = (
            select(TaskInstance, Task)
            .join(Task, TaskInstance.task_id == Task.id)
            .where(
                TaskInstance.user_id == self.user_id,
                TaskInstance.status == "completed",
                TaskInstance.completed_at.isnot(None),
            )
            .order_by(TaskInstance.completed_at.desc())
            .limit(limit)
        )
        instance_result = await self.db.execute(instance_query)
        instances = list(instance_result.all())

        # Get domains
        domains_query = select(Domain).where(Domain.user_id == self.user_id)
        domains_result = await self.db.execute(domains_query)
        domains_map = {d.id: d for d in domains_result.scalars().all()}

        # Combine and sort
        completions = []

        for task in tasks:
            domain = domains_map.get(task.domain_id) if task.domain_id else None
            completions.append(
                {
                    "id": task.id,
                    "task_id": task.id,
                    "title": task.title,
                    "completed_at": task.completed_at,
                    "domain_name": domain.name if domain else "Inbox",
                    "domain_icon": domain.icon if domain else "📥",
                    "is_instance": False,
                }
            )

        for instance, task in instances:
            domain = domains_map.get(task.domain_id) if task.domain_id else None
            completions.append(
                {
                    "id": instance.id,
                    "task_id": task.id,
                    "title": task.title,
                    "completed_at": instance.completed_at,
                    "domain_name": domain.name if domain else "Inbox",
                    "domain_icon": domain.icon if domain else "📥",
                    "is_instance": True,
                }
            )

        # Sort by completed_at descending and limit
        completions.sort(key=lambda x: x["completed_at"] or datetime.min.replace(tzinfo=UTC), reverse=True)
        return completions[:limit]
