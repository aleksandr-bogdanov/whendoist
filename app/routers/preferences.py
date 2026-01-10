"""
User preferences API endpoints.

Provides REST endpoints for managing task display preferences.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User
from app.routers.auth import require_user
from app.services.preferences_service import PreferencesService

router = APIRouter(prefix="/api/preferences", tags=["preferences"])


# =============================================================================
# Request/Response Models
# =============================================================================


class PreferencesUpdate(BaseModel):
    """Request body for updating preferences."""

    show_completed_in_planner: bool | None = None
    completed_retention_days: int | None = Field(None, ge=1, le=7)
    completed_move_to_bottom: bool | None = None
    show_completed_in_list: bool | None = None
    hide_recurring_after_completion: bool | None = None


class PreferencesResponse(BaseModel):
    """Response model for user preferences."""

    show_completed_in_planner: bool
    completed_retention_days: int
    completed_move_to_bottom: bool
    show_completed_in_list: bool
    hide_recurring_after_completion: bool

    class Config:
        from_attributes = True


# =============================================================================
# Endpoints
# =============================================================================


@router.get("", response_model=PreferencesResponse)
async def get_preferences(
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current user's preferences (creates defaults if missing)."""
    service = PreferencesService(db, user.id)
    prefs = await service.get_preferences()
    await db.commit()  # Commit in case defaults were created
    return prefs


@router.put("", response_model=PreferencesResponse)
async def update_preferences(
    data: PreferencesUpdate,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Update current user's preferences."""
    service = PreferencesService(db, user.id)
    prefs = await service.update_preferences(
        show_completed_in_planner=data.show_completed_in_planner,
        completed_retention_days=data.completed_retention_days,
        completed_move_to_bottom=data.completed_move_to_bottom,
        show_completed_in_list=data.show_completed_in_list,
        hide_recurring_after_completion=data.hide_recurring_after_completion,
    )
    await db.commit()
    return prefs
