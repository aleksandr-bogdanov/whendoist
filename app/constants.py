"""
Centralized business constants for Whendoist.

This module provides a single source of truth for business constants
used across the application. Constants are grouped by domain.

v0.15.0: Architecture Cleanup
"""

from datetime import date
from enum import IntEnum


class Impact(IntEnum):
    """
    Task priority/impact levels.

    Lower numeric value = higher priority.
    Used for task sorting and display.
    """

    P1 = 1  # High - must do today
    P2 = 2  # Mid - important, do soon
    P3 = 3  # Low - normal priority
    P4 = 4  # Min - nice to have (default)

    @property
    def label(self) -> str:
        """Human-readable label for the impact level."""
        return IMPACT_LABELS[self.value]

    @property
    def color(self) -> str:
        """Hex color for the impact level (used in charts and UI)."""
        return IMPACT_COLORS[self.value]


# Impact level labels (used by Impact.label property)
IMPACT_LABELS: dict[int, str] = {
    1: "High",
    2: "Mid",
    3: "Low",
    4: "Min",
}

# Impact level colors (Tailwind-inspired palette)
# Used in analytics charts and UI elements
IMPACT_COLORS: dict[int, str] = {
    1: "#dc2626",  # red-600 (High)
    2: "#f97316",  # orange-500 (Mid)
    3: "#eab308",  # yellow-500 (Low)
    4: "#22c55e",  # green-500 (Min)
}


class RetentionDays(IntEnum):
    """
    Valid completed task retention periods.

    These are the only allowed values for completed_retention_days preference.
    """

    ONE_DAY = 1
    THREE_DAYS = 3  # default
    SEVEN_DAYS = 7

    @classmethod
    def is_valid(cls, days: int) -> bool:
        """Check if the given number of days is a valid retention period."""
        return days in (1, 3, 7)


# =============================================================================
# Crypto Constants
# =============================================================================
# These mirror the values in static/js/crypto.js for documentation purposes.
# The authoritative values are in the JS file (client-side encryption).

PBKDF2_ITERATIONS = 600_000  # 2024 OWASP recommendation

# WebAuthn challenge expiration (5 minutes as per WebAuthn recommendation)
CHALLENGE_TTL_SECONDS = 300

# WebAuthn timeout for registration/authentication (60 seconds)
WEBAUTHN_TIMEOUT_MS = 60000

# Known value used to verify encryption passphrase is correct
ENCRYPTION_TEST_VALUE = "WHENDOIST_ENCRYPTION_TEST"


# =============================================================================
# Default Values
# =============================================================================

DEFAULT_RETENTION_DAYS = RetentionDays.THREE_DAYS
DEFAULT_IMPACT = Impact.P4


# =============================================================================
# Input Validation Limits
# =============================================================================

TASK_TITLE_MAX_LENGTH = 500
TASK_DESCRIPTION_MAX_LENGTH = 10000
DOMAIN_NAME_MAX_LENGTH = 255


# =============================================================================
# Google Calendar Constants
# =============================================================================

GCAL_MAX_EVENTS = 1000  # Default max events to fetch per calendar
GCAL_PAGE_SIZE = 250  # Google's max results per page
TOKEN_REFRESH_BUFFER_SECONDS = 300  # Proactive refresh 5 min before expiry
TOKEN_REFRESH_MAX_RETRIES = 3  # Retry attempts for token refresh
TOKEN_REFRESH_BACKOFF_BASE = 1  # Base seconds for exponential backoff (1s, 2s, 4s)

# Google Calendar Sync Constants
GCAL_SYNC_CALENDAR_NAME = "Whendoist"
GCAL_SYNC_DEFAULT_DURATION_MINUTES = 30  # Fallback for tasks without duration
GCAL_SYNC_BATCH_DELAY_SECONDS = 0.2  # Delay between API calls in bulk sync (~5 QPS)
GCAL_SYNC_RATE_LIMIT_MAX_RETRIES = 3  # Max retries for rate-limited requests
GCAL_SYNC_RATE_LIMIT_BACKOFF_BASE = 5.0  # Base seconds for exponential backoff (5s, 10s, 20s)
GCAL_SYNC_RATE_LIMIT_PENALTY_SECONDS = 3.0  # Extra delay added to all subsequent calls after rate limit
GCAL_WRITE_SCOPE = "https://www.googleapis.com/auth/calendar"


# =============================================================================
# Analytics Constants
# =============================================================================

HEATMAP_WEEKS = 12  # Number of weeks to show in completion heatmap
VELOCITY_DAYS = 30  # Number of days for velocity chart
RECURRING_STATS_LIMIT = 10  # Max recurring tasks to show in stats
TITLE_TRUNCATE_LENGTH = 40  # Max chars for truncated task titles in stats


# =============================================================================
# Task Instance Constants
# =============================================================================

INSTANCE_RETENTION_DAYS = 90  # Days to keep completed/skipped instances

# Materialization timeout (5 minutes for runaway materialization cycles)
MATERIALIZATION_TIMEOUT_SECONDS = 300


# =============================================================================
# Timezone Constants
# =============================================================================

DEFAULT_TIMEZONE = "UTC"  # Fallback when user hasn't set timezone


# =============================================================================
# Demo Login Constants
# =============================================================================

DEMO_EMAIL_SUFFIX = "@whendoist.local"
DEMO_VALID_PROFILES = {"demo", "encrypted", "blank"}


def get_user_today(timezone: str | None) -> date:
    """
    Get today's date in the user's timezone.

    Args:
        timezone: IANA timezone string (e.g., "America/New_York") or None.

    Returns:
        Today's date in the specified timezone, or UTC if timezone is None/invalid.
    """
    from datetime import datetime
    from zoneinfo import ZoneInfo

    try:
        tz = ZoneInfo(timezone) if timezone else ZoneInfo(DEFAULT_TIMEZONE)
    except (KeyError, TypeError):
        # Invalid timezone string - fall back to UTC
        tz = ZoneInfo(DEFAULT_TIMEZONE)

    return datetime.now(tz).date()
