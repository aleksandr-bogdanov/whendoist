"""
User info endpoint for the React SPA.

Returns the current user's basic profile (name, email, demo status,
encryption and calendar connection flags).
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import GoogleToken, User
from app.routers.auth import require_user
from app.services.demo_service import DemoService
from app.services.preferences_service import PreferencesService

router = APIRouter(prefix="/me", tags=["me"])


class MeResponse(BaseModel):
    name: str | None
    email: str
    is_demo_user: bool
    encryption_enabled: bool
    calendar_connected: bool


@router.get("", response_model=MeResponse)
async def get_me(
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> MeResponse:
    """Return current user info for the SPA shell."""
    token = await db.scalar(select(GoogleToken).where(GoogleToken.user_id == user.id))
    prefs_service = PreferencesService(db, user.id)
    prefs = await prefs_service.get_preferences()
    return MeResponse(
        name=user.name,
        email=user.email,
        is_demo_user=DemoService.is_demo_user(user.email),
        encryption_enabled=prefs.encryption_enabled,
        calendar_connected=token is not None,
    )
