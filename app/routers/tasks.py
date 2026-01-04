"""
Task API endpoints.

Provides REST endpoints for managing native tasks.
"""

from datetime import date, time

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Task, User
from app.routers.auth import require_user
from app.services.recurrence_service import RecurrenceService
from app.services.task_service import TaskService

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


# =============================================================================
# Request/Response Models
# =============================================================================


class TaskCreate(BaseModel):
    """Request body for creating a task."""

    title: str
    description: str | None = None
    domain_id: int | None = None
    parent_id: int | None = None
    duration_minutes: int | None = None
    impact: int = 4
    clarity: str | None = None
    due_date: date | None = None
    due_time: time | None = None
    scheduled_date: date | None = None
    scheduled_time: time | None = None
    is_recurring: bool = False
    recurrence_rule: dict | None = None
    recurrence_start: date | None = None
    recurrence_end: date | None = None


class TaskUpdate(BaseModel):
    """Request body for updating a task."""

    title: str | None = None
    description: str | None = None
    domain_id: int | None = None
    duration_minutes: int | None = None
    impact: int | None = None
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


class SubtaskResponse(BaseModel):
    """Response model for a subtask (without nested subtasks)."""

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

    class Config:
        from_attributes = True


class TaskResponse(BaseModel):
    """Response model for a task."""

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
    status: str
    position: int
    subtasks: list[SubtaskResponse] = []

    class Config:
        from_attributes = True


def _task_to_response(task: Task) -> TaskResponse:
    """Convert a Task model to TaskResponse."""
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
        status=task.status,
        position=task.position,
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
    parent_id: int | None = Query(None, description="Get subtasks of a task"),
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Get tasks with optional filtering."""
    service = TaskService(db, user.id)
    tasks = await service.get_tasks(
        domain_id=domain_id,
        status=status,
        scheduled_date=scheduled_date,
        is_recurring=is_recurring,
        parent_id=parent_id,
        top_level_only=(parent_id is None),
    )
    return [_task_to_response(t) for t in tasks]


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: int,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single task by ID."""
    service = TaskService(db, user.id)
    task = await service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return _task_to_response(task)


@router.post("", response_model=TaskResponse, status_code=201)
async def create_task(
    data: TaskCreate,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new task."""
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
        recurrence = RecurrenceService(db, user.id)
        await recurrence.materialize_instances(task)

    await db.commit()

    # Reload to get relationships
    reloaded = await service.get_task(task.id)
    if not reloaded:
        raise HTTPException(status_code=500, detail="Failed to reload task")
    return _task_to_response(reloaded)


@router.put("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: int,
    data: TaskUpdate,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a task."""
    service = TaskService(db, user.id)

    # Get current task to check for recurrence changes
    current = await service.get_task(task_id)
    if not current:
        raise HTTPException(status_code=404, detail="Task not found")

    old_rule = current.recurrence_rule

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
        recurrence = RecurrenceService(db, user.id)
        await recurrence.regenerate_instances(task)

    await db.commit()

    # Reload to get relationships
    reloaded = await service.get_task(task_id)
    if not reloaded:
        raise HTTPException(status_code=500, detail="Failed to reload task")
    return _task_to_response(reloaded)


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
    return {"status": "completed", "task_id": task_id}
