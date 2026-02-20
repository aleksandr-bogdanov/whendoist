import asyncio
import logging
import secrets
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

import httpx

from app.config import get_settings
from app.constants import TOKEN_REFRESH_BACKOFF_BASE, TOKEN_REFRESH_MAX_RETRIES

logger = logging.getLogger("whendoist.auth.google")

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"

SCOPES = [
    "openid",
    "email",
    "profile",  # Required for name, given_name, picture
    "https://www.googleapis.com/auth/calendar.readonly",
]

# Extended scopes for calendar write access (task sync)
SCOPES_WITH_WRITE = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/calendar",  # Full read-write
]


def get_authorize_url(state: str, write_scope: bool = False) -> str:
    settings = get_settings()
    scopes = SCOPES_WITH_WRITE if write_scope else SCOPES
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": " ".join(scopes),
        "state": state,
        "access_type": "offline",
        "prompt": "consent",
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


def generate_state() -> str:
    return secrets.token_urlsafe(32)


async def exchange_code(code: str) -> dict:
    """Exchange authorization code for tokens. Returns dict with access_token, refresh_token, expires_in."""
    settings = get_settings()
    async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
        response = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": settings.google_redirect_uri,
            },
        )
        response.raise_for_status()
        return response.json()


class TokenRefreshError(Exception):
    """Raised when token refresh fails after all retries."""

    pass


async def refresh_access_token(refresh_token: str) -> dict:
    """
    Refresh the access token using refresh token.

    Implements retry with exponential backoff:
    - 3 attempts with 1s, 2s, 4s delays
    - Handles transient network/server errors

    Returns:
        dict with access_token and optionally refresh_token (if rotated)

    Raises:
        TokenRefreshError: If refresh fails after all retries
    """
    settings = get_settings()
    last_error: Exception | None = None

    for attempt in range(TOKEN_REFRESH_MAX_RETRIES):
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    GOOGLE_TOKEN_URL,
                    data={
                        "client_id": settings.google_client_id,
                        "client_secret": settings.google_client_secret,
                        "refresh_token": refresh_token,
                        "grant_type": "refresh_token",
                    },
                )
                response.raise_for_status()
                return response.json()
        except httpx.HTTPStatusError as e:
            # 4xx errors (except 429) are not retryable
            if 400 <= e.response.status_code < 500 and e.response.status_code != 429:
                logger.error(f"Token refresh failed with client error: {e.response.status_code}")
                raise TokenRefreshError(f"Token refresh failed: {e.response.status_code}") from e
            last_error = e
        except (httpx.RequestError, httpx.TimeoutException) as e:
            # Network/timeout errors are retryable
            last_error = e

        # Calculate backoff: 1s, 2s, 4s
        backoff = TOKEN_REFRESH_BACKOFF_BASE * (2**attempt)
        logger.warning(f"Token refresh attempt {attempt + 1} failed, retrying in {backoff}s: {last_error}")
        await asyncio.sleep(backoff)

    logger.error(f"Token refresh failed after {TOKEN_REFRESH_MAX_RETRIES} attempts")
    raise TokenRefreshError(f"Token refresh failed after {TOKEN_REFRESH_MAX_RETRIES} attempts") from last_error


async def get_user_email(access_token: str) -> str:
    """Get user email from Google userinfo endpoint."""
    async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
        response = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        response.raise_for_status()
        data = response.json()
        return data["email"]


async def get_user_info(access_token: str) -> dict:
    """Get user info (email, name, picture) from Google userinfo endpoint."""
    async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
        response = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        response.raise_for_status()
        data = response.json()
        return {
            "email": data.get("email"),
            "name": data.get("name"),
            "given_name": data.get("given_name"),
            "picture": data.get("picture"),
        }


def calculate_expires_at(expires_in: int) -> datetime:
    """Calculate expiration datetime from expires_in seconds."""
    return datetime.now(UTC) + timedelta(seconds=expires_in)
