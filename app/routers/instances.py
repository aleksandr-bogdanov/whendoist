"""
Task Instance API endpoints.

Provides REST endpoints for managing recurring task instances.
"""

from datetime import date, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import TaskInstance, User
from app.routers.auth import require_user
from app.services.preferences_service import PreferencesService
from app.services.recurrence_service import RecurrenceService

router = APIRouter(prefix="/instances", tags=["instances"])


# =============================================================================
# Request/Response Models
# =============================================================================


class InstanceSchedule(BaseModel):
    """Request body for rescheduling an instance."""

    scheduled_datetime: datetime | None


class InstanceResponse(BaseModel):
    """Response model for a task instance."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    task_id: int
    task_title: str
    instance_date: date
    scheduled_datetime: datetime | None
    status: str
    duration_minutes: int | None
    impact: int
    clarity: str | None
    domain_name: str | None = None


def _instance_to_response(instance: TaskInstance) -> InstanceResponse:
    """Convert a TaskInstance model to InstanceResponse.

    Requires instance.task and instance.task.domain to be eagerly loaded
    (e.g. via selectinload) to avoid MissingGreenlet in async context.
    """
    return InstanceResponse(
        id=instance.id,
        task_id=instance.task_id,
        task_title=instance.task.title,
        instance_date=instance.instance_date,
        scheduled_datetime=instance.scheduled_datetime,
        status=instance.status,
        duration_minutes=instance.task.duration_minutes,
        impact=instance.task.impact,
        clarity=instance.task.clarity,
        domain_name=instance.task.domain.name if instance.task.domain else None,
    )


class InstanceStatusResponse(BaseModel):
    """Response for instance complete/uncomplete/skip."""

    status: str
    instance_id: int


class InstanceToggleCompleteResponse(BaseModel):
    """Response for instance toggle-complete."""

    status: str
    instance_id: int
    completed: bool


class BatchCompleteResponse(BaseModel):
    """Response for batch-complete instances."""

    completed_count: int


class PendingPastCountResponse(BaseModel):
    """Response for pending-past-count."""

    pending_count: int


class BatchPastResponse(BaseModel):
    """Response for batch-past instances."""

    affected_count: int


# =============================================================================
# Endpoints
# =============================================================================


@router.get("", response_model=list[InstanceResponse])
async def list_instances(
    start_date: date = Query(..., description="Start of date range"),
    end_date: date = Query(..., description="End of date range"),
    status: str | None = Query("pending", description="Filter by status"),
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Get task instances for a date range."""
    service = RecurrenceService(db, user.id)
    instances = await service.get_instances_for_range(
        start_date=start_date,
        end_date=end_date,
        status=status,
    )
    return [_instance_to_response(i) for i in instances]


@router.post("/{instance_id}/complete", response_model=InstanceStatusResponse, status_code=200)
async def complete_instance(
    instance_id: int,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Complete a specific instance of a recurring task."""
    service = RecurrenceService(db, user.id)
    instance = await service.complete_instance(instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")
    await db.commit()
    return {"status": "completed", "instance_id": instance_id}


@router.post("/{instance_id}/uncomplete", response_model=InstanceStatusResponse, status_code=200)
async def uncomplete_instance(
    instance_id: int,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Uncomplete a specific instance of a recurring task."""
    service = RecurrenceService(db, user.id)
    instance = await service.uncomplete_instance(instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")
    await db.commit()
    return {"status": "pending", "instance_id": instance_id}


@router.post("/{instance_id}/toggle-complete", response_model=InstanceToggleCompleteResponse, status_code=200)
async def toggle_instance_complete(
    instance_id: int,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Toggle an instance's completion status."""
    service = RecurrenceService(db, user.id)
    instance = await service.toggle_instance_completion(instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")
    await db.commit()
    return {
        "status": instance.status,
        "instance_id": instance_id,
        "completed": instance.status == "completed",
    }


@router.post("/{instance_id}/skip", response_model=InstanceStatusResponse, status_code=200)
async def skip_instance(
    instance_id: int,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Skip a specific instance of a recurring task."""
    service = RecurrenceService(db, user.id)
    instance = await service.skip_instance(instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")
    await db.commit()
    return {"status": "skipped", "instance_id": instance_id}


@router.put("/{instance_id}/schedule", response_model=InstanceResponse)
async def schedule_instance(
    instance_id: int,
    data: InstanceSchedule,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Reschedule a specific instance."""
    service = RecurrenceService(db, user.id)
    instance = await service.schedule_instance(instance_id, data.scheduled_datetime)
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")
    await db.commit()
    return _instance_to_response(instance)


# =============================================================================
# Batch Endpoints
# =============================================================================


class BatchCompleteRequest(BaseModel):
    """Request body for batch completing instances of a single task."""

    task_id: int
    before_date: date


class BatchAction(BaseModel):
    """Request body for batch actions on all past instances."""

    action: Literal["complete", "skip"]


@router.post("/batch-complete", response_model=BatchCompleteResponse, status_code=200)
async def batch_complete_instances(
    data: BatchCompleteRequest,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Complete all pending instances for a task before a given date."""
    prefs_service = PreferencesService(db, user.id)
    timezone = await prefs_service.get_timezone()
    service = RecurrenceService(db, user.id, timezone=timezone)
    count = await service.batch_complete_instances(data.task_id, data.before_date)
    await db.commit()
    return {"completed_count": count}


@router.get("/pending-past-count", response_model=PendingPastCountResponse, status_code=200)
async def pending_past_count(
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Count pending instances from past days across all tasks."""
    prefs_service = PreferencesService(db, user.id)
    timezone = await prefs_service.get_timezone()
    service = RecurrenceService(db, user.id, timezone=timezone)
    count = await service.count_pending_past_instances()
    return {"pending_count": count}


@router.post("/batch-past", response_model=BatchPastResponse, status_code=200)
async def batch_past_instances(
    data: BatchAction,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Complete or skip all pending past instances across all tasks."""
    prefs_service = PreferencesService(db, user.id)
    timezone = await prefs_service.get_timezone()
    service = RecurrenceService(db, user.id, timezone=timezone)
    if data.action == "complete":
        count = await service.batch_complete_all_past_instances()
    elif data.action == "skip":
        count = await service.batch_skip_all_past_instances()
    else:
        raise HTTPException(status_code=400, detail="Invalid action. Use 'complete' or 'skip'.")
    await db.commit()
    return {"affected_count": count}


@router.post("/{instance_id}/unskip", response_model=InstanceStatusResponse, status_code=200)
async def unskip_instance(
    instance_id: int,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Unskip a specific instance (revert skip, mark as pending)."""
    service = RecurrenceService(db, user.id)
    instance = await service.unskip_instance(instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")
    await db.commit()
    return {"status": "pending", "instance_id": instance_id}
