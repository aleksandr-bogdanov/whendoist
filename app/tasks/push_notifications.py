"""
Background task for push notification reminders.

Periodically finds tasks with due reminders and sends silent push
notifications to registered devices. Follows the same pattern as
app/tasks/snapshots.py (sleep → wait_for → repeat).

The query uses PostgreSQL-specific interval arithmetic — this loop
only runs on the production database, never on SQLite.
"""

import asyncio
import logging
from collections import defaultdict
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select, text, update

from app.constants import (
    PUSH_REMINDER_FIRE_WINDOW_SECONDS,
    PUSH_REMINDER_LOOP_INTERVAL_SECONDS,
    PUSH_REMINDER_LOOP_TIMEOUT_SECONDS,
)
from app.database import async_session_factory
from app.models import DeviceToken, Task
from app.services.push_service import PushService

logger = logging.getLogger("whendoist.tasks.push")

# Singleton push service — created once, reused across cycles
_push_service: PushService | None = None


def _get_push_service() -> PushService:
    global _push_service
    if _push_service is None:
        _push_service = PushService()
    return _push_service


async def process_due_reminders() -> dict[str, int]:
    """Find tasks with due reminders, send push to registered devices."""
    stats = {"tasks_checked": 0, "pushes_sent": 0, "pushes_failed": 0, "tokens_cleaned": 0, "no_tokens": 0}

    now = datetime.now(UTC)
    window_start = now - timedelta(seconds=PUSH_REMINDER_FIRE_WINDOW_SECONDS)
    push_service = _get_push_service()

    # Single session for the entire cycle to avoid connection pool exhaustion.
    # Uses PostgreSQL interval arithmetic — not SQLite-compatible (by design,
    # since this background loop only runs on the production database).
    async with async_session_factory() as db:
        result = await db.execute(
            text("""
                SELECT t.id, t.user_id, t.title,
                       COALESCE(up.encryption_enabled, false) AS encryption_enabled
                FROM tasks t
                LEFT JOIN user_preferences up ON up.user_id = t.user_id
                WHERE t.reminder_minutes_before IS NOT NULL
                  AND t.reminder_sent_at IS NULL
                  AND t.status = 'pending'
                  AND t.scheduled_date IS NOT NULL
                  AND (
                    (t.scheduled_date::timestamp
                     + COALESCE(t.scheduled_time, '00:00')::interval
                     - (t.reminder_minutes_before * interval '1 minute')
                    ) AT TIME ZONE COALESCE(up.timezone, 'UTC')
                  ) BETWEEN :window_start AND :now
            """),
            {"window_start": window_start, "now": now},
        )
        due_tasks = result.all()

        if not due_tasks:
            return stats

        # Group by user for efficient token lookups
        user_tasks: dict[int, list] = defaultdict(list)
        for row in due_tasks:
            user_tasks[row.user_id].append(row)

        # Pre-fetch device tokens for all relevant users (single query).
        # Extract to plain tuples so we don't depend on ORM session state.
        user_ids = list(user_tasks.keys())
        token_result = await db.execute(select(DeviceToken).where(DeviceToken.user_id.in_(user_ids)))
        user_tokens: dict[int, list[tuple[int, str, str]]] = defaultdict(list)
        for dt in token_result.scalars().all():
            user_tokens[dt.user_id].append((dt.id, dt.token, dt.platform))

        for user_id, task_rows in user_tasks.items():
            tokens = user_tokens.get(user_id, [])

            for task_row in task_rows:
                stats["tasks_checked"] += 1
                task_id = task_row.id
                # Omit title for encrypted users — Rust falls back to "Task reminder"
                title = task_row.title if not task_row.encryption_enabled else None

                if not tokens:
                    stats["no_tokens"] += 1
                    # Mark as sent so we don't retry every 60s for users with no devices
                    await db.execute(
                        update(Task).where(Task.id == task_id, Task.user_id == user_id).values(reminder_sent_at=now)
                    )
                    continue

                # Send push to all registered devices
                invalid_token_ids: list[int] = []

                for token_id, token_str, token_platform in tokens:
                    push_result = await push_service.send_silent_push(
                        token=token_str,
                        platform=token_platform,
                        task_id=task_id,
                        title=title,
                    )
                    if push_result.success:
                        stats["pushes_sent"] += 1
                    else:
                        stats["pushes_failed"] += 1
                        if push_result.token_invalid:
                            invalid_token_ids.append(token_id)

                # Clean up invalid tokens and mark reminder as sent (best-effort)
                if invalid_token_ids:
                    await db.execute(delete(DeviceToken).where(DeviceToken.id.in_(invalid_token_ids)))
                    stats["tokens_cleaned"] += len(invalid_token_ids)

                await db.execute(
                    update(Task).where(Task.id == task_id, Task.user_id == user_id).values(reminder_sent_at=now)
                )

        await db.commit()

    if stats["pushes_sent"] > 0 or stats["tasks_checked"] > 0:
        logger.info(
            f"Push reminders: {stats['tasks_checked']} tasks, "
            f"{stats['pushes_sent']} sent, {stats['pushes_failed']} failed, "
            f"{stats['tokens_cleaned']} tokens cleaned, {stats['no_tokens']} no-token"
        )

    return stats


async def run_push_reminder_loop() -> None:
    """Background loop that periodically sends push reminders."""
    while True:
        try:
            await asyncio.sleep(PUSH_REMINDER_LOOP_INTERVAL_SECONDS)
            await asyncio.wait_for(process_due_reminders(), timeout=PUSH_REMINDER_LOOP_TIMEOUT_SECONDS)
        except TimeoutError:
            logger.error(f"Push reminder cycle timed out after {PUSH_REMINDER_LOOP_TIMEOUT_SECONDS}s")
        except asyncio.CancelledError:
            logger.debug("Push reminder loop cancelled")
            break
        except Exception as e:
            logger.exception(f"Push reminder loop error: {type(e).__name__}: {e}")


_push_task: asyncio.Task[None] | None = None


def start_push_reminder_background() -> None:
    """Start the background push reminder task."""
    global _push_task
    _push_task = asyncio.create_task(run_push_reminder_loop(), name="push-reminder-loop")
    logger.info(f"Started background push reminder loop ({PUSH_REMINDER_LOOP_INTERVAL_SECONDS}s interval)")


async def stop_push_reminder_background() -> None:
    """Stop the background push reminder task and close HTTP clients."""
    global _push_task, _push_service
    if _push_task:
        _push_task.cancel()
        _push_task = None
    if _push_service:
        await _push_service.close()
        _push_service = None
    logger.info("Stopped background push reminder loop")
