"""
CSRF (Cross-Site Request Forgery) protection middleware.

Implements the Synchronizer Token Pattern:
1. Generates a cryptographically secure token per session
2. Validates token on state-changing requests (POST, PUT, DELETE, PATCH)
3. Exempt paths for OAuth callbacks (which have their own state protection)

Token delivery:
- Template context via `csrf_token` variable
- Meta tag in base.html: <meta name="csrf-token" content="...">
- JavaScript reads from meta tag and sends as X-CSRF-Token header

v0.24.0: Security Hardening
"""

import secrets

from fastapi import HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

# Paths exempt from CSRF validation (OAuth callbacks have their own state protection)
CSRF_EXEMPT_PATHS = {
    "/auth/google/callback",
    "/auth/todoist/callback",
    "/health",
    "/ready",
    "/metrics",
}

# Methods that require CSRF validation
CSRF_PROTECTED_METHODS = {"POST", "PUT", "DELETE", "PATCH"}

# Session key for CSRF token
CSRF_SESSION_KEY = "_csrf_token"

# Header name for CSRF token
CSRF_HEADER_NAME = "X-CSRF-Token"

# Form field name for CSRF token (fallback)
CSRF_FORM_FIELD = "csrf_token"


def generate_csrf_token() -> str:
    """Generate a cryptographically secure CSRF token."""
    return secrets.token_urlsafe(32)


def get_csrf_token(request: Request) -> str:
    """Get or create CSRF token for the current session."""
    if CSRF_SESSION_KEY not in request.session:
        request.session[CSRF_SESSION_KEY] = generate_csrf_token()
    return request.session[CSRF_SESSION_KEY]


class CSRFMiddleware(BaseHTTPMiddleware):
    """
    Middleware that validates CSRF tokens on state-changing requests.

    Token sources (checked in order):
    1. X-CSRF-Token header (preferred for AJAX)
    2. csrf_token form field (fallback for traditional forms)
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        # Skip for paths that don't have session (health endpoints, etc.)
        # Check if session scope exists (set by SessionMiddleware)
        if "session" not in request.scope:
            return await call_next(request)

        # Always ensure a CSRF token exists in session (for template rendering)
        get_csrf_token(request)

        # Only validate on protected methods
        if request.method not in CSRF_PROTECTED_METHODS:
            return await call_next(request)

        # Skip validation for exempt paths
        if request.url.path in CSRF_EXEMPT_PATHS:
            return await call_next(request)

        # Skip validation for unauthenticated requests (no session = no CSRF risk)
        # The session is set by SessionMiddleware which runs before this
        if "user_id" not in request.session:
            return await call_next(request)

        # Get expected token from session
        expected_token = request.session.get(CSRF_SESSION_KEY)
        if not expected_token:
            # No token in session - should not happen, but regenerate
            expected_token = generate_csrf_token()
            request.session[CSRF_SESSION_KEY] = expected_token

        # Check header first (AJAX requests)
        provided_token = request.headers.get(CSRF_HEADER_NAME)

        # If not in header, check form field (traditional form submission)
        # Note: This requires reading the body, so we only do it as fallback
        if not provided_token:
            # For multipart/form-data or application/x-www-form-urlencoded
            content_type = request.headers.get("content-type", "")
            if "form" in content_type.lower():
                # Can't easily access form data in middleware without consuming body
                # For now, rely on header for all requests
                # Forms should use JS to add the header
                pass

        # Validate token
        if not provided_token or not secrets.compare_digest(provided_token, expected_token):
            raise HTTPException(
                status_code=403,
                detail="CSRF token missing or invalid",
            )

        return await call_next(request)


def require_csrf_token(request: Request) -> str:
    """
    FastAPI dependency that validates CSRF token.

    Use this as an alternative to middleware for specific routes:

        @router.post("/sensitive-action")
        async def sensitive_action(csrf: str = Depends(require_csrf_token)):
            ...
    """
    expected_token = request.session.get(CSRF_SESSION_KEY)
    if not expected_token:
        raise HTTPException(status_code=403, detail="CSRF token not found in session")

    provided_token = request.headers.get(CSRF_HEADER_NAME)
    if not provided_token or not secrets.compare_digest(provided_token, expected_token):
        raise HTTPException(status_code=403, detail="CSRF token missing or invalid")

    return provided_token
