"""
Activity Log API endpoints.

Provides endpoints for querying activity log entries:
- Per-task: GET /activity/task/{task_id}
- Per-user: GET /activity (paginated)
"""

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import ACTIVITY_LOG_DEFAULT_LIMIT, ACTIVITY_LOG_MAX_LIMIT
from app.database import get_db
from app.models import ActivityLog, User
from app.routers.auth import require_user

router = APIRouter(prefix="/activity", tags=["activity"])


# =============================================================================
# Response Models
# =============================================================================


class ActivityLogEntry(BaseModel):
    """A single activity log entry."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    task_id: int | None
    instance_id: int | None
    domain_id: int | None
    event_type: str
    field_name: str | None
    old_value: str | None
    new_value: str | None
    batch_id: str | None
    created_at: datetime


class ActivityLogResponse(BaseModel):
    """Paginated response for user-level activity log."""

    entries: list[ActivityLogEntry]
    total: int


# =============================================================================
# Endpoints
# =============================================================================


@router.get("/task/{task_id}", response_model=list[ActivityLogEntry])
async def get_task_activity(
    task_id: int,
    limit: int = Query(ACTIVITY_LOG_DEFAULT_LIMIT, ge=1, le=ACTIVITY_LOG_MAX_LIMIT),
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> list[ActivityLog]:
    """Get activity log for a specific task (includes instance events)."""
    result = await db.execute(
        select(ActivityLog)
        .where(
            ActivityLog.user_id == user.id,
            ActivityLog.task_id == task_id,
        )
        .order_by(ActivityLog.created_at.desc(), ActivityLog.id.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


@router.get("", response_model=ActivityLogResponse)
async def get_user_activity(
    limit: int = Query(ACTIVITY_LOG_DEFAULT_LIMIT, ge=1, le=ACTIVITY_LOG_MAX_LIMIT),
    offset: int = Query(0, ge=0),
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get activity log for the current user (paginated, all events)."""
    count_result = await db.execute(select(func.count(ActivityLog.id)).where(ActivityLog.user_id == user.id))
    total = count_result.scalar_one()

    result = await db.execute(
        select(ActivityLog)
        .where(ActivityLog.user_id == user.id)
        .order_by(ActivityLog.created_at.desc(), ActivityLog.id.desc())
        .offset(offset)
        .limit(limit)
    )
    entries = list(result.scalars().all())

    return {"entries": entries, "total": total}
