"""
Task API endpoints.

Provides REST endpoints for managing native tasks.
"""

import asyncio
import logging
import re
from datetime import date, datetime, time

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import (
    GCAL_SYNC_DEFAULT_DURATION_MINUTES,
    TASK_DESCRIPTION_MAX_LENGTH,
    TASK_TITLE_MAX_LENGTH,
    get_user_today,
)
from app.database import async_session_factory, get_db
from app.middleware.rate_limit import TASK_CREATE_LIMIT, limiter
from app.models import Task, User
from app.routers.auth import require_user
from app.services.preferences_service import PreferencesService
from app.services.recurrence_service import RecurrenceService
from app.services.task_service import TaskService

# Regex to match control characters except \n (newline) and \t (tab)
CONTROL_CHAR_PATTERN = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

logger = logging.getLogger("whendoist.tasks")

router = APIRouter(prefix="/tasks", tags=["tasks"])


async def _fire_and_forget_sync_task(task_id: int, user_id: int) -> None:
    """Fire-and-forget: sync a task to Google Calendar in a background coroutine."""
    try:
        async with async_session_factory() as db:
            from app.services.gcal_sync import GCalSyncService

            sync_service = GCalSyncService(db, user_id)
            task_service = TaskService(db, user_id)
            task = await task_service.get_task(task_id)
            if task:
                await sync_service.sync_task(task)
            await db.commit()
    except Exception as e:
        from app.auth.google import TokenRefreshError
        from app.services.gcal_sync import CalendarGoneError

        if isinstance(e, (CalendarGoneError, TokenRefreshError)):
            logger.warning(f"GCal sync auto-disabled for user {user_id}: {e}")
        else:
            logger.debug(f"GCal sync failed for task {task_id}: {e}")


async def _fire_and_forget_unsync_task(task_id: int, user_id: int) -> None:
    """Fire-and-forget: unsync a task from Google Calendar."""
    try:
        async with async_session_factory() as db:
            from app.services.gcal_sync import GCalSyncService

            sync_service = GCalSyncService(db, user_id)
            task_service = TaskService(db, user_id)
            task = await task_service.get_task(task_id)
            if task:
                await sync_service.unsync_task(task)
            await db.commit()
    except Exception as e:
        logger.debug(f"GCal unsync failed for task {task_id}: {e}")


async def _fire_and_forget_sync_instance(instance_id: int, task_id: int, user_id: int) -> None:
    """Fire-and-forget: sync a task instance to Google Calendar."""
    try:
        async with async_session_factory() as db:
            from sqlalchemy import select as sa_select

            from app.models import TaskInstance
            from app.services.gcal_sync import GCalSyncService

            sync_service = GCalSyncService(db, user_id)
            task_service = TaskService(db, user_id)
            task = await task_service.get_task(task_id)

            result = await db.execute(sa_select(TaskInstance).where(TaskInstance.id == instance_id))
            instance = result.scalar_one_or_none()

            if task and instance:
                await sync_service.sync_task_instance(instance, task)
            await db.commit()
    except Exception as e:
        from app.auth.google import TokenRefreshError
        from app.services.gcal_sync import CalendarGoneError

        if isinstance(e, (CalendarGoneError, TokenRefreshError)):
            logger.warning(f"GCal sync auto-disabled for user {user_id}: {e}")
        else:
            logger.debug(f"GCal sync failed for instance {instance_id}: {e}")


async def _fire_and_forget_bulk_sync(user_id: int) -> None:
    """Fire-and-forget: run a bulk sync to Google Calendar."""
    try:
        async with async_session_factory() as db:
            from app.services.gcal_sync import GCalSyncService

            sync_service = GCalSyncService(db, user_id)
            await sync_service.bulk_sync()
            await db.commit()
    except Exception as e:
        logger.debug(f"GCal bulk sync failed for user {user_id}: {e}")


# =============================================================================
# Request/Response Models
# =============================================================================


def _strip_control_chars(value: str) -> str:
    """Strip control characters except newline and tab."""
    return CONTROL_CHAR_PATTERN.sub("", value)


class TaskCreate(BaseModel):
    """Request body for creating a task."""

    title: str
    description: str | None = None
    domain_id: int | None = None
    parent_id: int | None = None
    duration_minutes: int | None = Field(None, ge=1, le=1440)
    impact: int = Field(default=4, ge=1, le=4)
    clarity: str = "normal"  # Default to "normal" - autopilot/normal/brainstorm
    due_date: date | None = None
    due_time: time | None = None
    scheduled_date: date | None = None
    scheduled_time: time | None = None
    is_recurring: bool = False
    recurrence_rule: dict | None = None
    recurrence_start: date | None = None
    recurrence_end: date | None = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        v = _strip_control_chars(v).strip()
        if not v:
            raise ValueError("Title cannot be empty")
        if len(v) > TASK_TITLE_MAX_LENGTH:
            raise ValueError(f"Title cannot exceed {TASK_TITLE_MAX_LENGTH} characters")
        return v

    @field_validator("description")
    @classmethod
    def validate_description(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = _strip_control_chars(v)
        if len(v) > TASK_DESCRIPTION_MAX_LENGTH:
            raise ValueError(f"Description cannot exceed {TASK_DESCRIPTION_MAX_LENGTH} characters")
        return v

    @field_validator("clarity")
    @classmethod
    def validate_clarity(cls, v: str) -> str:
        if v not in ("autopilot", "normal", "brainstorm"):
            raise ValueError("Clarity must be autopilot, normal, or brainstorm")
        return v

    @model_validator(mode="after")
    def ensure_duration_with_time(self) -> "TaskCreate":
        """If scheduled_time is set, ensure duration_minutes has a value."""
        if self.scheduled_time is not None and self.duration_minutes is None:
            self.duration_minutes = GCAL_SYNC_DEFAULT_DURATION_MINUTES
        return self


class TaskUpdate(BaseModel):
    """Request body for updating a task."""

    title: str | None = None
    description: str | None = None
    domain_id: int | None = None
    duration_minutes: int | None = Field(None, ge=1, le=1440)
    impact: int | None = Field(None, ge=1, le=4)
    clarity: str | None = None
    due_date: date | None = None
    due_time: time | None = None
    scheduled_date: date | None = None
    scheduled_time: time | None = None
    is_recurring: bool | None = None
    recurrence_rule: dict | None = None
    recurrence_start: date | None = None
    recurrence_end: date | None = None
    position: int | None = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = _strip_control_chars(v).strip()
        if not v:
            raise ValueError("Title cannot be empty")
        if len(v) > TASK_TITLE_MAX_LENGTH:
            raise ValueError(f"Title cannot exceed {TASK_TITLE_MAX_LENGTH} characters")
        return v

    @field_validator("description")
    @classmethod
    def validate_description(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = _strip_control_chars(v)
        if len(v) > TASK_DESCRIPTION_MAX_LENGTH:
            raise ValueError(f"Description cannot exceed {TASK_DESCRIPTION_MAX_LENGTH} characters")
        return v

    @field_validator("clarity")
    @classmethod
    def validate_clarity(cls, v: str | None) -> str | None:
        if v is not None and v not in ("autopilot", "normal", "brainstorm"):
            raise ValueError("Clarity must be autopilot, normal, or brainstorm")
        return v

    @model_validator(mode="after")
    def ensure_duration_with_time(self) -> "TaskUpdate":
        """If scheduled_time is being set, ensure duration_minutes has a value."""
        if self.scheduled_time is not None and self.duration_minutes is None:
            # Only auto-fill if scheduled_time was explicitly provided in the request
            self.duration_minutes = GCAL_SYNC_DEFAULT_DURATION_MINUTES
        return self


class SubtaskResponse(BaseModel):
    """Response model for a subtask (without nested subtasks)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None
    duration_minutes: int | None
    impact: int
    clarity: str | None
    due_date: date | None
    scheduled_date: date | None
    status: str
    position: int


class TaskResponse(BaseModel):
    """Response model for a task."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None
    domain_id: int | None
    domain_name: str | None = None
    parent_id: int | None
    duration_minutes: int | None
    impact: int
    clarity: str | None
    due_date: date | None
    due_time: time | None
    scheduled_date: date | None
    scheduled_time: time | None
    is_recurring: bool
    recurrence_rule: dict | None
    recurrence_start: date | None = None
    recurrence_end: date | None = None
    status: str
    position: int
    created_at: datetime | None = None
    completed_at: datetime | None = None
    subtasks: list[SubtaskResponse] = []
    # For recurring tasks: whether today's instance is completed
    today_instance_completed: bool | None = None


def _task_to_response(task: Task, user_today: date | None = None) -> TaskResponse:
    """Convert a Task model to TaskResponse.

    Args:
        task: The task to convert
        user_today: User's "today" in their timezone. If None, uses server time.
    """
    # For recurring tasks, check if today's instance is completed
    today_instance_completed: bool | None = None
    if task.is_recurring and hasattr(task, "instances") and task.instances:
        today = user_today or date.today()
        for instance in task.instances:
            if instance.instance_date == today:
                today_instance_completed = instance.status == "completed"
                break

    return TaskResponse(
        id=task.id,
        title=task.title,
        description=task.description,
        domain_id=task.domain_id,
        domain_name=task.domain.name if task.domain else None,
        parent_id=task.parent_id,
        duration_minutes=task.duration_minutes,
        impact=task.impact,
        clarity=task.clarity,
        due_date=task.due_date,
        due_time=task.due_time,
        scheduled_date=task.scheduled_date,
        scheduled_time=task.scheduled_time,
        is_recurring=task.is_recurring,
        recurrence_rule=task.recurrence_rule,
        recurrence_start=task.recurrence_start,
        recurrence_end=task.recurrence_end,
        status=task.status,
        position=task.position,
        created_at=task.created_at,
        completed_at=task.completed_at,
        subtasks=[
            SubtaskResponse(
                id=s.id,
                title=s.title,
                description=s.description,
                duration_minutes=s.duration_minutes,
                impact=s.impact,
                clarity=s.clarity,
                due_date=s.due_date,
                scheduled_date=s.scheduled_date,
                status=s.status,
                position=s.position,
            )
            for s in (task.subtasks or [])
        ],
        today_instance_completed=today_instance_completed,
    )


# =============================================================================
# Endpoints
# =============================================================================


@router.get("", response_model=list[TaskResponse])
async def list_tasks(
    domain_id: int | None = Query(None, description="Filter by domain ID"),
    status: str = Query("pending", description="Filter by status"),
    scheduled_date: date | None = Query(None, description="Filter by scheduled date"),
    is_recurring: bool | None = Query(None, description="Filter recurring/non-recurring"),
    clarity: str | None = Query(None, description="Filter by clarity (executable/defined/exploratory/none)"),
    parent_id: int | None = Query(None, description="Get subtasks of a task"),
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Get tasks with optional filtering."""
    # Get user's timezone for "today" calculations
    prefs_service = PreferencesService(db, user.id)
    timezone = await prefs_service.get_timezone()
    user_today = get_user_today(timezone)

    service = TaskService(db, user.id)
    tasks = await service.get_tasks(
        domain_id=domain_id,
        status=status,
        scheduled_date=scheduled_date,
        is_recurring=is_recurring,
        clarity=clarity,
        parent_id=parent_id,
        top_level_only=(parent_id is None),
    )
    return [_task_to_response(t, user_today) for t in tasks]


# =============================================================================
# All Content Endpoint (for encryption - must be before /{task_id})
# =============================================================================


class TaskContentData(BaseModel):
    """Single task's content for batch update."""

    id: int
    title: str
    description: str | None = None


class DomainContentData(BaseModel):
    """Single domain's content for batch update."""

    id: int
    name: str


class AllDataResponse(BaseModel):
    """Response containing all tasks and domains for encryption operations."""

    tasks: list[TaskContentData]
    domains: list[DomainContentData]


@router.get("/all-content", response_model=AllDataResponse)
async def get_all_content(
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get all task titles/descriptions and domain names for the user.

    Used by the client when enabling/disabling encryption to encrypt/decrypt
    all data in a single batch operation.
    """
    service = TaskService(db, user.id)

    # Get all non-archived tasks (including subtasks)
    tasks = await service.get_tasks(status=None, top_level_only=False)
    task_data = [
        TaskContentData(id=t.id, title=t.title, description=t.description) for t in tasks if t.status != "archived"
    ]

    # Get all domains
    domains = await service.get_domains(include_archived=False)
    domain_data = [DomainContentData(id=d.id, name=d.name) for d in domains]

    return AllDataResponse(tasks=task_data, domains=domain_data)


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: int,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single task by ID."""
    # Get user's timezone for "today" calculations
    prefs_service = PreferencesService(db, user.id)
    timezone = await prefs_service.get_timezone()
    user_today = get_user_today(timezone)

    service = TaskService(db, user.id)
    task = await service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return _task_to_response(task, user_today)


@router.post("", response_model=TaskResponse, status_code=201)
@limiter.limit(TASK_CREATE_LIMIT)
async def create_task(
    request: Request,
    data: TaskCreate,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new task."""
    # Get user's timezone for "today" calculations
    prefs_service = PreferencesService(db, user.id)
    timezone = await prefs_service.get_timezone()
    user_today = get_user_today(timezone)

    service = TaskService(db, user.id)
    task = await service.create_task(
        title=data.title,
        description=data.description,
        domain_id=data.domain_id,
        parent_id=data.parent_id,
        duration_minutes=data.duration_minutes,
        impact=data.impact,
        clarity=data.clarity,
        due_date=data.due_date,
        due_time=data.due_time,
        scheduled_date=data.scheduled_date,
        scheduled_time=data.scheduled_time,
        is_recurring=data.is_recurring,
        recurrence_rule=data.recurrence_rule,
        recurrence_start=data.recurrence_start,
        recurrence_end=data.recurrence_end,
    )

    # Materialize instances if recurring
    if task.is_recurring and task.recurrence_rule:
        recurrence = RecurrenceService(db, user.id, timezone=timezone)
        await recurrence.materialize_instances(task)

    await db.commit()

    # Reload to get relationships
    reloaded = await service.get_task(task.id)
    if not reloaded:
        raise HTTPException(status_code=500, detail="Failed to reload task")

    # Fire-and-forget sync to Google Calendar
    if task.is_recurring:
        asyncio.create_task(_fire_and_forget_bulk_sync(user.id))
    elif task.scheduled_date:
        asyncio.create_task(_fire_and_forget_sync_task(task.id, user.id))

    return _task_to_response(reloaded, user_today)


@router.put("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: int,
    data: TaskUpdate,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a task."""
    # Get user's timezone for "today" calculations
    prefs_service = PreferencesService(db, user.id)
    timezone = await prefs_service.get_timezone()
    user_today = get_user_today(timezone)

    service = TaskService(db, user.id)

    # Get current task to check for recurrence changes
    current = await service.get_task(task_id)
    if not current:
        raise HTTPException(status_code=404, detail="Task not found")

    old_rule = current.recurrence_rule
    old_is_recurring = current.is_recurring

    # Get only fields that were explicitly set in the request
    # This allows us to distinguish between "not provided" and "set to null"
    update_data = data.model_dump(exclude_unset=True)

    task = await service.update_task(
        task_id=task_id,
        **update_data,
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Regenerate instances if recurrence changed
    if task.is_recurring and task.recurrence_rule != old_rule:
        recurrence = RecurrenceService(db, user.id, timezone=timezone)
        await recurrence.regenerate_instances(task)

    # Clean up instances when disabling recurrence
    if not task.is_recurring and old_is_recurring:
        from sqlalchemy import delete as sa_delete

        from app.models import TaskInstance

        # Delete future pending instances (completed/skipped are preserved)
        await db.execute(
            sa_delete(TaskInstance).where(
                TaskInstance.task_id == task.id,
                TaskInstance.status == "pending",
            )
        )

    await db.commit()

    # Reload to get relationships
    reloaded = await service.get_task(task_id)
    if not reloaded:
        raise HTTPException(status_code=500, detail="Failed to reload task")

    # Fire-and-forget sync to Google Calendar
    if task.is_recurring:
        asyncio.create_task(_fire_and_forget_bulk_sync(user.id))
    else:
        asyncio.create_task(_fire_and_forget_sync_task(task_id, user.id))

    return _task_to_response(reloaded, user_today)


@router.delete("/{task_id}", status_code=204)
async def delete_task(
    task_id: int,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Archive a task (soft delete)."""
    service = TaskService(db, user.id)
    task = await service.archive_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    await db.commit()

    # Fire-and-forget unsync from Google Calendar
    asyncio.create_task(_fire_and_forget_unsync_task(task_id, user.id))


@router.post("/{task_id}/restore", status_code=200)
async def restore_task(
    task_id: int,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Restore an archived task back to pending status."""
    service = TaskService(db, user.id)
    task = await service.restore_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found or not archived")
    await db.commit()

    # Fire-and-forget re-sync to Google Calendar
    if task.scheduled_date:
        asyncio.create_task(_fire_and_forget_sync_task(task_id, user.id))

    return {"status": "restored", "task_id": task_id}


@router.post("/{task_id}/complete", status_code=200)
async def complete_task(
    task_id: int,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Complete a non-recurring task."""
    service = TaskService(db, user.id)
    task = await service.get_task(task_id)

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.is_recurring:
        raise HTTPException(
            status_code=400,
            detail="Cannot complete recurring task directly. Complete instances instead.",
        )

    await service.complete_task(task_id)
    await db.commit()

    # Fire-and-forget sync (updates title with ✓ and color to Graphite)
    asyncio.create_task(_fire_and_forget_sync_task(task_id, user.id))

    return {"status": "completed", "task_id": task_id}


@router.post("/{task_id}/uncomplete", status_code=200)
async def uncomplete_task(
    task_id: int,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Uncomplete a task (mark as pending)."""
    service = TaskService(db, user.id)
    task = await service.get_task(task_id)

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    await service.uncomplete_task(task_id)
    await db.commit()

    # Fire-and-forget sync (removes ✓ and restores impact color)
    asyncio.create_task(_fire_and_forget_sync_task(task_id, user.id))

    return {"status": "pending", "task_id": task_id}


class ToggleCompleteRequest(BaseModel):
    """Request body for toggle-complete with optional date."""

    target_date: date | None = None  # For recurring tasks, complete instance for this date


@router.post("/{task_id}/toggle-complete", status_code=200)
async def toggle_task_complete(
    task_id: int,
    data: ToggleCompleteRequest | None = None,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Toggle a task's completion status.

    For recurring tasks, this toggles the instance for the specified date
    (or today if no date provided).
    """
    # Get user's timezone for "today" calculations
    prefs_service = PreferencesService(db, user.id)
    timezone = await prefs_service.get_timezone()
    user_today = get_user_today(timezone)

    service = TaskService(db, user.id)
    task = await service.get_task(task_id)

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.is_recurring:
        # For recurring tasks, toggle the instance for the target date
        recurrence_service = RecurrenceService(db, user.id, timezone=timezone)
        target_date = data.target_date if data and data.target_date else user_today
        instance = await recurrence_service.get_or_create_instance_for_date(task, target_date)
        if not instance:
            raise HTTPException(status_code=400, detail="Could not create instance for recurring task")

        # Toggle the instance
        toggled_instance = await recurrence_service.toggle_instance_completion(instance.id)
        await db.commit()

        # Fire-and-forget sync instance to Google Calendar
        if toggled_instance:
            asyncio.create_task(_fire_and_forget_sync_instance(instance.id, task_id, user.id))

        return {
            "status": toggled_instance.status if toggled_instance else "error",
            "task_id": task_id,
            "instance_id": instance.id,
            "completed": toggled_instance.status == "completed" if toggled_instance else False,
        }

    updated_task = await service.toggle_task_completion(task_id)
    await db.commit()

    # Fire-and-forget sync to Google Calendar
    asyncio.create_task(_fire_and_forget_sync_task(task_id, user.id))

    return {
        "status": updated_task.status if updated_task else "error",
        "task_id": task_id,
        "completed": updated_task.status == "completed" if updated_task else False,
    }


# =============================================================================
# Batch Update Endpoint (for encryption enable/disable)
# =============================================================================


class BatchUpdateTasksRequest(BaseModel):
    """Request body for batch updating task content."""

    tasks: list[TaskContentData] = Field(max_length=5000)


@router.post("/batch-update", status_code=200)
async def batch_update_tasks(
    data: BatchUpdateTasksRequest,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Batch update task content (title and description).

    Used when enabling encryption (to save encrypted content) or
    disabling encryption (to save decrypted content).

    **Non-Atomic Behavior:** Commits in batches of 25 to prevent connection
    timeouts on cloud databases (Railway, etc). If an error occurs mid-batch,
    previously committed batches remain persisted. The operation is idempotent -
    retry to complete any remaining tasks.

    Returns:
        - updated_count: Number of tasks successfully updated
        - total_requested: Total tasks in request
        - errors: List of {id, error} for failed tasks (only if any failed)
    """
    service = TaskService(db, user.id)
    updated_count = 0
    errors = []
    batch_size = 25

    for i, item in enumerate(data.tasks):
        try:
            task = await service.get_task(item.id)
            if not task:
                continue

            await service.update_task(
                task_id=item.id,
                title=item.title,
                description=item.description,
            )
            updated_count += 1

            # Commit every batch_size items to keep transactions short
            if (i + 1) % batch_size == 0:
                await db.commit()
                logger.debug(f"Batch update: committed {i + 1}/{len(data.tasks)} tasks")
        except Exception as e:
            # Log but continue - don't fail entire batch for one item
            errors.append({"id": item.id, "error": str(e)})
            logger.warning(f"Failed to update task {item.id}: {e}")

    # Final commit for remaining items
    await db.commit()

    result: dict[str, int | list[dict[str, str]]] = {
        "updated_count": updated_count,
        "total_requested": len(data.tasks),
    }
    if errors:
        result["errors"] = errors
    return result
