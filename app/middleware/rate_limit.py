"""
Rate limiting middleware using slowapi.

Protects sensitive endpoints from brute force and abuse:
- Auth/passkey endpoints: 10/minute (prevents credential stuffing)
- Encryption endpoints: 5/minute (expensive PBKDF2 operations)
- General API: 60/minute (normal usage patterns)
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

# Create limiter instance with remote address as key
limiter = Limiter(key_func=get_remote_address, default_limits=["100/minute"])

# Specific rate limits for sensitive endpoints
AUTH_LIMIT = "10/minute"  # Auth and passkey endpoints
ENCRYPTION_LIMIT = "5/minute"  # Encryption setup/disable endpoints
API_LIMIT = "60/minute"  # General API endpoints
