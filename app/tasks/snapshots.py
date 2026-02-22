"""
Background task for automated export snapshots.

Periodically checks users with snapshots enabled and creates
daily snapshots. Uses data_version fast-path to skip unchanged users
entirely, plus content-hash deduplication as a safety net.
"""

import asyncio
import logging
from datetime import UTC, datetime

from sqlalchemy import and_, func, or_, select

from app.constants import (
    SNAPSHOT_CHECK_INTERVAL_SECONDS,
    SNAPSHOT_FREQUENCY_INTERVAL,
    SNAPSHOT_LOOP_TIMEOUT_SECONDS,
    SNAPSHOT_RETAIN_COUNT,
)
from app.database import async_session_factory
from app.models import ExportSnapshot, User, UserPreferences
from app.services.snapshot_service import SnapshotService

logger = logging.getLogger("whendoist.tasks.snapshots")


async def process_due_snapshots() -> dict[str, int]:
    """
    Check all users with snapshots enabled and create snapshots when due.

    Uses a single batch query to find candidates, then a data_version
    fast-path to skip users whose data hasn't changed since the last snapshot.

    Returns dict with stats: {users_checked, snapshots_created, snapshots_skipped, users_skipped_fast}
    """
    stats = {"users_checked": 0, "snapshots_created": 0, "snapshots_skipped": 0, "users_skipped_fast": 0}

    now = datetime.now(UTC)
    cutoff = now - SNAPSHOT_FREQUENCY_INTERVAL

    # Single batch query: find users who are due for a snapshot check
    async with async_session_factory() as db:
        # Subquery: latest snapshot per user (MAX created_at)
        latest_time_sub = (
            select(
                ExportSnapshot.user_id,
                func.max(ExportSnapshot.created_at).label("max_created"),
            )
            .group_by(ExportSnapshot.user_id)
            .subquery()
        )

        # Subquery: join back to get snapshot_data_version for the latest snapshot
        latest_snapshot = (
            select(
                ExportSnapshot.user_id,
                ExportSnapshot.snapshot_data_version,
                ExportSnapshot.created_at,
            )
            .join(
                latest_time_sub,
                and_(
                    ExportSnapshot.user_id == latest_time_sub.c.user_id,
                    ExportSnapshot.created_at == latest_time_sub.c.max_created,
                ),
            )
            .subquery()
        )

        # Main query: users with snapshots_enabled who are due
        result = await db.execute(
            select(
                UserPreferences.user_id,
                User.data_version,
                latest_snapshot.c.snapshot_data_version,
            )
            .join(User, User.id == UserPreferences.user_id)
            .outerjoin(latest_snapshot, latest_snapshot.c.user_id == UserPreferences.user_id)
            .where(
                UserPreferences.snapshots_enabled == True,  # noqa: E712
                or_(
                    latest_snapshot.c.created_at.is_(None),  # Never had a snapshot
                    latest_snapshot.c.created_at < cutoff,  # Due for new one
                ),
            )
        )
        candidates = result.all()

    if not candidates:
        logger.debug("No users due for snapshots")
        return stats

    for row in candidates:
        user_id = row.user_id
        current_version = row.data_version
        snapshot_version = row.snapshot_data_version

        stats["users_checked"] += 1

        # Fast path: data_version unchanged since last snapshot — skip entirely
        if snapshot_version is not None and snapshot_version == current_version:
            stats["users_skipped_fast"] += 1
            continue

        # Slow path: data_version changed (or NULL for legacy snapshots)
        # Do full export + content-hash dedup
        try:
            async with async_session_factory() as db:
                service = SnapshotService(db, user_id)
                snapshot = await service.create_snapshot(
                    is_manual=False,
                    data_version=current_version,
                )
                if snapshot:
                    stats["snapshots_created"] += 1
                    deleted = await service.enforce_retention(SNAPSHOT_RETAIN_COUNT)
                    if deleted > 0:
                        logger.debug(f"Snapshot retention: deleted {deleted} old snapshots for user {user_id}")
                else:
                    stats["snapshots_skipped"] += 1

                await db.commit()

        except Exception as e:
            logger.exception(f"Snapshot failed for user {user_id}: {type(e).__name__}: {e}")
            continue

    if stats["snapshots_created"] > 0 or stats["users_skipped_fast"] > 0:
        logger.info(
            f"Snapshots: {stats['users_checked']} checked, "
            f"{stats['users_skipped_fast']} skipped (version match), "
            f"{stats['snapshots_created']} created, "
            f"{stats['snapshots_skipped']} skipped (hash match)"
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
