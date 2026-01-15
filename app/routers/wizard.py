"""
Wizard API endpoints for first-run onboarding.

Provides REST endpoints for managing the setup wizard state.
"""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User
from app.routers.auth import require_user

router = APIRouter(prefix="/api/wizard", tags=["wizard"])


# =============================================================================
# Response Models
# =============================================================================


class WizardStatusResponse(BaseModel):
    """Response model for wizard status."""

    completed: bool
    completed_at: str | None = None


class WizardActionResponse(BaseModel):
    """Response model for wizard actions."""

    success: bool


# =============================================================================
# Endpoints
# =============================================================================


@router.get("/status", response_model=WizardStatusResponse)
async def get_wizard_status(
    user: User = Depends(require_user),
) -> WizardStatusResponse:
    """Check if wizard has been completed."""
    return WizardStatusResponse(
        completed=user.wizard_completed,
        completed_at=user.wizard_completed_at.isoformat() if user.wizard_completed_at else None,
    )


@router.post("/complete", response_model=WizardActionResponse)
async def complete_wizard(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_user),
) -> WizardActionResponse:
    """Mark wizard as completed."""
    user.wizard_completed = True
    user.wizard_completed_at = datetime.now(UTC)
    await db.commit()

    return WizardActionResponse(success=True)


@router.post("/reset", response_model=WizardActionResponse)
async def reset_wizard(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_user),
) -> WizardActionResponse:
    """Reset wizard to allow re-running."""
    user.wizard_completed = False
    user.wizard_completed_at = None
    await db.commit()

    return WizardActionResponse(success=True)
