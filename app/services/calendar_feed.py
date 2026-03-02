"""
iCal (.ics) calendar subscription feed generator.

Produces RFC 5545 compliant VCALENDAR output from Whendoist tasks.
Non-recurring tasks become individual VEVENTs; recurring tasks become
VEVENTs with RRULE (not materialized instances) so calendar apps can
show occurrences beyond the 60-day materialization window.

Exception handling follows RFC 5545:
- Skipped instances → EXDATE entries
- Completed instances → override VEVENTs (same UID + RECURRENCE-ID)
"""

import logging
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from dateutil.rrule import DAILY, MONTHLY, WEEKLY, YEARLY, rrule
from dateutil.rrule import FR as _FR
from dateutil.rrule import MO as _MO
from dateutil.rrule import SA as _SA
from dateutil.rrule import SU as _SU
from dateutil.rrule import TH as _TH
from dateutil.rrule import TU as _TU
from dateutil.rrule import WE as _WE
from icalendar import Calendar, Event, vDate
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import DEFAULT_TIMEZONE
from app.models import Task, TaskInstance

logger = logging.getLogger("whendoist.calendar_feed")

# Completed task retention: only include tasks completed within last 14 days
COMPLETED_RETENTION_DAYS = 14

# Default event duration for timed tasks without explicit duration
DEFAULT_DURATION_MINUTES = 30

# Day-of-week mapping for RRULE BYDAY values
_RRULE_DAY_MAP = {
    "MO": "MO",
    "TU": "TU",
    "WE": "WE",
    "TH": "TH",
    "FR": "FR",
    "SA": "SA",
    "SU": "SU",
}

# Frequency mapping for dateutil rrule (used to compute DTSTART)
_FREQ_MAP = {
    "daily": DAILY,
    "weekly": WEEKLY,
    "monthly": MONTHLY,
    "yearly": YEARLY,
}

_DATEUTIL_DAY_MAP = {
    "MO": _MO,
    "TU": _TU,
    "WE": _WE,
    "TH": _TH,
    "FR": _FR,
    "SA": _SA,
    "SU": _SU,
}


async def generate_feed(db: AsyncSession, user_id: int, timezone: str) -> bytes:
    """
    Generate a complete iCal feed for a user.

    Args:
        db: Database session
        user_id: The user's ID
        timezone: IANA timezone string (e.g., "America/New_York")

    Returns:
        UTF-8 encoded .ics file content
    """
    now = datetime.now(UTC)
    cutoff = now - timedelta(days=COMPLETED_RETENTION_DAYS)

    # Query 1: Non-recurring tasks with scheduled_date or completed_at
    tasks_result = await db.execute(
        select(Task).where(
            Task.user_id == user_id,
            Task.is_recurring == False,
            Task.status != "archived",
            or_(
                Task.scheduled_date.isnot(None),
                Task.completed_at.isnot(None),
            ),
        )
    )
    non_recurring_tasks = list(tasks_result.scalars().all())

    # Query 2: Recurring tasks (non-archived)
    recurring_result = await db.execute(
        select(Task).where(
            Task.user_id == user_id,
            Task.is_recurring == True,
            Task.status != "archived",
        )
    )
    recurring_tasks = list(recurring_result.scalars().all())

    # Query 3: Non-pending instances for recurring tasks (completed + skipped)
    instances: list[TaskInstance] = []
    if recurring_tasks:
        task_ids = [t.id for t in recurring_tasks]
        instances_result = await db.execute(
            select(TaskInstance)
            .join(Task, TaskInstance.task_id == Task.id)
            .where(
                TaskInstance.user_id == user_id,
                TaskInstance.task_id.in_(task_ids),
                TaskInstance.status.in_(["completed", "skipped"]),
            )
        )
        instances = list(instances_result.scalars().all())

    # Group instances by task_id
    skipped_by_task: dict[int, list[date]] = {}
    completed_by_task: dict[int, list[TaskInstance]] = {}
    for inst in instances:
        if inst.status == "skipped":
            skipped_by_task.setdefault(inst.task_id, []).append(inst.instance_date)
        elif inst.status == "completed" and inst.completed_at and inst.completed_at >= cutoff:
            completed_by_task.setdefault(inst.task_id, []).append(inst)

    # Build the calendar
    cal = Calendar()
    cal.add("prodid", "-//Whendoist//Calendar Feed//EN")
    cal.add("version", "2.0")
    cal.add("calscale", "GREGORIAN")
    cal.add("x-wr-calname", "Whendoist")
    cal.add("x-wr-timezone", timezone)
    cal.add("refresh-interval;value=duration", "PT1H")
    cal.add("x-published-ttl", "PT1H")

    dtstamp = now

    # Add non-recurring tasks
    for task in non_recurring_tasks:
        event = _task_to_vevent(task, timezone, dtstamp, cutoff)
        if event:
            cal.add_component(event)

    # Add recurring tasks
    for task in recurring_tasks:
        skipped_dates = skipped_by_task.get(task.id, [])
        event = _recurring_task_to_vevent(task, skipped_dates, timezone, dtstamp)
        if event:
            cal.add_component(event)

        # Add override VEVENTs for completed instances
        for inst in completed_by_task.get(task.id, []):
            override = _completed_instance_to_override(inst, task, timezone, dtstamp)
            if override:
                cal.add_component(override)

    return cal.to_ical()


def _effective_date(task: Task) -> date | None:
    """Get the effective calendar date for a non-recurring task."""
    if task.scheduled_date:
        return task.scheduled_date
    if task.status == "completed" and task.completed_at:
        return task.completed_at.date()
    return None


def _task_to_vevent(
    task: Task,
    timezone: str,
    dtstamp: datetime,
    completed_cutoff: datetime,
) -> Event | None:
    """Convert a non-recurring task to a VEVENT."""
    eff_date = _effective_date(task)
    if not eff_date:
        return None

    # Skip old completed tasks
    if task.status == "completed" and task.completed_at and task.completed_at < completed_cutoff:
        return None

    is_completed = task.status == "completed"
    summary = f"✓ {task.title}" if is_completed else task.title

    event = Event()
    event.add("uid", f"task-{task.id}@whendoist.com")
    event.add("dtstamp", dtstamp)
    event.add("summary", summary)
    event.add("status", "CONFIRMED")
    event.add("sequence", _sequence_from_updated_at(task.updated_at))

    if task.updated_at:
        event.add("last-modified", task.updated_at)

    if task.description:
        event.add("description", task.description)

    _add_start_end(event, eff_date, task.scheduled_time, task.duration_minutes, timezone)

    return event


def _recurring_task_to_vevent(
    task: Task,
    skipped_dates: list[date],
    timezone: str,
    dtstamp: datetime,
) -> Event | None:
    """Convert a recurring task to a VEVENT with RRULE and EXDATE entries."""
    if not task.recurrence_rule:
        return None

    # Compute DTSTART as the first actual occurrence (not necessarily recurrence_start)
    dtstart_date = _compute_first_occurrence(task)
    if not dtstart_date:
        return None

    is_completed = task.status == "completed"
    summary = f"✓ {task.title}" if is_completed else task.title

    event = Event()
    event.add("uid", f"task-{task.id}@whendoist.com")
    event.add("dtstamp", dtstamp)
    event.add("summary", summary)
    event.add("status", "CONFIRMED")
    event.add("sequence", _sequence_from_updated_at(task.updated_at))

    if task.updated_at:
        event.add("last-modified", task.updated_at)

    if task.description:
        event.add("description", task.description)

    # DTSTART / DTEND
    _add_start_end(event, dtstart_date, task.scheduled_time, task.duration_minutes, timezone)

    # RRULE
    rrule_dict = _recurrence_rule_to_rrule(task.recurrence_rule, task.recurrence_end)
    if rrule_dict:
        event.add("rrule", rrule_dict)

    # EXDATE for skipped instances
    tz = ZoneInfo(timezone) if timezone else ZoneInfo(DEFAULT_TIMEZONE)
    for skip_date in skipped_dates:
        if task.scheduled_time:
            exdate_dt = datetime.combine(skip_date, task.scheduled_time, tzinfo=tz)
            event.add("exdate", exdate_dt)
        else:
            event.add("exdate", skip_date)

    return event


def _completed_instance_to_override(
    instance: TaskInstance,
    task: Task,
    timezone: str,
    dtstamp: datetime,
) -> Event | None:
    """Create an override VEVENT for a completed recurring instance."""
    summary = f"✓ {task.title}"

    event = Event()
    event.add("uid", f"task-{task.id}@whendoist.com")
    event.add("dtstamp", dtstamp)
    event.add("summary", summary)
    event.add("status", "CONFIRMED")
    event.add("sequence", _sequence_from_updated_at(task.updated_at))

    if task.updated_at:
        event.add("last-modified", task.updated_at)

    if task.description:
        event.add("description", task.description)

    # RECURRENCE-ID must match the DTSTART format of the parent
    tz = ZoneInfo(timezone) if timezone else ZoneInfo(DEFAULT_TIMEZONE)
    if task.scheduled_time:
        recurrence_id = datetime.combine(instance.instance_date, task.scheduled_time, tzinfo=tz)
        event.add("recurrence-id", recurrence_id)
    else:
        event.add("recurrence-id", vDate(instance.instance_date))

    # DTSTART / DTEND for this specific occurrence
    _add_start_end(event, instance.instance_date, task.scheduled_time, task.duration_minutes, timezone)

    return event


def _add_start_end(
    event: Event,
    event_date: date,
    scheduled_time: time | None,
    duration_minutes: int | None,
    timezone: str,
) -> None:
    """Add DTSTART and DTEND to an event (timed or all-day)."""
    if scheduled_time:
        # Timed event
        tz = ZoneInfo(timezone) if timezone else ZoneInfo(DEFAULT_TIMEZONE)
        start_dt = datetime.combine(event_date, scheduled_time, tzinfo=tz)
        duration = duration_minutes or DEFAULT_DURATION_MINUTES
        end_dt = start_dt + timedelta(minutes=duration)
        event.add("dtstart", start_dt)
        event.add("dtend", end_dt)
    else:
        # All-day event: VALUE=DATE (bare date, not midnight datetime)
        event.add("dtstart", vDate(event_date))
        event.add("dtend", vDate(event_date + timedelta(days=1)))


def _recurrence_rule_to_rrule(rule: dict, recurrence_end: date | None) -> dict | None:
    """Convert Whendoist recurrence_rule JSON to icalendar RRULE dict.

    Returns a dict suitable for icalendar's event.add('rrule', ...).
    """
    freq = rule.get("freq")
    if not freq:
        return None

    freq_upper = freq.upper()
    if freq_upper not in ("DAILY", "WEEKLY", "MONTHLY", "YEARLY"):
        return None

    rrule_dict: dict = {"freq": freq_upper}

    interval = rule.get("interval", 1)
    if interval and interval > 1:
        rrule_dict["interval"] = interval

    # Weekly: BYDAY
    if freq == "weekly" and "days_of_week" in rule:
        days = [_RRULE_DAY_MAP[d] for d in rule["days_of_week"] if d in _RRULE_DAY_MAP]
        if days:
            rrule_dict["byday"] = days

    # Monthly: BYMONTHDAY (specific day of month)
    if freq == "monthly" and "day_of_month" in rule and "week_of_month" not in rule:
        rrule_dict["bymonthday"] = rule["day_of_month"]

    # Monthly: nth weekday (e.g., 2nd Monday → BYDAY=2MO)
    if freq == "monthly" and "week_of_month" in rule and "days_of_week" in rule:
        week = rule["week_of_month"]
        days = rule["days_of_week"]
        if days:
            # RFC 5545: BYDAY=2MO means "2nd Monday"
            rrule_dict["byday"] = f"{week}{_RRULE_DAY_MAP[days[0]]}"

    # Yearly
    if freq == "yearly":
        if "month_of_year" in rule:
            rrule_dict["bymonth"] = rule["month_of_year"]
        if "day_of_month" in rule:
            rrule_dict["bymonthday"] = rule["day_of_month"]

    # UNTIL
    if recurrence_end:
        rrule_dict["until"] = datetime.combine(recurrence_end, time(23, 59, 59), tzinfo=ZoneInfo("UTC"))

    return rrule_dict


def _compute_first_occurrence(task: Task) -> date | None:
    """Compute the first actual occurrence date for a recurring task.

    Uses dateutil.rrule to find the first occurrence, which may differ
    from recurrence_start when BYDAY constraints don't align with the start date.
    """
    if not task.recurrence_rule:
        return None

    rule = task.recurrence_rule
    freq = _FREQ_MAP.get(rule.get("freq", ""))
    if freq is None:
        return None

    start = task.recurrence_start or task.scheduled_date or task.created_at.date()

    kwargs: dict = {
        "dtstart": datetime.combine(start, task.scheduled_time or time(9, 0)),
        "count": 1,
        "interval": rule.get("interval", 1),
    }

    # Weekly: days of week
    if rule.get("freq") == "weekly" and "days_of_week" in rule:
        days = [_DATEUTIL_DAY_MAP[d] for d in rule["days_of_week"] if d in _DATEUTIL_DAY_MAP]
        if days:
            kwargs["byweekday"] = days

    # Monthly: specific day
    if rule.get("freq") == "monthly" and "day_of_month" in rule and "week_of_month" not in rule:
        kwargs["bymonthday"] = rule["day_of_month"]

    # Monthly: nth weekday
    if rule.get("freq") == "monthly" and "week_of_month" in rule and "days_of_week" in rule:
        week = rule["week_of_month"]
        days = rule["days_of_week"]
        if days:
            kwargs["byweekday"] = [_DATEUTIL_DAY_MAP[days[0]](week)]

    # Yearly
    if rule.get("freq") == "yearly":
        if "month_of_year" in rule:
            kwargs["bymonth"] = rule["month_of_year"]
        if "day_of_month" in rule:
            kwargs["bymonthday"] = rule["day_of_month"]

    try:
        rr = rrule(freq, **kwargs)  # type: ignore[arg-type]
        occurrences = list(rr)
        if occurrences:
            return occurrences[0].date()
    except Exception:
        logger.warning(f"Failed to compute first occurrence for task {task.id}", exc_info=True)

    # Fallback to recurrence_start
    return start


def _sequence_from_updated_at(updated_at: datetime | None) -> int:
    """Derive SEQUENCE from updated_at timestamp.

    SEQUENCE is critical for Google Calendar — it uses UID + SEQUENCE
    to detect event changes. Using unix timestamp ensures monotonic increase.
    """
    if updated_at:
        return int(updated_at.timestamp())
    return 0
