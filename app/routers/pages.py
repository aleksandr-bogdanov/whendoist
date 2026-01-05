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
from app.models import Domain, GoogleCalendarSelection, GoogleToken, Task, TodoistToken, User
from app.routers.auth import get_current_user
from app.services.gcal import GoogleCalendarClient
from app.services.labels import Clarity, clarity_display
from app.services.recurrence_service import RecurrenceService
from app.services.task_service import TaskService

logger = logging.getLogger(__name__)

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


def build_native_task_item(task: Task, next_instances: dict[int, date] | None = None) -> TaskItem:
    """Create a task item dict from native Task model."""
    import contextlib

    # Map clarity string to Clarity enum for display
    clarity = None
    if task.clarity:
        with contextlib.suppress(ValueError):
            clarity = Clarity(task.clarity)

    # Get next occurrence for recurring tasks
    next_occurrence = None
    if task.is_recurring and next_instances:
        next_occurrence = next_instances.get(task.id)

    # Only access subtasks if already eagerly loaded (avoids lazy loading in async context)
    subtasks = []
    if "subtasks" in sa_inspect(task).dict:
        subtasks = [build_native_task_item(s, next_instances) for s in (task.subtasks or [])]

    return {
        "task": task,
        "clarity_display": clarity_display(clarity),
        "next_occurrence": next_occurrence,
        "subtasks": subtasks,
    }


def native_task_sort_key(task_item: TaskItem) -> tuple:
    """Sort key: impact (asc = highest first), then position."""
    task = task_item["task"]
    return (task.impact, task.position, task.created_at)


def group_tasks_by_domain(
    tasks: list[Task],
    domains: list[Domain],
    next_instances: dict[int, date] | None = None,
) -> list[DomainWithTasks]:
    """Group tasks by domain, sorted by impact."""
    domains_map = {d.id: d for d in domains}
    tasks_by_domain: dict[int | None, list[TaskItem]] = {}

    for task in tasks:
        task_item = build_native_task_item(task, next_instances)
        domain_id = task.domain_id
        tasks_by_domain.setdefault(domain_id, []).append(task_item)

    # Sort tasks within each domain
    domains_with_tasks: list[DomainWithTasks] = []

    # First add domains that have tasks
    for domain_id, domain_tasks in tasks_by_domain.items():
        domain_tasks.sort(key=native_task_sort_key)
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
    """Home page - redirect to thoughts or show login."""
    if user:
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

    # Check Google connection (Todoist no longer required for native tasks)
    google_token = (await db.execute(select(GoogleToken).where(GoogleToken.user_id == user.id))).scalar_one_or_none()

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
    # Native Task Loading
    # ==========================================================================
    task_service = TaskService(db, user.id)
    recurrence_service = RecurrenceService(db, user.id)

    # Ensure recurring task instances are materialized
    await recurrence_service.ensure_instances_materialized()

    # Get domains and tasks (exclude inbox/thoughts - tasks without domain)
    domains = await task_service.get_domains()
    all_tasks = await task_service.get_tasks(status="pending", top_level_only=True)
    tasks = [t for t in all_tasks if t.domain_id is not None]

    # Get next occurrence date for each recurring task
    next_instances: dict[int, date] = {}
    recurring_task_ids = [t.id for t in tasks if t.is_recurring]
    if recurring_task_ids:
        instances = await recurrence_service.get_next_instances_for_tasks(recurring_task_ids)
        next_instances = {inst.task_id: inst.instance_date for inst in instances}

    domains_with_tasks = group_tasks_by_domain(tasks, domains, next_instances)

    # Get scheduled tasks for calendar display
    start_date = today - timedelta(days=7)
    end_date = today + timedelta(days=8)

    scheduled_tasks_by_date: dict[date, list[dict]] = {}

    # Separate date-only tasks from time-scheduled tasks
    date_only_tasks_by_date: dict[date, list[dict]] = {}

    # Non-recurring scheduled tasks
    scheduled_tasks = await task_service.get_scheduled_tasks_for_range(start_date, end_date)
    for task in scheduled_tasks:
        if task.scheduled_date:
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
                    }
                )

    # Recurring task instances
    instances = await recurrence_service.get_instances_for_range(start_date, end_date, status="pending")
    for instance in instances:
        # Check if instance has a specific time
        has_time = instance.scheduled_datetime is not None or instance.task.scheduled_time is not None
        if has_time:
            instance_datetime = instance.scheduled_datetime or datetime.combine(
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
                }
            )

    # ==========================================================================
    # Google Calendar Events
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

    # Get tasks without a domain (inbox/thoughts)
    all_tasks = await task_service.get_tasks(status="pending", top_level_only=True)
    inbox_tasks = [t for t in all_tasks if t.domain_id is None]

    # Build task items for display
    task_items = [build_native_task_item(t) for t in inbox_tasks]
    task_items.sort(key=native_task_sort_key)

    return templates.TemplateResponse(
        "thoughts.html",
        {
            "request": request,
            "user": user,
            "tasks": task_items,
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

    # Get user's domains
    task_service = TaskService(db, user.id)
    domains = await task_service.get_domains()

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

    return templates.TemplateResponse(
        "settings.html",
        {
            "request": request,
            "user": user,
            "domains": domains,
            "google_connected": google_token is not None,
            "todoist_connected": todoist_token is not None,
            "calendars": calendars,
        },
    )
