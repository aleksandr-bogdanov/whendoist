"""
Request ID middleware for request tracing.

Generates a unique ID for each request and makes it available in:
- Response headers (X-Request-ID)
- Logging context (via contextvars)
- Request state (request.state.request_id)
"""

import uuid
from collections.abc import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.logging_config import request_id_var, user_id_var

REQUEST_ID_HEADER = "X-Request-ID"


class RequestIDMiddleware(BaseHTTPMiddleware):
    """
    Middleware that assigns a unique ID to each request.

    - Uses existing X-Request-ID header if present (for tracing across services)
    - Generates a new UUID if not present
    - Sets the ID in response headers for debugging
    - Sets the ID in contextvars for logging
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Get request ID from header or generate new one
        request_id = request.headers.get(REQUEST_ID_HEADER) or str(uuid.uuid4())[:8]

        # Store in contextvars for logging
        request_id_token = request_id_var.set(request_id)

        # Also set user_id if available from session
        user_id_token = None
        if hasattr(request, "state") and hasattr(request.state, "user_id"):
            user_id_token = user_id_var.set(request.state.user_id)

        # Store in request state for handlers
        request.state.request_id = request_id

        try:
            response = await call_next(request)

            # Add to response headers
            response.headers[REQUEST_ID_HEADER] = request_id

            return response
        finally:
            # Reset contextvars
            request_id_var.reset(request_id_token)
            if user_id_token:
                user_id_var.reset(user_id_token)


def get_request_id() -> str:
    """Get current request ID from context."""
    return request_id_var.get()
