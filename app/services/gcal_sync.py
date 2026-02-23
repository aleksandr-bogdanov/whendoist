"""
Google Calendar sync service.

One-way sync: Whendoist -> Google Calendar.
Scheduled tasks appear as events in a dedicated "Whendoist" calendar.
"""

import asyncio
import logging
from collections.abc import Callable, Coroutine
from datetime import UTC, date, datetime
from typing import Any

import httpx
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.google import TokenRefreshError
from app.constants import (
    DEFAULT_TIMEZONE,
    GCAL_SYNC_BATCH_DELAY_SECONDS,
    GCAL_SYNC_ENCRYPTED_PLACEHOLDER,
    GCAL_SYNC_RATE_LIMIT_BACKOFF_BASE,
    GCAL_SYNC_RATE_LIMIT_MAX_RETRIES,
    GCAL_SYNC_RATE_LIMIT_PENALTY_SECONDS,
)
from app.models import (
    GoogleCalendarEventSync,
    GoogleToken,
    Task,
    TaskInstance,
    UserPreferences,
)
from app.services.gcal import (
    GoogleCalendarClient,
    build_event_data,
    compute_sync_hash,
)

logger = logging.getLogger("whendoist.gcal_sync")


class CalendarGoneError(Exception):
    """Raised when the sync calendar is inaccessible (deleted or no access)."""

    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        self.message = message
        super().__init__(message)


def _effective_date(task: Task) -> date | None:
    """
    Get the effective calendar date for a task.

    Uses scheduled_date if available, otherwise falls back to completed_at date
    for completed tasks (e.g. Todoist imports that lack scheduling info).
    """
    if task.scheduled_date:
        return task.scheduled_date
    if task.status == "completed" and task.completed_at:
        return task.completed_at.date()
    return None


def _is_gone_error(e: Exception) -> bool:
    """Check if an exception indicates a 404/410 (resource gone)."""
    if isinstance(e, httpx.HTTPStatusError):
        return e.response.status_code in (404, 410)
    return False


def _is_rate_limit_error(e: Exception) -> bool:
    """Check if an exception is a Google API rate limit (403 with rateLimitExceeded)."""
    if isinstance(e, httpx.HTTPStatusError) and e.response.status_code == 403:
        try:
            body = e.response.json()
            errors = body.get("error", {}).get("errors", [])
            return any(err.get("domain") == "usageLimits" for err in errors)
        except Exception:
            pass
    return False


def _is_calendar_error(e: Exception) -> bool:
    """Check if an exception indicates a calendar-level failure (403/404/410).

    403 = no write access (token scope revoked or calendar ownership changed)
          BUT NOT rate limit 403 (usageLimits domain)
    404/410 = calendar deleted externally
    """
    if isinstance(e, httpx.HTTPStatusError):
        if e.response.status_code in (404, 410):
            return True
        if e.response.status_code == 403:
            return not _is_rate_limit_error(e)
    return False


def _calendar_error_message(e: Exception) -> str:
    """Build a user-facing error message from a calendar-level error."""
    if isinstance(e, httpx.HTTPStatusError):
        if e.response.status_code == 403:
            return "Calendar write access lost. Please re-enable sync in Settings."
        if e.response.status_code in (404, 410):
            return "Whendoist calendar was deleted. Please re-enable sync in Settings."
    return f"Calendar sync error: {e}"


class _AdaptiveThrottle:
    """Adaptive rate limiter for Google Calendar API calls.

    Starts with a base delay between calls. When rate-limited,
    increases the delay for ALL subsequent calls in the batch.
    Retries individual calls with exponential backoff.
    """

    def __init__(self) -> None:
        self.delay = GCAL_SYNC_BATCH_DELAY_SECONDS

    async def call[T](self, fn: Callable[..., Coroutine[Any, Any, T]], *args: Any, **kwargs: Any) -> T:
        """Call fn with adaptive throttling and retry on rate limit."""
        await asyncio.sleep(self.delay)
        for attempt in range(GCAL_SYNC_RATE_LIMIT_MAX_RETRIES + 1):
            try:
                return await fn(*args, **kwargs)
            except httpx.HTTPStatusError as e:
                if _is_rate_limit_error(e) and attempt < GCAL_SYNC_RATE_LIMIT_MAX_RETRIES:
                    # Slow down all future calls
                    self.delay += GCAL_SYNC_RATE_LIMIT_PENALTY_SECONDS
                    backoff = GCAL_SYNC_RATE_LIMIT_BACKOFF_BASE * (2**attempt)
                    logger.warning(
                        f"Rate limited by Google API, backing off {backoff}s "
                        f"(attempt {attempt + 1}, new delay {self.delay:.1f}s)"
                    )
                    await asyncio.sleep(backoff)
                    continue
                raise
        raise RuntimeError("Unreachable")


class GCalSyncService:
    """Service for syncing tasks to Google Calendar."""

    def __init__(self, db: AsyncSession, user_id: int):
        self.db = db
        self.user_id = user_id

    async def _get_prefs(self) -> UserPreferences | None:
        result = await self.db.execute(select(UserPreferences).where(UserPreferences.user_id == self.user_id))
        return result.scalar_one_or_none()

    async def _get_google_token(self) -> GoogleToken | None:
        result = await self.db.execute(select(GoogleToken).where(GoogleToken.user_id == self.user_id))
        return result.scalar_one_or_none()

    async def _get_timezone(self, prefs: UserPreferences | None) -> str:
        return prefs.timezone or DEFAULT_TIMEZONE if prefs else DEFAULT_TIMEZONE

    async def _disable_sync_on_error(self, error_message: str) -> None:
        """Disable sync and record the error for the user to see."""
        prefs = await self._get_prefs()
        if prefs:
            prefs.gcal_sync_enabled = False
            prefs.gcal_sync_calendar_id = None
            prefs.gcal_sync_error = error_message
            logger.warning(f"Auto-disabled sync for user {self.user_id}: {error_message}")

    async def _clear_sync_error(self) -> None:
        """Clear any previous sync error (called on successful sync operations)."""
        prefs = await self._get_prefs()
        if prefs and prefs.gcal_sync_error:
            prefs.gcal_sync_error = None

    # =========================================================================
    # Core Sync Operations
    # =========================================================================

    async def sync_task(self, task: Task) -> None:
        """Sync a single non-recurring task to Google Calendar.

        Raises CalendarGoneError if the calendar is inaccessible (403/404/410).
        """
        prefs = await self._get_prefs()
        if not prefs or not prefs.gcal_sync_enabled or not prefs.gcal_sync_calendar_id:
            return

        # Mask encrypted content — keys are client-side only, server sees ciphertext
        title = GCAL_SYNC_ENCRYPTED_PLACEHOLDER if prefs.encryption_enabled else task.title
        description = None if prefs.encryption_enabled else task.description

        # Resolve effective date (scheduled_date or completed_at for Todoist imports)
        eff_date = _effective_date(task)
        if not eff_date:
            await self._unsync_by_task_id(task.id, prefs.gcal_sync_calendar_id)
            return

        timezone = await self._get_timezone(prefs)
        is_completed = task.status == "completed"

        current_hash = compute_sync_hash(
            title=title,
            description=description,
            scheduled_date=eff_date,
            scheduled_time=task.scheduled_time,
            duration_minutes=task.duration_minutes,
            impact=task.impact,
            status=task.status,
        )

        # Check existing sync record
        result = await self.db.execute(
            select(GoogleCalendarEventSync).where(
                GoogleCalendarEventSync.user_id == self.user_id,
                GoogleCalendarEventSync.task_id == task.id,
            )
        )
        sync_record = result.scalar_one_or_none()

        if sync_record and sync_record.sync_hash == current_hash:
            return  # Already in sync

        event_data = build_event_data(
            title=title,
            description=description,
            scheduled_date=eff_date,
            scheduled_time=task.scheduled_time,
            duration_minutes=task.duration_minutes,
            impact=task.impact,
            is_completed=is_completed,
            user_timezone=timezone,
        )

        google_token = await self._get_google_token()
        if not google_token:
            return

        try:
            async with GoogleCalendarClient(self.db, google_token) as client:
                if sync_record:
                    # Update existing event
                    try:
                        await client.update_event(prefs.gcal_sync_calendar_id, sync_record.google_event_id, event_data)
                    except Exception as e:
                        if _is_calendar_error(e):
                            msg = _calendar_error_message(e)
                            await self._disable_sync_on_error(msg)
                            raise CalendarGoneError(
                                status_code=e.response.status_code if isinstance(e, httpx.HTTPStatusError) else 0,
                                message=msg,
                            ) from e
                        if _is_gone_error(e):
                            # Event was deleted in Google Calendar, create a new one
                            event_id = await client.create_event(prefs.gcal_sync_calendar_id, event_data)
                            sync_record.google_event_id = event_id
                        else:
                            raise
                    sync_record.sync_hash = current_hash
                    sync_record.last_synced_at = datetime.now(UTC)
                else:
                    # Create new event
                    try:
                        event_id = await client.create_event(prefs.gcal_sync_calendar_id, event_data)
                    except Exception as e:
                        if _is_calendar_error(e):
                            msg = _calendar_error_message(e)
                            await self._disable_sync_on_error(msg)
                            raise CalendarGoneError(
                                status_code=e.response.status_code if isinstance(e, httpx.HTTPStatusError) else 0,
                                message=msg,
                            ) from e
                        raise
                    sync_record = GoogleCalendarEventSync(
                        user_id=self.user_id,
                        task_id=task.id,
                        google_event_id=event_id,
                        sync_hash=current_hash,
                        last_synced_at=datetime.now(UTC),
                    )
                    self.db.add(sync_record)
        except TokenRefreshError as e:
            msg = "Google authorization expired. Please reconnect Google Calendar in Settings."
            await self._disable_sync_on_error(msg)
            logger.warning(f"Token refresh failed for user {self.user_id} during sync_task")
            raise CalendarGoneError(status_code=401, message=msg) from e

        await self.db.flush()

    async def sync_task_instance(self, instance: TaskInstance, task: Task) -> None:
        """Sync a single task instance to Google Calendar.

        Raises CalendarGoneError if the calendar is inaccessible (403/404/410).
        """
        prefs = await self._get_prefs()
        if not prefs or not prefs.gcal_sync_enabled or not prefs.gcal_sync_calendar_id:
            return

        # Mask encrypted content
        title = GCAL_SYNC_ENCRYPTED_PLACEHOLDER if prefs.encryption_enabled else task.title
        description = None if prefs.encryption_enabled else task.description

        # Recurring tasks only sync when they have a specific time
        scheduled_time = task.scheduled_time
        if not scheduled_time:
            await self._unsync_instance(instance.id, prefs.gcal_sync_calendar_id)
            return

        timezone = await self._get_timezone(prefs)
        is_completed = instance.status == "completed"

        current_hash = compute_sync_hash(
            title=title,
            description=description,
            scheduled_date=instance.instance_date,
            scheduled_time=scheduled_time,
            duration_minutes=task.duration_minutes,
            impact=task.impact,
            status=instance.status,
        )

        # Check existing sync record
        result = await self.db.execute(
            select(GoogleCalendarEventSync).where(
                GoogleCalendarEventSync.user_id == self.user_id,
                GoogleCalendarEventSync.task_instance_id == instance.id,
            )
        )
        sync_record = result.scalar_one_or_none()

        if sync_record and sync_record.sync_hash == current_hash:
            return  # Already in sync

        event_data = build_event_data(
            title=title,
            description=description,
            scheduled_date=instance.instance_date,
            scheduled_time=scheduled_time,
            duration_minutes=task.duration_minutes,
            impact=task.impact,
            is_completed=is_completed,
            user_timezone=timezone,
        )

        google_token = await self._get_google_token()
        if not google_token:
            return

        try:
            async with GoogleCalendarClient(self.db, google_token) as client:
                if sync_record:
                    try:
                        await client.update_event(prefs.gcal_sync_calendar_id, sync_record.google_event_id, event_data)
                    except Exception as e:
                        if _is_calendar_error(e):
                            msg = _calendar_error_message(e)
                            await self._disable_sync_on_error(msg)
                            raise CalendarGoneError(
                                status_code=e.response.status_code if isinstance(e, httpx.HTTPStatusError) else 0,
                                message=msg,
                            ) from e
                        if _is_gone_error(e):
                            event_id = await client.create_event(prefs.gcal_sync_calendar_id, event_data)
                            sync_record.google_event_id = event_id
                        else:
                            raise
                    sync_record.sync_hash = current_hash
                    sync_record.last_synced_at = datetime.now(UTC)
                else:
                    try:
                        event_id = await client.create_event(prefs.gcal_sync_calendar_id, event_data)
                    except Exception as e:
                        if _is_calendar_error(e):
                            msg = _calendar_error_message(e)
                            await self._disable_sync_on_error(msg)
                            raise CalendarGoneError(
                                status_code=e.response.status_code if isinstance(e, httpx.HTTPStatusError) else 0,
                                message=msg,
                            ) from e
                        raise
                    sync_record = GoogleCalendarEventSync(
                        user_id=self.user_id,
                        task_instance_id=instance.id,
                        google_event_id=event_id,
                        sync_hash=current_hash,
                        last_synced_at=datetime.now(UTC),
                    )
                    self.db.add(sync_record)
        except TokenRefreshError as e:
            msg = "Google authorization expired. Please reconnect Google Calendar in Settings."
            await self._disable_sync_on_error(msg)
            logger.warning(f"Token refresh failed for user {self.user_id} during sync_task_instance")
            raise CalendarGoneError(status_code=401, message=msg) from e

        await self.db.flush()

    async def unsync_task(self, task: Task) -> None:
        """Remove a task's synced event from Google Calendar."""
        prefs = await self._get_prefs()
        if not prefs or not prefs.gcal_sync_calendar_id:
            return
        await self._unsync_by_task_id(task.id, prefs.gcal_sync_calendar_id)

    async def _unsync_by_task_id(self, task_id: int, calendar_id: str) -> None:
        """Delete the synced event for a task and remove the sync record."""
        result = await self.db.execute(
            select(GoogleCalendarEventSync).where(
                GoogleCalendarEventSync.user_id == self.user_id,
                GoogleCalendarEventSync.task_id == task_id,
            )
        )
        sync_record = result.scalar_one_or_none()
        if not sync_record:
            return

        google_token = await self._get_google_token()
        if google_token:
            try:
                async with GoogleCalendarClient(self.db, google_token) as client:
                    await client.delete_event(calendar_id, sync_record.google_event_id)
            except Exception:
                logger.warning(f"Failed to delete event {sync_record.google_event_id} from Google Calendar")

        await self.db.delete(sync_record)
        await self.db.flush()

    async def _unsync_instance(self, instance_id: int, calendar_id: str) -> None:
        """Delete the synced event for a task instance and remove the sync record."""
        result = await self.db.execute(
            select(GoogleCalendarEventSync).where(
                GoogleCalendarEventSync.user_id == self.user_id,
                GoogleCalendarEventSync.task_instance_id == instance_id,
            )
        )
        sync_record = result.scalar_one_or_none()
        if not sync_record:
            return

        google_token = await self._get_google_token()
        if google_token:
            try:
                async with GoogleCalendarClient(self.db, google_token) as client:
                    await client.delete_event(calendar_id, sync_record.google_event_id)
            except Exception:
                logger.warning(f"Failed to delete event {sync_record.google_event_id} from Google Calendar")

        await self.db.delete(sync_record)
        await self.db.flush()

    # =========================================================================
    # Bulk Operations
    # =========================================================================

    async def bulk_sync(
        self,
        on_progress: Callable[[dict], None] | None = None,
        is_cancelled: Callable[[], bool] | None = None,
    ) -> dict:
        """
        Full sync: create missing, update changed, delete orphaned.

        Args:
            on_progress: Optional callback invoked after each operation with
                current stats dict, enabling real-time progress reporting.
            is_cancelled: Optional callback that returns True when the sync
                should stop (e.g., user disabled sync mid-run).

        Returns stats dict with counts. On calendar-level errors (403/404),
        auto-disables sync and returns immediately with an error key.
        """
        prefs = await self._get_prefs()
        if not prefs or not prefs.gcal_sync_enabled or not prefs.gcal_sync_calendar_id:
            return {"created": 0, "updated": 0, "deleted": 0, "skipped": 0}

        google_token = await self._get_google_token()
        if not google_token:
            return {"created": 0, "updated": 0, "deleted": 0, "skipped": 0}

        timezone = await self._get_timezone(prefs)
        encrypted = prefs.encryption_enabled
        stats: dict = {"created": 0, "updated": 0, "deleted": 0, "skipped": 0}

        def _check_cancelled() -> bool:
            return is_cancelled() if is_cancelled else False

        def _report() -> None:
            if on_progress:
                on_progress(stats)

        # Get all syncable tasks: either has scheduled_date, or is completed with completed_at
        # (completed Todoist imports may lack scheduled_date but have completed_at)
        tasks_result = await self.db.execute(
            select(Task).where(
                Task.user_id == self.user_id,
                Task.is_recurring == False,
                Task.status != "archived",
                or_(
                    Task.scheduled_date.isnot(None),
                    Task.completed_at.isnot(None),
                ),
            )
        )
        tasks = list(tasks_result.scalars().all())

        # Get all task instances for recurring tasks
        instances_result = await self.db.execute(
            select(TaskInstance)
            .join(Task, TaskInstance.task_id == Task.id)
            .where(
                TaskInstance.user_id == self.user_id,
                Task.status != "archived",
            )
        )
        instances = list(instances_result.scalars().all())

        # Get all existing sync records
        syncs_result = await self.db.execute(
            select(GoogleCalendarEventSync).where(
                GoogleCalendarEventSync.user_id == self.user_id,
            )
        )
        existing_syncs = list(syncs_result.scalars().all())

        # Index sync records by task_id and task_instance_id
        syncs_by_task: dict[int, GoogleCalendarEventSync] = {}
        syncs_by_instance: dict[int, GoogleCalendarEventSync] = {}
        for sync in existing_syncs:
            if sync.task_id:
                syncs_by_task[sync.task_id] = sync
            elif sync.task_instance_id:
                syncs_by_instance[sync.task_instance_id] = sync

        # Track which sync records are still valid
        valid_sync_ids: set[int] = set()

        throttle = _AdaptiveThrottle()

        try:
            async with GoogleCalendarClient(self.db, google_token) as client:
                # Sync non-recurring tasks
                for task in tasks:
                    if _check_cancelled():
                        stats["cancelled"] = True
                        break
                    eff_date = _effective_date(task)
                    if not eff_date:
                        continue
                    is_completed = task.status == "completed"
                    t_title = GCAL_SYNC_ENCRYPTED_PLACEHOLDER if encrypted else task.title
                    t_desc = None if encrypted else task.description
                    current_hash = compute_sync_hash(
                        title=t_title,
                        description=t_desc,
                        scheduled_date=eff_date,
                        scheduled_time=task.scheduled_time,
                        duration_minutes=task.duration_minutes,
                        impact=task.impact,
                        status=task.status,
                    )

                    sync_record = syncs_by_task.get(task.id)

                    if sync_record:
                        valid_sync_ids.add(sync_record.id)
                        if sync_record.sync_hash == current_hash:
                            stats["skipped"] += 1
                            _report()
                            continue
                        # Update
                        event_data = build_event_data(
                            title=t_title,
                            description=t_desc,
                            scheduled_date=eff_date,
                            scheduled_time=task.scheduled_time,
                            duration_minutes=task.duration_minutes,
                            impact=task.impact,
                            is_completed=is_completed,
                            user_timezone=timezone,
                        )
                        try:
                            await throttle.call(
                                client.update_event,
                                prefs.gcal_sync_calendar_id,
                                sync_record.google_event_id,
                                event_data,
                            )
                            sync_record.sync_hash = current_hash
                            sync_record.last_synced_at = datetime.now(UTC)
                            stats["updated"] += 1
                            _report()
                            # Periodic flush to prevent orphan events on crash
                            if (stats["created"] + stats["updated"]) % 50 == 0:
                                await self.db.flush()
                        except Exception as e:
                            if _is_calendar_error(e):
                                raise  # Will be caught by outer try/except
                            if _is_gone_error(e):
                                event_id = await throttle.call(
                                    client.create_event,
                                    prefs.gcal_sync_calendar_id,
                                    event_data,
                                )
                                sync_record.google_event_id = event_id
                                sync_record.sync_hash = current_hash
                                sync_record.last_synced_at = datetime.now(UTC)
                                stats["created"] += 1
                                _report()
                            else:
                                logger.warning(f"Failed to update event for task {task.id}: {e}")
                    else:
                        # Create
                        event_data = build_event_data(
                            title=t_title,
                            description=t_desc,
                            scheduled_date=eff_date,
                            scheduled_time=task.scheduled_time,
                            duration_minutes=task.duration_minutes,
                            impact=task.impact,
                            is_completed=is_completed,
                            user_timezone=timezone,
                        )
                        try:
                            event_id = await throttle.call(
                                client.create_event,
                                prefs.gcal_sync_calendar_id,
                                event_data,
                            )
                            new_sync = GoogleCalendarEventSync(
                                user_id=self.user_id,
                                task_id=task.id,
                                google_event_id=event_id,
                                sync_hash=current_hash,
                                last_synced_at=datetime.now(UTC),
                            )
                            self.db.add(new_sync)
                            stats["created"] += 1
                            _report()
                            # Periodic flush to prevent orphan events on crash
                            if (stats["created"] + stats["updated"]) % 50 == 0:
                                await self.db.flush()
                        except Exception as e:
                            if _is_calendar_error(e):
                                raise  # Will be caught by outer try/except
                            logger.warning(f"Failed to create event for task {task.id}: {e}")

                # Sync task instances (need to load parent task for each)
                # Build a lookup of tasks by ID
                task_lookup: dict[int, Task] = {}
                if instances:
                    task_ids = {inst.task_id for inst in instances}
                    tasks_for_instances_result = await self.db.execute(select(Task).where(Task.id.in_(task_ids)))
                    for t in tasks_for_instances_result.scalars().all():
                        task_lookup[t.id] = t

                for instance in instances:
                    if _check_cancelled():
                        stats["cancelled"] = True
                        break
                    parent_task = task_lookup.get(instance.task_id)
                    if not parent_task:
                        continue

                    # Recurring tasks only sync when they have a specific time
                    scheduled_time = parent_task.scheduled_time
                    if not scheduled_time:
                        continue

                    is_completed = instance.status == "completed"
                    p_title = GCAL_SYNC_ENCRYPTED_PLACEHOLDER if encrypted else parent_task.title
                    p_desc = None if encrypted else parent_task.description
                    current_hash = compute_sync_hash(
                        title=p_title,
                        description=p_desc,
                        scheduled_date=instance.instance_date,
                        scheduled_time=scheduled_time,
                        duration_minutes=parent_task.duration_minutes,
                        impact=parent_task.impact,
                        status=instance.status,
                    )

                    sync_record = syncs_by_instance.get(instance.id)

                    if sync_record:
                        valid_sync_ids.add(sync_record.id)
                        if sync_record.sync_hash == current_hash:
                            stats["skipped"] += 1
                            _report()
                            continue
                        event_data = build_event_data(
                            title=p_title,
                            description=p_desc,
                            scheduled_date=instance.instance_date,
                            scheduled_time=scheduled_time,
                            duration_minutes=parent_task.duration_minutes,
                            impact=parent_task.impact,
                            is_completed=is_completed,
                            user_timezone=timezone,
                        )
                        try:
                            await throttle.call(
                                client.update_event,
                                prefs.gcal_sync_calendar_id,
                                sync_record.google_event_id,
                                event_data,
                            )
                            sync_record.sync_hash = current_hash
                            sync_record.last_synced_at = datetime.now(UTC)
                            stats["updated"] += 1
                            _report()
                            # Periodic flush to prevent orphan events on crash
                            if (stats["created"] + stats["updated"]) % 50 == 0:
                                await self.db.flush()
                        except Exception as e:
                            if _is_calendar_error(e):
                                raise
                            if _is_gone_error(e):
                                event_id = await throttle.call(
                                    client.create_event,
                                    prefs.gcal_sync_calendar_id,
                                    event_data,
                                )
                                sync_record.google_event_id = event_id
                                sync_record.sync_hash = current_hash
                                sync_record.last_synced_at = datetime.now(UTC)
                                stats["created"] += 1
                                _report()
                            else:
                                logger.warning(f"Failed to update event for instance {instance.id}: {e}")
                    else:
                        event_data = build_event_data(
                            title=p_title,
                            description=p_desc,
                            scheduled_date=instance.instance_date,
                            scheduled_time=scheduled_time,
                            duration_minutes=parent_task.duration_minutes,
                            impact=parent_task.impact,
                            is_completed=is_completed,
                            user_timezone=timezone,
                        )
                        try:
                            event_id = await throttle.call(
                                client.create_event,
                                prefs.gcal_sync_calendar_id,
                                event_data,
                            )
                            new_sync = GoogleCalendarEventSync(
                                user_id=self.user_id,
                                task_instance_id=instance.id,
                                google_event_id=event_id,
                                sync_hash=current_hash,
                                last_synced_at=datetime.now(UTC),
                            )
                            self.db.add(new_sync)
                            stats["created"] += 1
                            _report()
                            # Periodic flush to prevent orphan events on crash
                            if (stats["created"] + stats["updated"]) % 50 == 0:
                                await self.db.flush()
                        except Exception as e:
                            if _is_calendar_error(e):
                                raise
                            logger.warning(f"Failed to create event for instance {instance.id}: {e}")

                # Delete orphaned sync records (events for tasks that no longer exist or are unscheduled)
                if not stats.get("cancelled"):
                    orphaned = [s for s in existing_syncs if s.id not in valid_sync_ids]
                else:
                    orphaned = []
                for sync_record in orphaned:
                    try:
                        await throttle.call(
                            client.delete_event,
                            prefs.gcal_sync_calendar_id,
                            sync_record.google_event_id,
                        )
                    except Exception:
                        logger.debug(f"Failed to delete orphaned event {sync_record.google_event_id}")
                    await self.db.delete(sync_record)
                    stats["deleted"] += 1
                    _report()

        except (httpx.HTTPStatusError, TokenRefreshError) as e:
            if isinstance(e, TokenRefreshError):
                msg = "Google authorization expired. Please reconnect Google Calendar in Settings."
                await self._disable_sync_on_error(msg)
                stats["error"] = msg
                logger.warning(f"Bulk sync aborted for user {self.user_id}: {msg}")
                await self.db.flush()
                return stats
            if _is_calendar_error(e):
                msg = _calendar_error_message(e)
                await self._disable_sync_on_error(msg)
                stats["error"] = msg
                logger.warning(f"Bulk sync aborted for user {self.user_id}: {msg}")
                await self.db.flush()
                return stats
            raise

        # Clear any previous error on successful sync
        await self._clear_sync_error()
        await self.db.flush()
        return stats
