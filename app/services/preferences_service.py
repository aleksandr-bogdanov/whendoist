"""
User preferences service.

Provides CRUD operations for user preferences (task display settings).
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import UserPreferences


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

    async def update_preferences(
        self,
        show_completed_in_planner: bool | None = None,
        completed_retention_days: int | None = None,
        completed_move_to_bottom: bool | None = None,
        show_completed_in_list: bool | None = None,
        hide_recurring_after_completion: bool | None = None,
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

        if show_completed_in_list is not None:
            prefs.show_completed_in_list = show_completed_in_list

        if hide_recurring_after_completion is not None:
            prefs.hide_recurring_after_completion = hide_recurring_after_completion

        await self.db.flush()
        return prefs
