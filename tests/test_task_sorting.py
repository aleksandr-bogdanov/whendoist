"""
Server-Side Task Sorting Tests.

Tests the Python sorting logic in app/services/task_sorting.py and
app/services/task_grouping.py that determines task order based on user preferences.

Test Category: Unit (async, uses in-memory SQLite)
Related Code: app/services/task_sorting.py, app/services/task_grouping.py

Coverage:
- Three-bucket grouping: active (by domain), scheduled (flat), completed (flat)
- Date-based sorting within scheduled/completed sections
- Task visibility filtering (retention window, show/hide toggles)

Note: These tests verify SERVER-SIDE sorting only. Client-side sorting
(column header clicks) is tested in test_js_module_contract.py and
e2e/test_task_sorting_e2e.py.

See tests/README.md for full test architecture.

v0.33.1: Updated for flattened scheduled/completed sections
"""

from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Domain, Task, User, UserPreferences
from app.services.task_grouping import build_native_task_item, group_tasks_by_domain
from app.services.task_sorting import (
    completed_task_sort_key,
    native_task_sort_key,
    scheduled_task_sort_key,
)

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
async def test_user(db_session: AsyncSession) -> User:
    """Create a test user."""
    user = User(email="test@example.com")
    db_session.add(user)
    await db_session.flush()
    return user


@pytest.fixture
async def test_domain(db_session: AsyncSession, test_user: User) -> Domain:
    """Create a test domain."""
    domain = Domain(user_id=test_user.id, name="Work")
    db_session.add(domain)
    await db_session.flush()
    return domain


@pytest.fixture
async def default_prefs(db_session: AsyncSession, test_user: User) -> UserPreferences:
    """Create default user preferences."""
    prefs = UserPreferences(user_id=test_user.id)
    db_session.add(prefs)
    await db_session.flush()
    return prefs


# =============================================================================
# Sort Key Function Tests
# =============================================================================


class TestNativeTaskSortKey:
    """Tests for native_task_sort_key function."""

    async def test_sorts_by_impact_first(self, db_session: AsyncSession, test_user: User, test_domain: Domain):
        """Tasks should sort by impact (P1 first)."""
        task_p1 = Task(user_id=test_user.id, domain_id=test_domain.id, title="P1 Task", impact=1, position=0)
        task_p4 = Task(user_id=test_user.id, domain_id=test_domain.id, title="P4 Task", impact=4, position=0)
        db_session.add_all([task_p1, task_p4])
        await db_session.flush()

        item_p1 = build_native_task_item(task_p1)
        item_p4 = build_native_task_item(task_p4)

        assert native_task_sort_key(item_p1) < native_task_sort_key(item_p4)

    async def test_sorts_by_position_within_impact(
        self, db_session: AsyncSession, test_user: User, test_domain: Domain
    ):
        """Tasks with same impact sort by position."""
        task1 = Task(user_id=test_user.id, domain_id=test_domain.id, title="First", impact=2, position=1)
        task2 = Task(user_id=test_user.id, domain_id=test_domain.id, title="Second", impact=2, position=5)
        db_session.add_all([task1, task2])
        await db_session.flush()

        item1 = build_native_task_item(task1)
        item2 = build_native_task_item(task2)

        assert native_task_sort_key(item1) < native_task_sort_key(item2)


class TestScheduledTaskSortKey:
    """Tests for scheduled_task_sort_key function."""

    async def test_sorts_by_date_first(self, db_session: AsyncSession, test_user: User, test_domain: Domain):
        """Scheduled tasks sort by date (soonest first)."""
        today = date.today()
        task_today = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Today",
            scheduled_date=today,
            impact=4,
        )
        task_tomorrow = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Tomorrow",
            scheduled_date=today + timedelta(days=1),
            impact=1,
        )
        db_session.add_all([task_today, task_tomorrow])
        await db_session.flush()

        item_today = build_native_task_item(task_today)
        item_tomorrow = build_native_task_item(task_tomorrow)

        # Even with lower priority (P4 vs P1), today's task comes first
        assert scheduled_task_sort_key(item_today) < scheduled_task_sort_key(item_tomorrow)

    async def test_sorts_by_impact_within_same_date(
        self, db_session: AsyncSession, test_user: User, test_domain: Domain
    ):
        """Tasks on same date sort by impact."""
        today = date.today()
        task_p1 = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="P1",
            scheduled_date=today,
            impact=1,
        )
        task_p4 = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="P4",
            scheduled_date=today,
            impact=4,
        )
        db_session.add_all([task_p1, task_p4])
        await db_session.flush()

        item_p1 = build_native_task_item(task_p1)
        item_p4 = build_native_task_item(task_p4)

        assert scheduled_task_sort_key(item_p1) < scheduled_task_sort_key(item_p4)


class TestCompletedTaskSortKey:
    """Tests for completed_task_sort_key function."""

    async def test_sorts_by_completion_date_descending(
        self, db_session: AsyncSession, test_user: User, test_domain: Domain
    ):
        """Completed tasks sort by completion date (most recent first)."""
        now = datetime.now(tz=UTC)
        task_recent = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Recent",
            status="completed",
            completed_at=now,
            impact=4,
        )
        task_older = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Older",
            status="completed",
            completed_at=now - timedelta(hours=2),
            impact=1,
        )
        db_session.add_all([task_recent, task_older])
        await db_session.flush()

        item_recent = build_native_task_item(task_recent)
        item_older = build_native_task_item(task_older)

        # Most recent first, regardless of impact
        assert completed_task_sort_key(item_recent) < completed_task_sort_key(item_older)

    async def test_tasks_without_completed_at_go_last(
        self, db_session: AsyncSession, test_user: User, test_domain: Domain
    ):
        """Tasks without completed_at timestamp go to the end."""
        now = datetime.now(tz=UTC)
        task_with_date = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="With Date",
            status="completed",
            completed_at=now,
        )
        task_without_date = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Without Date",
            status="completed",
            completed_at=None,
        )
        db_session.add_all([task_with_date, task_without_date])
        await db_session.flush()

        item_with = build_native_task_item(task_with_date)
        item_without = build_native_task_item(task_without_date)

        assert completed_task_sort_key(item_with) < completed_task_sort_key(item_without)


# =============================================================================
# Group Tasks By Domain Tests — Three-Bucket Structure
# =============================================================================


class TestGroupTasksByDomainBuckets:
    """Tests for the three-bucket return structure: domain_groups, scheduled_tasks, completed_tasks."""

    async def test_returns_dict_with_three_keys(self, db_session: AsyncSession, test_user: User, test_domain: Domain):
        """Return value is a dict with domain_groups, scheduled_tasks, completed_tasks."""
        task = Task(user_id=test_user.id, domain_id=test_domain.id, title="Active", impact=2)
        db_session.add(task)
        await db_session.flush()

        result = group_tasks_by_domain([task], [test_domain])

        assert "domain_groups" in result
        assert "scheduled_tasks" in result
        assert "completed_tasks" in result

    async def test_active_tasks_in_domain_groups(self, db_session: AsyncSession, test_user: User, test_domain: Domain):
        """Unscheduled pending tasks go into domain_groups."""
        task = Task(user_id=test_user.id, domain_id=test_domain.id, title="Active", impact=2)
        db_session.add(task)
        await db_session.flush()

        result = group_tasks_by_domain([task], [test_domain])

        assert len(result["domain_groups"]) == 1
        assert result["domain_groups"][0]["domain"] == test_domain
        titles = [t["task"].title for t in result["domain_groups"][0]["tasks"]]
        assert titles == ["Active"]
        assert result["scheduled_tasks"] == []
        assert result["completed_tasks"] == []

    async def test_scheduled_tasks_in_flat_list(self, db_session: AsyncSession, test_user: User, test_domain: Domain):
        """Scheduled pending tasks go into the flat scheduled_tasks list."""
        today = date.today()
        task = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Scheduled",
            scheduled_date=today,
            impact=1,
        )
        db_session.add(task)
        await db_session.flush()

        result = group_tasks_by_domain([task], [test_domain])

        assert len(result["domain_groups"]) == 0  # No active tasks
        titles = [t["task"].title for t in result["scheduled_tasks"]]
        assert titles == ["Scheduled"]
        assert result["completed_tasks"] == []

    async def test_completed_tasks_in_flat_list(self, db_session: AsyncSession, test_user: User, test_domain: Domain):
        """Completed tasks go into the flat completed_tasks list."""
        now = datetime.now(tz=UTC)
        task = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Done",
            status="completed",
            completed_at=now,
            impact=1,
        )
        db_session.add(task)
        await db_session.flush()

        result = group_tasks_by_domain([task], [test_domain])

        assert len(result["domain_groups"]) == 0
        assert result["scheduled_tasks"] == []
        titles = [t["task"].title for t in result["completed_tasks"]]
        assert titles == ["Done"]

    async def test_three_task_types_separated(self, db_session: AsyncSession, test_user: User, test_domain: Domain):
        """Active, scheduled, and completed tasks each go to their correct bucket."""
        today = date.today()
        now = datetime.now(tz=UTC)

        task_active = Task(user_id=test_user.id, domain_id=test_domain.id, title="Active", impact=2)
        task_scheduled = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Scheduled",
            scheduled_date=today,
            impact=1,
        )
        task_completed = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Completed",
            status="completed",
            completed_at=now,
            impact=1,
        )
        db_session.add_all([task_active, task_scheduled, task_completed])
        await db_session.flush()

        result = group_tasks_by_domain(
            [task_completed, task_scheduled, task_active],
            [test_domain],
        )

        active_titles = [t["task"].title for t in result["domain_groups"][0]["tasks"]]
        sched_titles = [t["task"].title for t in result["scheduled_tasks"]]
        done_titles = [t["task"].title for t in result["completed_tasks"]]
        assert active_titles == ["Active"]
        assert sched_titles == ["Scheduled"]
        assert done_titles == ["Completed"]

    async def test_scheduled_across_domains_sorted_by_date(self, db_session: AsyncSession, test_user: User):
        """Scheduled tasks from different domains are merged into one flat list sorted by date."""
        domain_a = Domain(user_id=test_user.id, name="Alpha")
        domain_b = Domain(user_id=test_user.id, name="Beta")
        db_session.add_all([domain_a, domain_b])
        await db_session.flush()

        today = date.today()
        task_b_today = Task(
            user_id=test_user.id,
            domain_id=domain_b.id,
            title="Beta Today",
            scheduled_date=today,
            impact=4,
        )
        task_a_tomorrow = Task(
            user_id=test_user.id,
            domain_id=domain_a.id,
            title="Alpha Tomorrow",
            scheduled_date=today + timedelta(days=1),
            impact=1,
        )
        db_session.add_all([task_a_tomorrow, task_b_today])
        await db_session.flush()

        result = group_tasks_by_domain(
            [task_a_tomorrow, task_b_today],
            [domain_a, domain_b],
        )

        sched_titles = [t["task"].title for t in result["scheduled_tasks"]]
        assert sched_titles == ["Beta Today", "Alpha Tomorrow"]

    async def test_completed_across_domains_sorted_by_date(self, db_session: AsyncSession, test_user: User):
        """Completed tasks from different domains are merged into one flat list sorted by completion date."""
        domain_a = Domain(user_id=test_user.id, name="Alpha")
        domain_b = Domain(user_id=test_user.id, name="Beta")
        db_session.add_all([domain_a, domain_b])
        await db_session.flush()

        now = datetime.now(tz=UTC)
        task_b_recent = Task(
            user_id=test_user.id,
            domain_id=domain_b.id,
            title="Beta Recent",
            status="completed",
            completed_at=now,
            impact=4,
        )
        task_a_older = Task(
            user_id=test_user.id,
            domain_id=domain_a.id,
            title="Alpha Older",
            status="completed",
            completed_at=now - timedelta(hours=2),
            impact=1,
        )
        db_session.add_all([task_a_older, task_b_recent])
        await db_session.flush()

        result = group_tasks_by_domain(
            [task_a_older, task_b_recent],
            [domain_a, domain_b],
        )

        done_titles = [t["task"].title for t in result["completed_tasks"]]
        assert done_titles == ["Beta Recent", "Alpha Older"]


class TestGroupTasksByDomainDateSorting:
    """Tests for date-based sorting within scheduled/completed sections."""

    async def test_scheduled_sorted_by_date(self, db_session: AsyncSession, test_user: User, test_domain: Domain):
        """Scheduled tasks always sort by date (soonest first)."""
        today = date.today()

        task_tomorrow = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Tomorrow P1",
            scheduled_date=today + timedelta(days=1),
            impact=1,
            position=0,
        )
        task_today = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Today P4",
            scheduled_date=today,
            impact=4,
            position=0,
        )
        db_session.add_all([task_tomorrow, task_today])
        await db_session.flush()

        result = group_tasks_by_domain(
            [task_tomorrow, task_today],
            [test_domain],
        )

        titles = [t["task"].title for t in result["scheduled_tasks"]]
        assert titles == ["Today P4", "Tomorrow P1"]

    async def test_completed_sorted_by_completion_date(
        self, db_session: AsyncSession, test_user: User, test_domain: Domain
    ):
        """Completed tasks always sort by completion date (most recent first)."""
        now = datetime.now(tz=UTC)

        task_older = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Older P1",
            status="completed",
            completed_at=now - timedelta(hours=2),
            impact=1,
            position=0,
        )
        task_recent = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Recent P4",
            status="completed",
            completed_at=now,
            impact=4,
            position=0,
        )
        db_session.add_all([task_older, task_recent])
        await db_session.flush()

        result = group_tasks_by_domain(
            [task_older, task_recent],
            [test_domain],
        )

        titles = [t["task"].title for t in result["completed_tasks"]]
        assert titles == ["Recent P4", "Older P1"]

    async def test_active_tasks_sorted_by_impact(self, db_session: AsyncSession, test_user: User, test_domain: Domain):
        """Active (unscheduled, pending) tasks sort by impact within their domain."""
        task_p3 = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="P3",
            impact=3,
            position=0,
        )
        task_p1 = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="P1",
            impact=1,
            position=0,
        )
        db_session.add_all([task_p3, task_p1])
        await db_session.flush()

        result = group_tasks_by_domain(
            [task_p3, task_p1],
            [test_domain],
        )

        titles = [t["task"].title for t in result["domain_groups"][0]["tasks"]]
        assert titles == ["P1", "P3"]


class TestGroupTasksByDomainVisibility:
    """Tests for task visibility based on preferences."""

    async def test_hide_scheduled_when_show_scheduled_false(
        self, db_session: AsyncSession, test_user: User, test_domain: Domain
    ):
        """Scheduled pending tasks are hidden when show_scheduled_in_list=False."""
        today = date.today()

        task_unscheduled = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Unscheduled",
            impact=2,
        )
        task_scheduled = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Scheduled",
            scheduled_date=today,
            impact=1,
        )
        db_session.add_all([task_unscheduled, task_scheduled])
        await db_session.flush()

        prefs = UserPreferences(
            user_id=test_user.id,
            show_scheduled_in_list=False,
        )
        db_session.add(prefs)
        await db_session.flush()

        result = group_tasks_by_domain(
            [task_unscheduled, task_scheduled],
            [test_domain],
            user_prefs=prefs,
        )

        active_titles = [t["task"].title for t in result["domain_groups"][0]["tasks"]]
        assert active_titles == ["Unscheduled"]
        assert result["scheduled_tasks"] == []

    async def test_hide_completed_when_show_completed_false(
        self, db_session: AsyncSession, test_user: User, test_domain: Domain
    ):
        """Completed tasks are hidden when show_completed_in_list=False."""
        now = datetime.now(tz=UTC)

        task_pending = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Pending",
            impact=2,
        )
        task_completed = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Completed",
            status="completed",
            completed_at=now,
            impact=1,
        )
        db_session.add_all([task_pending, task_completed])
        await db_session.flush()

        prefs = UserPreferences(
            user_id=test_user.id,
            show_completed_in_list=False,
        )
        db_session.add(prefs)
        await db_session.flush()

        result = group_tasks_by_domain(
            [task_pending, task_completed],
            [test_domain],
            user_prefs=prefs,
        )

        active_titles = [t["task"].title for t in result["domain_groups"][0]["tasks"]]
        assert active_titles == ["Pending"]
        assert result["completed_tasks"] == []

    async def test_retention_window_filters_old_completed(
        self, db_session: AsyncSession, test_user: User, test_domain: Domain
    ):
        """Completed tasks outside retention window are hidden."""
        now = datetime.now(tz=UTC)

        task_recent = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Recent",
            status="completed",
            completed_at=now - timedelta(hours=1),
            impact=1,
        )
        task_old = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Old",
            status="completed",
            completed_at=now - timedelta(days=5),  # Outside 3-day retention
            impact=1,
        )
        db_session.add_all([task_recent, task_old])
        await db_session.flush()

        prefs = UserPreferences(
            user_id=test_user.id,
            completed_retention_days=3,
        )
        db_session.add(prefs)
        await db_session.flush()

        result = group_tasks_by_domain(
            [task_recent, task_old],
            [test_domain],
            user_prefs=prefs,
        )

        titles = [t["task"].title for t in result["completed_tasks"]]
        assert titles == ["Recent"]


class TestGroupTasksByDomainComplexScenarios:
    """Tests for complex sorting scenarios."""

    async def test_full_scenario_all_task_types(self, db_session: AsyncSession, test_user: User, test_domain: Domain):
        """
        Full scenario: active sorted by impact, scheduled by date, completed by date.
        """
        today = date.today()
        now = datetime.now(tz=UTC)

        tasks = [
            # Active (unscheduled pending)
            Task(
                user_id=test_user.id,
                domain_id=test_domain.id,
                title="Unscheduled P2",
                impact=2,
                position=0,
            ),
            Task(
                user_id=test_user.id,
                domain_id=test_domain.id,
                title="Unscheduled P1",
                impact=1,
                position=0,
            ),
            # Scheduled
            Task(
                user_id=test_user.id,
                domain_id=test_domain.id,
                title="Scheduled Tomorrow",
                scheduled_date=today + timedelta(days=1),
                impact=1,
                position=0,
            ),
            Task(
                user_id=test_user.id,
                domain_id=test_domain.id,
                title="Scheduled Today",
                scheduled_date=today,
                impact=4,
                position=0,
            ),
            # Completed
            Task(
                user_id=test_user.id,
                domain_id=test_domain.id,
                title="Completed Old",
                status="completed",
                completed_at=now - timedelta(hours=1),
                impact=1,
                position=0,
            ),
            Task(
                user_id=test_user.id,
                domain_id=test_domain.id,
                title="Completed Recent",
                status="completed",
                completed_at=now,
                impact=4,
                position=0,
            ),
        ]
        db_session.add_all(tasks)
        await db_session.flush()

        result = group_tasks_by_domain(tasks, [test_domain])

        active_titles = [t["task"].title for t in result["domain_groups"][0]["tasks"]]
        sched_titles = [t["task"].title for t in result["scheduled_tasks"]]
        done_titles = [t["task"].title for t in result["completed_tasks"]]

        assert active_titles == ["Unscheduled P1", "Unscheduled P2"]
        assert sched_titles == ["Scheduled Today", "Scheduled Tomorrow"]
        assert done_titles == ["Completed Recent", "Completed Old"]

    async def test_empty_buckets_when_all_completed(
        self, db_session: AsyncSession, test_user: User, test_domain: Domain
    ):
        """When all tasks are completed, domain_groups and scheduled_tasks are empty."""
        now = datetime.now(tz=UTC)
        tasks = [
            Task(
                user_id=test_user.id,
                domain_id=test_domain.id,
                title="Done 1",
                status="completed",
                completed_at=now,
                impact=1,
            ),
            Task(
                user_id=test_user.id,
                domain_id=test_domain.id,
                title="Done 2",
                status="completed",
                completed_at=now - timedelta(hours=1),
                impact=2,
            ),
        ]
        db_session.add_all(tasks)
        await db_session.flush()

        result = group_tasks_by_domain(tasks, [test_domain])

        assert result["domain_groups"] == []
        assert result["scheduled_tasks"] == []
        assert len(result["completed_tasks"]) == 2
