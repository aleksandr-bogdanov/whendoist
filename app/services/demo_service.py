"""
Demo login service for testing and PR preview deployments.

Creates and manages demo user accounts that bypass Google OAuth.
Each demo session gets a unique user with email demo-{profile}-{uuid}@whendoist.local.

Gated by DEMO_LOGIN_ENABLED env var (default: false).
"""

import logging
import random
import uuid
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import DEMO_EMAIL_SUFFIX, DEMO_VALID_PROFILES, get_user_today
from app.models import (
    Domain,
    ExportSnapshot,
    GoogleCalendarEventSync,
    GoogleCalendarSelection,
    GoogleToken,
    Task,
    TaskInstance,
    TodoistToken,
    User,
    UserPasskey,
    UserPreferences,
    WebAuthnChallenge,
)
from app.services.task_service import TaskService

logger = logging.getLogger("whendoist.demo")


class DemoService:
    """Service for managing demo user accounts and their seed data."""

    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def is_demo_user(email: str) -> bool:
        """Check if an email belongs to a demo user."""
        return email.endswith(DEMO_EMAIL_SUFFIX)

    @staticmethod
    def extract_profile(email: str) -> str | None:
        """Extract profile name from a demo email.

        Handles both formats:
        - demo-{profile}-{uuid}@whendoist.local (new multi-tenant)
        - demo-{profile}@whendoist.local (legacy)
        """
        if not email.endswith(DEMO_EMAIL_SUFFIX):
            return None
        local = email[: -len(DEMO_EMAIL_SUFFIX)]  # e.g. "demo-demo-abc123" or "demo-demo"
        parts = local.split("-", 2)  # ['demo', 'demo', 'abc123'] or ['demo', 'demo']
        if len(parts) >= 2 and parts[0] == "demo" and parts[1] in DEMO_VALID_PROFILES:
            return parts[1]
        return None

    async def get_or_create_demo_user(self, profile: str) -> User:
        """Create a new unique demo user for the given profile.

        Each call creates a fresh user with isolated data.
        Cleans up stale demo users before creating the new one.
        """
        if profile not in DEMO_VALID_PROFILES:
            raise ValueError(f"Invalid demo profile: {profile}")

        # Clean up stale demo users lazily
        from app.config import get_settings

        settings = get_settings()
        await self.cleanup_stale_users(settings.demo_cleanup_max_age_hours)

        # Generate unique email
        short_id = uuid.uuid4().hex[:8]
        email = f"demo-{profile}-{short_id}{DEMO_EMAIL_SUFFIX}"

        display_names = {
            "demo": "Demo User",
            "encrypted": "Encryption Test",
            "blank": "Blank Slate",
        }
        user = User(
            email=email,
            name=display_names.get(profile, "Demo User"),
            wizard_completed=False,
        )
        self.db.add(user)
        await self.db.flush()

        # Seed data for the "demo" profile
        if profile == "demo":
            await self._seed_demo_data(user.id)

        await self.db.commit()
        await self.db.refresh(user)
        logger.info(f"Created demo user: {email} (id={user.id})")
        return user

    async def reset_demo_user(self, user_id: int) -> None:
        """Clear all data for a demo user and re-seed if applicable.

        Only operates on demo users (verified by email). No-op for real users.
        """
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user or not self.is_demo_user(user.email):
            return

        await self._clear_user_data(user_id)

        # Reset wizard so demo always starts with onboarding
        user.wizard_completed = False
        user.wizard_completed_at = None

        # Determine profile from email
        profile = self.extract_profile(user.email)
        if profile == "demo":
            await self._seed_demo_data(user_id)

        await self.db.commit()
        logger.info(f"Reset demo user: {user.email} (id={user_id})")

    async def cleanup_stale_users(self, max_age_hours: int = 24) -> int:
        """Delete demo users (and all their data) older than max_age_hours.

        Returns the number of users deleted.
        """
        cutoff = datetime.now(UTC) - timedelta(hours=max_age_hours)

        result = await self.db.execute(
            select(User).where(
                User.email.startswith("demo-"),
                User.created_at < cutoff,
            )
        )
        stale_users = list(result.scalars().all())

        # Just delete User rows — all child tables have ondelete=CASCADE
        for user in stale_users:
            await self.db.delete(user)

        if stale_users:
            await self.db.flush()
            logger.info(f"Cleaned up {len(stale_users)} stale demo users")

        return len(stale_users)

    async def _clear_user_data(self, user_id: int) -> None:
        """Delete all user-generated data, keeping the User row.

        Only used by reset_demo_user (cleanup_stale_users relies on CASCADE instead).
        If you add a new table with user_id FK, add a DELETE here too.
        """
        # Order matters: delete children before parents
        await self.db.execute(delete(ExportSnapshot).where(ExportSnapshot.user_id == user_id))
        await self.db.execute(delete(GoogleCalendarEventSync).where(GoogleCalendarEventSync.user_id == user_id))
        await self.db.execute(delete(TaskInstance).where(TaskInstance.user_id == user_id))
        await self.db.execute(delete(Task).where(Task.user_id == user_id))
        await self.db.execute(delete(Domain).where(Domain.user_id == user_id))
        await self.db.execute(delete(UserPreferences).where(UserPreferences.user_id == user_id))
        await self.db.execute(delete(GoogleCalendarSelection).where(GoogleCalendarSelection.user_id == user_id))
        await self.db.execute(delete(GoogleToken).where(GoogleToken.user_id == user_id))
        await self.db.execute(delete(TodoistToken).where(TodoistToken.user_id == user_id))
        await self.db.execute(delete(WebAuthnChallenge).where(WebAuthnChallenge.user_id == user_id))
        await self.db.execute(delete(UserPasskey).where(UserPasskey.user_id == user_id))

    async def _seed_demo_data(self, user_id: int) -> None:
        """Create sample domains, tasks, recurring instances, and completed history."""
        # Deterministic randomness: same user_id always produces same data
        random.seed(user_id)

        task_service = TaskService(self.db, user_id)
        today = get_user_today(None)  # UTC-based for demo

        # --- Domains ---
        domains = await self._seed_domains(task_service)

        # --- Active tasks (via TaskService for proper position handling) ---
        await self._seed_active_tasks(task_service, domains, today)

        # --- Overdue tasks ---
        await self._seed_overdue_tasks(task_service, domains, today)

        # --- Recurring tasks with historical instances ---
        await self._seed_recurring_with_instances(task_service, domains, today, user_id)

        # --- Completed tasks (direct insertion for custom timestamps) ---
        await self._seed_completed_tasks(domains, today, user_id)

        # --- Archived tasks ---
        await self._seed_archived_tasks(domains, today, user_id)

        # --- Thoughts (no domain) ---
        await self._seed_thoughts(task_service)

    async def _seed_domains(self, task_service: TaskService) -> dict[str, Domain]:
        """Create the 5 demo domains. Returns mapping of name -> Domain."""
        work = await task_service.create_domain(name="Work", color="#3b82f6", icon="💼")
        health = await task_service.create_domain(name="Health & Fitness", color="#22c55e", icon="💪")
        personal = await task_service.create_domain(name="Personal", color="#f59e0b", icon="🏠")
        side_project = await task_service.create_domain(name="Side Project", color="#a855f7", icon="🚀")
        learning = await task_service.create_domain(name="Learning", color="#06b6d4", icon="📚")
        return {
            "work": work,
            "health": health,
            "personal": personal,
            "side_project": side_project,
            "learning": learning,
        }

    async def _seed_active_tasks(
        self,
        task_service: TaskService,
        domains: dict[str, Domain],
        today: date,
    ) -> None:
        """Create active tasks: some scheduled (calendar), some unscheduled (domain backlog)."""
        w = domains["work"]
        h = domains["health"]
        p = domains["personal"]
        s = domains["side_project"]
        l = domains["learning"]  # noqa: E741

        # === TODAY: 5 time-slotted + 2 date-only ===
        prd_task = await task_service.create_task(
            title="Write PRD for search feature",
            description="Define user stories, wireframes, and success metrics for the new search feature.",
            domain_id=w.id,
            impact=1,
            clarity="brainstorm",
            scheduled_date=today,
            scheduled_time=time(10, 0),
            duration_minutes=90,
        )
        # Subtasks for PRD
        await task_service.create_task(
            title="Define user stories and acceptance criteria",
            parent_id=prd_task.id,
            impact=2,
            clarity="brainstorm",
        )
        await task_service.create_task(
            title="Create wireframe sketches",
            parent_id=prd_task.id,
            impact=2,
            clarity="brainstorm",
        )
        await task_service.create_task(
            title="Write success metrics and KPIs",
            parent_id=prd_task.id,
            impact=2,
            clarity="normal",
        )

        await task_service.create_task(
            title="Review design mockups from Figma",
            domain_id=w.id,
            impact=2,
            clarity="normal",
            scheduled_date=today,
            scheduled_time=time(11, 30),
            duration_minutes=30,
        )
        await task_service.create_task(
            title="Lunch with Sarah",
            domain_id=p.id,
            impact=3,
            clarity="normal",
            scheduled_date=today,
            scheduled_time=time(13, 0),
            duration_minutes=60,
        )
        investor_task = await task_service.create_task(
            title="Prepare Q4 investor update",
            description="Pull metrics, draft narrative slides, and prepare talking points.",
            domain_id=w.id,
            impact=1,
            clarity="brainstorm",
            scheduled_date=today,
            scheduled_time=time(14, 30),
            duration_minutes=60,
        )
        # Subtasks for investor update
        await task_service.create_task(
            title="Pull Q4 revenue and growth metrics",
            parent_id=investor_task.id,
            impact=1,
            clarity="normal",
        )
        await task_service.create_task(
            title="Draft narrative slides",
            parent_id=investor_task.id,
            impact=1,
            clarity="brainstorm",
        )

        await task_service.create_task(
            title="Grocery run — farmers market",
            domain_id=p.id,
            impact=2,
            clarity="autopilot",
            scheduled_date=today,
            scheduled_time=time(17, 0),
            duration_minutes=45,
        )
        # Date-only today
        await task_service.create_task(
            title="Pay rent",
            domain_id=p.id,
            impact=1,
            clarity="autopilot",
            scheduled_date=today,
            duration_minutes=5,
        )
        await task_service.create_task(
            title="Submit expense report",
            domain_id=w.id,
            impact=3,
            clarity="autopilot",
            scheduled_date=today,
            duration_minutes=15,
        )

        # === TOMORROW: 4 time-slotted ===
        tomorrow = today + timedelta(days=1)
        await task_service.create_task(
            title="Prep user interview questions",
            description="Focus on onboarding friction and feature discovery patterns.",
            domain_id=w.id,
            impact=2,
            clarity="brainstorm",
            scheduled_date=tomorrow,
            scheduled_time=time(10, 30),
            duration_minutes=45,
        )
        await task_service.create_task(
            title="Coffee with Marcus re: partnership",
            domain_id=w.id,
            impact=2,
            clarity="normal",
            scheduled_date=tomorrow,
            scheduled_time=time(13, 0),
            duration_minutes=45,
        )
        await task_service.create_task(
            title="Write blog post draft",
            domain_id=s.id,
            impact=2,
            clarity="brainstorm",
            scheduled_date=tomorrow,
            scheduled_time=time(16, 0),
            duration_minutes=90,
        )
        await task_service.create_task(
            title="Run — 5K tempo",
            domain_id=h.id,
            impact=2,
            clarity="normal",
            scheduled_date=tomorrow,
            scheduled_time=time(18, 0),
            duration_minutes=40,
        )

        # === DAY +2: 3 tasks ===
        day2 = today + timedelta(days=2)
        await task_service.create_task(
            title="Sprint planning prep",
            description="Review backlog, estimate stories, prepare discussion points.",
            domain_id=w.id,
            impact=2,
            clarity="brainstorm",
            scheduled_date=day2,
            scheduled_time=time(9, 0),
            duration_minutes=60,
        )
        await task_service.create_task(
            title="Dentist appointment",
            domain_id=p.id,
            impact=2,
            clarity="autopilot",
            scheduled_date=day2,
            scheduled_time=time(14, 0),
            duration_minutes=60,
        )
        await task_service.create_task(
            title="Deploy side project to staging",
            domain_id=s.id,
            impact=2,
            clarity="normal",
            scheduled_date=day2,
            scheduled_time=time(19, 0),
            duration_minutes=45,
        )

        # === DAY +3: 2 tasks ===
        day3 = today + timedelta(days=3)
        await task_service.create_task(
            title="Team workshop — retro and goals",
            domain_id=w.id,
            impact=1,
            clarity="brainstorm",
            scheduled_date=day3,
            scheduled_time=time(10, 0),
            duration_minutes=90,
        )
        await task_service.create_task(
            title="Outline conference talk",
            domain_id=l.id,
            impact=2,
            clarity="brainstorm",
            scheduled_date=day3,
            scheduled_time=time(20, 0),
            duration_minutes=60,
        )

        # === DAY +4: 1 task ===
        day4 = today + timedelta(days=4)
        await task_service.create_task(
            title="Book flight for conference",
            domain_id=w.id,
            impact=2,
            clarity="autopilot",
            scheduled_date=day4,
            duration_minutes=20,
        )

        # === DAY +5: 1 task ===
        day5 = today + timedelta(days=5)
        await task_service.create_task(
            title="Quarterly OKR review",
            domain_id=w.id,
            impact=1,
            clarity="brainstorm",
            scheduled_date=day5,
            scheduled_time=time(10, 0),
            duration_minutes=60,
        )

        # === UNSCHEDULED: domain backlog tasks (no date, appear in domain areas) ===
        await task_service.create_task(
            title="Order new monitor for home office",
            domain_id=w.id,
            impact=3,
            clarity="autopilot",
        )
        await task_service.create_task(
            title="Update LinkedIn profile",
            domain_id=w.id,
            impact=4,
            clarity="normal",
        )
        await task_service.create_task(
            title="Research new protein supplement",
            domain_id=h.id,
            impact=3,
            clarity="brainstorm",
        )
        await task_service.create_task(
            title="Sign up for Saturday soccer league",
            domain_id=h.id,
            impact=3,
            clarity="normal",
        )
        await task_service.create_task(
            title="Call plumber about kitchen sink",
            domain_id=p.id,
            impact=3,
            clarity="normal",
            duration_minutes=15,
        )
        await task_service.create_task(
            title="Deep clean apartment",
            domain_id=p.id,
            impact=3,
            clarity="normal",
            duration_minutes=120,
        )
        await task_service.create_task(
            title="Fix authentication bug in OAuth flow",
            domain_id=s.id,
            impact=1,
            clarity="normal",
            duration_minutes=60,
        )
        await task_service.create_task(
            title="Design landing page for side project",
            domain_id=s.id,
            impact=2,
            clarity="brainstorm",
            duration_minutes=90,
        )
        await task_service.create_task(
            title="Complete online course module 3",
            domain_id=l.id,
            impact=3,
            clarity="normal",
            duration_minutes=60,
        )
        await task_service.create_task(
            title="Read book chapter on system design",
            domain_id=l.id,
            impact=3,
            clarity="brainstorm",
            duration_minutes=45,
        )

    async def _seed_overdue_tasks(
        self,
        task_service: TaskService,
        domains: dict[str, Domain],
        today: date,
    ) -> None:
        """Create 3 overdue tasks (past-dated, still pending)."""
        await task_service.create_task(
            title="Reply to partnership email",
            domain_id=domains["work"].id,
            impact=2,
            clarity="normal",
            scheduled_date=today - timedelta(days=1),
        )
        await task_service.create_task(
            title="Return Amazon package",
            domain_id=domains["personal"].id,
            impact=4,
            clarity="autopilot",
            scheduled_date=today - timedelta(days=2),
        )
        await task_service.create_task(
            title="Review pull request #312",
            domain_id=domains["side_project"].id,
            impact=2,
            clarity="normal",
            scheduled_date=today - timedelta(days=3),
            duration_minutes=30,
        )

    async def _seed_recurring_with_instances(
        self,
        task_service: TaskService,
        domains: dict[str, Domain],
        today: date,
        user_id: int,
    ) -> None:
        """Create 8 recurring tasks and backfill 14 days of TaskInstance records."""
        recurrence_start = today - timedelta(days=14)

        # Pre-generate deterministic skip patterns (seeded in _seed_demo_data)
        skip_rolls = [random.random() for _ in range(200)]
        roll_idx = 0

        def should_skip(threshold: float) -> bool:
            nonlocal roll_idx
            roll = skip_rolls[roll_idx % len(skip_rolls)]
            roll_idx += 1
            return roll >= threshold  # skip if roll >= threshold (i.e., complete if roll < threshold)

        # 1) Morning standup (Work, daily weekdays)
        standup = await task_service.create_task(
            title="Morning standup",
            domain_id=domains["work"].id,
            impact=3,
            clarity="autopilot",
            is_recurring=True,
            recurrence_rule={"freq": "daily"},
            recurrence_start=recurrence_start,
            scheduled_time=time(9, 0),
            duration_minutes=15,
        )
        for day_offset in range(-14, 3):
            d = today + timedelta(days=day_offset)
            if d.weekday() >= 5:
                continue
            status = "pending"
            completed_at = None
            if day_offset < 0:
                if should_skip(0.85):
                    status = "skipped"
                else:
                    status = "completed"
                    completed_at = datetime(d.year, d.month, d.day, 9, 15, tzinfo=UTC)
            self.db.add(
                TaskInstance(
                    task_id=standup.id,
                    user_id=user_id,
                    instance_date=d,
                    scheduled_datetime=datetime(d.year, d.month, d.day, 9, 0, tzinfo=UTC),
                    status=status,
                    completed_at=completed_at,
                )
            )

        # 2) Gym session (Health, Mon/Wed/Fri)
        gym = await task_service.create_task(
            title="Gym session",
            domain_id=domains["health"].id,
            impact=2,
            clarity="normal",
            is_recurring=True,
            recurrence_rule={"freq": "weekly", "byday": ["MO", "WE", "FR"]},
            recurrence_start=recurrence_start,
            scheduled_time=time(7, 0),
            duration_minutes=60,
        )
        for day_offset in range(-14, 3):
            d = today + timedelta(days=day_offset)
            if d.weekday() not in (0, 2, 4):
                continue
            status = "pending"
            completed_at = None
            if day_offset < 0:
                if should_skip(0.80):
                    status = "skipped"
                else:
                    status = "completed"
                    completed_at = datetime(d.year, d.month, d.day, 8, 0, tzinfo=UTC)
            self.db.add(
                TaskInstance(
                    task_id=gym.id,
                    user_id=user_id,
                    instance_date=d,
                    scheduled_datetime=datetime(d.year, d.month, d.day, 7, 0, tzinfo=UTC),
                    status=status,
                    completed_at=completed_at,
                )
            )

        # 3) Weekly 1:1 with manager (Work, Thu)
        one_on_one = await task_service.create_task(
            title="Weekly 1:1 with manager",
            domain_id=domains["work"].id,
            impact=2,
            clarity="normal",
            is_recurring=True,
            recurrence_rule={"freq": "weekly", "byday": ["TH"]},
            recurrence_start=recurrence_start,
            scheduled_time=time(14, 0),
            duration_minutes=30,
        )
        for day_offset in range(-14, 3):
            d = today + timedelta(days=day_offset)
            if d.weekday() != 3:
                continue
            status = "pending"
            completed_at = None
            if day_offset < 0:
                status = "completed"
                completed_at = datetime(d.year, d.month, d.day, 14, 30, tzinfo=UTC)
            self.db.add(
                TaskInstance(
                    task_id=one_on_one.id,
                    user_id=user_id,
                    instance_date=d,
                    scheduled_datetime=datetime(d.year, d.month, d.day, 14, 0, tzinfo=UTC),
                    status=status,
                    completed_at=completed_at,
                )
            )

        # 4) Sprint review (Work, Fri)
        sprint_review = await task_service.create_task(
            title="Sprint review",
            domain_id=domains["work"].id,
            impact=2,
            clarity="normal",
            is_recurring=True,
            recurrence_rule={"freq": "weekly", "byday": ["FR"]},
            recurrence_start=recurrence_start,
            scheduled_time=time(15, 0),
            duration_minutes=45,
        )
        for day_offset in range(-14, 3):
            d = today + timedelta(days=day_offset)
            if d.weekday() != 4:
                continue
            status = "pending"
            completed_at = None
            if day_offset < 0:
                status = "completed"
                completed_at = datetime(d.year, d.month, d.day, 15, 45, tzinfo=UTC)
            self.db.add(
                TaskInstance(
                    task_id=sprint_review.id,
                    user_id=user_id,
                    instance_date=d,
                    scheduled_datetime=datetime(d.year, d.month, d.day, 15, 0, tzinfo=UTC),
                    status=status,
                    completed_at=completed_at,
                )
            )

        # 5) Meal prep (Health, Sun)
        meal_prep = await task_service.create_task(
            title="Meal prep",
            domain_id=domains["health"].id,
            impact=3,
            clarity="normal",
            is_recurring=True,
            recurrence_rule={"freq": "weekly", "byday": ["SU"]},
            recurrence_start=recurrence_start,
            scheduled_time=time(10, 0),
            duration_minutes=90,
        )
        for day_offset in range(-14, 3):
            d = today + timedelta(days=day_offset)
            if d.weekday() != 6:
                continue
            status = "pending"
            completed_at = None
            if day_offset < 0:
                if should_skip(0.90):
                    status = "skipped"
                else:
                    status = "completed"
                    completed_at = datetime(d.year, d.month, d.day, 11, 30, tzinfo=UTC)
            self.db.add(
                TaskInstance(
                    task_id=meal_prep.id,
                    user_id=user_id,
                    instance_date=d,
                    scheduled_datetime=datetime(d.year, d.month, d.day, 10, 0, tzinfo=UTC),
                    status=status,
                    completed_at=completed_at,
                )
            )

        # 6) Water plants (Personal, every 3 days)
        water = await task_service.create_task(
            title="Water plants",
            domain_id=domains["personal"].id,
            impact=4,
            clarity="autopilot",
            is_recurring=True,
            recurrence_rule={"freq": "daily", "interval": 3},
            recurrence_start=recurrence_start,
            scheduled_time=time(8, 0),
            duration_minutes=10,
        )
        for day_offset in range(-14, 3):
            d = today + timedelta(days=day_offset)
            days_since_start = (d - recurrence_start).days
            if days_since_start % 3 != 0:
                continue
            status = "pending"
            completed_at = None
            if day_offset < 0:
                if should_skip(0.90):
                    status = "skipped"
                else:
                    status = "completed"
                    completed_at = datetime(d.year, d.month, d.day, 8, 10, tzinfo=UTC)
            self.db.add(
                TaskInstance(
                    task_id=water.id,
                    user_id=user_id,
                    instance_date=d,
                    scheduled_datetime=datetime(d.year, d.month, d.day, 8, 0, tzinfo=UTC),
                    status=status,
                    completed_at=completed_at,
                )
            )

        # 7) Evening coding session (Side Project, Tue/Thu)
        coding = await task_service.create_task(
            title="Evening coding session",
            domain_id=domains["side_project"].id,
            impact=2,
            clarity="normal",
            is_recurring=True,
            recurrence_rule={"freq": "weekly", "byday": ["TU", "TH"]},
            recurrence_start=recurrence_start,
            scheduled_time=time(20, 0),
            duration_minutes=90,
        )
        for day_offset in range(-14, 3):
            d = today + timedelta(days=day_offset)
            if d.weekday() not in (1, 3):
                continue
            status = "pending"
            completed_at = None
            if day_offset < 0:
                if should_skip(0.75):
                    status = "skipped"
                else:
                    status = "completed"
                    completed_at = datetime(d.year, d.month, d.day, 21, 30, tzinfo=UTC)
            self.db.add(
                TaskInstance(
                    task_id=coding.id,
                    user_id=user_id,
                    instance_date=d,
                    scheduled_datetime=datetime(d.year, d.month, d.day, 20, 0, tzinfo=UTC),
                    status=status,
                    completed_at=completed_at,
                )
            )

        # 8) Reading time (Learning, daily)
        reading = await task_service.create_task(
            title="Reading time",
            domain_id=domains["learning"].id,
            impact=3,
            clarity="normal",
            is_recurring=True,
            recurrence_rule={"freq": "daily"},
            recurrence_start=recurrence_start,
            scheduled_time=time(22, 0),
            duration_minutes=30,
        )
        for day_offset in range(-14, 3):
            d = today + timedelta(days=day_offset)
            status = "pending"
            completed_at = None
            if day_offset < 0:
                if should_skip(0.70):
                    status = "skipped"
                else:
                    status = "completed"
                    completed_at = datetime(d.year, d.month, d.day, 22, 30, tzinfo=UTC)
            self.db.add(
                TaskInstance(
                    task_id=reading.id,
                    user_id=user_id,
                    instance_date=d,
                    scheduled_datetime=datetime(d.year, d.month, d.day, 22, 0, tzinfo=UTC),
                    status=status,
                    completed_at=completed_at,
                )
            )

    async def _seed_completed_tasks(
        self,
        domains: dict[str, Domain],
        today: date,
        user_id: int,
    ) -> None:
        """Insert ~30 completed tasks with varied timestamps for analytics."""
        w = domains["work"].id
        h = domains["health"].id
        p = domains["personal"].id
        s = domains["side_project"].id
        l = domains["learning"].id  # noqa: E741

        # (title, domain_id, impact, clarity, created_days_ago, completed_days_ago, completed_hour)
        completed_specs: list[tuple[str, int, int, str, int, int, int]] = [
            # Work (~10)
            ("Sprint planning for Q1", w, 1, "brainstorm", 5, 3, 10),
            ("Update Jira board with sprint tasks", w, 3, "autopilot", 2, 2, 14),
            ("Write migration guide for API v2", w, 2, "normal", 8, 5, 11),
            ("Review analytics dashboard mockup", w, 2, "normal", 4, 3, 15),
            ("Send weekly metrics email to stakeholders", w, 3, "autopilot", 1, 1, 9),
            ("Draft feature announcement for blog", w, 2, "brainstorm", 10, 7, 16),
            ("Triage bug reports from support queue", w, 1, "normal", 3, 2, 10),
            ("Update API documentation for v3 endpoints", w, 3, "normal", 12, 9, 13),
            ("Prepare board presentation slides", w, 1, "brainstorm", 20, 14, 11),
            ("Review competitor product launch", w, 4, "brainstorm", 6, 4, 20),
            # Health & Fitness (~6)
            ("Meal prep — chicken and rice bowls", h, 3, "normal", 4, 3, 18),
            ("Order new running shoes from Nike", h, 4, "autopilot", 7, 7, 21),
            ("Schedule annual physical exam", h, 4, "autopilot", 9, 8, 10),
            ("Complete HIIT workout video series", h, 3, "normal", 5, 4, 7),
            ("Renew gym membership for next year", h, 4, "autopilot", 15, 13, 12),
            ("Log weekly calories and macros", h, 3, "normal", 2, 1, 20),
            # Personal (~6)
            ("Clean out garage and donate old items", p, 3, "normal", 15, 10, 15),
            ("Fix squeaky bedroom door hinge", p, 4, "normal", 3, 1, 16),
            ("Order standing desk for home office", p, 4, "autopilot", 8, 6, 21),
            ("Deep clean kitchen — oven and fridge", p, 2, "normal", 6, 5, 9),
            ("Replace smoke detector batteries", p, 2, "autopilot", 25, 18, 14),
            ("Call electrician about outdoor lights", p, 3, "normal", 4, 2, 11),
            # Side Project (~5)
            ("Deploy v0.3 to staging environment", s, 1, "normal", 6, 4, 20),
            ("Write unit tests for auth module", s, 2, "normal", 5, 3, 19),
            ("Fix memory leak in background worker", s, 1, "normal", 10, 8, 21),
            ("Set up error monitoring with Sentry", s, 2, "normal", 14, 11, 18),
            ("Refactor database connection pooling", s, 2, "brainstorm", 8, 6, 20),
            # Learning (~3)
            ("Complete TypeScript advanced patterns course", l, 2, "normal", 7, 5, 22),
            ("Read chapter on distributed systems", l, 3, "brainstorm", 3, 2, 21),
            ("Watch conference talk on WebAssembly", l, 4, "normal", 9, 7, 19),
        ]

        for idx, (title, domain_id, impact, clarity, created_ago, completed_ago, hour) in enumerate(completed_specs):
            created_date = today - timedelta(days=created_ago)
            completed_date = today - timedelta(days=completed_ago)
            # Deterministic minute variation based on index
            minute = (idx * 7 + 3) % 50
            task = Task(
                user_id=user_id,
                domain_id=domain_id,
                title=title,
                impact=impact,
                clarity=clarity,
                status="completed",
                created_at=datetime(created_date.year, created_date.month, created_date.day, 9, 0, tzinfo=UTC),
                completed_at=datetime(
                    completed_date.year, completed_date.month, completed_date.day, hour, minute, tzinfo=UTC
                ),
            )
            self.db.add(task)

    async def _seed_archived_tasks(
        self,
        domains: dict[str, Domain],
        today: date,
        user_id: int,
    ) -> None:
        """Insert 6 archived tasks across multiple domains."""
        w = domains["work"].id
        h = domains["health"].id
        p = domains["personal"].id
        s = domains["side_project"].id
        l = domains["learning"].id  # noqa: E741

        # (title, domain_id, impact, clarity, archived_days_ago)
        archived_specs: list[tuple[str, int, int, str, int]] = [
            ("Cancel premium Notion plan", w, 4, "autopilot", 5),
            ("Old meal prep recipe collection", h, 4, "normal", 8),
            ("Research coworking spaces", p, 3, "brainstorm", 3),
            ("Rewrite onboarding flow", s, 2, "brainstorm", 10),
            ("Organize bookshelf by category", p, 4, "normal", 6),
            ("Set up RSS reader", l, 4, "autopilot", 12),
        ]

        for title, domain_id, impact, clarity, archived_ago in archived_specs:
            created_date = today - timedelta(days=archived_ago + 5)
            archived_date = today - timedelta(days=archived_ago)
            task = Task(
                user_id=user_id,
                domain_id=domain_id,
                title=title,
                impact=impact,
                clarity=clarity,
                status="archived",
                created_at=datetime(created_date.year, created_date.month, created_date.day, 9, 0, tzinfo=UTC),
                updated_at=datetime(archived_date.year, archived_date.month, archived_date.day, 12, 0, tzinfo=UTC),
            )
            self.db.add(task)

    async def _seed_thoughts(self, task_service: TaskService) -> None:
        """Create 6 thought items (tasks with no domain)."""
        await task_service.create_task(
            title="Explore working remotely from Lisbon for a month",
            impact=4,
            clarity="brainstorm",
        )
        await task_service.create_task(
            title="Cancel HBO Max subscription",
            impact=3,
            clarity="autopilot",
        )
        await task_service.create_task(
            title="Birthday gift ideas for Mom",
            impact=3,
            clarity="brainstorm",
        )
        await task_service.create_task(
            title="Try that new Thai place on 5th Avenue",
            impact=4,
            clarity="normal",
        )
        await task_service.create_task(
            title="Look into home office tax deduction",
            impact=3,
            clarity="normal",
        )
        await task_service.create_task(
            title="Learn to make sourdough bread",
            impact=4,
            clarity="brainstorm",
        )
