"""
Device token authentication for Tauri native app.

Tauri WebViews run on a different origin (tauri://localhost), so session cookies
can't be sent to the backend. This router exchanges a valid session for signed
device tokens (access + refresh), which the app stores locally and sends as
Authorization: Bearer headers.

Flow:
1. User completes Google OAuth in Tauri WebView (cookies work for same-origin redirects)
2. Frontend calls POST /api/v1/device/token with the active session cookie
3. Backend returns signed access_token (1h) + refresh_token (30d)
4. Tauri stores tokens in tauri-plugin-store
5. All subsequent requests use Authorization: Bearer <access_token>
6. On expiry, frontend calls POST /api/v1/device/refresh with the refresh_token

v0.58.0: Tauri v2 Mobile Migration — Phase 0
"""

import logging
import time

from fastapi import APIRouter, Depends, HTTPException, Request
from itsdangerous import BadSignature, URLSafeTimedSerializer
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.constants import (
    DEVICE_REFRESH_TOKEN_MAX_AGE_SECONDS,
    DEVICE_TOKEN_MAX_AGE_SECONDS,
)
from app.database import get_db
from app.middleware.rate_limit import AUTH_LIMIT, limiter
from app.models import User
from app.routers.auth import get_user_id

logger = logging.getLogger("whendoist.device_auth")

router = APIRouter(prefix="/device", tags=["device-auth"])

_settings = get_settings()
_access_serializer = URLSafeTimedSerializer(_settings.secret_key, salt="device-access")
_refresh_serializer = URLSafeTimedSerializer(_settings.secret_key, salt="device-refresh")


def _create_access_token(user_id: int) -> str:
    """Create a signed access token containing the user_id."""
    return _access_serializer.dumps({"uid": user_id, "t": "access"})


def _create_refresh_token(user_id: int) -> str:
    """Create a signed refresh token containing the user_id."""
    return _refresh_serializer.dumps({"uid": user_id, "t": "refresh"})


def verify_access_token(token: str) -> int | None:
    """Verify an access token and return the user_id, or None if invalid/expired."""
    try:
        data = _access_serializer.loads(token, max_age=DEVICE_TOKEN_MAX_AGE_SECONDS)
        if data.get("t") != "access":
            return None
        return data.get("uid")
    except BadSignature:
        return None


def _verify_refresh_token(token: str) -> int | None:
    """Verify a refresh token and return the user_id, or None if invalid/expired."""
    try:
        data = _refresh_serializer.loads(token, max_age=DEVICE_REFRESH_TOKEN_MAX_AGE_SECONDS)
        if data.get("t") != "refresh":
            return None
        return data.get("uid")
    except BadSignature:
        return None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_at: int  # Unix timestamp (seconds)
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/token", response_model=TokenResponse)
@limiter.limit(AUTH_LIMIT)
async def exchange_session_for_token(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Exchange a valid session cookie for device tokens (access + refresh).

    Called once after OAuth login completes in Tauri WebView.
    The session cookie is available because OAuth happens on the same origin.
    """
    user_id = get_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Verify user exists
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    access_token = _create_access_token(user_id)
    refresh_token = _create_refresh_token(user_id)
    expires_at = int(time.time()) + DEVICE_TOKEN_MAX_AGE_SECONDS

    logger.info(f"Device token issued for user {user_id}")

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_at=expires_at,
    )


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit(AUTH_LIMIT)
async def refresh_device_token(
    request: Request,
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Refresh an expired access token using a valid refresh token.

    No session cookie required — the refresh token is self-contained.
    """
    user_id = _verify_refresh_token(body.refresh_token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    # Verify user still exists
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    # Issue fresh tokens (rotating refresh tokens for security)
    access_token = _create_access_token(user_id)
    refresh_token = _create_refresh_token(user_id)
    expires_at = int(time.time()) + DEVICE_TOKEN_MAX_AGE_SECONDS

    logger.debug(f"Device token refreshed for user {user_id}")

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_at=expires_at,
    )


@router.delete("/token")
@limiter.limit(AUTH_LIMIT)
async def revoke_device_token(request: Request) -> dict:
    """Revoke device tokens (logout from native app).

    Since tokens are stateless (signed, not stored in DB), revocation is
    advisory — the client should delete its stored tokens. The endpoint
    exists for the logout flow to have a server-side touchpoint.
    """
    # Best-effort: extract user_id from bearer token for logging
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        user_id = verify_access_token(auth_header[7:])
        if user_id:
            logger.info(f"Device token revoked for user {user_id}")

    return {"success": True}
