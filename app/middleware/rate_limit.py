"""
Rate limiting middleware using slowapi.

Protects sensitive endpoints from brute force and abuse:
- Auth/passkey endpoints: 10/minute (prevents credential stuffing)
- Encryption endpoints: 5/minute (expensive PBKDF2 operations)
- Backup endpoints: 5/minute (computationally expensive operations)
- General API: 60/minute (normal usage patterns)
"""

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request


def get_user_or_ip(request: Request) -> str:
    """
    Rate limit key function that uses user_id when authenticated, IP otherwise.

    For authenticated endpoints, this ensures rate limits apply per-user,
    not per-IP (preventing one user from affecting others behind NAT).
    """
    # Try to get user_id from request state (set by auth middleware)
    user = getattr(request.state, "user", None)
    if user and hasattr(user, "id"):
        return f"user:{user.id}"

    # Fall back to IP for unauthenticated requests
    return get_remote_address(request)


# Create limiter instance with remote address as default key
limiter = Limiter(key_func=get_remote_address, default_limits=["100/minute"])

# Specific rate limits for sensitive endpoints
AUTH_LIMIT = "10/minute"  # Auth and passkey endpoints
DEMO_LIMIT = "3/minute"  # Demo login/reset (expensive seeding operations)
ENCRYPTION_LIMIT = "5/minute"  # Encryption setup/disable endpoints
BACKUP_LIMIT = "5/minute"  # Backup export/import (expensive operations)
API_LIMIT = "60/minute"  # General API endpoints
TASK_CREATE_LIMIT = "30/minute"  # Task creation (prevents storage abuse)
