"""
Push notification device token management.

Tauri mobile apps register their FCM/APNs tokens here so the backend
can send push reminders when the app is closed/backgrounded.

v0.61.0: Phase 2 — Push Notifications / Remote Reminders
"""

import logging
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import PUSH_MAX_TOKENS_PER_USER
from app.database import get_db
from app.models import DeviceToken, User
from app.routers.auth import require_user

logger = logging.getLogger("whendoist.push")

router = APIRouter(prefix="/push", tags=["push-notifications"])


class RegisterTokenRequest(BaseModel):
    token: str
    platform: Literal["ios", "android"]


@router.post("/token", status_code=201)
async def register_push_token(
    data: RegisterTokenRequest,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Register a device push token for remote notifications.

    Upserts: if the (user_id, token) pair exists, touches updated_at.
    Enforces max tokens per user — deletes oldest if cap is reached.
    """
    # Check if token already exists for this user
    result = await db.execute(
        select(DeviceToken).where(
            DeviceToken.user_id == user.id,
            DeviceToken.token == data.token,
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        # Touch updated_at to keep it fresh
        existing.updated_at = datetime.now(UTC)
        existing.platform = data.platform
    else:
        # Enforce max tokens per user — delete oldest if at cap
        count_result = await db.execute(
            select(DeviceToken.id).where(DeviceToken.user_id == user.id).order_by(DeviceToken.updated_at.asc())
        )
        existing_ids = list(count_result.scalars().all())

        if len(existing_ids) >= PUSH_MAX_TOKENS_PER_USER:
            # Delete oldest tokens to make room
            ids_to_delete = existing_ids[: len(existing_ids) - PUSH_MAX_TOKENS_PER_USER + 1]
            await db.execute(delete(DeviceToken).where(DeviceToken.id.in_(ids_to_delete)))

        db.add(
            DeviceToken(
                user_id=user.id,
                token=data.token,
                platform=data.platform,
            )
        )

    await db.commit()
    return {"status": "registered"}


@router.delete("/token", status_code=204)
async def unregister_push_token(
    token: str,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Unregister a device push token (e.g. on logout).

    Token is passed as a query parameter (DELETE bodies are stripped by some proxies).
    Idempotent: returns 204 even if token wasn't found.
    Multitenancy: only deletes tokens owned by the authenticated user.
    """
    await db.execute(
        delete(DeviceToken).where(
            DeviceToken.user_id == user.id,
            DeviceToken.token == token,
        )
    )
    await db.commit()
    return Response(status_code=204)
