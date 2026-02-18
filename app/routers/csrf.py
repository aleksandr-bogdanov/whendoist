"""
CSRF token endpoint for the React SPA.

Returns the session's CSRF token so the frontend can include it
as X-CSRF-Token on all state-changing requests.
"""

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.middleware.csrf import get_csrf_token

router = APIRouter(prefix="/csrf", tags=["csrf"])


class CSRFTokenResponse(BaseModel):
    csrf_token: str


@router.get("", response_model=CSRFTokenResponse)
async def get_csrf(request: Request) -> CSRFTokenResponse:
    """Return the CSRF token for the current session."""
    token = get_csrf_token(request)
    return CSRFTokenResponse(csrf_token=token)
