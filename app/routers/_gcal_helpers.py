"""
Shared fire-and-forget GCal sync helpers.

Used by tasks.py and instances.py to trigger background Google Calendar
syncs after mutations. Bulk sync acquires a per-user asyncio.Lock to
prevent concurrent syncs from corrupting sync state.
"""

import asyncio
import logging

from sqlalchemy import select as sa_select

from app.database import async_session_factory
from app.models import Task, TaskInstance
from app.services.task_service import TaskService

logger = logging.getLogger("whendoist.gcal_helpers")

# Per-user lock to prevent concurrent bulk syncs.
# Shared with gcal_sync.py — imported there to keep a single lock dict.
bulk_sync_locks: dict[int, asyncio.Lock] = {}


async def fire_and_forget_sync_task(task_id: int, user_id: int) -> None:
    """Fire-and-forget: sync a task to Google Calendar in a background coroutine.

    Includes a race-condition guard: after committing the sync, re-checks the task
    in a fresh session. If it was unscheduled while we were calling Google's API
    (e.g. Plan My Day undo), the unsync runs immediately. Without this, the undo's
    own sync fires before our sync record exists, leaving a stale Google event.
    """
    try:
        async with async_session_factory() as db:
            from app.services.gcal_sync import GCalSyncService

            sync_service = GCalSyncService(db, user_id)
            task_service = TaskService(db, user_id)
            task = await task_service.get_task(task_id)
            if task:
                await sync_service.sync_task(task)
            await db.commit()

        # Race-condition guard: re-check task state with a fresh session.
        # If the task was unscheduled during sync (e.g. Plan My Day undo fired
        # while we were awaiting the Google API), our sync record now exists but
        # the undo's unsync already ran and found nothing. Clean up now.
        async with async_session_factory() as db:
            from app.services.gcal_sync import GCalSyncService

            task_service = TaskService(db, user_id)
            task = await task_service.get_task(task_id)
            if task and not task.scheduled_date and not (task.status == "completed" and task.completed_at):
                sync_service = GCalSyncService(db, user_id)
                await sync_service.unsync_task(task)
                await db.commit()
    except Exception as e:
        from app.auth.google import TokenRefreshError
        from app.services.gcal_sync import CalendarGoneError

        if isinstance(e, (CalendarGoneError, TokenRefreshError)):
            logger.warning(f"GCal sync auto-disabled for user {user_id}: {e}")
        else:
            logger.warning(f"GCal sync failed for task {task_id}: {e}")


async def fire_and_forget_unsync_task(task_id: int, user_id: int) -> None:
    """Fire-and-forget: unsync a task from Google Calendar."""
    try:
        async with async_session_factory() as db:
            from app.services.gcal_sync import GCalSyncService

            sync_service = GCalSyncService(db, user_id)
            task_service = TaskService(db, user_id)
            task = await task_service.get_task(task_id)
            if task:
                await sync_service.unsync_task(task)
            await db.commit()
    except Exception as e:
        logger.warning(f"GCal unsync failed for task {task_id}: {e}")


async def fire_and_forget_sync_instance(instance_id: int, task_id: int, user_id: int) -> None:
    """Fire-and-forget: sync a task instance to Google Calendar."""
    try:
        async with async_session_factory() as db:
            from app.services.gcal_sync import GCalSyncService

            sync_service = GCalSyncService(db, user_id)
            task_service = TaskService(db, user_id)
            task = await task_service.get_task(task_id)

            result = await db.execute(
                sa_select(TaskInstance).join(Task).where(TaskInstance.id == instance_id, Task.user_id == user_id)
            )
            instance = result.scalar_one_or_none()

            if task and instance:
                await sync_service.sync_task_instance(instance, task)
            await db.commit()
    except Exception as e:
        from app.auth.google import TokenRefreshError
        from app.services.gcal_sync import CalendarGoneError

        if isinstance(e, (CalendarGoneError, TokenRefreshError)):
            logger.warning(f"GCal sync auto-disabled for user {user_id}: {e}")
        else:
            logger.warning(f"GCal sync failed for instance {instance_id}: {e}")


async def fire_and_forget_bulk_sync(user_id: int) -> None:
    """Fire-and-forget: run a bulk sync to Google Calendar with per-user lock.

    Acquires the shared per-user lock to prevent concurrent bulk syncs from
    corrupting sync state (duplicate events, orphaned events, stale hashes).
    If a sync is already running for this user, this call is skipped.
    """
    lock = bulk_sync_locks.setdefault(user_id, asyncio.Lock())
    if lock.locked():
        logger.info(f"Bulk sync already running for user {user_id}, skipping")
        return

    async with lock:
        try:
            async with async_session_factory() as db:
                from app.services.gcal_sync import GCalSyncService

                sync_service = GCalSyncService(db, user_id)
                await sync_service.bulk_sync()
                await db.commit()
        except Exception as e:
            logger.warning(f"GCal bulk sync failed for user {user_id}: {e}")
