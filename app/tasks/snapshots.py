"""
Background task for automated export snapshots.

Periodically checks users with snapshots enabled and creates
daily snapshots. Uses content-hash deduplication so inactive
users generate zero additional storage.
"""

import asyncio
import logging
from datetime import UTC, datetime

from sqlalchemy import select

from app.constants import (
    SNAPSHOT_CHECK_INTERVAL_SECONDS,
    SNAPSHOT_FREQUENCY_INTERVAL,
    SNAPSHOT_LOOP_TIMEOUT_SECONDS,
    SNAPSHOT_RETAIN_COUNT,
)
from app.database import async_session_factory
from app.models import UserPreferences
from app.services.snapshot_service import SnapshotService

logger = logging.getLogger("whendoist.tasks.snapshots")


async def process_due_snapshots() -> dict[str, int]:
    """
    Check all users with snapshots enabled and create snapshots when due.

    Returns dict with stats: {users_checked, snapshots_created, snapshots_skipped}
    """
    stats = {"users_checked": 0, "snapshots_created": 0, "snapshots_skipped": 0}

    # Get users with snapshots enabled
    async with async_session_factory() as db:
        result = await db.execute(
            select(UserPreferences.user_id).where(UserPreferences.snapshots_enabled == True)  # noqa: E712
        )
        user_ids = [row[0] for row in result.all()]

    if not user_ids:
        logger.debug("No users with snapshots enabled")
        return stats

    now = datetime.now(UTC)

    for user_id in user_ids:
        try:
            async with async_session_factory() as db:
                service = SnapshotService(db, user_id)

                # Check if snapshot is due (daily)
                latest_time = await service.get_latest_snapshot_time()
                if latest_time:
                    latest_aware = latest_time.replace(tzinfo=UTC) if latest_time.tzinfo is None else latest_time
                    if (now - latest_aware) < SNAPSHOT_FREQUENCY_INTERVAL:
                        stats["users_checked"] += 1
                        continue

                # Due: create snapshot
                snapshot = await service.create_snapshot(is_manual=False)
                if snapshot:
                    stats["snapshots_created"] += 1
                    deleted = await service.enforce_retention(SNAPSHOT_RETAIN_COUNT)
                    if deleted > 0:
                        logger.debug(f"Snapshot retention: deleted {deleted} old snapshots for user {user_id}")
                else:
                    stats["snapshots_skipped"] += 1

                await db.commit()
                stats["users_checked"] += 1

        except Exception as e:
            logger.exception(f"Snapshot failed for user {user_id}: {type(e).__name__}: {e}")
            continue

    if stats["snapshots_created"] > 0:
        logger.info(
            f"Snapshots: {stats['users_checked']} users checked, "
            f"{stats['snapshots_created']} created, {stats['snapshots_skipped']} skipped (no changes)"
        )
    else:
        logger.debug(f"Snapshots: {stats['users_checked']} users checked, nothing to do")

    return stats


async def run_snapshot_loop() -> None:
    """
    Background loop that periodically creates snapshots.

    Does NOT run on startup — first run after SNAPSHOT_CHECK_INTERVAL_SECONDS sleep.
    """
    while True:
        try:
            await asyncio.sleep(SNAPSHOT_CHECK_INTERVAL_SECONDS)
            await asyncio.wait_for(process_due_snapshots(), timeout=SNAPSHOT_LOOP_TIMEOUT_SECONDS)
        except TimeoutError:
            logger.error(f"Snapshot cycle timed out after {SNAPSHOT_LOOP_TIMEOUT_SECONDS}s - will retry next cycle")
        except asyncio.CancelledError:
            logger.debug("Snapshot loop cancelled")
            break
        except Exception as e:
            logger.exception(f"Snapshot loop error: {type(e).__name__}: {e}")


# Keep reference to background task for cleanup
_snapshot_task: asyncio.Task[None] | None = None


def start_snapshot_background() -> None:
    """Start the background snapshot task."""
    global _snapshot_task
    _snapshot_task = asyncio.create_task(run_snapshot_loop(), name="snapshot-loop")
    logger.info(f"Started background snapshot loop ({SNAPSHOT_CHECK_INTERVAL_SECONDS}s interval)")


def stop_snapshot_background() -> None:
    """Stop the background snapshot task."""
    global _snapshot_task
    if _snapshot_task:
        _snapshot_task.cancel()
        _snapshot_task = None
        logger.info("Stopped background snapshot loop")
