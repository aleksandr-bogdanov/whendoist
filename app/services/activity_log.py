"""
Activity logging service.

Provides helpers to create activity log entries within existing database
transactions. All log calls ride the caller's transaction — no extra
commits needed. Called from TaskService, RecurrenceService, and routers
right before bump_data_version().

Two views from one table:
- Per-task:  WHERE user_id = ? AND task_id = ? ORDER BY created_at DESC
- Per-user:  WHERE user_id = ? ORDER BY created_at DESC
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ActivityLog

# Fields encrypted client-side — log event only, never store old/new values
ENCRYPTED_FIELDS = frozenset({"title", "description", "name"})

# Fields to skip entirely (too noisy, internal ordering)
SKIP_FIELDS = frozenset({"position"})

# Non-encrypted task fields to track diffs for
TASK_DIFF_FIELDS = frozenset(
    {
        "domain_id",
        "parent_id",
        "impact",
        "clarity",
        "duration_minutes",
        "scheduled_date",
        "scheduled_time",
        "is_recurring",
        "recurrence_rule",
        "recurrence_start",
        "recurrence_end",
    }
)

# Non-encrypted domain fields to track diffs for
DOMAIN_DIFF_FIELDS = frozenset({"color", "icon"})


async def log_activity(
    db: AsyncSession,
    *,
    user_id: int,
    event_type: str,
    task_id: int | None = None,
    instance_id: int | None = None,
    domain_id: int | None = None,
    field_name: str | None = None,
    old_value: str | None = None,
    new_value: str | None = None,
    batch_id: str | None = None,
) -> None:
    """Create a single activity log entry. Rides the caller's transaction."""
    db.add(
        ActivityLog(
            user_id=user_id,
            task_id=task_id,
            instance_id=instance_id,
            domain_id=domain_id,
            event_type=event_type,
            field_name=field_name,
            old_value=old_value,
            new_value=new_value,
            batch_id=batch_id,
        )
    )


async def log_field_changes(
    db: AsyncSession,
    *,
    user_id: int,
    event_type: str,
    old_values: dict[str, object],
    new_values: dict[str, object],
    diff_fields: frozenset[str],
    task_id: int | None = None,
    domain_id: int | None = None,
    batch_id: str | None = None,
) -> None:
    """
    Log field_changed events for each field that actually changed.

    For encrypted fields: logs event without old/new values.
    For non-encrypted fields: logs old and new as string representations.
    Skips fields in SKIP_FIELDS (e.g., position).
    """
    check_fields = (diff_fields | (ENCRYPTED_FIELDS & set(old_values))) - SKIP_FIELDS
    for field in check_fields:
        old = old_values.get(field)
        new = new_values.get(field)
        if old == new:
            continue

        if field in ENCRYPTED_FIELDS:
            await log_activity(
                db,
                user_id=user_id,
                event_type=event_type,
                task_id=task_id,
                domain_id=domain_id,
                field_name=field,
                batch_id=batch_id,
            )
        else:
            await log_activity(
                db,
                user_id=user_id,
                event_type=event_type,
                task_id=task_id,
                domain_id=domain_id,
                field_name=field,
                old_value=str(old) if old is not None else None,
                new_value=str(new) if new is not None else None,
                batch_id=batch_id,
            )


def new_batch_id() -> str:
    """Generate a new batch ID for grouping related activity entries."""
    return str(uuid.uuid4())
