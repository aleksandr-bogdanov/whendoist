"""
User preferences service.

Provides CRUD operations for user preferences (task display settings).
"""

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import UserPasskey, UserPreferences


class PreferencesService:
    """Async service for user preferences operations."""

    def __init__(self, db: AsyncSession, user_id: int):
        self.db = db
        self.user_id = user_id

    async def get_preferences(self) -> UserPreferences:
        """
        Get user preferences, creating defaults if not exists.

        Always returns a preferences object - never None.
        """
        result = await self.db.execute(select(UserPreferences).where(UserPreferences.user_id == self.user_id))
        prefs = result.scalar_one_or_none()

        if not prefs:
            # Create default preferences
            prefs = UserPreferences(user_id=self.user_id)
            self.db.add(prefs)
            await self.db.flush()

        return prefs

    async def get_timezone(self) -> str | None:
        """
        Get user's timezone preference.

        Returns:
            IANA timezone string (e.g., "America/New_York") or None if not set.
        """
        prefs = await self.get_preferences()
        return prefs.timezone

    async def update_preferences(
        self,
        show_completed_in_planner: bool | None = None,
        completed_retention_days: int | None = None,
        completed_move_to_bottom: bool | None = None,
        completed_sort_by_date: bool | None = None,
        show_completed_in_list: bool | None = None,
        hide_recurring_after_completion: bool | None = None,
        show_scheduled_in_list: bool | None = None,
        scheduled_move_to_bottom: bool | None = None,
        scheduled_sort_by_date: bool | None = None,
        timezone: str | None = None,
        gcal_sync_all_day: bool | None = None,
    ) -> UserPreferences:
        """
        Update user preferences.

        Only updates fields that are explicitly provided.
        Creates preferences record if not exists.
        """
        prefs = await self.get_preferences()

        if show_completed_in_planner is not None:
            prefs.show_completed_in_planner = show_completed_in_planner

        if completed_retention_days is not None:
            # Validate retention days (only 1, 3, or 7 allowed)
            if completed_retention_days not in (1, 3, 7):
                completed_retention_days = 3  # Default to 3 if invalid
            prefs.completed_retention_days = completed_retention_days

        if completed_move_to_bottom is not None:
            prefs.completed_move_to_bottom = completed_move_to_bottom

        if completed_sort_by_date is not None:
            prefs.completed_sort_by_date = completed_sort_by_date

        if show_completed_in_list is not None:
            prefs.show_completed_in_list = show_completed_in_list

        if hide_recurring_after_completion is not None:
            prefs.hide_recurring_after_completion = hide_recurring_after_completion

        if show_scheduled_in_list is not None:
            prefs.show_scheduled_in_list = show_scheduled_in_list

        if scheduled_move_to_bottom is not None:
            prefs.scheduled_move_to_bottom = scheduled_move_to_bottom

        if scheduled_sort_by_date is not None:
            prefs.scheduled_sort_by_date = scheduled_sort_by_date

        if timezone is not None:
            # Validate timezone string (empty string clears it)
            if timezone == "":
                prefs.timezone = None
            else:
                # Validate against zoneinfo
                from zoneinfo import ZoneInfo

                try:
                    ZoneInfo(timezone)  # Raises if invalid
                    prefs.timezone = timezone
                except (KeyError, TypeError):
                    pass  # Silently ignore invalid timezones

        if gcal_sync_all_day is not None:
            prefs.gcal_sync_all_day = gcal_sync_all_day

        await self.db.flush()
        return prefs

    async def setup_encryption(self, salt: str, test_value: str) -> UserPreferences:
        """
        Enable E2E encryption with the provided salt and test value.

        Args:
            salt: Base64-encoded 32-byte salt for key derivation
            test_value: Encrypted known value for passphrase verification
        """
        prefs = await self.get_preferences()

        prefs.encryption_enabled = True
        prefs.encryption_salt = salt
        prefs.encryption_test_value = test_value

        await self.db.flush()
        return prefs

    async def disable_encryption(self) -> UserPreferences:
        """
        Disable E2E encryption.

        Note: This does NOT decrypt existing data.

        IMPORTANT: Also deletes all passkeys for this user because:
        - Passkeys store wrapped_key values that wrap the current master key
        - If user re-enables encryption with a new password, old passkeys cannot
          unwrap the new master key (they still have the old one wrapped)
        - To prevent "Invalid passkey - unable to decrypt data" errors, we must
          delete all passkeys when encryption is disabled
        """
        prefs = await self.get_preferences()

        prefs.encryption_enabled = False
        prefs.encryption_salt = None
        prefs.encryption_test_value = None
        prefs.encryption_unlock_method = None  # Reset unlock method

        # Delete all passkeys for this user - they become invalid with new password
        await self.db.execute(delete(UserPasskey).where(UserPasskey.user_id == self.user_id))

        await self.db.flush()
        return prefs
