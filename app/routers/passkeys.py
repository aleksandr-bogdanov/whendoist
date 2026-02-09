"""
Passkey (WebAuthn) API endpoints.

Provides REST endpoints for managing WebAuthn passkeys used for E2E encryption unlock.
"""

import json

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession
from webauthn.helpers import base64url_to_bytes

from app.database import get_db
from app.middleware.rate_limit import ENCRYPTION_LIMIT, limiter
from app.models import User
from app.routers.auth import require_user
from app.services.challenge_service import ChallengeService
from app.services.passkey_service import PasskeyService

router = APIRouter(prefix="/passkeys", tags=["passkeys"])


# =============================================================================
# Request/Response Models
# =============================================================================


class RegistrationOptionsResponse(BaseModel):
    """WebAuthn registration options for the browser."""

    options: dict  # Parsed JSON for easier client-side handling
    challenge: str  # Base64url-encoded challenge (for reference)


class RegistrationVerifyRequest(BaseModel):
    """Request to verify and store a new passkey."""

    credential: dict  # WebAuthn credential from navigator.credentials.create()
    name: str  # User-provided name for this passkey
    prf_salt: str  # Salt used in PRF evaluation
    wrapped_key: str  # Master encryption key wrapped with PRF-derived key


class RegistrationVerifyResponse(BaseModel):
    """Response after successful passkey registration."""

    success: bool
    passkey_id: int
    name: str


class AuthenticationOptionsResponse(BaseModel):
    """WebAuthn authentication options for the browser."""

    options: dict  # Parsed JSON for easier client-side handling
    prf_salt: str | None = None  # PRF salt for key derivation
    wrapped_key: str | None = None  # Master key wrapped with PRF-derived key
    has_passkeys: bool


class AuthenticationVerifyRequest(BaseModel):
    """Request to verify passkey authentication."""

    credential: dict  # WebAuthn assertion from navigator.credentials.get()


class AuthenticationVerifyResponse(BaseModel):
    """Response after successful passkey authentication."""

    success: bool
    prf_salt: str  # PRF salt for key derivation
    wrapped_key: str  # Master key wrapped with PRF-derived key


class PasskeyInfo(BaseModel):
    """Public passkey information for listing."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    created_at: str
    last_used_at: str | None


class PasskeyListResponse(BaseModel):
    """Response with list of user's passkeys."""

    passkeys: list[PasskeyInfo]
    count: int


class DeletePasskeyResponse(BaseModel):
    """Response after deleting a passkey."""

    success: bool
    message: str


# =============================================================================
# Registration Endpoints
# =============================================================================


@router.post("/register/options", response_model=RegistrationOptionsResponse)
@limiter.limit(ENCRYPTION_LIMIT)
async def get_registration_options(
    request: Request,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get WebAuthn registration options for creating a new passkey.

    The browser uses these options with navigator.credentials.create().
    """
    passkey_service = PasskeyService(db, user.id)
    challenge_service = ChallengeService(db, user.id)

    options_json = await passkey_service.generate_registration_options()
    options = json.loads(options_json)

    # Extract and store the challenge for verification (database-backed for multi-worker support)
    challenge_b64 = options.get("challenge", "")
    challenge_bytes = base64url_to_bytes(challenge_b64)
    await challenge_service.store_challenge(challenge_bytes)
    await db.commit()  # Commit so challenge persists for the verify request

    return RegistrationOptionsResponse(
        options=options,
        challenge=challenge_b64,
    )


@router.post("/register/verify", response_model=RegistrationVerifyResponse)
@limiter.limit(ENCRYPTION_LIMIT)
async def verify_registration(
    request: Request,
    data: RegistrationVerifyRequest,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Verify the WebAuthn registration response and store the passkey.

    After navigator.credentials.create() returns, the client sends the
    credential along with the PRF salt and encrypted test value.
    """
    challenge_service = ChallengeService(db, user.id)
    challenge = await challenge_service.get_and_consume_challenge()
    if not challenge:
        raise HTTPException(
            status_code=400,
            detail="No pending registration challenge. Please start registration again.",
        )

    passkey_service = PasskeyService(db, user.id)

    try:
        passkey = await passkey_service.verify_registration(
            credential_json=json.dumps(data.credential),
            name=data.name,
            prf_salt=data.prf_salt,
            wrapped_key=data.wrapped_key,
            expected_challenge=challenge,
        )
        await db.commit()

        return RegistrationVerifyResponse(
            success=True,
            passkey_id=passkey.id,
            name=passkey.name,
        )
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"Registration verification failed: {e}") from e


# =============================================================================
# Authentication Endpoints
# =============================================================================


@router.post("/authenticate/options", response_model=AuthenticationOptionsResponse)
@limiter.limit(ENCRYPTION_LIMIT)
async def get_authentication_options(
    request: Request,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get WebAuthn authentication options for unlocking with a passkey.

    Also returns the PRF salt and test value for the first passkey.
    The browser uses these options with navigator.credentials.get().
    """
    passkey_service = PasskeyService(db, user.id)
    challenge_service = ChallengeService(db, user.id)

    options_json, passkey = await passkey_service.generate_authentication_options()
    options = json.loads(options_json)

    # Extract and store the challenge for verification (database-backed for multi-worker support)
    challenge_b64 = options.get("challenge", "")
    challenge_bytes = base64url_to_bytes(challenge_b64)
    await challenge_service.store_challenge(challenge_bytes)
    await db.commit()  # Commit so challenge persists for the verify request

    if passkey:
        return AuthenticationOptionsResponse(
            options=options,
            prf_salt=passkey.prf_salt,
            wrapped_key=passkey.wrapped_key,
            has_passkeys=True,
        )
    else:
        return AuthenticationOptionsResponse(
            options=options,
            prf_salt=None,
            wrapped_key=None,
            has_passkeys=False,
        )


@router.post("/authenticate/verify", response_model=AuthenticationVerifyResponse)
@limiter.limit(ENCRYPTION_LIMIT)
async def verify_authentication(
    request: Request,
    data: AuthenticationVerifyRequest,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Verify the WebAuthn authentication response.

    Returns the PRF salt and wrapped key for the authenticated passkey.
    The client unwraps this to get the master encryption key.
    """
    challenge_service = ChallengeService(db, user.id)
    challenge = await challenge_service.get_and_consume_challenge()
    if not challenge:
        raise HTTPException(
            status_code=400,
            detail="No pending authentication challenge. Please start authentication again.",
        )

    passkey_service = PasskeyService(db, user.id)

    try:
        passkey = await passkey_service.verify_authentication(
            credential_json=json.dumps(data.credential),
            expected_challenge=challenge,
        )
        await db.commit()

        return AuthenticationVerifyResponse(
            success=True,
            prf_salt=passkey.prf_salt,
            wrapped_key=passkey.wrapped_key,
        )
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"Authentication verification failed: {e}") from e


# =============================================================================
# Passkey Lookup Endpoints
# =============================================================================


@router.get("/by-credential/{credential_id}")
async def get_passkey_by_credential(
    credential_id: str,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get PRF data for a specific credential ID.

    This is used when the browser already knows which credential was used
    and needs to look up the corresponding PRF salt and wrapped key.
    """
    service = PasskeyService(db, user.id)

    passkey = await service.get_passkey_for_credential(credential_id)
    if not passkey:
        raise HTTPException(status_code=404, detail="Passkey not found")

    return {
        "prf_salt": passkey.prf_salt,
        "wrapped_key": passkey.wrapped_key,
    }


# =============================================================================
# Management Endpoints
# =============================================================================


@router.get("", response_model=PasskeyListResponse)
async def list_passkeys(
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """List all passkeys for the current user."""
    service = PasskeyService(db, user.id)

    passkeys = await service.list_passkeys()

    return PasskeyListResponse(
        passkeys=[
            PasskeyInfo(
                id=p.id,
                name=p.name,
                created_at=p.created_at.isoformat() if p.created_at else "",
                last_used_at=p.last_used_at.isoformat() if p.last_used_at else None,
            )
            for p in passkeys
        ],
        count=len(passkeys),
    )


@router.delete("/{passkey_id}", response_model=DeletePasskeyResponse)
@limiter.limit(ENCRYPTION_LIMIT)
async def delete_passkey(
    passkey_id: int,
    request: Request,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete a passkey.

    Note: Cannot delete the last passkey if no passphrase fallback is configured.
    """
    service = PasskeyService(db, user.id)

    # Check if this is the last passkey
    count = await service.get_passkey_count()

    deleted = await service.delete_passkey(passkey_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Passkey not found")

    await db.commit()

    return DeletePasskeyResponse(
        success=True,
        message=f"Passkey deleted. {count - 1} passkey(s) remaining.",
    )
