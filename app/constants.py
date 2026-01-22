"""
Centralized business constants for Whendoist.

This module provides a single source of truth for business constants
used across the application. Constants are grouped by domain.

v0.15.0: Architecture Cleanup
"""

from enum import IntEnum


class Impact(IntEnum):
    """
    Task priority/impact levels.

    Lower numeric value = higher priority.
    Used for task sorting and display.
    """

    P1 = 1  # Critical - must do today
    P2 = 2  # High - important, do soon
    P3 = 3  # Medium - normal priority
    P4 = 4  # Low - nice to have (default)

    @property
    def label(self) -> str:
        """Human-readable label for the impact level."""
        return {
            1: "Critical",
            2: "High",
            3: "Medium",
            4: "Low",
        }[self.value]


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

PBKDF2_ITERATIONS_V1 = 100_000  # Legacy (v0.8.0 - v0.11.x)
PBKDF2_ITERATIONS_V2 = 600_000  # Current OWASP recommendation (v0.12.0+)

# WebAuthn challenge expiration (5 minutes as per WebAuthn recommendation)
CHALLENGE_TTL_SECONDS = 300

# Known value used to verify encryption passphrase is correct
ENCRYPTION_TEST_VALUE = "WHENDOIST_ENCRYPTION_TEST"


# =============================================================================
# Default Values
# =============================================================================

DEFAULT_RETENTION_DAYS = RetentionDays.THREE_DAYS
DEFAULT_IMPACT = Impact.P4
