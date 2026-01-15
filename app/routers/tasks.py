"""
Task API endpoints.

Provides REST endpoints for managing native tasks.
"""

from datetime import date, datetime, time

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
    clarity: str = "defined"  # Default to "defined" - all tasks must have clarity
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
    created_at: datetime | None = None
    completed_at: datetime | None = None
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
    return [_task_to_response(t) for t in tasks]


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
    service = TaskService(db, user.id)
    task = await service.get_task(task_id)

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.is_recurring:
        # For recurring tasks, toggle the instance for the target date
        recurrence_service = RecurrenceService(db, user.id)
        target_date = data.target_date if data and data.target_date else date.today()
        instance = await recurrence_service.get_or_create_instance_for_date(task, target_date)
        if not instance:
            raise HTTPException(status_code=400, detail="Could not create instance for recurring task")

        # Toggle the instance
        toggled_instance = await recurrence_service.toggle_instance_completion(instance.id)
        await db.commit()
        return {
            "status": toggled_instance.status if toggled_instance else "error",
            "task_id": task_id,
            "instance_id": instance.id,
            "completed": toggled_instance.status == "completed" if toggled_instance else False,
        }

    updated_task = await service.toggle_task_completion(task_id)
    await db.commit()
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

    tasks: list[TaskContentData]


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

    Returns count of tasks updated.
    """
    service = TaskService(db, user.id)
    updated_count = 0

    for item in data.tasks:
        task = await service.get_task(item.id)
        if not task:
            continue

        await service.update_task(
            task_id=item.id,
            title=item.title,
            description=item.description,
        )
        updated_count += 1

    await db.commit()
    return {"updated_count": updated_count, "total_requested": len(data.tasks)}
