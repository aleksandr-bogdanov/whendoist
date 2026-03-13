"""
MCP (Model Context Protocol) server for whendoist.

Exposes task management tools over the MCP HTTP transport.
Mounted as an ASGI sub-app at /mcp in the main FastAPI application.

Authentication: Bearer tokens (same as device auth / OAuth).
User context: Passed via contextvars, set by auth middleware.
"""

import contextvars
import json
import logging
from datetime import date, timedelta
from typing import Any

from mcp.server.fastmcp import FastMCP
from sqlalchemy import select
from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.responses import JSONResponse
from starlette.routing import Mount
from starlette.types import ASGIApp, Receive, Scope, Send

from app.database import async_session_factory
from app.models import UserPreferences
from app.routers.device_auth import verify_access_token
from app.services.task_service import TaskService

logger = logging.getLogger("whendoist.mcp")

# Context variable for the authenticated user ID
_current_user_id: contextvars.ContextVar[int] = contextvars.ContextVar("mcp_user_id")

IMPACT_LABELS = {1: "high", 2: "mid", 3: "low", 4: "minimal"}
CLARITY_ICONS = {"autopilot": "\U0001f9df", "normal": "\u2615", "brainstorm": "\U0001f9e0"}


# =============================================================================
# Auth Middleware
# =============================================================================


class MCPAuthMiddleware:
    """ASGI middleware that validates Bearer tokens and sets user context."""

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Extract Authorization header
        headers = dict(scope.get("headers", []))
        auth_value = headers.get(b"authorization", b"").decode()

        if not auth_value.startswith("Bearer "):
            response = JSONResponse(
                {"error": "unauthorized", "error_description": "Bearer token required"},
                status_code=401,
                headers={"WWW-Authenticate": "Bearer"},
            )
            await response(scope, receive, send)
            return

        token = auth_value[7:]
        user_id = verify_access_token(token)

        if not user_id:
            response = JSONResponse(
                {"error": "invalid_token", "error_description": "Token expired or invalid"},
                status_code=401,
                headers={"WWW-Authenticate": 'Bearer error="invalid_token"'},
            )
            await response(scope, receive, send)
            return

        # Set user context for MCP tools
        token_var = _current_user_id.set(user_id)
        try:
            await self.app(scope, receive, send)
        finally:
            _current_user_id.reset(token_var)


# =============================================================================
# Helpers
# =============================================================================


def _get_user_id() -> int:
    """Get the authenticated user ID from context."""
    try:
        return _current_user_id.get()
    except LookupError:
        raise RuntimeError("No authenticated user in MCP context") from None


def _format_task(t: dict) -> str:
    """Format a single task as a readable line."""
    flags: list[str] = []
    impact = t.get("impact", 4)
    if impact <= 2:
        flags.append(f"!{IMPACT_LABELS.get(impact, '?')}")
    clarity = t.get("clarity")
    if clarity and clarity != "normal":
        flags.append(CLARITY_ICONS.get(clarity, clarity) or clarity)
    if t.get("duration_minutes"):
        flags.append(f"{t['duration_minutes']}m")
    if t.get("domain_name"):
        flags.append(f"#{t['domain_name']}")

    status_mark = "x" if t.get("status") == "completed" else " "
    line = f"[{status_mark}] [id:{t['id']}] {t['title']}"
    if flags:
        line += f"  ({', '.join(flags)})"
    if t.get("scheduled_date"):
        sched = str(t["scheduled_date"])
        if t.get("scheduled_time"):
            sched += f" {t['scheduled_time']}"
        line += f"  -> {sched}"
    if t.get("description"):
        desc = str(t["description"])[:80]
        if len(str(t["description"])) > 80:
            desc += "..."
        line += f"\n     {desc}"
    if t.get("subtasks"):
        for sub in t["subtasks"]:
            sub_mark = "x" if sub.get("status") == "completed" else " "
            line += f"\n   [{sub_mark}] [id:{sub['id']}] {sub['title']}"
    return line


def _task_to_dict(task: Any, domain_name: str | None = None) -> dict:
    """Convert a Task ORM object to a dict for formatting."""
    d: dict[str, Any] = {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "domain_id": task.domain_id,
        "domain_name": domain_name or (task.domain.name if task.domain else None),
        "impact": task.impact,
        "clarity": task.clarity,
        "duration_minutes": task.duration_minutes,
        "scheduled_date": task.scheduled_date,
        "scheduled_time": task.scheduled_time,
        "status": task.status,
        "is_recurring": task.is_recurring,
        "completed_at": task.completed_at,
    }
    if hasattr(task, "subtasks") and task.subtasks:
        d["subtasks"] = [{"id": s.id, "title": s.title, "status": s.status} for s in task.subtasks]
    return d


def _instance_to_dict(inst: Any) -> dict:
    """Convert a TaskInstance ORM object to a dict."""
    return {
        "id": inst.id,
        "task_id": inst.task_id,
        "task_title": inst.task.title if inst.task else "Recurring task",
        "instance_date": inst.instance_date,
        "status": inst.status,
        "duration_minutes": inst.task.duration_minutes if inst.task else None,
        "impact": inst.task.impact if inst.task else 4,
        "clarity": inst.task.clarity if inst.task else None,
        "domain_name": inst.task.domain.name if inst.task and inst.task.domain else None,
    }


def _format_instance(inst: dict) -> str:
    """Format a recurring task instance."""
    mark = "x" if inst["status"] == "completed" else "s" if inst["status"] == "skipped" else " "
    line = f"[{mark}] [inst:{inst['id']}] {inst.get('task_title', 'Recurring task')}"
    if inst.get("instance_date"):
        line += f"  -> {inst['instance_date']}"
    return line


async def _check_encryption(user_id: int) -> str | None:
    """Check if user has E2E encryption enabled. Returns error message or None."""
    async with async_session_factory() as db:
        result = await db.execute(select(UserPreferences.encryption_enabled).where(UserPreferences.user_id == user_id))
        enabled = result.scalar_one_or_none()
        if enabled:
            return (
                "E2E encryption is enabled on your account. MCP tools cannot read or write "
                "encrypted data (task titles, descriptions, domain names are ciphertext on the server). "
                "Disable E2E encryption in whendoist Settings to use MCP integration."
            )
    return None


# =============================================================================
# MCP Server
# =============================================================================

mcp = FastMCP(
    "whendoist",
    instructions=(
        "Whendoist task management. Use these tools to read, create, update, and complete tasks. "
        "Tasks have domains (projects/life areas), impact levels (1=high to 4=minimal), "
        "clarity/energy modes (autopilot, normal, brainstorm), optional scheduling (date + time), "
        "and duration estimates in minutes."
    ),
)


# =============================================================================
# Tier 1 Tools
# =============================================================================


@mcp.tool()
async def list_tasks(
    domain: str | None = None,
    status: str = "pending",
    scheduled_date: str | None = None,
    clarity: str | None = None,
    impact: int | None = None,
    is_recurring: bool | None = None,
    limit: int = 50,
) -> str:
    """List tasks from whendoist with optional filters.

    Args:
        domain: Filter by domain name (e.g. "Housing", "Health"). Case-insensitive.
        status: Task status: pending (default), completed, archived.
        scheduled_date: Filter by exact date (YYYY-MM-DD).
        clarity: Energy mode filter: autopilot, normal, brainstorm.
        impact: Priority filter: 1=high, 2=mid, 3=low, 4=minimal.
        is_recurring: Filter recurring (true) or one-off (false) tasks.
        limit: Max results, default 50.
    """
    user_id = _get_user_id()
    enc_error = await _check_encryption(user_id)
    if enc_error:
        return enc_error

    async with async_session_factory() as db:
        svc = TaskService(db, user_id)

        # Resolve domain name to ID
        domain_id = None
        if domain:
            domains = await svc.get_domains(include_archived=True)
            match = next((d for d in domains if d.name.lower() == domain.lower()), None)
            if not match:
                available = ", ".join(d.name for d in domains if not d.is_archived)
                return f"Domain '{domain}' not found. Available: {available}"
            domain_id = match.id

        from datetime import date as date_type

        parsed_date = date_type.fromisoformat(scheduled_date) if scheduled_date else None

        tasks = await svc.get_tasks(
            status=status,
            domain_id=domain_id,
            scheduled_date=parsed_date,
            clarity=clarity,
            is_recurring=is_recurring,
            limit=limit,
        )

        # Client-side impact filter (not supported by service)
        if impact is not None:
            tasks = [t for t in tasks if t.impact == impact]

        if not tasks:
            return "No tasks found matching filters."

        lines = [_format_task(_task_to_dict(t)) for t in tasks]
        return f"{len(tasks)} task(s):\n\n" + "\n".join(lines)


@mcp.tool()
async def create_task(
    title: str,
    domain: str | None = None,
    impact: int = 4,
    clarity: str = "normal",
    duration_minutes: int | None = None,
    scheduled_date: str | None = None,
    scheduled_time: str | None = None,
    description: str | None = None,
    parent_id: int | None = None,
) -> str:
    """Create a new task in whendoist.

    Args:
        title: Task title (required).
        domain: Domain name (e.g. "Health", "Housing"). Resolved to ID automatically.
        impact: Priority: 1=high, 2=mid, 3=low, 4=minimal (default).
        clarity: Energy mode: autopilot, normal (default), brainstorm.
        duration_minutes: Estimated time in minutes (1-1440).
        scheduled_date: When to do it (YYYY-MM-DD).
        scheduled_time: What time (HH:MM, 24h format). Requires scheduled_date.
        description: Optional notes/details.
        parent_id: ID of parent task to create this as a subtask.
    """
    user_id = _get_user_id()
    enc_error = await _check_encryption(user_id)
    if enc_error:
        return enc_error

    async with async_session_factory() as db:
        svc = TaskService(db, user_id)

        domain_id = None
        if domain:
            domains = await svc.get_domains(include_archived=True)
            match = next((d for d in domains if d.name.lower() == domain.lower()), None)
            if match:
                domain_id = match.id
            else:
                available = ", ".join(d.name for d in domains if not d.is_archived)
                return f"Domain '{domain}' not found. Available: {available}"

        # Parse date/time strings
        from datetime import date as date_type
        from datetime import time as time_type

        parsed_date = None
        if scheduled_date:
            parsed_date = date_type.fromisoformat(scheduled_date)

        parsed_time = None
        if scheduled_time:
            parsed_time = time_type.fromisoformat(scheduled_time)

        task = await svc.create_task(
            title=title,
            domain_id=domain_id,
            parent_id=parent_id,
            impact=impact,
            clarity=clarity,
            duration_minutes=duration_minutes,
            scheduled_date=parsed_date,
            scheduled_time=parsed_time,
            description=description,
        )
        await db.commit()

        domain_name = ""
        if task.domain:
            domain_name = f" in #{task.domain.name}"
        return f"Created task [id:{task.id}]: {task.title}{domain_name}"


@mcp.tool()
async def complete_task(task_id: int) -> str:
    """Mark a task as completed.

    Args:
        task_id: The task ID to complete.
    """
    user_id = _get_user_id()

    async with async_session_factory() as db:
        svc = TaskService(db, user_id)
        task = await svc.complete_task(task_id)
        if not task:
            return f"Task {task_id} not found or not owned by you."
        await db.commit()
        return f"Completed task [id:{task_id}]: {task.title}"


@mcp.tool()
async def list_domains() -> str:
    """List all domains (projects/life areas) in whendoist."""
    user_id = _get_user_id()
    enc_error = await _check_encryption(user_id)
    if enc_error:
        return enc_error

    async with async_session_factory() as db:
        svc = TaskService(db, user_id)
        domains = await svc.get_domains(include_archived=True)

        if not domains:
            return "No domains found."

        lines = []
        for d in domains:
            archived = " (archived)" if d.is_archived else ""
            lines.append(f"- [id:{d.id}] {d.name}{archived}")

        return f"{len(domains)} domain(s):\n\n" + "\n".join(lines)


@mcp.tool()
async def get_schedule(
    date_from: str | None = None,
    date_to: str | None = None,
) -> str:
    """Get scheduled tasks and recurring instances for a date range.

    Defaults to today if no dates given.

    Args:
        date_from: Start date (YYYY-MM-DD). Defaults to today.
        date_to: End date (YYYY-MM-DD). Defaults to same as date_from.
    """
    user_id = _get_user_id()
    enc_error = await _check_encryption(user_id)
    if enc_error:
        return enc_error

    from datetime import date as date_type

    if not date_from:
        date_from = date.today().isoformat()
    if not date_to:
        date_to = date_from

    async with async_session_factory() as db:
        svc = TaskService(db, user_id)

        # Get one-off tasks scheduled for the date range
        tasks = await svc.get_tasks(
            status="pending",
            scheduled_date=date_type.fromisoformat(date_from),
            is_recurring=False,
            limit=100,
        )

        # Get recurring instances
        from sqlalchemy.orm import selectinload

        from app.models import Task, TaskInstance

        instance_query = (
            select(TaskInstance)
            .where(
                TaskInstance.user_id == user_id,
                TaskInstance.status == "pending",
                TaskInstance.instance_date >= date_type.fromisoformat(date_from),
                TaskInstance.instance_date <= date_type.fromisoformat(date_to),
            )
            .options(selectinload(TaskInstance.task).selectinload(Task.domain))
            .order_by(TaskInstance.instance_date)
            .limit(100)
        )
        result = await db.execute(instance_query)
        instances = list(result.scalars().all())

    lines: list[str] = []
    if date_from == date_to:
        lines.append(f"Schedule for {date_from}:")
    else:
        lines.append(f"Schedule for {date_from} -> {date_to}:")

    if tasks:
        lines.append(f"\n--- Tasks ({len(tasks)}) ---")
        for t in tasks:
            lines.append(_format_task(_task_to_dict(t)))

    if instances:
        lines.append(f"\n--- Recurring ({len(instances)}) ---")
        for inst in instances:
            lines.append(_format_instance(_instance_to_dict(inst)))

    if not tasks and not instances:
        lines.append("\nNothing scheduled.")

    return "\n".join(lines)


# =============================================================================
# Tier 2 Tools
# =============================================================================


@mcp.tool()
async def update_task(
    task_id: int,
    title: str | None = None,
    domain: str | None = None,
    impact: int | None = None,
    clarity: str | None = None,
    duration_minutes: int | None = None,
    scheduled_date: str | None = None,
    scheduled_time: str | None = None,
    description: str | None = None,
) -> str:
    """Update an existing task. Only provided fields are changed.

    Args:
        task_id: The task ID to update (required).
        title: New title.
        domain: New domain name (resolved to ID).
        impact: New priority: 1=high, 2=mid, 3=low, 4=minimal.
        clarity: New energy mode: autopilot, normal, brainstorm.
        duration_minutes: New time estimate in minutes.
        scheduled_date: New date (YYYY-MM-DD), or empty string to clear.
        scheduled_time: New time (HH:MM), or empty string to clear.
        description: New description/notes.
    """
    user_id = _get_user_id()
    enc_error = await _check_encryption(user_id)
    if enc_error:
        return enc_error

    async with async_session_factory() as db:
        svc = TaskService(db, user_id)

        kwargs: dict[str, Any] = {}
        if title is not None:
            kwargs["title"] = title
        if impact is not None:
            kwargs["impact"] = impact
        if clarity is not None:
            kwargs["clarity"] = clarity
        if duration_minutes is not None:
            kwargs["duration_minutes"] = duration_minutes
        if description is not None:
            kwargs["description"] = description

        if domain is not None:
            domains = await svc.get_domains(include_archived=True)
            match = next((d for d in domains if d.name.lower() == domain.lower()), None)
            if match:
                kwargs["domain_id"] = match.id
            else:
                return f"Domain '{domain}' not found."

        if scheduled_date is not None:
            from datetime import date as date_type

            kwargs["scheduled_date"] = date_type.fromisoformat(scheduled_date) if scheduled_date else None

        if scheduled_time is not None:
            from datetime import time as time_type

            kwargs["scheduled_time"] = time_type.fromisoformat(scheduled_time) if scheduled_time else None

        if not kwargs:
            return "Nothing to update -- provide at least one field."

        task = await svc.update_task(task_id, **kwargs)
        if not task:
            return f"Task {task_id} not found or not owned by you."
        await db.commit()
        return f"Updated task [id:{task_id}]: {task.title}"


@mcp.tool()
async def get_overdue() -> str:
    """Get overdue tasks and recurring instances past their scheduled date."""
    user_id = _get_user_id()
    enc_error = await _check_encryption(user_id)
    if enc_error:
        return enc_error

    today = date.today()

    async with async_session_factory() as db:
        svc = TaskService(db, user_id)

        # Get all pending tasks, filter overdue client-side
        tasks = await svc.get_tasks(status="pending", limit=200)
        overdue = [t for t in tasks if t.scheduled_date and t.scheduled_date < today]

        # Count pending past instances
        from sqlalchemy import func

        from app.models import TaskInstance

        result = await db.execute(
            select(func.count()).where(
                TaskInstance.user_id == user_id,
                TaskInstance.status == "pending",
                TaskInstance.instance_date < today,
            )
        )
        past_instance_count = result.scalar() or 0

    lines = [f"Overdue summary as of {today.isoformat()}:"]

    if overdue:
        lines.append(f"\n--- Overdue tasks ({len(overdue)}) ---")
        for t in sorted(overdue, key=lambda x: x.scheduled_date or today):
            lines.append(_format_task(_task_to_dict(t)))

    if past_instance_count > 0:
        lines.append(f"\n--- Past recurring instances: {past_instance_count} pending ---")

    if not overdue and past_instance_count == 0:
        lines.append("\nAll caught up! Nothing overdue.")

    return "\n".join(lines)


@mcp.tool()
async def get_analytics() -> str:
    """Get task completion analytics: streaks, velocity, domain breakdown."""
    user_id = _get_user_id()

    async with async_session_factory() as db:
        from app.constants import get_user_today
        from app.services.analytics_service import AnalyticsService
        from app.services.preferences_service import PreferencesService

        prefs_svc = PreferencesService(db, user_id)
        timezone = await prefs_svc.get_timezone()
        end_date = get_user_today(timezone)
        start_date = end_date - timedelta(days=30)

        svc = AnalyticsService(db, user_id, timezone=timezone)
        data = await svc.get_comprehensive_stats(start_date, end_date)

    lines = ["Analytics (last 30 days):"]

    if data.get("streaks"):
        s = data["streaks"]
        lines.append(f"\nStreaks: current={s.get('current', 0)} days, best={s.get('best', 0)} days")

    if "total_completed" in data:
        lines.append(f"Total completed: {data['total_completed']}")
    if "total_pending" in data:
        lines.append(f"Total pending: {data['total_pending']}")

    if data.get("by_domain"):
        lines.append("\nBy domain:")
        for entry in data["by_domain"]:
            lines.append(f"  {entry.get('name', 'No domain')}: {entry.get('count', 0)} completed")

    if data.get("impact_distribution"):
        lines.append("\nBy impact:")
        for entry in data["impact_distribution"]:
            label = IMPACT_LABELS.get(entry.get("impact"), "?")
            lines.append(f"  {label}: {entry.get('count', 0)}")

    return "\n".join(lines)


@mcp.tool()
async def search_tasks(query: str, include_completed: bool = False) -> str:
    """Search tasks by title keyword.

    Args:
        query: Search term to match against task titles.
        include_completed: Also search completed tasks (default: false).
    """
    user_id = _get_user_id()
    enc_error = await _check_encryption(user_id)
    if enc_error:
        return enc_error

    query_lower = query.lower()
    all_matches: list[dict] = []

    async with async_session_factory() as db:
        svc = TaskService(db, user_id)

        for status in ["pending"] + (["completed"] if include_completed else []):
            tasks = await svc.get_tasks(status=status, limit=200)
            matches = [_task_to_dict(t) for t in tasks if query_lower in t.title.lower()]
            all_matches.extend(matches)

    if not all_matches:
        return f"No tasks matching '{query}'."

    lines = [_format_task(t) for t in all_matches]
    return f"{len(all_matches)} task(s) matching '{query}':\n\n" + "\n".join(lines)


# =============================================================================
# Tier 3 Tools
# =============================================================================


@mcp.tool()
async def batch_create_tasks(tasks_json: str) -> str:
    """Create multiple tasks at once. Useful for goal decomposition.

    Args:
        tasks_json: JSON array of task objects. Each supports:
            title (required), domain, impact, clarity, duration_minutes,
            scheduled_date, scheduled_time, description.
    """
    user_id = _get_user_id()
    enc_error = await _check_encryption(user_id)
    if enc_error:
        return enc_error

    try:
        tasks_list = json.loads(tasks_json)
    except json.JSONDecodeError as e:
        return f"Invalid JSON: {e}"

    if not isinstance(tasks_list, list):
        return "Expected a JSON array of task objects."

    created: list[str] = []
    errors: list[str] = []

    async with async_session_factory() as db:
        svc = TaskService(db, user_id)
        # Pre-fetch domains for name resolution
        all_domains = await svc.get_domains(include_archived=True)
        domain_map = {d.name.lower(): d.id for d in all_domains}

        for i, task_data in enumerate(tasks_list):
            if not isinstance(task_data, dict) or "title" not in task_data:
                errors.append(f"Item {i}: missing 'title'")
                continue

            try:
                from datetime import date as date_type
                from datetime import time as time_type

                domain_id = None
                if "domain" in task_data:
                    domain_id = domain_map.get(task_data["domain"].lower())

                parsed_date = None
                if task_data.get("scheduled_date"):
                    parsed_date = date_type.fromisoformat(task_data["scheduled_date"])

                parsed_time = None
                if task_data.get("scheduled_time"):
                    parsed_time = time_type.fromisoformat(task_data["scheduled_time"])

                task = await svc.create_task(
                    title=task_data["title"],
                    domain_id=domain_id,
                    impact=task_data.get("impact", 4),
                    clarity=task_data.get("clarity", "normal"),
                    duration_minutes=task_data.get("duration_minutes"),
                    scheduled_date=parsed_date,
                    scheduled_time=parsed_time,
                    description=task_data.get("description"),
                )
                created.append(f"[id:{task.id}] {task.title}")
            except Exception as e:
                errors.append(f"'{task_data['title']}': {e}")

        await db.commit()

    lines = [f"Created {len(created)} task(s):"]
    for c in created:
        lines.append(f"  + {c}")
    if errors:
        lines.append(f"\n{len(errors)} error(s):")
        for e in errors:
            lines.append(f"  x {e}")

    return "\n".join(lines)


@mcp.tool()
async def complete_instance(instance_id: int) -> str:
    """Complete a specific recurring task instance.

    Args:
        instance_id: The instance ID (shown as inst:ID in schedule output).
    """
    user_id = _get_user_id()

    async with async_session_factory() as db:
        from app.models import TaskInstance

        result = await db.execute(
            select(TaskInstance).where(
                TaskInstance.id == instance_id,
                TaskInstance.user_id == user_id,
            )
        )
        instance = result.scalar_one_or_none()
        if not instance:
            return f"Instance {instance_id} not found or not owned by you."

        from datetime import UTC, datetime

        instance.status = "completed"
        instance.completed_at = datetime.now(UTC)
        await db.commit()

        return f"Completed instance [inst:{instance_id}]"


@mcp.tool()
async def create_domain(name: str) -> str:
    """Create a new domain (project/life area).

    Args:
        name: Domain name (e.g. "Side Project", "Freelance").
    """
    user_id = _get_user_id()
    enc_error = await _check_encryption(user_id)
    if enc_error:
        return enc_error

    async with async_session_factory() as db:
        svc = TaskService(db, user_id)
        domain = await svc.create_domain(name=name)
        await db.commit()
        return f"Created domain [id:{domain.id}]: {domain.name}"


# =============================================================================
# ASGI App Factory
# =============================================================================


def create_mcp_app() -> ASGIApp:
    """Create the MCP ASGI application with auth middleware.

    Returns a Starlette app that wraps FastMCP's streamable HTTP transport
    with bearer token authentication.
    """
    mcp_http_app = mcp.streamable_http_app()

    # Wrap with auth middleware
    app = Starlette(
        routes=[Mount("/", app=mcp_http_app)],
        middleware=[Middleware(MCPAuthMiddleware)],
    )
    return app
