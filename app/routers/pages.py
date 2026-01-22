"""
Page routes for the Whendoist dashboard.

Renders HTML pages using Jinja2 templates with task and calendar data.
"""

import logging
from datetime import UTC, date, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy import inspect as sa_inspect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import (
    Domain,
    GoogleCalendarSelection,
    GoogleToken,
    Task,
    TodoistToken,
    User,
    UserPasskey,
    UserPreferences,
)
from app.routers.auth import get_current_user
from app.services.analytics_service import AnalyticsService
from app.services.calendar_cache import get_calendar_cache
from app.services.gcal import GoogleCalendarClient
from app.services.labels import Clarity, clarity_display
from app.services.preferences_service import PreferencesService
from app.services.recurrence_service import RecurrenceService
from app.services.task_service import TaskService

logger = logging.getLogger(__name__)


async def get_encryption_context(db: AsyncSession, user_id: int) -> dict[str, Any]:
    """Get encryption settings for template context."""
    from sqlalchemy import func

    result = await db.execute(select(UserPreferences).where(UserPreferences.user_id == user_id))
    prefs = result.scalar_one_or_none()

    # Count passkeys for this user
    passkey_count_result = await db.execute(select(func.count(UserPasskey.id)).where(UserPasskey.user_id == user_id))
    passkey_count = passkey_count_result.scalar() or 0

    if prefs and prefs.encryption_enabled:
        return {
            "encryption_enabled": True,
            "encryption_salt": prefs.encryption_salt,
            "encryption_test_value": prefs.encryption_test_value,
            "encryption_version": prefs.encryption_version or 1,
            "has_passkeys": passkey_count > 0,
            "passkey_count": passkey_count,
            "unlock_method": prefs.encryption_unlock_method or "passphrase",
        }
    return {
        "encryption_enabled": False,
        "encryption_salt": None,
        "encryption_test_value": None,
        "encryption_version": 1,
        "has_passkeys": False,
        "passkey_count": 0,
        "unlock_method": None,
    }


router = APIRouter(tags=["pages"])
templates = Jinja2Templates(directory="app/templates")


# -----------------------------------------------------------------------------
# Helper Types
# -----------------------------------------------------------------------------

TaskItem = dict[str, Any]  # Task with metadata and subtasks
DomainWithTasks = dict[str, Any]  # Domain with its tasks


# -----------------------------------------------------------------------------
# Native Task Processing Helpers
# -----------------------------------------------------------------------------


def build_native_task_item(
    task: Task,
    next_instances: dict[int, dict] | None = None,
    instance_completed_at: datetime | None = None,
) -> TaskItem:
    """
    Create a task item dict from native Task model.

    Args:
        task: The task to build item for
        next_instances: Dict of task_id -> {date, id} for recurring tasks
        instance_completed_at: For recurring tasks, the completion time of today's instance
    """
    import contextlib

    # Map clarity string to Clarity enum for display
    clarity = None
    if task.clarity:
        with contextlib.suppress(ValueError):
            clarity = Clarity(task.clarity)

    # Get next occurrence for recurring tasks
    next_occurrence = None
    next_instance_id = None
    if task.is_recurring and next_instances:
        instance_info = next_instances.get(task.id)
        if instance_info:
            next_occurrence = instance_info["date"]
            next_instance_id = instance_info["id"]

    # Determine completion age class for visual aging
    # For recurring tasks, use instance completion time; for regular tasks, use task completion time
    completed_at = instance_completed_at if task.is_recurring else task.completed_at
    completion_age_class = TaskService.get_completion_age_class(completed_at, task.status)

    # Only access subtasks if already eagerly loaded (avoids lazy loading in async context)
    subtasks = []
    if "subtasks" in sa_inspect(task).dict:
        subtasks = [build_native_task_item(s, next_instances) for s in (task.subtasks or [])]

    return {
        "task": task,
        "clarity_display": clarity_display(clarity),
        "next_occurrence": next_occurrence,
        "next_instance_id": next_instance_id,
        "subtasks": subtasks,
        "completion_age_class": completion_age_class,
        "instance_completed_at": instance_completed_at,
    }


def native_task_sort_key(task_item: TaskItem) -> tuple:
    """Sort key for unscheduled tasks: impact (asc = highest first), then position."""
    task = task_item["task"]
    return (task.impact, task.position, task.created_at)


def scheduled_task_sort_key(task_item: TaskItem) -> tuple:
    """Sort key for scheduled tasks: date first (soonest first), then impact.

    Scheduled tasks are sorted chronologically because the date represents
    when the task needs to be done - earlier dates are more urgent regardless
    of impact level.

    For recurring tasks, uses the next_occurrence date instead of scheduled_date.
    """
    task = task_item["task"]
    # For recurring tasks, use next occurrence; for regular tasks, use scheduled_date
    if task.is_recurring and task_item.get("next_occurrence"):
        scheduled = task_item["next_occurrence"]
    else:
        scheduled = task.scheduled_date or date.max
    return (scheduled, task.impact, task.position)


def completed_task_sort_key(task_item: TaskItem) -> tuple:
    """Sort key for completed tasks by completion date (most recent first), then impact.

    Uses instance_completed_at for recurring tasks, task.completed_at for regular tasks.
    """
    task = task_item["task"]
    # Get completion time - use instance completion for recurring tasks
    completed_at = task_item.get("instance_completed_at") or task.completed_at
    # Most recent first: negate timestamp for descending order, inf for None (end of list)
    timestamp = -completed_at.timestamp() if completed_at else float("inf")
    return (timestamp, task.impact, task.position)


def group_tasks_by_domain(
    tasks: list[Task],
    domains: list[Domain],
    next_instances: dict[int, dict] | None = None,
    today_instance_completions: dict[int, datetime] | None = None,
    user_prefs: UserPreferences | None = None,
) -> list[DomainWithTasks]:
    """
    Group tasks by domain, sorted by impact.

    Args:
        tasks: List of tasks to group
        domains: All user domains
        next_instances: Dict of task_id -> next instance date for recurring tasks
        today_instance_completions: Dict of task_id -> completed_at for today's recurring instances
        user_prefs: User preferences for filtering/sorting
    """
    domains_map = {d.id: d for d in domains}
    tasks_by_domain: dict[int | None, list[TaskItem]] = {}

    # Get preference values with defaults
    retention_days = user_prefs.completed_retention_days if user_prefs else 3
    show_completed_in_list = user_prefs.show_completed_in_list if user_prefs else True
    show_scheduled_in_list = user_prefs.show_scheduled_in_list if user_prefs else True
    move_to_bottom = user_prefs.completed_move_to_bottom if user_prefs else True
    completed_sort_by_date = user_prefs.completed_sort_by_date if user_prefs else True
    scheduled_to_bottom = user_prefs.scheduled_move_to_bottom if user_prefs else True
    scheduled_sort_by_date = user_prefs.scheduled_sort_by_date if user_prefs else True
    hide_recurring_after = user_prefs.hide_recurring_after_completion if user_prefs else False

    for task in tasks:
        # Get instance completion time for recurring tasks
        instance_completed_at = today_instance_completions.get(task.id) if today_instance_completions else None

        # Check if task is scheduled (has a date assigned)
        is_scheduled = task.scheduled_date is not None

        # Hide scheduled tasks if preference is off (they'll still show on calendar)
        if is_scheduled and not show_scheduled_in_list:
            # Still show completed scheduled tasks if they're within retention window
            is_task_completed = task.status == "completed" or task.completed_at is not None or instance_completed_at
            if not is_task_completed:
                continue

        # Determine if task should be shown
        # Check status, completed_at (for regular tasks), and instance_completed_at (for recurring tasks)
        is_task_completed = task.status == "completed" or task.completed_at is not None or instance_completed_at
        if is_task_completed:
            # Check retention window
            completed_at = instance_completed_at if task.is_recurring else task.completed_at
            if not TaskService.is_within_retention_window(completed_at, retention_days):
                continue

            # Check if completed should show in list
            if not show_completed_in_list:
                continue

            # Check hide recurring after completion setting
            if task.is_recurring and hide_recurring_after and instance_completed_at:
                continue

        task_item = build_native_task_item(task, next_instances, instance_completed_at)
        domain_id = task.domain_id
        tasks_by_domain.setdefault(domain_id, []).append(task_item)

    # Sort tasks within each domain
    domains_with_tasks: list[DomainWithTasks] = []

    def is_completed_task(task_item: TaskItem) -> bool:
        """Check if a task should be considered completed for sorting purposes."""
        # Has visual aging class (completed_at is set)
        if task_item["completion_age_class"]:
            return True
        # Task status is completed (fallback for tasks without completed_at)
        task = task_item["task"]
        if task.status == "completed":
            return True
        # Recurring task with instance completed today
        return bool(task_item["instance_completed_at"])

    def is_scheduled_task(task_item: TaskItem) -> bool:
        """Check if a task has a scheduled date (counts as scheduled for separation)."""
        task = task_item["task"]
        return task.scheduled_date is not None

    for domain_id, domain_tasks in tasks_by_domain.items():
        # Separate tasks into groups for proper sorting
        unscheduled_pending = [t for t in domain_tasks if not is_completed_task(t) and not is_scheduled_task(t)]
        scheduled_pending = [t for t in domain_tasks if not is_completed_task(t) and is_scheduled_task(t)]
        completed = [t for t in domain_tasks if is_completed_task(t)]

        # Sort each group:
        # - Unscheduled: by impact (P1 first)
        # - Scheduled: by date (soonest first) when grouped at bottom, otherwise by impact
        # - Completed: by completion date (most recent first) when grouped at bottom, otherwise by impact
        unscheduled_pending.sort(key=native_task_sort_key)
        if scheduled_to_bottom and scheduled_sort_by_date:
            scheduled_pending.sort(key=scheduled_task_sort_key)
        else:
            scheduled_pending.sort(key=native_task_sort_key)
        if move_to_bottom and completed_sort_by_date:
            completed.sort(key=completed_task_sort_key)
        else:
            completed.sort(key=native_task_sort_key)

        if move_to_bottom and scheduled_to_bottom:
            # Both completed and scheduled at bottom: unscheduled -> scheduled -> completed
            domain_tasks = unscheduled_pending + scheduled_pending + completed
        elif move_to_bottom and not scheduled_to_bottom:
            # Only completed at bottom: (unscheduled + scheduled interleaved) -> completed
            all_pending = unscheduled_pending + scheduled_pending
            all_pending.sort(key=native_task_sort_key)
            domain_tasks = all_pending + completed
        elif not move_to_bottom and scheduled_to_bottom:
            # Only scheduled at bottom: (unscheduled + completed_unscheduled) -> (scheduled + completed_scheduled)
            completed_unscheduled = [t for t in completed if not is_scheduled_task(t)]
            completed_scheduled = [t for t in completed if is_scheduled_task(t)]
            all_unscheduled = unscheduled_pending + completed_unscheduled
            all_scheduled = scheduled_pending + completed_scheduled
            all_unscheduled.sort(key=native_task_sort_key)
            all_scheduled.sort(key=scheduled_task_sort_key)
            domain_tasks = all_unscheduled + all_scheduled
        else:
            # Neither at bottom: all tasks interleaved by impact
            all_tasks = unscheduled_pending + scheduled_pending + completed
            all_tasks.sort(key=native_task_sort_key)
            domain_tasks = all_tasks

        for task_item in domain_tasks:
            task_item["subtasks"].sort(key=native_task_sort_key)

        domains_with_tasks.append(
            {
                "domain": domains_map.get(domain_id) if domain_id else None,
                "tasks": domain_tasks,
            }
        )

    # Sort: named domains alphabetically, Inbox (None) last
    domains_with_tasks.sort(key=lambda d: (d["domain"] is None, d["domain"].name.lower() if d["domain"] else "zzz"))

    return domains_with_tasks


# -----------------------------------------------------------------------------
# Routes
# -----------------------------------------------------------------------------


@router.get("/", response_class=HTMLResponse)
async def index(
    request: Request,
    user: User | None = Depends(get_current_user),
):
    """Home page - redirect based on auth and wizard status, or show login."""
    if user:
        # Authenticated: check wizard status
        if not user.wizard_completed:
            # Wizard not done → go to dashboard with wizard overlay
            return RedirectResponse(url="/dashboard", status_code=303)
        # Wizard done → normal flow to thoughts
        return RedirectResponse(url="/thoughts", status_code=303)
    return templates.TemplateResponse("login.html", {"request": request})


@router.get("/dashboard", response_class=HTMLResponse)
async def dashboard(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_current_user),
):
    """Dashboard with task list grouped by domain and calendar events."""
    if not user:
        return RedirectResponse(url="/", status_code=303)

    # Check Google and Todoist connections
    google_token = (await db.execute(select(GoogleToken).where(GoogleToken.user_id == user.id))).scalar_one_or_none()
    todoist_token = (await db.execute(select(TodoistToken).where(TodoistToken.user_id == user.id))).scalar_one_or_none()

    today = date.today()

    # Generate date range: 7 days before and after today (15 days total)
    calendar_days = []
    for offset in range(-7, 8):
        day_date = today + timedelta(days=offset)
        calendar_days.append(
            {
                "date": day_date,
                "is_today": offset == 0,
                "offset": offset,
                "events": [],
                "scheduled_tasks": [],
                "date_only_tasks": [],
            }
        )

    # ==========================================================================
    # User Preferences
    # ==========================================================================
    prefs_service = PreferencesService(db, user.id)
    user_prefs = await prefs_service.get_preferences()

    # ==========================================================================
    # Native Task Loading
    # ==========================================================================
    task_service = TaskService(db, user.id)
    recurrence_service = RecurrenceService(db, user.id)

    # Note: Instance materialization is now handled by background task (v0.14.0)
    # No longer blocking request here

    # Get domains and tasks (exclude inbox/thoughts - tasks without domain)
    # Include both pending and completed tasks so completed ones show dimmed
    domains = await task_service.get_domains()
    # Use SQL filter for has_domain instead of Python list comprehension
    tasks = await task_service.get_tasks(status=None, top_level_only=True, has_domain=True)

    # Get next occurrence for each recurring task (date + instance ID for completion)
    next_instances: dict[int, dict] = {}
    recurring_task_ids = [t.id for t in tasks if t.is_recurring]
    if recurring_task_ids:
        instances = await recurrence_service.get_next_instances_for_tasks(recurring_task_ids)
        next_instances = {inst.task_id: {"date": inst.instance_date, "id": inst.id} for inst in instances}

    # Get today's instance completions for recurring tasks (for visual aging)
    today_instance_completions: dict[int, datetime] = {}
    if recurring_task_ids:
        today_instances = await recurrence_service.get_instances_for_range(today, today, status=None)
        for inst in today_instances:
            if inst.status == "completed" and inst.completed_at:
                today_instance_completions[inst.task_id] = inst.completed_at

    domains_with_tasks = group_tasks_by_domain(tasks, domains, next_instances, today_instance_completions, user_prefs)

    # Get scheduled tasks for calendar display
    # Note: Redefine start_date here (was used above for instance fetching)
    start_date = today - timedelta(days=7)
    end_date = today + timedelta(days=8)

    scheduled_tasks_by_date: dict[date, list[dict]] = {}

    # Separate date-only tasks from time-scheduled tasks
    date_only_tasks_by_date: dict[date, list[dict]] = {}

    # Get calendar retention preference (completed tasks always show in calendar, just respect retention)
    calendar_retention_days = user_prefs.completed_retention_days if user_prefs else 3

    # Non-recurring scheduled tasks
    scheduled_tasks = await task_service.get_scheduled_tasks_for_range(start_date, end_date)
    for task in scheduled_tasks:
        if task.scheduled_date:
            # Skip completed tasks outside retention window
            is_completed = task.status == "completed" or task.completed_at is not None
            if is_completed and not TaskService.is_within_retention_window(task.completed_at, calendar_retention_days):
                continue

            completion_age = TaskService.get_completion_age_class(task.completed_at, task.status)
            if task.scheduled_time:
                # Task has both date and time - show on calendar grid
                scheduled_datetime = datetime.combine(
                    task.scheduled_date,
                    task.scheduled_time,
                    tzinfo=UTC,
                )
                scheduled_tasks_by_date.setdefault(task.scheduled_date, []).append(
                    {
                        "task": task,
                        "is_instance": False,
                        "start": scheduled_datetime,
                        "duration_minutes": task.duration_minutes or 30,
                        "clarity": task.clarity or "none",
                        "completion_age_class": completion_age,
                    }
                )
            else:
                # Task has date but no time - show in date-only banner
                date_only_tasks_by_date.setdefault(task.scheduled_date, []).append(
                    {
                        "task": task,
                        "is_instance": False,
                        "duration_minutes": task.duration_minutes or 30,
                        "clarity": task.clarity or "none",
                        "completion_age_class": completion_age,
                    }
                )

    # Recurring task instances (include completed to show them dimmed)
    instances = await recurrence_service.get_instances_for_range(start_date, end_date, status=None)
    for instance in instances:
        # Skip completed instances outside retention window
        is_completed = instance.status == "completed" or instance.completed_at is not None
        if is_completed and not TaskService.is_within_retention_window(instance.completed_at, calendar_retention_days):
            continue

        # Get completion age for instance
        completion_age = TaskService.get_completion_age_class(instance.completed_at, instance.status)

        # Check if instance has a specific time
        has_time = instance.scheduled_datetime is not None or instance.task.scheduled_time is not None
        if has_time:
            if instance.scheduled_datetime is not None:
                instance_datetime = instance.scheduled_datetime
            else:
                # has_time is True and scheduled_datetime is None, so scheduled_time must exist
                assert instance.task.scheduled_time is not None
                instance_datetime = datetime.combine(
                    instance.instance_date,
                    instance.task.scheduled_time,
                    tzinfo=UTC,
                )
            scheduled_tasks_by_date.setdefault(instance.instance_date, []).append(
                {
                    "task": instance.task,
                    "instance": instance,
                    "is_instance": True,
                    "start": instance_datetime,
                    "duration_minutes": instance.task.duration_minutes or 30,
                    "clarity": instance.task.clarity or "none",
                    "completion_age_class": completion_age,
                }
            )
        else:
            # Recurring instance without time - show in date-only banner
            date_only_tasks_by_date.setdefault(instance.instance_date, []).append(
                {
                    "task": instance.task,
                    "instance": instance,
                    "is_instance": True,
                    "duration_minutes": instance.task.duration_minutes or 30,
                    "clarity": instance.task.clarity or "none",
                    "completion_age_class": completion_age,
                }
            )

    # ==========================================================================
    # Google Calendar Events (with caching)
    # ==========================================================================
    if google_token:
        try:
            selections = (
                (
                    await db.execute(
                        select(GoogleCalendarSelection).where(
                            GoogleCalendarSelection.user_id == user.id,
                            GoogleCalendarSelection.enabled == True,  # noqa: E712
                        )
                    )
                )
                .scalars()
                .all()
            )

            if selections:
                calendar_ids = [s.calendar_id for s in selections]
                cache = get_calendar_cache()

                # Try cache first
                events = cache.get(user.id, calendar_ids, start_date, end_date)

                if events is None:
                    # Cache miss - fetch from Google API
                    time_min = datetime.combine(start_date, datetime.min.time(), tzinfo=UTC)
                    time_max = datetime.combine(end_date, datetime.min.time(), tzinfo=UTC)

                    events = []
                    async with GoogleCalendarClient(google_token) as client:
                        for selection in selections:
                            try:
                                cal_events = await client.get_events(selection.calendar_id, time_min, time_max)
                                events.extend(cal_events)
                            except Exception as e:
                                logger.debug(f"Failed to fetch calendar {selection.calendar_id}: {e}")
                                continue

                    await db.commit()
                    events.sort(key=lambda e: e.start)

                    # Store in cache
                    cache.set(user.id, calendar_ids, start_date, end_date, events)

                # Group events by date
                events_by_date = {}
                for event in events:
                    event_date = event.start.date()
                    events_by_date.setdefault(event_date, []).append(event)

                # Assign events to calendar days
                for day in calendar_days:
                    day["events"] = events_by_date.get(day["date"], [])
        except Exception as e:
            logger.warning(f"Google Calendar API error: {e}")

    # Assign scheduled tasks and date-only tasks to calendar days
    for day in calendar_days:
        day["scheduled_tasks"] = scheduled_tasks_by_date.get(day["date"], [])
        day["date_only_tasks"] = date_only_tasks_by_date.get(day["date"], [])

    # Get encryption context for base template
    encryption_ctx = await get_encryption_context(db, user.id)

    # Check if wizard should be shown
    show_wizard = not user.wizard_completed

    return templates.TemplateResponse(
        "dashboard.html",
        {
            "request": request,
            "user": user,
            "google_connected": google_token is not None,
            "domains_with_tasks": domains_with_tasks,
            "domains": domains,
            "calendar_days": calendar_days,
            "today": today,
            "timedelta": timedelta,  # For adjacent day calculations in template
            "user_prefs": user_prefs,
            "show_wizard": show_wizard,
            # Wizard-related variables
            "calendar_connected": google_token is not None,
            "todoist_connected": todoist_token is not None,
            "user_name": user.name or (user.email.split("@")[0] if user.email else ""),
            "user_email": user.email or "",
            **encryption_ctx,
        },
    )


@router.get("/api/task-list", response_class=HTMLResponse)
async def task_list_partial(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_current_user),
):
    """Return just the task list HTML for HTMX partial updates."""
    if not user:
        return HTMLResponse(status_code=401)

    today = date.today()

    # User Preferences
    prefs_service = PreferencesService(db, user.id)
    user_prefs = await prefs_service.get_preferences()

    # Native Task Loading
    task_service = TaskService(db, user.id)
    recurrence_service = RecurrenceService(db, user.id)

    # Note: Instance materialization is now handled by background task (v0.14.0)
    # No longer blocking request here

    # Get domains and tasks (use SQL filter for has_domain)
    domains = await task_service.get_domains()
    tasks = await task_service.get_tasks(status=None, top_level_only=True, has_domain=True)

    # Get next occurrence for each recurring task (date + instance ID for completion)
    next_instances: dict[int, dict] = {}
    recurring_task_ids = [t.id for t in tasks if t.is_recurring]
    if recurring_task_ids:
        instances = await recurrence_service.get_next_instances_for_tasks(recurring_task_ids)
        next_instances = {inst.task_id: {"date": inst.instance_date, "id": inst.id} for inst in instances}

    # Get today's instance completions for recurring tasks
    today_instance_completions: dict[int, datetime] = {}
    if recurring_task_ids:
        today_instances = await recurrence_service.get_instances_for_range(today, today, status=None)
        for inst in today_instances:
            if inst.status == "completed" and inst.completed_at:
                today_instance_completions[inst.task_id] = inst.completed_at

    domains_with_tasks = group_tasks_by_domain(tasks, domains, next_instances, today_instance_completions, user_prefs)

    return templates.TemplateResponse(
        "_task_list.html",
        {
            "request": request,
            "domains_with_tasks": domains_with_tasks,
        },
    )


@router.get("/api/deleted-tasks", response_class=HTMLResponse)
async def deleted_tasks_partial(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_current_user),
):
    """Return deleted tasks HTML for HTMX."""
    if not user:
        return HTMLResponse(status_code=401)

    task_service = TaskService(db, user.id)
    deleted_tasks = await task_service.get_archived_tasks()

    # Group by domain for display
    domains = await task_service.get_domains(include_archived=True)
    domains_map = {d.id: d for d in domains}

    tasks_by_domain: dict[int | None, list] = {}
    for task in deleted_tasks:
        task_item = build_native_task_item(task)
        tasks_by_domain.setdefault(task.domain_id, []).append(task_item)

    # Build domain groups
    deleted_domains_with_tasks = []
    for domain_id, task_items in tasks_by_domain.items():
        domain = domains_map.get(domain_id) if domain_id else None
        deleted_domains_with_tasks.append(
            {
                "domain": domain,
                "tasks": sorted(task_items, key=native_task_sort_key),
            }
        )

    # Sort by domain name
    deleted_domains_with_tasks.sort(key=lambda x: (x["domain"].name if x["domain"] else ""))

    # Get encryption context
    encryption_ctx = await get_encryption_context(db, user.id)

    return templates.TemplateResponse(
        "_deleted_tasks.html",
        {
            "request": request,
            "domains_with_tasks": deleted_domains_with_tasks,
            "total_count": len(deleted_tasks),
            "encryption_enabled": encryption_ctx["encryption_enabled"],
        },
    )


@router.get("/api/scheduled-tasks", response_class=HTMLResponse)
async def scheduled_tasks_partial(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_current_user),
):
    """Return scheduled tasks HTML for HTMX."""
    if not user:
        return HTMLResponse(status_code=401)

    task_service = TaskService(db, user.id)
    all_tasks = await task_service.get_tasks()

    # Filter to only scheduled tasks
    scheduled_tasks = [t for t in all_tasks if t.scheduled_date is not None]

    # Group by domain for display
    domains = await task_service.get_domains()
    domains_map = {d.id: d for d in domains}

    tasks_by_domain: dict[int | None, list] = {}
    for task in scheduled_tasks:
        task_item = build_native_task_item(task)
        tasks_by_domain.setdefault(task.domain_id, []).append(task_item)

    # Build domain groups
    scheduled_domains_with_tasks = []
    for domain_id, task_items in tasks_by_domain.items():
        domain = domains_map.get(domain_id) if domain_id else None
        scheduled_domains_with_tasks.append(
            {
                "domain": domain,
                "tasks": sorted(task_items, key=native_task_sort_key),
            }
        )

    # Sort by domain name
    scheduled_domains_with_tasks.sort(key=lambda x: (x["domain"].name if x["domain"] else ""))

    # Get encryption context
    encryption_ctx = await get_encryption_context(db, user.id)

    return templates.TemplateResponse(
        "_scheduled_tasks.html",
        {
            "request": request,
            "domains_with_tasks": scheduled_domains_with_tasks,
            "total_count": len(scheduled_tasks),
            "encryption_enabled": encryption_ctx["encryption_enabled"],
        },
    )


@router.get("/api/completed-tasks", response_class=HTMLResponse)
async def completed_tasks_partial(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_current_user),
):
    """Return completed tasks HTML for HTMX."""
    if not user:
        return HTMLResponse(status_code=401)

    task_service = TaskService(db, user.id)
    completed_tasks = await task_service.get_tasks(status="completed")

    # Group by domain for display
    domains = await task_service.get_domains()
    domains_map = {d.id: d for d in domains}

    tasks_by_domain: dict[int | None, list] = {}
    for task in completed_tasks:
        task_item = build_native_task_item(task)
        tasks_by_domain.setdefault(task.domain_id, []).append(task_item)

    # Build domain groups
    completed_domains_with_tasks = []
    for domain_id, task_items in tasks_by_domain.items():
        domain = domains_map.get(domain_id) if domain_id else None
        completed_domains_with_tasks.append(
            {
                "domain": domain,
                "tasks": sorted(task_items, key=lambda x: x["task"].completed_at or datetime.min, reverse=True),
            }
        )

    # Sort by domain name
    completed_domains_with_tasks.sort(key=lambda x: (x["domain"].name if x["domain"] else ""))

    # Get encryption context
    encryption_ctx = await get_encryption_context(db, user.id)

    return templates.TemplateResponse(
        "_completed_tasks.html",
        {
            "request": request,
            "domains_with_tasks": completed_domains_with_tasks,
            "total_count": len(completed_tasks),
            "encryption_enabled": encryption_ctx["encryption_enabled"],
        },
    )


@router.get("/thoughts", response_class=HTMLResponse)
async def thoughts(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_current_user),
):
    """Thoughts page - inbox tasks without a domain."""
    if not user:
        return RedirectResponse(url="/", status_code=303)

    task_service = TaskService(db, user.id)

    # Get tasks without a domain (inbox/thoughts) - use SQL filter
    inbox_tasks = await task_service.get_tasks(status="pending", top_level_only=True, has_domain=False)

    # Build task items for display
    task_items = [build_native_task_item(t) for t in inbox_tasks]
    task_items.sort(key=native_task_sort_key)

    # Get encryption context for base template
    encryption_ctx = await get_encryption_context(db, user.id)

    return templates.TemplateResponse(
        "thoughts.html",
        {
            "request": request,
            "user": user,
            "tasks": task_items,
            **encryption_ctx,
        },
    )


@router.get("/settings", response_class=HTMLResponse)
async def settings(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_current_user),
):
    """Settings page - domains and calendar selection."""
    if not user:
        return RedirectResponse(url="/", status_code=303)

    # Get user preferences
    prefs_service = PreferencesService(db, user.id)
    user_prefs = await prefs_service.get_preferences()

    # Get user's domains
    task_service = TaskService(db, user.id)
    domains = await task_service.get_domains()

    # Count tasks per domain (active tasks only) - use SQL filter
    active_tasks = await task_service.get_tasks(
        status=None, top_level_only=True, exclude_statuses=["deleted", "archived"]
    )
    domain_task_counts: dict[int, int] = {}
    for task in active_tasks:
        if task.domain_id:
            domain_task_counts[task.domain_id] = domain_task_counts.get(task.domain_id, 0) + 1

    google_token = (await db.execute(select(GoogleToken).where(GoogleToken.user_id == user.id))).scalar_one_or_none()
    todoist_token = (await db.execute(select(TodoistToken).where(TodoistToken.user_id == user.id))).scalar_one_or_none()

    calendars = []
    if google_token:
        try:
            selections = {
                s.calendar_id: s
                for s in (
                    await db.execute(select(GoogleCalendarSelection).where(GoogleCalendarSelection.user_id == user.id))
                )
                .scalars()
                .all()
            }

            async with GoogleCalendarClient(google_token) as client:
                all_calendars = await client.list_calendars()

            await db.commit()

            calendars = [
                {
                    "id": cal.id,
                    "summary": cal.summary,
                    "primary": cal.primary,
                    "background_color": cal.background_color,
                    "enabled": selections.get(cal.id, None) is not None and selections[cal.id].enabled,
                }
                for cal in all_calendars
            ]

            # Sort: primary first, then alphabetically
            calendars.sort(key=lambda c: (not c["primary"], c["summary"].lower()))

        except Exception as e:
            # Failed to load calendars - show empty list
            logger.warning(f"Failed to load Google calendars: {e}")

    # Get encryption context for base template
    encryption_ctx = await get_encryption_context(db, user.id)

    # Get user's passkeys for the security panel
    passkeys_result = await db.execute(
        select(UserPasskey).where(UserPasskey.user_id == user.id).order_by(UserPasskey.created_at.desc())
    )
    user_passkeys = list(passkeys_result.scalars().all())

    return templates.TemplateResponse(
        "settings.html",
        {
            "request": request,
            "user": user,
            "domains": domains,
            "domain_task_counts": domain_task_counts,
            "google_connected": google_token is not None,
            "todoist_connected": todoist_token is not None,
            "calendars": calendars,
            "user_prefs": user_prefs,
            "user_passkeys": user_passkeys,
            **encryption_ctx,
        },
    )


@router.get("/analytics", response_class=HTMLResponse)
async def analytics(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_current_user),
    days: int = 7,
):
    """Analytics page - comprehensive stats dashboard."""
    if not user:
        return RedirectResponse(url="/", status_code=303)

    # Validate days parameter (7, 30, or 90)
    if days not in (7, 30, 90):
        days = 7

    today = date.today()
    start_date = today - timedelta(days=days - 1)
    end_date = today

    analytics_service = AnalyticsService(db, user.id)

    # Get comprehensive stats for all charts
    stats = await analytics_service.get_comprehensive_stats(start_date, end_date)

    # Get recent completions for the log
    recent_completions = await analytics_service.get_recent_completions(limit=20)

    # Get encryption context for base template
    encryption_ctx = await get_encryption_context(db, user.id)

    return templates.TemplateResponse(
        "analytics.html",
        {
            "request": request,
            "user": user,
            "days": days,
            "start_date": start_date,
            "end_date": end_date,
            "stats": stats,
            "recent_completions": recent_completions,
            **encryption_ctx,
        },
    )


# -----------------------------------------------------------------------------
# Legal Pages
# -----------------------------------------------------------------------------


@router.get("/terms", response_class=HTMLResponse)
async def terms(request: Request):
    """Terms of Service page."""
    return templates.TemplateResponse("terms.html", {"request": request})


@router.get("/privacy", response_class=HTMLResponse)
async def privacy(request: Request):
    """Privacy Policy - redirects to terms page with anchor."""
    return RedirectResponse(url="/terms#privacy", status_code=302)


@router.get("/showcase", response_class=HTMLResponse)
async def showcase(request: Request):
    """UI Component Showcase - for design review."""
    return templates.TemplateResponse("showcase.html", {"request": request})
