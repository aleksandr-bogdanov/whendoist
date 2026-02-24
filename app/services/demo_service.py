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
                User.email.endswith(DEMO_EMAIL_SUFFIX),
                User.created_at < cutoff,
            )
        )
        stale_users = list(result.scalars().all())

        for user in stale_users:
            await self._clear_user_data(user.id)
            await self.db.delete(user)

        if stale_users:
            await self.db.flush()
            logger.info(f"Cleaned up {len(stale_users)} stale demo users")

        return len(stale_users)

    async def _clear_user_data(self, user_id: int) -> None:
        """Delete all user-generated data, keeping the User row."""
        # Order matters: delete children before parents
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
        task_service = TaskService(self.db, user_id)
        today = get_user_today(None)  # UTC-based for demo

        # --- Domains ---
        domains = await self._seed_domains(task_service)

        # --- Active tasks (via TaskService for proper position handling) ---
        await self._seed_active_tasks(task_service, domains, today)

        # --- Recurring tasks with historical instances ---
        await self._seed_recurring_with_instances(task_service, domains, today, user_id)

        # --- Completed tasks (direct insertion for custom timestamps) ---
        await self._seed_completed_tasks(domains, today, user_id)

        # --- Thoughts (no domain) ---
        await self._seed_thoughts(task_service)

    async def _seed_domains(self, task_service: TaskService) -> dict[str, Domain]:
        """Create the 4 demo domains. Returns mapping of name -> Domain."""
        product = await task_service.create_domain(name="Product", color="#3b82f6", icon="💡")
        fitness = await task_service.create_domain(name="Fitness", color="#22c55e", icon="🏋️")
        home = await task_service.create_domain(name="Home", color="#f59e0b", icon="🏡")
        side_project = await task_service.create_domain(name="Side Project", color="#a855f7", icon="🚀")
        return {
            "product": product,
            "fitness": fitness,
            "home": home,
            "side_project": side_project,
        }

    async def _seed_active_tasks(
        self,
        task_service: TaskService,
        domains: dict[str, Domain],
        today: date,
    ) -> None:
        """Create ~17 pending tasks spread across day-2 to day+5."""
        p = domains["product"]
        f = domains["fitness"]
        h = domains["home"]
        s = domains["side_project"]

        # --- Product (6) ---
        await task_service.create_task(
            title="Write product spec for notifications",
            description="Define user stories, wireframes, and success metrics for push notification feature.",
            domain_id=p.id,
            impact=1,
            clarity="brainstorm",
            scheduled_date=today,
            scheduled_time=time(10, 0),
            duration_minutes=60,
        )
        await task_service.create_task(
            title="Review PR #247 from backend team",
            domain_id=p.id,
            impact=2,
            clarity="normal",
            scheduled_date=today,
            scheduled_time=time(14, 0),
            duration_minutes=30,
        )
        await task_service.create_task(
            title="Send standup update to Slack",
            domain_id=p.id,
            impact=3,
            clarity="autopilot",
            scheduled_date=today + timedelta(days=1),
            scheduled_time=time(9, 30),
            duration_minutes=10,
        )
        await task_service.create_task(
            title="Prep user interview questions",
            description="Focus on onboarding friction and feature discovery patterns.",
            domain_id=p.id,
            impact=2,
            clarity="brainstorm",
            scheduled_date=today + timedelta(days=1),
            scheduled_time=time(11, 0),
            duration_minutes=45,
        )
        await task_service.create_task(
            title="Update roadmap Notion page",
            domain_id=p.id,
            impact=3,
            clarity="normal",
            scheduled_date=today + timedelta(days=2),
            duration_minutes=20,
        )
        await task_service.create_task(
            title="File Q1 expense reports",
            domain_id=p.id,
            impact=4,
            clarity="autopilot",
            scheduled_date=today + timedelta(days=2),
            scheduled_time=time(16, 0),
            duration_minutes=15,
        )

        # --- Fitness (3) ---
        await task_service.create_task(
            title="Gym: upper body day",
            description="Bench press, overhead press, rows, curls. Progressive overload week 3.",
            domain_id=f.id,
            impact=2,
            clarity="normal",
            scheduled_date=today,
            scheduled_time=time(7, 0),
            duration_minutes=45,
        )
        await task_service.create_task(
            title="Book sports massage",
            domain_id=f.id,
            impact=4,
            clarity="autopilot",
            scheduled_date=today + timedelta(days=3),
        )
        await task_service.create_task(
            title="Research 5K training plans",
            description="Compare Couch-to-5K vs Hal Higdon beginner plan.",
            domain_id=f.id,
            impact=3,
            clarity="brainstorm",
            scheduled_date=today + timedelta(days=2),
            scheduled_time=time(19, 0),
            duration_minutes=30,
        )

        # --- Home (4) ---
        await task_service.create_task(
            title="Grocery shopping",
            domain_id=h.id,
            impact=2,
            clarity="normal",
            scheduled_date=today - timedelta(days=1),
            scheduled_time=time(17, 0),
            duration_minutes=45,
        )
        await task_service.create_task(
            title="Water plants",
            domain_id=h.id,
            impact=4,
            clarity="autopilot",
            scheduled_date=today + timedelta(days=1),
            scheduled_time=time(8, 0),
            duration_minutes=5,
        )
        await task_service.create_task(
            title="Pay electricity bill",
            domain_id=h.id,
            impact=2,
            clarity="autopilot",
            scheduled_date=today,
            duration_minutes=5,
        )
        await task_service.create_task(
            title="Plan weekend hike with friends",
            description="Check weather, pick trail, share directions in group chat.",
            domain_id=h.id,
            impact=3,
            clarity="brainstorm",
            scheduled_date=today + timedelta(days=1),
            scheduled_time=time(20, 0),
            duration_minutes=30,
        )

        # --- Side Project (4) ---
        await task_service.create_task(
            title="Design API architecture for auth service",
            description="JWT vs session tokens, refresh flow, rate limiting strategy.",
            domain_id=s.id,
            impact=1,
            clarity="brainstorm",
            scheduled_date=today - timedelta(days=2),
            scheduled_time=time(20, 0),
            duration_minutes=90,
        )
        await task_service.create_task(
            title="Fix CSS layout bug on mobile",
            domain_id=s.id,
            impact=2,
            clarity="normal",
            scheduled_date=today,
            scheduled_time=time(19, 0),
            duration_minutes=30,
        )
        await task_service.create_task(
            title="Read chapter on event-driven systems",
            domain_id=s.id,
            impact=3,
            clarity="brainstorm",
            scheduled_date=today + timedelta(days=2),
            scheduled_time=time(21, 0),
            duration_minutes=45,
        )
        await task_service.create_task(
            title="Set up CI pipeline",
            domain_id=s.id,
            impact=2,
            clarity="normal",
            scheduled_date=today + timedelta(days=5),
            duration_minutes=60,
        )

    async def _seed_recurring_with_instances(
        self,
        task_service: TaskService,
        domains: dict[str, Domain],
        today: date,
        user_id: int,
    ) -> None:
        """Create recurring tasks and backfill 14 days of TaskInstance records."""
        recurrence_start = today - timedelta(days=14)

        # 1) Daily standup update (Product, autopilot)
        standup = await task_service.create_task(
            title="Daily standup update",
            domain_id=domains["product"].id,
            impact=3,
            clarity="autopilot",
            is_recurring=True,
            recurrence_rule={"freq": "daily"},
            recurrence_start=recurrence_start,
            scheduled_time=time(9, 30),
            duration_minutes=10,
        )
        for day_offset in range(-14, 3):
            d = today + timedelta(days=day_offset)
            is_weekend = d.weekday() >= 5
            if is_weekend:
                continue  # Skip weekends for standup
            status = "pending"
            completed_at = None
            if day_offset < 0:
                # Past: mostly completed, occasional skip
                if random.random() < 0.85:
                    status = "completed"
                    completed_at = datetime(d.year, d.month, d.day, 9, 35, tzinfo=UTC)
                else:
                    status = "skipped"
            inst = TaskInstance(
                task_id=standup.id,
                user_id=user_id,
                instance_date=d,
                scheduled_datetime=datetime(d.year, d.month, d.day, 9, 30, tzinfo=UTC),
                status=status,
                completed_at=completed_at,
            )
            self.db.add(inst)

        # 2) Gym workout (Fitness, normal) — Mon/Wed/Fri
        gym = await task_service.create_task(
            title="Gym workout",
            domain_id=domains["fitness"].id,
            impact=2,
            clarity="normal",
            is_recurring=True,
            recurrence_rule={"freq": "weekly", "byday": ["MO", "WE", "FR"]},
            recurrence_start=recurrence_start,
            scheduled_time=time(7, 0),
            duration_minutes=45,
        )
        for day_offset in range(-14, 3):
            d = today + timedelta(days=day_offset)
            if d.weekday() not in (0, 2, 4):  # Mon=0, Wed=2, Fri=4
                continue
            status = "pending"
            completed_at = None
            if day_offset < 0:
                if random.random() < 0.80:
                    status = "completed"
                    completed_at = datetime(d.year, d.month, d.day, 7, 50, tzinfo=UTC)
                else:
                    status = "skipped"
            inst = TaskInstance(
                task_id=gym.id,
                user_id=user_id,
                instance_date=d,
                scheduled_datetime=datetime(d.year, d.month, d.day, 7, 0, tzinfo=UTC),
                status=status,
                completed_at=completed_at,
            )
            self.db.add(inst)

        # 3) Water all plants (Home, autopilot) — every 3 days
        water = await task_service.create_task(
            title="Water all plants",
            domain_id=domains["home"].id,
            impact=4,
            clarity="autopilot",
            is_recurring=True,
            recurrence_rule={"freq": "daily", "interval": 3},
            recurrence_start=recurrence_start,
            scheduled_time=time(8, 0),
            duration_minutes=5,
        )
        for day_offset in range(-14, 3):
            d = today + timedelta(days=day_offset)
            days_since_start = (d - recurrence_start).days
            if days_since_start % 3 != 0:
                continue
            status = "pending"
            completed_at = None
            if day_offset < 0:
                if random.random() < 0.90:
                    status = "completed"
                    completed_at = datetime(d.year, d.month, d.day, 8, 5, tzinfo=UTC)
                else:
                    status = "skipped"
            inst = TaskInstance(
                task_id=water.id,
                user_id=user_id,
                instance_date=d,
                scheduled_datetime=datetime(d.year, d.month, d.day, 8, 0, tzinfo=UTC),
                status=status,
                completed_at=completed_at,
            )
            self.db.add(inst)

        # 4) Weekly review & planning (Product, brainstorm) — Fridays
        review = await task_service.create_task(
            title="Weekly review & planning",
            domain_id=domains["product"].id,
            impact=2,
            clarity="brainstorm",
            is_recurring=True,
            recurrence_rule={"freq": "weekly", "byday": ["FR"]},
            recurrence_start=recurrence_start,
            scheduled_time=time(16, 0),
            duration_minutes=30,
        )
        for day_offset in range(-14, 3):
            d = today + timedelta(days=day_offset)
            if d.weekday() != 4:  # Friday only
                continue
            status = "pending"
            completed_at = None
            if day_offset < 0:
                status = "completed"
                completed_at = datetime(d.year, d.month, d.day, 16, 35, tzinfo=UTC)
            inst = TaskInstance(
                task_id=review.id,
                user_id=user_id,
                instance_date=d,
                scheduled_datetime=datetime(d.year, d.month, d.day, 16, 0, tzinfo=UTC),
                status=status,
                completed_at=completed_at,
            )
            self.db.add(inst)

    async def _seed_completed_tasks(
        self,
        domains: dict[str, Domain],
        today: date,
        user_id: int,
    ) -> None:
        """Insert ~28 completed tasks with varied timestamps for analytics."""
        p = domains["product"].id
        f = domains["fitness"].id
        h = domains["home"].id
        s = domains["side_project"].id

        # (title, domain_id, impact, clarity, created_days_ago, completed_days_ago, completed_hour)
        completed_specs: list[tuple[str, int, int, str, int, int, int]] = [
            # Product (~10)
            ("Sprint planning for Q1", p, 1, "brainstorm", 5, 3, 10),
            ("Update Jira board", p, 3, "autopilot", 2, 2, 14),
            ("Write migration guide", p, 2, "normal", 8, 5, 11),
            ("Review analytics dashboard mockup", p, 2, "normal", 4, 3, 15),
            ("Send weekly metrics email", p, 3, "autopilot", 1, 1, 9),
            ("Draft feature announcement", p, 2, "brainstorm", 10, 7, 16),
            ("Triage bug reports from support", p, 1, "normal", 3, 2, 10),
            ("Update API documentation", p, 3, "normal", 12, 9, 13),
            ("Prepare board presentation", p, 1, "brainstorm", 20, 14, 11),
            ("Review competitor product updates", p, 4, "brainstorm", 6, 4, 20),
            # Fitness (~6)
            ("Meal prep for the week", f, 3, "normal", 4, 3, 18),
            ("Order new running shoes", f, 4, "autopilot", 7, 7, 21),
            ("Schedule dentist appointment", f, 4, "autopilot", 9, 8, 10),
            ("Try new HIIT workout video", f, 3, "normal", 5, 4, 7),
            ("Renew gym membership", f, 4, "autopilot", 15, 13, 12),
            ("Track weekly calories", f, 3, "normal", 2, 1, 20),
            # Home (~6)
            ("Clean garage", h, 3, "normal", 15, 10, 15),
            ("Fix squeaky door hinge", h, 4, "normal", 3, 1, 16),
            ("Order new shelf for office", h, 4, "autopilot", 8, 6, 21),
            ("Deep clean kitchen", h, 2, "normal", 6, 5, 9),
            ("Replace smoke detector batteries", h, 2, "autopilot", 25, 18, 14),
            ("Call plumber about sink", h, 3, "normal", 4, 2, 11),
            # Side Project (~6)
            ("Deploy v0.3 to staging", s, 1, "normal", 6, 4, 20),
            ("Write unit tests for auth module", s, 2, "normal", 5, 3, 19),
            ("Fix memory leak in worker process", s, 1, "normal", 10, 8, 21),
            ("Set up error monitoring with Sentry", s, 2, "normal", 14, 11, 18),
            ("Refactor database connection pool", s, 2, "brainstorm", 8, 6, 20),
            ("Design landing page wireframe", s, 3, "brainstorm", 3, 2, 19),
        ]

        for title, domain_id, impact, clarity, created_ago, completed_ago, hour in completed_specs:
            created_date = today - timedelta(days=created_ago)
            completed_date = today - timedelta(days=completed_ago)
            # Add some minute variation
            minute = random.randint(0, 45)
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

    async def _seed_thoughts(self, task_service: TaskService) -> None:
        """Create thought items (tasks with no domain)."""
        await task_service.create_task(
            title="Research vacation spots for March",
            impact=4,
            clarity="brainstorm",
        )
        await task_service.create_task(
            title="Cancel old streaming subscription",
            impact=3,
            clarity="autopilot",
        )
        await task_service.create_task(
            title="Birthday gift ideas for Sarah",
            impact=3,
            clarity="brainstorm",
        )
        await task_service.create_task(
            title="Try that new ramen place downtown",
            impact=4,
            clarity="normal",
        )
