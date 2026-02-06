"""
User Preferences Service Tests.

Tests the PreferencesService class that handles CRUD operations
for user preferences (task display settings, encryption config).

Test Category: Unit (async, uses in-memory SQLite)
Related Code: app/services/preferences_service.py, app/models.py (UserPreferences)

Coverage:
- Default preference creation on first access
- Individual preference updates
- Validation (e.g., retention_days must be 1, 3, or 7)
- Encryption setup and teardown
- Preference persistence across updates

See tests/README.md for full test architecture.
"""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User, UserPreferences
from app.services.preferences_service import PreferencesService

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
async def test_user(db_session: AsyncSession) -> User:
    """Create a test user."""
    user = User(email="test@example.com")
    db_session.add(user)
    await db_session.flush()
    return user


# =============================================================================
# PreferencesService Tests
# =============================================================================


class TestPreferencesServiceGet:
    """Tests for getting user preferences."""

    async def test_creates_defaults_when_missing(self, db_session: AsyncSession, test_user: User):
        """When no preferences exist, creates with default values."""
        service = PreferencesService(db_session, test_user.id)
        prefs = await service.get_preferences()

        assert prefs is not None
        assert prefs.user_id == test_user.id
        # Verify defaults
        assert prefs.show_completed_in_planner is True
        assert prefs.completed_retention_days == 3
        assert prefs.completed_move_to_bottom is True
        assert prefs.completed_sort_by_date is True
        assert prefs.show_completed_in_list is True
        assert prefs.hide_recurring_after_completion is False
        assert prefs.show_scheduled_in_list is True
        assert prefs.scheduled_move_to_bottom is True
        assert prefs.scheduled_sort_by_date is True
        assert prefs.encryption_enabled is False

    async def test_returns_existing_preferences(self, db_session: AsyncSession, test_user: User):
        """When preferences exist, returns them."""
        # Create custom preferences
        prefs = UserPreferences(
            user_id=test_user.id,
            completed_retention_days=7,
            completed_move_to_bottom=False,
        )
        db_session.add(prefs)
        await db_session.flush()

        service = PreferencesService(db_session, test_user.id)
        result = await service.get_preferences()

        assert result.id == prefs.id
        assert result.completed_retention_days == 7
        assert result.completed_move_to_bottom is False


class TestPreferencesServiceUpdate:
    """Tests for updating user preferences."""

    async def test_updates_completed_retention_days(self, db_session: AsyncSession, test_user: User):
        """Can update completed_retention_days."""
        service = PreferencesService(db_session, test_user.id)
        await service.get_preferences()  # Create defaults

        result = await service.update_preferences(completed_retention_days=7)

        assert result.completed_retention_days == 7

    async def test_validates_retention_days_values(self, db_session: AsyncSession, test_user: User):
        """Invalid retention days values default to 3."""
        service = PreferencesService(db_session, test_user.id)
        await service.get_preferences()

        # Invalid value should default to 3
        result = await service.update_preferences(completed_retention_days=5)
        assert result.completed_retention_days == 3

    async def test_updates_show_completed_in_list(self, db_session: AsyncSession, test_user: User):
        """Can update show_completed_in_list."""
        service = PreferencesService(db_session, test_user.id)
        await service.get_preferences()

        result = await service.update_preferences(show_completed_in_list=False)
        assert result.show_completed_in_list is False

    async def test_updates_show_scheduled_in_list(self, db_session: AsyncSession, test_user: User):
        """Can update show_scheduled_in_list."""
        service = PreferencesService(db_session, test_user.id)
        await service.get_preferences()

        result = await service.update_preferences(show_scheduled_in_list=False)
        assert result.show_scheduled_in_list is False

    async def test_updates_hide_recurring_after_completion(self, db_session: AsyncSession, test_user: User):
        """Can update hide_recurring_after_completion."""
        service = PreferencesService(db_session, test_user.id)
        await service.get_preferences()

        result = await service.update_preferences(hide_recurring_after_completion=True)
        assert result.hide_recurring_after_completion is True

    async def test_updates_multiple_fields(self, db_session: AsyncSession, test_user: User):
        """Can update multiple fields at once."""
        service = PreferencesService(db_session, test_user.id)
        await service.get_preferences()

        result = await service.update_preferences(
            completed_retention_days=7,
            show_completed_in_list=False,
            show_scheduled_in_list=False,
        )

        assert result.completed_retention_days == 7
        assert result.show_completed_in_list is False
        assert result.show_scheduled_in_list is False

    async def test_update_preserves_unspecified_fields(self, db_session: AsyncSession, test_user: User):
        """Updating one field doesn't change others."""
        service = PreferencesService(db_session, test_user.id)
        await service.get_preferences()

        # Set some custom values
        await service.update_preferences(
            completed_retention_days=7,
            show_completed_in_list=False,
        )

        # Update only one field
        result = await service.update_preferences(completed_retention_days=1)

        # Other fields should be preserved
        assert result.completed_retention_days == 1
        assert result.show_completed_in_list is False


class TestPreferencesServiceEncryption:
    """Tests for encryption-related preferences."""

    async def test_setup_encryption(self, db_session: AsyncSession, test_user: User):
        """Can set up encryption with salt and test value."""
        service = PreferencesService(db_session, test_user.id)
        await service.get_preferences()

        result = await service.setup_encryption(
            salt="test-salt-base64",
            test_value="encrypted-test-value",
        )

        assert result.encryption_enabled is True
        assert result.encryption_salt == "test-salt-base64"
        assert result.encryption_test_value == "encrypted-test-value"

    async def test_disable_encryption(self, db_session: AsyncSession, test_user: User):
        """Can disable encryption, clearing salt and test value."""
        service = PreferencesService(db_session, test_user.id)
        await service.get_preferences()

        # Enable first
        await service.setup_encryption(
            salt="test-salt",
            test_value="test-value",
        )

        # Then disable
        result = await service.disable_encryption()

        assert result.encryption_enabled is False
        assert result.encryption_salt is None
        assert result.encryption_test_value is None


class TestPreferencesTimezone:
    """Tests for timezone preference."""

    async def test_timezone_default_is_none(self, db_session: AsyncSession, test_user: User):
        """New preferences have no timezone set."""
        service = PreferencesService(db_session, test_user.id)
        prefs = await service.get_preferences()

        assert prefs.timezone is None

    async def test_get_timezone_returns_value(self, db_session: AsyncSession, test_user: User):
        """get_timezone() returns the stored timezone."""
        service = PreferencesService(db_session, test_user.id)
        await service.update_preferences(timezone="America/New_York")

        result = await service.get_timezone()
        assert result == "America/New_York"

    async def test_update_timezone_with_valid_iana(self, db_session: AsyncSession, test_user: User):
        """Can update timezone with valid IANA string."""
        service = PreferencesService(db_session, test_user.id)
        await service.get_preferences()

        result = await service.update_preferences(timezone="Europe/London")
        assert result.timezone == "Europe/London"

        result = await service.update_preferences(timezone="Asia/Tokyo")
        assert result.timezone == "Asia/Tokyo"

    async def test_update_timezone_invalid_ignored(self, db_session: AsyncSession, test_user: User):
        """Invalid timezone strings are silently ignored."""
        service = PreferencesService(db_session, test_user.id)
        await service.update_preferences(timezone="America/New_York")

        # Try to set invalid timezone
        result = await service.update_preferences(timezone="Invalid/Timezone")

        # Should keep the old value
        assert result.timezone == "America/New_York"

    async def test_update_timezone_empty_string_clears(self, db_session: AsyncSession, test_user: User):
        """Empty string clears the timezone."""
        service = PreferencesService(db_session, test_user.id)
        await service.update_preferences(timezone="America/New_York")

        result = await service.update_preferences(timezone="")
        assert result.timezone is None


class TestPreferencesDefaults:
    """Tests for verifying correct default values."""

    async def test_all_defaults(self, db_session: AsyncSession, test_user: User):
        """Verify all preference defaults match expected values."""
        service = PreferencesService(db_session, test_user.id)
        prefs = await service.get_preferences()

        # Completed task preferences
        assert prefs.show_completed_in_planner is True
        assert prefs.completed_retention_days == 3
        assert prefs.completed_move_to_bottom is True
        assert prefs.completed_sort_by_date is True
        assert prefs.show_completed_in_list is True
        assert prefs.hide_recurring_after_completion is False

        # Scheduled task preferences
        assert prefs.show_scheduled_in_list is True
        assert prefs.scheduled_move_to_bottom is True
        assert prefs.scheduled_sort_by_date is True

        # Encryption
        assert prefs.encryption_enabled is False
        assert prefs.encryption_salt is None
        assert prefs.encryption_test_value is None

        # Timezone
        assert prefs.timezone is None
