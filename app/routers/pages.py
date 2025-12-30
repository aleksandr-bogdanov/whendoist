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

from app.database import get_db
from app.models import GoogleCalendarSelection, GoogleToken, TodoistToken, User
from app.routers.auth import get_current_user
from app.services.gcal import GoogleCalendarClient
from app.services.labels import clarity_display, parse_labels
from app.services.todoist import TodoistClient, TodoistProject, TodoistTask

logger = logging.getLogger(__name__)

router = APIRouter(tags=["pages"])
templates = Jinja2Templates(directory="app/templates")


# -----------------------------------------------------------------------------
# Helper Types
# -----------------------------------------------------------------------------

TaskItem = dict[str, Any]  # Task with metadata and subtasks
ProjectWithTasks = dict[str, Any]  # Project with its tasks


# -----------------------------------------------------------------------------
# Task Processing Helpers
# -----------------------------------------------------------------------------


def build_task_item(task: TodoistTask) -> TaskItem:
    """Create a task item dict with parsed metadata."""
    metadata = parse_labels(task.labels, task.description)
    return {
        "task": task,
        "metadata": metadata,
        "clarity_display": clarity_display(metadata.clarity),
        "subtasks": [],
    }


def build_task_hierarchy(
    tasks: list[TodoistTask],
    current_user_id: str,
) -> dict[str, TaskItem]:
    """
    Build task lookup with subtasks attached to parents.

    Filters out tasks assigned to other users.
    Calculates parent duration as sum of subtask durations.
    """
    task_lookup: dict[str, TaskItem] = {}
    subtasks_by_parent: dict[str, list[TaskItem]] = {}

    # First pass: create all task items
    for task in tasks:
        # Only include tasks assigned to current user or unassigned
        if task.assignee_id and task.assignee_id != current_user_id:
            continue

        task_item = build_task_item(task)
        task_lookup[task.id] = task_item

        if task.parent_id:
            subtasks_by_parent.setdefault(task.parent_id, []).append(task_item)

    # Second pass: attach subtasks and calculate parent durations
    for parent_id, subtasks in subtasks_by_parent.items():
        if parent_id in task_lookup:
            task_lookup[parent_id]["subtasks"] = subtasks
            # Parent duration = sum of subtask durations
            total_duration = sum(s["metadata"].duration_minutes or 0 for s in subtasks)
            if total_duration > 0:
                task_lookup[parent_id]["metadata"].duration_minutes = total_duration

    return task_lookup


def task_sort_key(task_item: TaskItem) -> tuple:
    """Sort key: priority (desc), then due datetime (asc)."""
    task = task_item["task"]
    due = task.due

    if due and due.datetime_:
        dt = due.datetime_
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        return (-task.priority, dt)

    # No datetime → sort to end
    return (-task.priority, datetime.max.replace(tzinfo=UTC))


def group_tasks_by_project(
    task_lookup: dict[str, TaskItem],
    projects_map: dict[str, TodoistProject],
) -> list[ProjectWithTasks]:
    """Group top-level tasks by project, sorted by priority/due."""
    tasks_by_project: dict[str, list[TaskItem]] = {}

    for task_item in task_lookup.values():
        # Skip subtasks (they're nested under parents)
        if task_item["task"].parent_id:
            continue

        project_id = task_item["task"].project_id
        tasks_by_project.setdefault(project_id, []).append(task_item)

    # Sort tasks and subtasks within each project
    projects_with_tasks: list[ProjectWithTasks] = []
    for project_id, project_tasks in tasks_by_project.items():
        project_tasks.sort(key=task_sort_key)
        for task_item in project_tasks:
            task_item["subtasks"].sort(key=task_sort_key)

        projects_with_tasks.append(
            {
                "project": projects_map.get(project_id),
                "tasks": project_tasks,
            }
        )

    # Sort projects alphabetically (Inbox last)
    projects_with_tasks.sort(key=lambda p: p["project"].name.lower() if p["project"] else "zzz")

    return projects_with_tasks


# -----------------------------------------------------------------------------
# Routes
# -----------------------------------------------------------------------------


@router.get("/", response_class=HTMLResponse)
async def index(
    request: Request,
    user: User | None = Depends(get_current_user),
):
    """Home page - redirect to dashboard or show login."""
    if user:
        return RedirectResponse(url="/dashboard", status_code=303)
    return templates.TemplateResponse("login.html", {"request": request})


@router.get("/dashboard", response_class=HTMLResponse)
async def dashboard(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_current_user),
):
    """Dashboard with task list grouped by project and calendar events."""
    if not user:
        return RedirectResponse(url="/", status_code=303)

    # Check API connections
    todoist_token = (await db.execute(select(TodoistToken).where(TodoistToken.user_id == user.id))).scalar_one_or_none()

    google_token = (await db.execute(select(GoogleToken).where(GoogleToken.user_id == user.id))).scalar_one_or_none()

    projects_with_tasks: list[ProjectWithTasks] = []
    scheduled_tasks_by_date: dict[date, list[dict]] = {}
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
            }
        )

    # Fetch and process Todoist tasks
    if todoist_token:
        try:
            async with TodoistClient(todoist_token.access_token) as client:
                tasks = await client.get_all_tasks()
                projects = await client.get_projects()
                current_user_id = await client.get_current_user_id()

                projects_map = {p.id: p for p in projects}
                task_lookup = build_task_hierarchy(tasks, current_user_id)
                projects_with_tasks = group_tasks_by_project(task_lookup, projects_map)

                # Collect tasks with due_datetime for calendar display
                for task in tasks:
                    if task.due and task.due.datetime_:
                        task_date = task.due.datetime_.date()
                        metadata = parse_labels(task.labels, task.description)
                        scheduled_tasks_by_date.setdefault(task_date, []).append(
                            {
                                "task": task,
                                "metadata": metadata,
                                "start": task.due.datetime_,
                                "duration_minutes": task.duration_minutes or metadata.duration_minutes or 30,
                                "clarity": metadata.clarity.value if metadata.clarity else "none",
                            }
                        )
        except Exception as e:
            # Token is invalid (likely 401) - delete it so user can reconnect
            logger.warning(f"Todoist API error, clearing token: {e}")
            await db.delete(todoist_token)
            await db.commit()
            todoist_token = None

    # Fetch Google Calendar events
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
                start_date = today - timedelta(days=7)
                end_date = today + timedelta(days=8)
                time_min = datetime.combine(start_date, datetime.min.time(), tzinfo=UTC)
                time_max = datetime.combine(end_date, datetime.min.time(), tzinfo=UTC)

                events = []
                async with GoogleCalendarClient(google_token) as client:
                    for selection in selections:
                        try:
                            cal_events = await client.get_events(selection.calendar_id, time_min, time_max)
                            events.extend(cal_events)
                        except Exception as e:
                            # Skip calendars that fail (might have been deleted or permissions changed)
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
            # Google API error - log but continue without events
            logger.warning(f"Google Calendar API error: {e}")

    # Assign scheduled Todoist tasks to calendar days
    for day in calendar_days:
        day["scheduled_tasks"] = scheduled_tasks_by_date.get(day["date"], [])

    return templates.TemplateResponse(
        "dashboard.html",
        {
            "request": request,
            "user": user,
            "todoist_connected": todoist_token is not None,
            "google_connected": google_token is not None,
            "projects_with_tasks": projects_with_tasks,
            "calendar_days": calendar_days,
            "today": today,
        },
    )


@router.get("/settings", response_class=HTMLResponse)
async def settings(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_current_user),
):
    """Settings page - Google Calendar selection."""
    if not user:
        return RedirectResponse(url="/", status_code=303)

    todoist_token = (await db.execute(select(TodoistToken).where(TodoistToken.user_id == user.id))).scalar_one_or_none()

    google_token = (await db.execute(select(GoogleToken).where(GoogleToken.user_id == user.id))).scalar_one_or_none()

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
            "todoist_connected": todoist_token is not None,
            "google_connected": google_token is not None,
            "calendars": calendars,
        },
    )
