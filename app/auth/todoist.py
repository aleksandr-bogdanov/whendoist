import secrets
from urllib.parse import urlencode

import httpx

from app.config import get_settings

TODOIST_AUTH_URL = "https://todoist.com/oauth/authorize"
TODOIST_TOKEN_URL = "https://todoist.com/oauth/access_token"


def get_authorize_url(state: str) -> str:
    settings = get_settings()
    params = {
        "client_id": settings.todoist_client_id,
        "scope": "data:read,data:read_write",
        "state": state,
        "redirect_uri": settings.todoist_redirect_uri,
    }
    return f"{TODOIST_AUTH_URL}?{urlencode(params)}"


def generate_state() -> str:
    return secrets.token_urlsafe(32)


async def exchange_code(code: str) -> str:
    """Exchange authorization code for access token. Returns access token."""
    settings = get_settings()
    async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
        response = await client.post(
            TODOIST_TOKEN_URL,
            data={
                "client_id": settings.todoist_client_id,
                "client_secret": settings.todoist_client_secret,
                "code": code,
                "redirect_uri": settings.todoist_redirect_uri,
            },
        )
        response.raise_for_status()
        data = response.json()
        return data["access_token"]
