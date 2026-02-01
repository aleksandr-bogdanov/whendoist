"""
Google Calendar sync service.

One-way sync: Whendoist -> Google Calendar.
Scheduled tasks appear as events in a dedicated "Whendoist" calendar.
"""

import contextlib
import logging
from datetime import UTC, date, datetime

from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import DEFAULT_TIMEZONE
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

    # =========================================================================
    # Core Sync Operations
    # =========================================================================

    async def sync_task(self, task: Task) -> None:
        """Sync a single non-recurring task to Google Calendar."""
        prefs = await self._get_prefs()
        if not prefs or not prefs.gcal_sync_enabled or not prefs.gcal_sync_calendar_id:
            return

        # Resolve effective date (scheduled_date or completed_at for Todoist imports)
        eff_date = _effective_date(task)
        if not eff_date:
            await self._unsync_by_task_id(task.id, prefs.gcal_sync_calendar_id)
            return

        # For date-only tasks (no scheduled_time), check all-day preference
        if not task.scheduled_time and not prefs.gcal_sync_all_day:
            await self._unsync_by_task_id(task.id, prefs.gcal_sync_calendar_id)
            return

        timezone = await self._get_timezone(prefs)
        is_completed = task.status == "completed"

        current_hash = compute_sync_hash(
            title=task.title,
            description=task.description,
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
            title=task.title,
            description=task.description,
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

        async with GoogleCalendarClient(self.db, google_token) as client:
            if sync_record:
                # Update existing event
                try:
                    await client.update_event(prefs.gcal_sync_calendar_id, sync_record.google_event_id, event_data)
                except Exception as e:
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
                event_id = await client.create_event(prefs.gcal_sync_calendar_id, event_data)
                sync_record = GoogleCalendarEventSync(
                    user_id=self.user_id,
                    task_id=task.id,
                    google_event_id=event_id,
                    sync_hash=current_hash,
                    last_synced_at=datetime.now(UTC),
                )
                self.db.add(sync_record)

        await self.db.flush()

    async def sync_task_instance(self, instance: TaskInstance, task: Task) -> None:
        """Sync a single task instance to Google Calendar."""
        prefs = await self._get_prefs()
        if not prefs or not prefs.gcal_sync_enabled or not prefs.gcal_sync_calendar_id:
            return

        # Use instance_date as the scheduled_date, task's time as scheduled_time
        scheduled_time = task.scheduled_time
        if not scheduled_time and not prefs.gcal_sync_all_day:
            return

        timezone = await self._get_timezone(prefs)
        is_completed = instance.status == "completed"

        current_hash = compute_sync_hash(
            title=task.title,
            description=task.description,
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
            title=task.title,
            description=task.description,
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

        async with GoogleCalendarClient(self.db, google_token) as client:
            if sync_record:
                try:
                    await client.update_event(prefs.gcal_sync_calendar_id, sync_record.google_event_id, event_data)
                except Exception as e:
                    if _is_gone_error(e):
                        event_id = await client.create_event(prefs.gcal_sync_calendar_id, event_data)
                        sync_record.google_event_id = event_id
                    else:
                        raise
                sync_record.sync_hash = current_hash
                sync_record.last_synced_at = datetime.now(UTC)
            else:
                event_id = await client.create_event(prefs.gcal_sync_calendar_id, event_data)
                sync_record = GoogleCalendarEventSync(
                    user_id=self.user_id,
                    task_instance_id=instance.id,
                    google_event_id=event_id,
                    sync_hash=current_hash,
                    last_synced_at=datetime.now(UTC),
                )
                self.db.add(sync_record)

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

    # =========================================================================
    # Bulk Operations
    # =========================================================================

    async def bulk_sync(self) -> dict:
        """
        Full sync: create missing, update changed, delete orphaned.

        Returns stats dict with counts.
        """
        prefs = await self._get_prefs()
        if not prefs or not prefs.gcal_sync_enabled or not prefs.gcal_sync_calendar_id:
            return {"created": 0, "updated": 0, "deleted": 0, "skipped": 0}

        google_token = await self._get_google_token()
        if not google_token:
            return {"created": 0, "updated": 0, "deleted": 0, "skipped": 0}

        timezone = await self._get_timezone(prefs)
        stats = {"created": 0, "updated": 0, "deleted": 0, "skipped": 0}

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

        async with GoogleCalendarClient(self.db, google_token) as client:
            # Sync non-recurring tasks
            for task in tasks:
                eff_date = _effective_date(task)
                if not eff_date:
                    continue
                if not task.scheduled_time and not prefs.gcal_sync_all_day:
                    continue

                is_completed = task.status == "completed"
                current_hash = compute_sync_hash(
                    title=task.title,
                    description=task.description,
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
                        continue
                    # Update
                    event_data = build_event_data(
                        title=task.title,
                        description=task.description,
                        scheduled_date=eff_date,
                        scheduled_time=task.scheduled_time,
                        duration_minutes=task.duration_minutes,
                        impact=task.impact,
                        is_completed=is_completed,
                        user_timezone=timezone,
                    )
                    try:
                        await client.update_event(prefs.gcal_sync_calendar_id, sync_record.google_event_id, event_data)
                        sync_record.sync_hash = current_hash
                        sync_record.last_synced_at = datetime.now(UTC)
                        stats["updated"] += 1
                    except Exception as e:
                        if _is_gone_error(e):
                            event_id = await client.create_event(prefs.gcal_sync_calendar_id, event_data)
                            sync_record.google_event_id = event_id
                            sync_record.sync_hash = current_hash
                            sync_record.last_synced_at = datetime.now(UTC)
                            stats["created"] += 1
                        else:
                            logger.warning(f"Failed to update event for task {task.id}: {e}")
                else:
                    # Create
                    event_data = build_event_data(
                        title=task.title,
                        description=task.description,
                        scheduled_date=eff_date,
                        scheduled_time=task.scheduled_time,
                        duration_minutes=task.duration_minutes,
                        impact=task.impact,
                        is_completed=is_completed,
                        user_timezone=timezone,
                    )
                    try:
                        event_id = await client.create_event(prefs.gcal_sync_calendar_id, event_data)
                        new_sync = GoogleCalendarEventSync(
                            user_id=self.user_id,
                            task_id=task.id,
                            google_event_id=event_id,
                            sync_hash=current_hash,
                            last_synced_at=datetime.now(UTC),
                        )
                        self.db.add(new_sync)
                        stats["created"] += 1
                    except Exception as e:
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
                parent_task = task_lookup.get(instance.task_id)
                if not parent_task:
                    continue

                scheduled_time = parent_task.scheduled_time
                if not scheduled_time and not prefs.gcal_sync_all_day:
                    continue

                is_completed = instance.status == "completed"
                current_hash = compute_sync_hash(
                    title=parent_task.title,
                    description=parent_task.description,
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
                        continue
                    event_data = build_event_data(
                        title=parent_task.title,
                        description=parent_task.description,
                        scheduled_date=instance.instance_date,
                        scheduled_time=scheduled_time,
                        duration_minutes=parent_task.duration_minutes,
                        impact=parent_task.impact,
                        is_completed=is_completed,
                        user_timezone=timezone,
                    )
                    try:
                        await client.update_event(prefs.gcal_sync_calendar_id, sync_record.google_event_id, event_data)
                        sync_record.sync_hash = current_hash
                        sync_record.last_synced_at = datetime.now(UTC)
                        stats["updated"] += 1
                    except Exception as e:
                        if _is_gone_error(e):
                            event_id = await client.create_event(prefs.gcal_sync_calendar_id, event_data)
                            sync_record.google_event_id = event_id
                            sync_record.sync_hash = current_hash
                            sync_record.last_synced_at = datetime.now(UTC)
                            stats["created"] += 1
                        else:
                            logger.warning(f"Failed to update event for instance {instance.id}: {e}")
                else:
                    event_data = build_event_data(
                        title=parent_task.title,
                        description=parent_task.description,
                        scheduled_date=instance.instance_date,
                        scheduled_time=scheduled_time,
                        duration_minutes=parent_task.duration_minutes,
                        impact=parent_task.impact,
                        is_completed=is_completed,
                        user_timezone=timezone,
                    )
                    try:
                        event_id = await client.create_event(prefs.gcal_sync_calendar_id, event_data)
                        new_sync = GoogleCalendarEventSync(
                            user_id=self.user_id,
                            task_instance_id=instance.id,
                            google_event_id=event_id,
                            sync_hash=current_hash,
                            last_synced_at=datetime.now(UTC),
                        )
                        self.db.add(new_sync)
                        stats["created"] += 1
                    except Exception as e:
                        logger.warning(f"Failed to create event for instance {instance.id}: {e}")

            # Delete orphaned sync records (events for tasks that no longer exist or are unscheduled)
            orphaned = [s for s in existing_syncs if s.id not in valid_sync_ids]
            for sync_record in orphaned:
                try:
                    await client.delete_event(prefs.gcal_sync_calendar_id, sync_record.google_event_id)
                except Exception:
                    logger.debug(f"Failed to delete orphaned event {sync_record.google_event_id}")
                await self.db.delete(sync_record)
                stats["deleted"] += 1

        await self.db.flush()
        return stats

    async def delete_all_synced_events(self) -> int:
        """Delete all synced events from Google Calendar and remove sync records."""
        prefs = await self._get_prefs()
        if not prefs or not prefs.gcal_sync_calendar_id:
            return 0

        google_token = await self._get_google_token()
        if not google_token:
            return 0

        syncs_result = await self.db.execute(
            select(GoogleCalendarEventSync).where(
                GoogleCalendarEventSync.user_id == self.user_id,
            )
        )
        sync_records = list(syncs_result.scalars().all())

        deleted = 0
        if sync_records:
            async with GoogleCalendarClient(self.db, google_token) as client:
                for sync_record in sync_records:
                    with contextlib.suppress(Exception):
                        await client.delete_event(prefs.gcal_sync_calendar_id, sync_record.google_event_id)
                    deleted += 1

            # Delete all sync records in one query
            await self.db.execute(
                delete(GoogleCalendarEventSync).where(
                    GoogleCalendarEventSync.user_id == self.user_id,
                )
            )
            await self.db.flush()

        return deleted


def _is_gone_error(e: Exception) -> bool:
    """Check if an exception indicates a 404/410 (resource gone)."""
    import httpx

    if isinstance(e, httpx.HTTPStatusError):
        return e.response.status_code in (404, 410)
    return False
