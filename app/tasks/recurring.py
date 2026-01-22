"""
Background task for materializing recurring task instances.

Runs on startup and periodically to ensure instances exist
without blocking page requests.

Performance optimization (v0.14.0):
- Moves instance materialization from request-time to background
- Runs initial materialization on app startup
- Periodic refresh every hour
"""

import asyncio
import logging
from typing import Any

from sqlalchemy import select

from app.database import async_session_factory
from app.models import Task, User
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

        logger.info(f"Materializing instances for {len(user_ids)} users")

        for user_id in user_ids:
            try:
                service = RecurrenceService(db, user_id)
                await service.ensure_instances_materialized(horizon_days=MATERIALIZATION_HORIZON_DAYS)
                stats["users_processed"] += 1
            except Exception as e:
                logger.error(f"Failed to materialize for user {user_id}: {e}")
                continue

        await db.commit()

    logger.info(f"Materialization complete: {stats['users_processed']} users processed")

    return stats


async def run_materialization_loop() -> None:
    """
    Background loop that periodically materializes instances.

    Runs every MATERIALIZATION_INTERVAL_SECONDS.
    """
    while True:
        try:
            await asyncio.sleep(MATERIALIZATION_INTERVAL_SECONDS)
            logger.debug("Running periodic instance materialization")
            await materialize_all_instances()
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
