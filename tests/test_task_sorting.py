"""
Server-Side Task Sorting Tests.

Tests the Python sorting logic in app/routers/pages.py that determines
task order based on user preferences.

Test Category: Unit (async, uses in-memory SQLite)
Related Code: app/routers/pages.py (group_tasks_by_domain, sort key functions)

Coverage:
- All 4 preference combinations for section ordering:
  - completed_move_to_bottom (True/False)
  - scheduled_move_to_bottom (True/False)
- Date-based sorting within sections:
  - completed_sort_by_date (True/False)
  - scheduled_sort_by_date (True/False)
- Task visibility filtering (retention window, show/hide toggles)

Note: These tests verify SERVER-SIDE sorting only. Client-side sorting
(column header clicks) is tested in test_js_module_contract.py and
e2e/test_task_sorting_e2e.py.

See tests/README.md for full test architecture.
"""

from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Domain, Task, User, UserPreferences
from app.routers.pages import (
    build_native_task_item,
    completed_task_sort_key,
    group_tasks_by_domain,
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
# Group Tasks By Domain Tests
# =============================================================================


class TestGroupTasksByDomainSections:
    """Tests for task grouping into sections based on preferences."""

    async def test_completed_and_scheduled_both_at_bottom(
        self, db_session: AsyncSession, test_user: User, test_domain: Domain
    ):
        """
        With completed_move_to_bottom=True and scheduled_move_to_bottom=True:
        Order should be: unscheduled -> scheduled -> completed
        """
        today = date.today()
        now = datetime.now(tz=UTC)

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
        task_completed = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Completed",
            status="completed",
            completed_at=now,
            impact=1,
        )
        db_session.add_all([task_unscheduled, task_scheduled, task_completed])
        await db_session.flush()

        prefs = UserPreferences(
            user_id=test_user.id,
            completed_move_to_bottom=True,
            scheduled_move_to_bottom=True,
        )
        db_session.add(prefs)
        await db_session.flush()

        result = group_tasks_by_domain(
            [task_completed, task_scheduled, task_unscheduled],  # Random order
            [test_domain],
            user_prefs=prefs,
        )

        titles = [t["task"].title for t in result[0]["tasks"]]
        assert titles == ["Unscheduled", "Scheduled", "Completed"]

    async def test_only_completed_at_bottom(self, db_session: AsyncSession, test_user: User, test_domain: Domain):
        """
        With completed_move_to_bottom=True and scheduled_move_to_bottom=False:
        Order should be: (unscheduled + scheduled interleaved by impact) -> completed
        """
        today = date.today()
        now = datetime.now(tz=UTC)

        task_unscheduled_p2 = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Unscheduled P2",
            impact=2,
            position=0,
        )
        task_scheduled_p1 = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Scheduled P1",
            scheduled_date=today,
            impact=1,
            position=0,
        )
        task_completed = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Completed",
            status="completed",
            completed_at=now,
            impact=1,
        )
        db_session.add_all([task_unscheduled_p2, task_scheduled_p1, task_completed])
        await db_session.flush()

        prefs = UserPreferences(
            user_id=test_user.id,
            completed_move_to_bottom=True,
            scheduled_move_to_bottom=False,
        )
        db_session.add(prefs)
        await db_session.flush()

        result = group_tasks_by_domain(
            [task_completed, task_unscheduled_p2, task_scheduled_p1],
            [test_domain],
            user_prefs=prefs,
        )

        titles = [t["task"].title for t in result[0]["tasks"]]
        # P1 should come before P2, completed last
        assert titles == ["Scheduled P1", "Unscheduled P2", "Completed"]

    async def test_only_scheduled_at_bottom(self, db_session: AsyncSession, test_user: User, test_domain: Domain):
        """
        With completed_move_to_bottom=False and scheduled_move_to_bottom=True:
        Order should be: (unscheduled + completed_unscheduled) -> (scheduled + completed_scheduled)
        """
        today = date.today()
        now = datetime.now(tz=UTC)

        task_unscheduled = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Unscheduled",
            impact=2,
            position=0,
        )
        task_completed_unscheduled = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Completed Unscheduled",
            status="completed",
            completed_at=now,
            impact=1,
            position=0,
        )
        task_scheduled = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Scheduled",
            scheduled_date=today,
            impact=1,
            position=0,
        )
        db_session.add_all([task_unscheduled, task_completed_unscheduled, task_scheduled])
        await db_session.flush()

        prefs = UserPreferences(
            user_id=test_user.id,
            completed_move_to_bottom=False,
            scheduled_move_to_bottom=True,
        )
        db_session.add(prefs)
        await db_session.flush()

        result = group_tasks_by_domain(
            [task_scheduled, task_unscheduled, task_completed_unscheduled],
            [test_domain],
            user_prefs=prefs,
        )

        titles = [t["task"].title for t in result[0]["tasks"]]
        # Completed unscheduled (P1) first, unscheduled (P2) second, scheduled last
        assert titles == ["Completed Unscheduled", "Unscheduled", "Scheduled"]

    async def test_neither_at_bottom(self, db_session: AsyncSession, test_user: User, test_domain: Domain):
        """
        With completed_move_to_bottom=False and scheduled_move_to_bottom=False:
        All tasks interleaved by impact.
        """
        today = date.today()
        now = datetime.now(tz=UTC)

        task_p3 = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Unscheduled P3",
            impact=3,
            position=0,
        )
        task_scheduled_p1 = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Scheduled P1",
            scheduled_date=today,
            impact=1,
            position=0,
        )
        task_completed_p2 = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Completed P2",
            status="completed",
            completed_at=now,
            impact=2,
            position=0,
        )
        db_session.add_all([task_p3, task_scheduled_p1, task_completed_p2])
        await db_session.flush()

        prefs = UserPreferences(
            user_id=test_user.id,
            completed_move_to_bottom=False,
            scheduled_move_to_bottom=False,
        )
        db_session.add(prefs)
        await db_session.flush()

        result = group_tasks_by_domain(
            [task_p3, task_completed_p2, task_scheduled_p1],
            [test_domain],
            user_prefs=prefs,
        )

        titles = [t["task"].title for t in result[0]["tasks"]]
        # All sorted by impact: P1, P2, P3
        assert titles == ["Scheduled P1", "Completed P2", "Unscheduled P3"]


class TestGroupTasksByDomainDateSorting:
    """Tests for date-based sorting within sections."""

    async def test_scheduled_sort_by_date_when_enabled(
        self, db_session: AsyncSession, test_user: User, test_domain: Domain
    ):
        """Scheduled tasks sort by date when scheduled_sort_by_date=True."""
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

        prefs = UserPreferences(
            user_id=test_user.id,
            scheduled_move_to_bottom=True,
            scheduled_sort_by_date=True,
        )
        db_session.add(prefs)
        await db_session.flush()

        result = group_tasks_by_domain(
            [task_tomorrow, task_today],
            [test_domain],
            user_prefs=prefs,
        )

        titles = [t["task"].title for t in result[0]["tasks"]]
        # Today (soonest) comes first even with lower priority
        assert titles == ["Today P4", "Tomorrow P1"]

    async def test_scheduled_sort_by_impact_when_disabled(
        self, db_session: AsyncSession, test_user: User, test_domain: Domain
    ):
        """Scheduled tasks sort by impact when scheduled_sort_by_date=False."""
        today = date.today()

        task_tomorrow_p1 = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Tomorrow P1",
            scheduled_date=today + timedelta(days=1),
            impact=1,
            position=0,
        )
        task_today_p4 = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Today P4",
            scheduled_date=today,
            impact=4,
            position=0,
        )
        db_session.add_all([task_tomorrow_p1, task_today_p4])
        await db_session.flush()

        prefs = UserPreferences(
            user_id=test_user.id,
            scheduled_move_to_bottom=True,
            scheduled_sort_by_date=False,
        )
        db_session.add(prefs)
        await db_session.flush()

        result = group_tasks_by_domain(
            [task_today_p4, task_tomorrow_p1],
            [test_domain],
            user_prefs=prefs,
        )

        titles = [t["task"].title for t in result[0]["tasks"]]
        # P1 comes first regardless of date
        assert titles == ["Tomorrow P1", "Today P4"]

    async def test_completed_sort_by_date_when_enabled(
        self, db_session: AsyncSession, test_user: User, test_domain: Domain
    ):
        """Completed tasks sort by completion date when completed_sort_by_date=True."""
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

        prefs = UserPreferences(
            user_id=test_user.id,
            completed_move_to_bottom=True,
            completed_sort_by_date=True,
        )
        db_session.add(prefs)
        await db_session.flush()

        result = group_tasks_by_domain(
            [task_older, task_recent],
            [test_domain],
            user_prefs=prefs,
        )

        titles = [t["task"].title for t in result[0]["tasks"]]
        # Most recent first
        assert titles == ["Recent P4", "Older P1"]

    async def test_completed_sort_by_impact_when_disabled(
        self, db_session: AsyncSession, test_user: User, test_domain: Domain
    ):
        """Completed tasks sort by impact when completed_sort_by_date=False."""
        now = datetime.now(tz=UTC)

        task_recent_p4 = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Recent P4",
            status="completed",
            completed_at=now,
            impact=4,
            position=0,
        )
        task_older_p1 = Task(
            user_id=test_user.id,
            domain_id=test_domain.id,
            title="Older P1",
            status="completed",
            completed_at=now - timedelta(hours=2),
            impact=1,
            position=0,
        )
        db_session.add_all([task_recent_p4, task_older_p1])
        await db_session.flush()

        prefs = UserPreferences(
            user_id=test_user.id,
            completed_move_to_bottom=True,
            completed_sort_by_date=False,
        )
        db_session.add(prefs)
        await db_session.flush()

        result = group_tasks_by_domain(
            [task_recent_p4, task_older_p1],
            [test_domain],
            user_prefs=prefs,
        )

        titles = [t["task"].title for t in result[0]["tasks"]]
        # P1 comes first regardless of completion time
        assert titles == ["Older P1", "Recent P4"]


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

        titles = [t["task"].title for t in result[0]["tasks"]]
        # Only unscheduled task should be visible
        assert titles == ["Unscheduled"]

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

        titles = [t["task"].title for t in result[0]["tasks"]]
        # Only pending task should be visible
        assert titles == ["Pending"]

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

        titles = [t["task"].title for t in result[0]["tasks"]]
        # Only recent task should be visible
        assert titles == ["Recent"]


class TestGroupTasksByDomainComplexScenarios:
    """Tests for complex sorting scenarios with multiple preferences."""

    async def test_full_scenario_all_enabled(self, db_session: AsyncSession, test_user: User, test_domain: Domain):
        """
        Full scenario with all bottom-grouping enabled:
        - Unscheduled: P1, P2, P3
        - Scheduled: sorted by date (soonest first)
        - Completed: sorted by completion date (most recent first)
        """
        today = date.today()
        now = datetime.now(tz=UTC)

        tasks = [
            # Unscheduled
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

        prefs = UserPreferences(
            user_id=test_user.id,
            completed_move_to_bottom=True,
            completed_sort_by_date=True,
            scheduled_move_to_bottom=True,
            scheduled_sort_by_date=True,
        )
        db_session.add(prefs)
        await db_session.flush()

        result = group_tasks_by_domain(
            tasks,
            [test_domain],
            user_prefs=prefs,
        )

        titles = [t["task"].title for t in result[0]["tasks"]]
        expected = [
            "Unscheduled P1",
            "Unscheduled P2",
            "Scheduled Today",  # Soonest date
            "Scheduled Tomorrow",
            "Completed Recent",  # Most recent completion
            "Completed Old",
        ]
        assert titles == expected

    async def test_full_scenario_all_disabled(self, db_session: AsyncSession, test_user: User, test_domain: Domain):
        """
        Full scenario with all bottom-grouping disabled:
        All tasks interleaved by impact.
        """
        today = date.today()
        now = datetime.now(tz=UTC)

        tasks = [
            Task(
                user_id=test_user.id,
                domain_id=test_domain.id,
                title="Unscheduled P3",
                impact=3,
                position=0,
            ),
            Task(
                user_id=test_user.id,
                domain_id=test_domain.id,
                title="Scheduled P1",
                scheduled_date=today,
                impact=1,
                position=0,
            ),
            Task(
                user_id=test_user.id,
                domain_id=test_domain.id,
                title="Completed P2",
                status="completed",
                completed_at=now,
                impact=2,
                position=0,
            ),
        ]
        db_session.add_all(tasks)
        await db_session.flush()

        prefs = UserPreferences(
            user_id=test_user.id,
            completed_move_to_bottom=False,
            completed_sort_by_date=False,
            scheduled_move_to_bottom=False,
            scheduled_sort_by_date=False,
        )
        db_session.add(prefs)
        await db_session.flush()

        result = group_tasks_by_domain(
            tasks,
            [test_domain],
            user_prefs=prefs,
        )

        titles = [t["task"].title for t in result[0]["tasks"]]
        # All by impact: P1, P2, P3
        expected = ["Scheduled P1", "Completed P2", "Unscheduled P3"]
        assert titles == expected
