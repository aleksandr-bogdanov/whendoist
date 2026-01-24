"""
Security headers middleware.

Adds essential security headers to all responses:
- Content-Security-Policy: Prevents XSS by controlling resource loading
- X-Frame-Options: Prevents clickjacking
- X-Content-Type-Options: Prevents MIME sniffing
- Referrer-Policy: Controls referrer information leakage
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Middleware that adds security headers to all responses."""

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        # Content Security Policy
        # Note: 'unsafe-inline' is required for Pico CSS and some inline styles
        # We use strict sources for scripts to prevent XSS
        csp = (
            "default-src 'self'; "
            # Scripts: self + CDN for ApexCharts and external libraries
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            # Styles: self + CDN + unsafe-inline (required for Pico CSS and inline styles)
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; "
            # Images: self + data URIs (for inline SVGs) + HTTPS sources
            "img-src 'self' data: https:; "
            # Fonts: self + Google Fonts + CDN
            "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net; "
            # Connect: self + Google APIs for OAuth/Calendar + Google Fonts
            "connect-src 'self' https://accounts.google.com https://www.googleapis.com https://fonts.googleapis.com https://fonts.gstatic.com; "
            # Prevent embedding in frames (clickjacking protection)
            "frame-ancestors 'none'; "
            # Restrict base URI to prevent base tag injection
            "base-uri 'self'; "
            # Form actions: self + Google for OAuth
            "form-action 'self' https://accounts.google.com https://todoist.com;"
        )

        response.headers["Content-Security-Policy"] = csp
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        return response
