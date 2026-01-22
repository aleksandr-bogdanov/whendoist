"""
Task Instance API endpoints.

Provides REST endpoints for managing recurring task instances.
"""

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import TaskInstance, User
from app.routers.auth import require_user
from app.services.recurrence_service import RecurrenceService

router = APIRouter(prefix="/instances", tags=["instances"])


# =============================================================================
# Request/Response Models
# =============================================================================


class InstanceSchedule(BaseModel):
    """Request body for rescheduling an instance."""

    scheduled_datetime: datetime


class InstanceResponse(BaseModel):
    """Response model for a task instance."""

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

    class Config:
        from_attributes = True


def _instance_to_response(instance: TaskInstance) -> InstanceResponse:
    """Convert a TaskInstance model to InstanceResponse."""
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


@router.post("/{instance_id}/complete", status_code=200)
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


@router.post("/{instance_id}/uncomplete", status_code=200)
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


@router.post("/{instance_id}/toggle-complete", status_code=200)
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


@router.post("/{instance_id}/skip", status_code=200)
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
