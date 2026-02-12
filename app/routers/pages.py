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
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import __version__
from app.config import get_settings
from app.constants import get_user_today
from app.database import get_db
from app.middleware.csrf import get_csrf_token
from app.models import (
    GoogleCalendarSelection,
    GoogleToken,
    TodoistToken,
    User,
    UserPasskey,
    UserPreferences,
)
from app.routers.auth import get_current_user
from app.services.analytics_service import AnalyticsService
from app.services.calendar_cache import get_calendar_cache
from app.services.demo_service import DemoService
from app.services.gcal import GoogleCalendarClient
from app.services.preferences_service import PreferencesService
from app.services.recurrence_service import RecurrenceService
from app.services.task_grouping import build_native_task_item, group_tasks_by_domain
from app.services.task_service import TaskService
from app.services.task_sorting import native_task_sort_key

logger = logging.getLogger(__name__)


async def get_encryption_context(db: AsyncSession, user_id: int) -> dict[str, Any]:
    """Get encryption and user preference settings for template context."""
    from sqlalchemy import func

    result = await db.execute(select(UserPreferences).where(UserPreferences.user_id == user_id))
    prefs = result.scalar_one_or_none()

    # Count passkeys for this user
    passkey_count_result = await db.execute(select(func.count(UserPasskey.id)).where(UserPasskey.user_id == user_id))
    passkey_count = passkey_count_result.scalar() or 0

    # Base context with timezone (always included)
    base_context = {
        "user_timezone": prefs.timezone if prefs else "",
    }

    if prefs and prefs.encryption_enabled:
        return {
            **base_context,
            "encryption_enabled": True,
            "encryption_salt": prefs.encryption_salt,
            "encryption_test_value": prefs.encryption_test_value,
            "has_passkeys": passkey_count > 0,
            "passkey_count": passkey_count,
            "unlock_method": prefs.encryption_unlock_method or "passphrase",
        }
    return {
        **base_context,
        "encryption_enabled": False,
        "encryption_salt": None,
        "encryption_test_value": None,
        "has_passkeys": False,
        "passkey_count": 0,
        "unlock_method": None,
    }


router = APIRouter(tags=["pages"])
templates = Jinja2Templates(directory="app/templates")


def render_template(request: Request, template_name: str, context: dict) -> HTMLResponse:
    """
    Render a template with CSRF token automatically included.

    This wrapper ensures all templates have access to the csrf_token variable.
    """
    # Add CSRF token and version to context
    context["csrf_token"] = get_csrf_token(request)
    context["app_version"] = __version__
    context["request"] = request
    return templates.TemplateResponse(template_name, context)


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
    return render_template(request, "login.html", {"demo_login_enabled": get_settings().demo_login_enabled})


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

    # Get user's timezone for "today" calculations
    prefs_service = PreferencesService(db, user.id)
    timezone = await prefs_service.get_timezone()
    today = get_user_today(timezone)

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
    # Flat view: load all tasks (parents + subtasks) for hierarchy display
    domains = await task_service.get_domains()
    tasks = await task_service.get_tasks(status=None, top_level_only=False, include_subtasks=False, has_domain=True)

    # Compute subtask counts for parent task badges
    subtask_counts: dict[int, int] = {}
    for task in tasks:
        if task.parent_id:
            subtask_counts[task.parent_id] = subtask_counts.get(task.parent_id, 0) + 1

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

    grouped = group_tasks_by_domain(
        tasks, domains, next_instances, today_instance_completions, user_prefs, subtask_counts
    )

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
    # Get the user's Whendoist sync calendar ID to filter out duplicates
    gcal_sync_calendar_id = user_prefs.gcal_sync_calendar_id if user_prefs else None

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
                    async with GoogleCalendarClient(db, google_token) as client:
                        for selection in selections:
                            try:
                                cal_events = await client.get_events(selection.calendar_id, time_min, time_max)
                                events.extend(cal_events)
                            except Exception as e:
                                logger.debug(f"Failed to fetch calendar {selection.calendar_id}: {e}")
                                continue

                    # Token refresh commits internally; no explicit commit needed here
                    events.sort(key=lambda e: e.start)

                    # Store in cache
                    cache.set(user.id, calendar_ids, start_date, end_date, events)

                # Filter out events from the Whendoist sync calendar to avoid duplicates
                if gcal_sync_calendar_id:
                    events = [e for e in events if e.calendar_id != gcal_sync_calendar_id]

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

    return render_template(
        request,
        "dashboard.html",
        {
            "user": user,
            "google_connected": google_token is not None,
            "domain_groups": grouped["domain_groups"],
            "scheduled_tasks": grouped["scheduled_tasks"],
            "completed_tasks": grouped["completed_tasks"],
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
            "is_demo_user": DemoService.is_demo_user(user.email),
            **encryption_ctx,
        },
    )


@router.get("/api/v1/task-list", response_class=HTMLResponse)
async def task_list_partial(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_current_user),
):
    """Return just the task list HTML for HTMX partial updates."""
    if not user:
        return HTMLResponse(status_code=401)

    # User Preferences
    prefs_service = PreferencesService(db, user.id)
    user_prefs = await prefs_service.get_preferences()
    timezone = user_prefs.timezone
    today = get_user_today(timezone)

    # Native Task Loading
    task_service = TaskService(db, user.id)
    recurrence_service = RecurrenceService(db, user.id, timezone=timezone)

    # Note: Instance materialization is now handled by background task (v0.14.0)
    # No longer blocking request here

    # Get domains and tasks - flat view with hierarchy metadata
    domains = await task_service.get_domains()
    tasks = await task_service.get_tasks(status=None, top_level_only=False, include_subtasks=False, has_domain=True)

    # Compute subtask counts for parent task badges
    subtask_counts: dict[int, int] = {}
    for task in tasks:
        if task.parent_id:
            subtask_counts[task.parent_id] = subtask_counts.get(task.parent_id, 0) + 1

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

    grouped = group_tasks_by_domain(
        tasks, domains, next_instances, today_instance_completions, user_prefs, subtask_counts
    )

    return render_template(
        request,
        "_task_list.html",
        {
            "domain_groups": grouped["domain_groups"],
            "scheduled_tasks": grouped["scheduled_tasks"],
            "completed_tasks": grouped["completed_tasks"],
            "today": today,
            "user_prefs": user_prefs,
        },
    )


@router.get("/api/v1/deleted-tasks", response_class=HTMLResponse)
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

    return render_template(
        request,
        "_deleted_tasks.html",
        {
            "domains_with_tasks": deleted_domains_with_tasks,
            "total_count": len(deleted_tasks),
            "encryption_enabled": encryption_ctx["encryption_enabled"],
        },
    )


@router.get("/api/v1/scheduled-tasks", response_class=HTMLResponse)
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

    return render_template(
        request,
        "_scheduled_tasks.html",
        {
            "domains_with_tasks": scheduled_domains_with_tasks,
            "total_count": len(scheduled_tasks),
            "encryption_enabled": encryption_ctx["encryption_enabled"],
        },
    )


@router.get("/api/v1/completed-tasks", response_class=HTMLResponse)
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

    return render_template(
        request,
        "_completed_tasks.html",
        {
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

    # Build task items sorted by created_at ASC (oldest first = chat order)
    task_items = [build_native_task_item(t) for t in inbox_tasks]
    task_items.sort(key=lambda t: t["task"].created_at)

    # Group by date in user timezone
    prefs_service = PreferencesService(db, user.id)
    timezone = await prefs_service.get_timezone()
    today = get_user_today(timezone)
    yesterday = today - timedelta(days=1)

    from zoneinfo import ZoneInfo

    try:
        tz = ZoneInfo(timezone) if timezone else ZoneInfo("UTC")
    except (KeyError, TypeError):
        tz = ZoneInfo("UTC")

    thought_groups: list[dict[str, Any]] = []
    current_label: str | None = None
    current_items: list[dict] = []

    for item in task_items:
        created = item["task"].created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=UTC)
        item_date = created.astimezone(tz).date()

        if item_date == today:
            label = "Today"
        elif item_date == yesterday:
            label = "Yesterday"
        else:
            label = item_date.strftime("%b %-d")

        if label != current_label:
            if current_items:
                thought_groups.append({"label": current_label, "items": current_items})
            current_label = label
            current_items = [item]
        else:
            current_items.append(item)

    if current_items:
        thought_groups.append({"label": current_label, "items": current_items})

    # Get encryption context for base template
    encryption_ctx = await get_encryption_context(db, user.id)

    return render_template(
        request,
        "thoughts.html",
        {
            "user": user,
            "thought_groups": thought_groups,
            "total_count": len(task_items),
            "is_demo_user": DemoService.is_demo_user(user.email),
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

            async with GoogleCalendarClient(db, google_token) as client:
                all_calendars = await client.list_calendars()

            # Token refresh commits internally; no explicit commit needed here

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

    return render_template(
        request,
        "settings.html",
        {
            "user": user,
            "domains": domains,
            "domain_task_counts": domain_task_counts,
            "google_connected": google_token is not None,
            "todoist_connected": todoist_token is not None,
            "calendars": calendars,
            "user_prefs": user_prefs,
            "user_passkeys": user_passkeys,
            "is_demo_user": DemoService.is_demo_user(user.email),
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

    # Get user's timezone for "today" calculations
    prefs_service = PreferencesService(db, user.id)
    timezone = await prefs_service.get_timezone()
    today = get_user_today(timezone)
    start_date = today - timedelta(days=days - 1)
    end_date = today

    analytics_service = AnalyticsService(db, user.id)

    # Get comprehensive stats for all charts
    stats = await analytics_service.get_comprehensive_stats(start_date, end_date)

    # Get recent completions for the log
    recent_completions = await analytics_service.get_recent_completions(limit=20)

    # Get encryption context for base template
    encryption_ctx = await get_encryption_context(db, user.id)

    return render_template(
        request,
        "analytics.html",
        {
            "user": user,
            "days": days,
            "start_date": start_date,
            "end_date": end_date,
            "stats": stats,
            "recent_completions": recent_completions,
            "is_demo_user": DemoService.is_demo_user(user.email),
            **encryption_ctx,
        },
    )


# -----------------------------------------------------------------------------
# Legal Pages
# -----------------------------------------------------------------------------


@router.get("/terms", response_class=HTMLResponse)
async def terms(request: Request):
    """Terms of Service page."""
    return render_template(request, "terms.html", {})


@router.get("/privacy", response_class=HTMLResponse)
async def privacy(request: Request):
    """Privacy Policy - redirects to terms page with anchor."""
    return RedirectResponse(url="/terms#privacy", status_code=302)


@router.get("/showcase", response_class=HTMLResponse)
async def showcase(request: Request):
    """UI Component Showcase - for design review."""
    return render_template(request, "showcase.html", {})


@router.get("/mockups", response_class=HTMLResponse)
async def mobile_mockups(request: Request):
    """Mobile layout mockups - for testing layout options on phone."""
    return render_template(request, "mobile-mockups.html", {})
