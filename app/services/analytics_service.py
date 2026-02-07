"""
Analytics service for task completion statistics.

Provides comprehensive queries for completion stats, trends, patterns, and insights.

Performance optimizations (v0.14.0):
- Uses UNION ALL to combine Task and TaskInstance queries
- Batch queries for recurring stats (eliminates N+1)
- Shared daily counts for heatmap and velocity
- Single query for week comparison
"""

from collections import defaultdict
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import Date, cast, func, literal, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import (
    HEATMAP_WEEKS,
    IMPACT_COLORS,
    IMPACT_LABELS,
    RECURRING_STATS_LIMIT,
    TITLE_TRUNCATE_LENGTH,
    VELOCITY_DAYS,
)
from app.models import Domain, Task, TaskInstance
from app.utils.timing import log_timing


class AnalyticsService:
    """Async service for analytics queries."""

    def __init__(self, db: AsyncSession, user_id: int):
        self.db = db
        self.user_id = user_id

    @log_timing("analytics.comprehensive_stats")
    async def get_comprehensive_stats(
        self,
        start_date: date,
        end_date: date,
    ) -> dict:
        """
        Get comprehensive analytics for the dashboard.

        Returns dict with all metrics for ApexCharts visualization.

        Optimized to use ~10 queries instead of 26+.
        """
        range_start = datetime.combine(start_date, datetime.min.time())
        range_end = datetime.combine(end_date + timedelta(days=1), datetime.min.time())

        # Query 1: Get domains (needed for domain breakdown)
        domains_map = await self._get_domains_map()

        # Query 2: Pending count
        total_pending = await self._get_pending_count()

        # Query 3: All completions with metadata (unified Task + Instance)
        all_completions = await self._get_all_completions(range_start, range_end)
        total_completed = len(all_completions)

        # In-memory aggregations (fast, data already loaded)
        daily_completions = self._aggregate_by_date(all_completions, start_date, end_date)
        by_day_of_week = self._aggregate_by_day_of_week(all_completions)
        by_hour = self._aggregate_by_hour(all_completions)
        by_domain = self._aggregate_by_domain(all_completions, domains_map)
        impact_distribution = self._aggregate_by_impact(all_completions)

        # Query 4: Streaks (needs full history, separate query)
        streaks = await self._calculate_streaks()

        # Query 5: Daily counts for heatmap + velocity (shared query)
        today = date.today()
        heatmap_start = today - timedelta(days=today.weekday() + 7 * HEATMAP_WEEKS)
        velocity_start = today - timedelta(days=VELOCITY_DAYS + 6)  # +6 for 7-day rolling average
        counts_start = min(heatmap_start, velocity_start)
        daily_counts = await self._get_daily_counts(counts_start, today)

        heatmap_data = self._build_heatmap(daily_counts, heatmap_start, today)
        velocity_data = self._build_velocity(daily_counts, today)

        # Query 6: Week comparison (single optimized query)
        week_comparison = await self._get_week_comparison()

        # Query 7-8: Recurring stats (batch query, no N+1)
        recurring_stats = await self._get_recurring_stats(range_start, range_end)

        # Query 9: Aging stats
        aging_stats = await self._get_aging_stats()

        total = total_completed + total_pending
        completion_rate = round((total_completed / total * 100) if total > 0 else 0, 1)

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

    async def _get_domains_map(self) -> dict[int, Domain]:
        """Get all domains for the user as a lookup map."""
        query = select(Domain).where(Domain.user_id == self.user_id)
        result = await self.db.execute(query)
        return {d.id: d for d in result.scalars().all()}

    async def _get_all_completions(self, range_start: datetime, range_end: datetime) -> list[dict]:
        """
        Get all completion timestamps with metadata.

        Uses UNION ALL to combine Task and Instance completions in single query.
        """
        # Task completions
        task_query = select(
            Task.completed_at.label("completed_at"),
            Task.impact.label("impact"),
            Task.domain_id.label("domain_id"),
            literal(False).label("is_instance"),
        ).where(
            Task.user_id == self.user_id,
            Task.status == "completed",
            Task.completed_at >= range_start,
            Task.completed_at < range_end,
        )

        # Instance completions (joined to get task metadata)
        instance_query = (
            select(
                TaskInstance.completed_at.label("completed_at"),
                Task.impact.label("impact"),
                Task.domain_id.label("domain_id"),
                literal(True).label("is_instance"),
            )
            .select_from(TaskInstance)
            .join(Task, TaskInstance.task_id == Task.id)
            .where(
                TaskInstance.user_id == self.user_id,
                TaskInstance.status == "completed",
                TaskInstance.completed_at >= range_start,
                TaskInstance.completed_at < range_end,
            )
        )

        # Combine with UNION ALL (single query)
        combined = union_all(task_query, instance_query)
        result = await self.db.execute(combined)

        completions = []
        for row in result:
            if row.completed_at:
                completions.append(
                    {
                        "completed_at": row.completed_at,
                        "impact": row.impact,
                        "domain_id": row.domain_id,
                        "is_instance": row.is_instance,
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

    def _aggregate_by_domain(self, completions: list[dict], domains_map: dict[int, Domain]) -> list[dict]:
        """Aggregate completions by domain (in-memory)."""
        domain_counts: dict[int | None, int] = defaultdict(int)
        for c in completions:
            domain_counts[c["domain_id"]] += 1

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

    def _aggregate_by_impact(self, completions: list[dict]) -> list[dict]:
        """Aggregate completions by impact level (in-memory)."""
        impact_counts = {1: 0, 2: 0, 3: 0, 4: 0}
        for c in completions:
            impact = c["impact"]
            if impact in impact_counts:
                impact_counts[impact] += 1

        return [
            {
                "impact": i,
                "label": IMPACT_LABELS[i],
                "count": impact_counts[i],
                "color": IMPACT_COLORS[i],
            }
            for i in [1, 2, 3, 4]
        ]

    async def _calculate_streaks(self) -> dict:
        """
        Calculate current and longest completion streaks.

        Uses UNION ALL to combine Task and Instance dates.
        """
        # Combined query for all completion dates
        task_dates = (
            select(cast(Task.completed_at, Date).label("d"))
            .where(
                Task.user_id == self.user_id,
                Task.status == "completed",
                Task.completed_at.isnot(None),
            )
            .distinct()
        )

        instance_dates = (
            select(cast(TaskInstance.completed_at, Date).label("d"))
            .where(
                TaskInstance.user_id == self.user_id,
                TaskInstance.status == "completed",
                TaskInstance.completed_at.isnot(None),
            )
            .distinct()
        )

        # UNION removes duplicates automatically
        combined = union_all(task_dates, instance_dates).subquery()
        query = select(combined.c.d).distinct()
        result = await self.db.execute(query)

        all_dates = set()
        for row in result:
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

    async def _get_daily_counts(self, start_date: date, end_date: date) -> dict[date, int]:
        """
        Get daily completion counts for a date range.

        Shared by heatmap and velocity calculations (single query).
        """
        range_start = datetime.combine(start_date, datetime.min.time())
        range_end = datetime.combine(end_date + timedelta(days=1), datetime.min.time())

        # Task daily counts
        task_daily = (
            select(
                cast(Task.completed_at, Date).label("d"),
                func.count().label("cnt"),
            )
            .where(
                Task.user_id == self.user_id,
                Task.status == "completed",
                Task.completed_at >= range_start,
                Task.completed_at < range_end,
            )
            .group_by(cast(Task.completed_at, Date))
        )

        # Instance daily counts
        instance_daily = (
            select(
                cast(TaskInstance.completed_at, Date).label("d"),
                func.count().label("cnt"),
            )
            .where(
                TaskInstance.user_id == self.user_id,
                TaskInstance.status == "completed",
                TaskInstance.completed_at >= range_start,
                TaskInstance.completed_at < range_end,
            )
            .group_by(cast(TaskInstance.completed_at, Date))
        )

        # Combine and sum
        combined = union_all(task_daily, instance_daily).subquery()
        query = select(combined.c.d, func.sum(combined.c.cnt).label("total")).group_by(combined.c.d)

        result = await self.db.execute(query)

        daily_counts: dict[date, int] = {}
        for row in result:
            if row.d:
                daily_counts[row.d] = int(row.total)

        return daily_counts

    def _build_heatmap(self, daily_counts: dict[date, int], start_date: date, end_date: date) -> list[dict]:
        """Build heatmap data from daily counts."""
        heatmap = []
        current = start_date
        while current <= end_date:
            heatmap.append(
                {
                    "x": current.isoformat(),
                    "y": daily_counts.get(current, 0),
                }
            )
            current += timedelta(days=1)
        return heatmap

    def _build_velocity(self, daily_counts: dict[date, int], today: date) -> list[dict]:
        """Build velocity data (7-day rolling average) from daily counts."""
        velocity = []
        for i in range(VELOCITY_DAYS):
            d = today - timedelta(days=VELOCITY_DAYS - 1 - i)
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

    async def _get_week_comparison(self) -> dict:
        """
        Compare this week vs last week.

        Uses single query with conditional aggregation.
        """
        today = date.today()
        this_week_start = today - timedelta(days=today.weekday())
        last_week_start = this_week_start - timedelta(days=7)
        days_into_week = today.weekday() + 1

        tw_start = datetime.combine(this_week_start, datetime.min.time())
        tw_end = datetime.combine(today + timedelta(days=1), datetime.min.time())
        lw_start = datetime.combine(last_week_start, datetime.min.time())
        lw_end = datetime.combine(last_week_start + timedelta(days=days_into_week), datetime.min.time())

        # Task completions for both weeks
        task_query = select(Task.completed_at).where(
            Task.user_id == self.user_id,
            Task.status == "completed",
            Task.completed_at >= lw_start,
            Task.completed_at < tw_end,
        )

        # Instance completions for both weeks
        instance_query = select(TaskInstance.completed_at).where(
            TaskInstance.user_id == self.user_id,
            TaskInstance.status == "completed",
            TaskInstance.completed_at >= lw_start,
            TaskInstance.completed_at < tw_end,
        )

        # Combine all completions
        combined = union_all(task_query, instance_query).subquery()

        # Count with conditional aggregation
        query = select(
            func.count()
            .filter(combined.c.completed_at >= tw_start, combined.c.completed_at < tw_end)
            .label("this_week"),
            func.count()
            .filter(combined.c.completed_at >= lw_start, combined.c.completed_at < lw_end)
            .label("last_week"),
        ).select_from(combined)

        result = await self.db.execute(query)
        row = result.one()

        this_week_count = row.this_week or 0
        last_week_count = row.last_week or 0

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

    async def _get_recurring_stats(self, range_start: datetime, range_end: datetime) -> list[dict]:
        """
        Get completion rates for recurring tasks.

        Optimized: Uses batch query instead of N+1 pattern.
        Shows ALL recurring tasks, even those without instances in the date range.
        """
        # Query 1: Get recurring tasks (limited for performance)
        recurring_query = (
            select(Task.id, Task.title)
            .where(
                Task.user_id == self.user_id,
                Task.is_recurring == True,
                Task.status != "archived",
            )
            .limit(RECURRING_STATS_LIMIT)
        )
        result = await self.db.execute(recurring_query)
        recurring_tasks = {row.id: row.title for row in result}

        if not recurring_tasks:
            return []

        task_ids = list(recurring_tasks.keys())

        # Query 2: Batch get stats for all tasks at once (eliminates N+1)
        stats_query = (
            select(
                TaskInstance.task_id,
                func.count().label("total"),
                func.count().filter(TaskInstance.status == "completed").label("completed"),
            )
            .where(
                TaskInstance.task_id.in_(task_ids),
                TaskInstance.instance_date >= range_start.date(),
                TaskInstance.instance_date <= range_end.date(),
            )
            .group_by(TaskInstance.task_id)
        )
        stats_result = await self.db.execute(stats_query)
        stats_map = {row.task_id: (row.completed, row.total) for row in stats_result}

        # Build results for all tasks
        stats = []
        for task_id, title in recurring_tasks.items():
            completed, total = stats_map.get(task_id, (0, 0))
            rate = round(completed / total * 100) if total > 0 else 0
            truncated_title = title[:TITLE_TRUNCATE_LENGTH] + ("..." if len(title) > TITLE_TRUNCATE_LENGTH else "")
            stats.append(
                {
                    "task_id": task_id,
                    "title": truncated_title,
                    "completed": completed,
                    "total": total,
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
            "same_day": 0,  # Completed same day as created
            "within_week": 0,  # 1-7 days
            "within_month": 0,  # 8-30 days
            "over_month": 0,  # 30+ days
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
        """
        Get most recent completed tasks.

        Uses UNION ALL for efficient combined query with domain join.
        """
        # Get domains map
        domains_map = await self._get_domains_map()

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

        # Combine and sort
        completions = []

        for task in tasks:
            domain = domains_map.get(task.domain_id) if task.domain_id else None
            completions.append(
                {
                    "id": task.id,
                    "task_id": task.id,
                    "title": task.title,
                    "completed_at": task.completed_at,  # Keep for sorting
                    "completed_at_display": task.completed_at.strftime("%b %d") if task.completed_at else "",
                    "domain_name": domain.name if domain else "Thoughts",
                    "domain_icon": domain.icon if domain else "💭",
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
                    "completed_at": instance.completed_at,  # Keep for sorting
                    "completed_at_display": instance.completed_at.strftime("%b %d") if instance.completed_at else "",
                    "domain_name": domain.name if domain else "Thoughts",
                    "domain_icon": domain.icon if domain else "💭",
                    "is_instance": True,
                }
            )

        # Sort by completed_at descending and limit
        completions.sort(key=lambda x: x["completed_at"] or datetime.min.replace(tzinfo=UTC), reverse=True)
        result = completions[:limit]

        # Remove datetime objects before returning (they can't be JSON serialized)
        for item in result:
            del item["completed_at"]

        return result
