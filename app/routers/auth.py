import logging

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from itsdangerous import BadSignature, URLSafeTimedSerializer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import google, todoist
from app.config import get_settings
from app.constants import DEMO_VALID_PROFILES
from app.database import get_db
from app.middleware.rate_limit import AUTH_LIMIT, DEMO_LIMIT, limiter
from app.models import GoogleToken, TodoistToken, User
from app.services.demo_service import DemoService

logger = logging.getLogger("whendoist.auth")
router = APIRouter(prefix="/auth", tags=["auth"])

# Use a separate signed serializer for OAuth state (more reliable than session for OAuth flows)
_settings = get_settings()
_serializer = URLSafeTimedSerializer(_settings.secret_key)
_is_production = _settings.base_url.startswith("https://")


def _sign_state(state: str) -> str:
    """Sign the OAuth state for cookie storage."""
    return _serializer.dumps(state)


def _verify_state(signed: str, max_age: int = 600) -> str | None:
    """Verify and extract the OAuth state. Returns None if invalid."""
    try:
        return _serializer.loads(signed, max_age=max_age)
    except BadSignature:
        return None


def get_user_id(request: Request) -> int | None:
    """Get user_id from signed session cookie."""
    user_id = request.session.get("user_id")
    return int(user_id) if user_id else None


async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)) -> User | None:
    """Get current user from session."""
    user_id = get_user_id(request)
    if not user_id:
        return None
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def require_user(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    """Require authenticated user."""
    user = await get_current_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


# --- Todoist OAuth ---


@router.get("/todoist")
async def todoist_login(wizard: bool = False) -> Response:
    """Redirect to Todoist OAuth."""
    state = todoist.generate_state()
    url = todoist.get_authorize_url(state)
    response = RedirectResponse(url, status_code=302)
    response.set_cookie(
        key="todoist_oauth_state",
        value=_sign_state(state),
        max_age=600,
        httponly=True,
        samesite="lax",
        secure=_is_production,
        path="/",
    )
    # Track if we came from the wizard
    if wizard:
        response.set_cookie(
            key="oauth_return_to_wizard",
            value="true",
            max_age=600,
            httponly=True,
            samesite="lax",
            secure=_is_production,
            path="/",
        )
    logger.debug(f"Set todoist_oauth_state cookie, secure={_is_production}")
    return response


@router.get("/todoist/callback")
@limiter.limit(AUTH_LIMIT)
async def todoist_callback(
    request: Request,
    db: AsyncSession = Depends(get_db),
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    todoist_oauth_state: str | None = Cookie(default=None),
    oauth_return_to_wizard: str | None = Cookie(default=None),
) -> Response:
    """Handle Todoist OAuth callback."""
    # Handle OAuth errors (user denied, etc.)
    if error:
        raise HTTPException(status_code=400, detail=f"Todoist authorization failed: {error}")

    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing code or state parameter")

    if not todoist_oauth_state:
        raise HTTPException(status_code=400, detail="Missing state cookie")

    stored_state = _verify_state(todoist_oauth_state)
    if not stored_state or stored_state != state:
        raise HTTPException(status_code=400, detail="Invalid state")

    access_token = await todoist.exchange_code(code)

    user_id = get_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated. Please login with Google first.")

    # Check if token exists
    result = await db.execute(select(TodoistToken).where(TodoistToken.user_id == user_id))
    token = result.scalar_one_or_none()

    if token:
        token.access_token = access_token
    else:
        token = TodoistToken(user_id=user_id)
        token.access_token = access_token
        db.add(token)

    await db.commit()
    # Return to wizard or settings depending on where we came from
    redirect_url = "/dashboard" if oauth_return_to_wizard else "/settings"
    response = RedirectResponse(url=redirect_url, status_code=303)
    response.delete_cookie("todoist_oauth_state")
    response.delete_cookie("oauth_return_to_wizard")
    return response


# --- Google OAuth ---


@router.get("/google")
async def google_login(wizard: bool = False, write_scope: bool = False) -> Response:
    """Redirect to Google OAuth. Set write_scope=true to request calendar write access."""
    state = google.generate_state()
    url = google.get_authorize_url(state, write_scope=write_scope)
    response = RedirectResponse(url, status_code=302)
    response.set_cookie(
        key="google_oauth_state",
        value=_sign_state(state),
        max_age=600,
        httponly=True,
        samesite="lax",
        secure=_is_production,
        path="/",
    )
    # Track if we came from the wizard
    if wizard:
        response.set_cookie(
            key="oauth_return_to_wizard",
            value="true",
            max_age=600,
            httponly=True,
            samesite="lax",
            secure=_is_production,
            path="/",
        )
    # Track if we requested write scope (for gcal sync setup)
    if write_scope:
        response.set_cookie(
            key="oauth_gcal_write_scope",
            value="true",
            max_age=600,
            httponly=True,
            samesite="lax",
            secure=_is_production,
            path="/",
        )
    logger.debug(f"Set google_oauth_state cookie, secure={_is_production}")
    return response


@router.get("/google/callback")
@limiter.limit(AUTH_LIMIT)
async def google_callback(
    request: Request,
    code: str,
    state: str,
    db: AsyncSession = Depends(get_db),
    google_oauth_state: str | None = Cookie(default=None),
    oauth_return_to_wizard: str | None = Cookie(default=None),
    oauth_gcal_write_scope: str | None = Cookie(default=None),
) -> Response:
    """Handle Google OAuth callback."""
    if not google_oauth_state:
        logger.warning(f"Missing google_oauth_state cookie. Cookies received: {list(request.cookies.keys())}")
        raise HTTPException(
            status_code=400,
            detail="Missing state cookie. Try clearing cookies and using a non-incognito browser.",
        )

    stored_state = _verify_state(google_oauth_state)
    if not stored_state or stored_state != state:
        raise HTTPException(status_code=400, detail="Invalid state")

    tokens = await google.exchange_code(code)
    access_token = tokens["access_token"]
    refresh_token = tokens.get("refresh_token")
    expires_in = tokens.get("expires_in", 3600)

    # Determine write scope from actually granted scopes (source of truth),
    # falling back to the cookie hint for older flows that don't return scope.
    granted_scope = tokens.get("scope", "")
    has_write_scope = (
        ("auth/calendar " in f"{granted_scope} " and "calendar.readonly" not in granted_scope)
        if granted_scope
        else oauth_gcal_write_scope == "true"
    )

    # Get user info including name
    user_info = await google.get_user_info(access_token)
    email = user_info["email"]
    name = user_info.get("given_name") or user_info.get("name")  # Prefer first name

    # Find or create user
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user:
        user = User(email=email, name=name)
        db.add(user)
        await db.flush()
    elif name:
        # Always update name from Google (they may have updated it)
        user.name = name

    # Update or create Google token
    result = await db.execute(select(GoogleToken).where(GoogleToken.user_id == user.id))
    token = result.scalar_one_or_none()

    if token:
        token.access_token = access_token
        if refresh_token:
            token.refresh_token = refresh_token
        token.expires_at = google.calculate_expires_at(expires_in)
        token.gcal_write_scope = has_write_scope
    else:
        token = GoogleToken(
            user_id=user.id,
            expires_at=google.calculate_expires_at(expires_in),
            gcal_write_scope=has_write_scope,
        )
        token.access_token = access_token
        token.refresh_token = refresh_token
        db.add(token)

    await db.commit()

    request.session.clear()
    request.session["user_id"] = str(user.id)
    # Redirect to settings if returning from write scope upgrade
    redirect_url = "/settings" if has_write_scope else "/dashboard"
    if oauth_return_to_wizard:
        redirect_url = "/dashboard"
    response = RedirectResponse(url=redirect_url, status_code=303)
    response.delete_cookie("google_oauth_state")
    response.delete_cookie("oauth_return_to_wizard")
    response.delete_cookie("oauth_gcal_write_scope")
    return response


@router.get("/logout")
async def logout(request: Request) -> RedirectResponse:
    """Clear session and redirect to home."""
    request.session.clear()
    return RedirectResponse(url="/", status_code=303)


@router.post("/todoist/disconnect")
async def disconnect_todoist(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Disconnect Todoist by removing the stored token."""
    user_id = get_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    result = await db.execute(select(TodoistToken).where(TodoistToken.user_id == user_id))
    token = result.scalar_one_or_none()

    if token:
        await db.delete(token)
        await db.commit()

    return {"success": True}


# --- Demo Login ---


@router.get("/demo")
@limiter.limit(DEMO_LIMIT)
async def demo_login(
    request: Request,
    db: AsyncSession = Depends(get_db),
    profile: str = "demo",
) -> Response:
    """Demo login - bypasses Google OAuth for testing/previews."""
    if not _settings.demo_login_enabled:
        raise HTTPException(status_code=404)

    if profile not in DEMO_VALID_PROFILES:
        raise HTTPException(status_code=400, detail=f"Invalid profile. Valid: {', '.join(sorted(DEMO_VALID_PROFILES))}")

    demo_service = DemoService(db)
    user = await demo_service.get_or_create_demo_user(profile)

    request.session.clear()
    request.session["user_id"] = str(user.id)
    return RedirectResponse(url="/thoughts", status_code=303)


@router.post("/demo/reset")
@limiter.limit(DEMO_LIMIT)
async def demo_reset(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Reset demo user data back to initial seed state."""
    if not _settings.demo_login_enabled:
        raise HTTPException(status_code=404)

    user_id = get_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Verify this is actually a demo user
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not DemoService.is_demo_user(user.email):
        raise HTTPException(status_code=403, detail="Only demo accounts can be reset")

    demo_service = DemoService(db)
    await demo_service.reset_demo_user(user_id)
    return RedirectResponse(url="/thoughts", status_code=303)
