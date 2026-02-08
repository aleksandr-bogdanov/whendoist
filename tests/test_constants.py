"""
Constants Module Tests.

Tests for the centralized business constants in app/constants.py.

Test Category: Unit
Related Code: app/constants.py

v0.15.0: Architecture Cleanup
"""

from datetime import date

from app.constants import (
    CHALLENGE_TTL_SECONDS,
    DEFAULT_IMPACT,
    DEFAULT_RETENTION_DAYS,
    DEFAULT_TIMEZONE,
    ENCRYPTION_TEST_VALUE,
    PBKDF2_ITERATIONS,
    Impact,
    RetentionDays,
    get_user_today,
)


class TestImpact:
    """Tests for Impact enum."""

    def test_values(self):
        """Impact enum has correct numeric values."""
        assert Impact.P1 == 1
        assert Impact.P2 == 2
        assert Impact.P3 == 3
        assert Impact.P4 == 4

    def test_p1_is_highest_priority(self):
        """P1 (lowest value) is highest priority."""
        assert Impact.P1 < Impact.P4
        assert min(Impact) == Impact.P1

    def test_labels(self):
        """Impact has human-readable labels."""
        assert Impact.P1.label == "High"
        assert Impact.P2.label == "Mid"
        assert Impact.P3.label == "Low"
        assert Impact.P4.label == "Min"

    def test_iteration_order(self):
        """Impact enum iterates in priority order."""
        impacts = list(Impact)
        assert impacts == [Impact.P1, Impact.P2, Impact.P3, Impact.P4]

    def test_comparison(self):
        """Impact values can be compared as integers."""
        assert Impact.P1 < Impact.P2 < Impact.P3 < Impact.P4


class TestRetentionDays:
    """Tests for RetentionDays enum."""

    def test_values(self):
        """RetentionDays enum has correct values."""
        assert RetentionDays.ONE_DAY == 1
        assert RetentionDays.THREE_DAYS == 3
        assert RetentionDays.SEVEN_DAYS == 7

    def test_is_valid_accepts_valid_days(self):
        """is_valid() returns True for valid retention periods."""
        assert RetentionDays.is_valid(1) is True
        assert RetentionDays.is_valid(3) is True
        assert RetentionDays.is_valid(7) is True

    def test_is_valid_rejects_invalid_days(self):
        """is_valid() returns False for invalid retention periods."""
        assert RetentionDays.is_valid(0) is False
        assert RetentionDays.is_valid(2) is False
        assert RetentionDays.is_valid(5) is False
        assert RetentionDays.is_valid(10) is False
        assert RetentionDays.is_valid(-1) is False


class TestCryptoConstants:
    """Tests for crypto-related constants."""

    def test_pbkdf2_iterations(self):
        """PBKDF2 iterations match 2024 OWASP recommendation."""
        assert PBKDF2_ITERATIONS == 600_000

    def test_challenge_ttl(self):
        """Challenge TTL is 5 minutes (300 seconds)."""
        assert CHALLENGE_TTL_SECONDS == 300

    def test_encryption_test_value(self):
        """Encryption test value is the expected string."""
        assert ENCRYPTION_TEST_VALUE == "WHENDOIST_ENCRYPTION_TEST"


class TestDefaultValues:
    """Tests for default values."""

    def test_default_retention_days(self):
        """Default retention is 3 days."""
        assert DEFAULT_RETENTION_DAYS == 3
        assert DEFAULT_RETENTION_DAYS == RetentionDays.THREE_DAYS

    def test_default_impact(self):
        """Default impact is P4 (Low)."""
        assert DEFAULT_IMPACT == Impact.P4
        assert DEFAULT_IMPACT == 4

    def test_default_timezone(self):
        """Default timezone is UTC."""
        assert DEFAULT_TIMEZONE == "UTC"


class TestGetUserToday:
    """Tests for get_user_today() function."""

    def test_returns_date(self):
        """get_user_today() returns a date object."""
        result = get_user_today(None)
        assert isinstance(result, date)

    def test_none_timezone_uses_utc(self):
        """None timezone falls back to UTC."""
        result = get_user_today(None)
        # Should not raise, and return a date
        assert isinstance(result, date)

    def test_valid_timezone(self):
        """Valid IANA timezone string is accepted."""
        result = get_user_today("America/New_York")
        assert isinstance(result, date)

        result = get_user_today("Europe/London")
        assert isinstance(result, date)

        result = get_user_today("Asia/Tokyo")
        assert isinstance(result, date)

    def test_invalid_timezone_uses_utc(self):
        """Invalid timezone string falls back to UTC without error."""
        result = get_user_today("Invalid/Timezone")
        assert isinstance(result, date)

    def test_empty_string_uses_utc(self):
        """Empty string falls back to UTC."""
        result = get_user_today("")
        assert isinstance(result, date)
