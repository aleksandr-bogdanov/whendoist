"""
Background task for materializing recurring task instances.

Runs on startup and periodically to ensure instances exist
without blocking page requests.

Performance optimization (v0.14.0):
- Moves instance materialization from request-time to background
- Runs initial materialization on app startup
- Periodic refresh every hour

Operational polish (v0.25.0):
- Added cleanup job for old task instances (90-day retention)
"""

import asyncio
import logging
from datetime import date, timedelta
from typing import Any

from sqlalchemy import delete, select

from app.constants import INSTANCE_RETENTION_DAYS
from app.database import async_session_factory
from app.models import Task, TaskInstance, User, UserPreferences
from app.services.preferences_service import PreferencesService
from app.services.recurrence_service import RecurrenceService

logger = logging.getLogger("whendoist.tasks.recurring")

# Configuration
MATERIALIZATION_HORIZON_DAYS = 60
MATERIALIZATION_INTERVAL_SECONDS = 3600  # 1 hour


async def materialize_all_instances() -> dict[str, Any]:
    """
    Materialize instances for all users with recurring tasks.

    Returns dict with stats: {users_processed, tasks_processed}
    """
    stats = {
        "users_processed": 0,
        "tasks_processed": 0,
    }

    async with async_session_factory() as db:
        # Find all users with active recurring tasks
        users_query = (
            select(User.id)
            .distinct()
            .join(Task, Task.user_id == User.id)
            .where(
                Task.is_recurring == True,
                Task.status == "pending",
            )
        )

        result = await db.execute(users_query)
        user_ids = [row[0] for row in result.all()]

        if not user_ids:
            logger.debug("No users with recurring tasks found")
            return stats

        for user_id in user_ids:
            try:
                # Get user's timezone preference
                prefs_service = PreferencesService(db, user_id)
                timezone = await prefs_service.get_timezone()

                service = RecurrenceService(db, user_id, timezone=timezone)
                tasks_count = await service.ensure_instances_materialized(horizon_days=MATERIALIZATION_HORIZON_DAYS)
                stats["users_processed"] += 1
                stats["tasks_processed"] += tasks_count
            except Exception as e:
                logger.error(f"Failed to materialize for user {user_id}: {e}")
                continue

        await db.commit()

        # Sync newly materialized instances to Google Calendar (fire-and-forget per user)
        for user_id in user_ids:
            try:
                prefs_result = await db.execute(select(UserPreferences).where(UserPreferences.user_id == user_id))
                prefs = prefs_result.scalar_one_or_none()
                if prefs and prefs.gcal_sync_enabled:
                    from app.services.gcal_sync import GCalSyncService

                    sync_service = GCalSyncService(db, user_id)
                    await sync_service.bulk_sync()
                    await db.commit()
            except Exception as e:
                logger.debug(f"GCal sync after materialization failed for user {user_id}: {e}")

    if stats["tasks_processed"] > 0:
        logger.info(f"Materialized: {stats['users_processed']} users, {stats['tasks_processed']} tasks updated")
    else:
        logger.debug(f"Materialization: {stats['users_processed']} users checked, nothing to do")

    return stats


async def cleanup_old_instances() -> dict[str, Any]:
    """
    Delete TaskInstances older than INSTANCE_RETENTION_DAYS.

    This prevents table bloat from accumulating historical instances.
    Completed and skipped instances beyond retention period are removed.

    Returns dict with stats: {deleted_count}
    """
    cutoff_date = date.today() - timedelta(days=INSTANCE_RETENTION_DAYS)

    async with async_session_factory() as db:
        # Delete old instances that are completed or skipped
        # Keep pending instances even if old (user may still want to complete them)
        result = await db.execute(
            delete(TaskInstance).where(
                TaskInstance.instance_date < cutoff_date,
                TaskInstance.status.in_(["completed", "skipped"]),
            )
        )
        deleted_count: int = result.rowcount or 0  # type: ignore[union-attr]
        await db.commit()

    if deleted_count > 0:
        logger.info(f"Cleaned up {deleted_count} old task instances (before {cutoff_date})")

    return {"deleted_count": deleted_count}


async def run_materialization_loop() -> None:
    """
    Background loop that periodically materializes instances and cleans up old ones.

    Runs every MATERIALIZATION_INTERVAL_SECONDS (1 hour).
    """
    while True:
        try:
            await asyncio.sleep(MATERIALIZATION_INTERVAL_SECONDS)

            # Materialize new instances + clean up old ones
            stats = await materialize_all_instances()
            cleanup = await cleanup_old_instances()

            # Only log at INFO if work was actually done
            if stats["tasks_processed"] > 0 or cleanup["deleted_count"] > 0:
                logger.info(
                    f"Periodic materialization: {stats['tasks_processed']} tasks updated, "
                    f"{cleanup['deleted_count']} old instances cleaned"
                )

        except asyncio.CancelledError:
            logger.debug("Materialization loop cancelled")
            break
        except Exception as e:
            logger.error(f"Materialization loop error: {e}")
            # Continue running despite errors


# Keep reference to background task for cleanup
_materialization_task: asyncio.Task[None] | None = None


def start_materialization_background() -> None:
    """Start the background materialization task."""
    global _materialization_task
    _materialization_task = asyncio.create_task(run_materialization_loop())
    logger.info("Started background instance materialization (1 hour interval)")


def stop_materialization_background() -> None:
    """Stop the background materialization task."""
    global _materialization_task
    if _materialization_task:
        _materialization_task.cancel()
        _materialization_task = None
        logger.info("Stopped background instance materialization")
