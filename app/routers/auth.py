from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from itsdangerous import BadSignature, URLSafeTimedSerializer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import google, todoist
from app.config import get_settings
from app.database import get_db
from app.models import GoogleToken, TodoistToken, User

router = APIRouter(prefix="/auth", tags=["auth"])

# Use a separate signed serializer for OAuth state (more reliable than session for OAuth flows)
_serializer = URLSafeTimedSerializer(get_settings().secret_key)


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
async def todoist_login() -> Response:
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
        path="/",
    )
    return response


@router.get("/todoist/callback")
async def todoist_callback(
    request: Request,
    db: AsyncSession = Depends(get_db),
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    todoist_oauth_state: str | None = Cookie(default=None),
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
    response = RedirectResponse(url="/dashboard", status_code=303)
    response.delete_cookie("todoist_oauth_state")
    return response


# --- Google OAuth ---


@router.get("/google")
async def google_login() -> Response:
    """Redirect to Google OAuth."""
    state = google.generate_state()
    url = google.get_authorize_url(state)
    response = RedirectResponse(url, status_code=302)
    response.set_cookie(
        key="google_oauth_state",
        value=_sign_state(state),
        max_age=600,
        httponly=True,
        samesite="lax",
        path="/",
    )
    return response


@router.get("/google/callback")
async def google_callback(
    request: Request,
    code: str,
    state: str,
    db: AsyncSession = Depends(get_db),
    google_oauth_state: str | None = Cookie(default=None),
) -> Response:
    """Handle Google OAuth callback."""
    if not google_oauth_state:
        raise HTTPException(status_code=400, detail="Missing state cookie")

    stored_state = _verify_state(google_oauth_state)
    if not stored_state or stored_state != state:
        raise HTTPException(status_code=400, detail="Invalid state")

    tokens = await google.exchange_code(code)
    access_token = tokens["access_token"]
    refresh_token = tokens.get("refresh_token")
    expires_in = tokens.get("expires_in", 3600)

    email = await google.get_user_email(access_token)

    # Find or create user
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user:
        user = User(email=email)
        db.add(user)
        await db.flush()

    # Update or create Google token
    result = await db.execute(select(GoogleToken).where(GoogleToken.user_id == user.id))
    token = result.scalar_one_or_none()

    if token:
        token.access_token = access_token
        if refresh_token:
            token.refresh_token = refresh_token
        token.expires_at = google.calculate_expires_at(expires_in)
    else:
        token = GoogleToken(user_id=user.id, expires_at=google.calculate_expires_at(expires_in))
        token.access_token = access_token
        token.refresh_token = refresh_token
        db.add(token)

    await db.commit()

    request.session["user_id"] = str(user.id)
    response = RedirectResponse(url="/dashboard", status_code=303)
    response.delete_cookie("google_oauth_state")
    return response


@router.get("/logout")
async def logout(request: Request) -> RedirectResponse:
    """Clear session and redirect to home."""
    request.session.clear()
    return RedirectResponse(url="/", status_code=303)
