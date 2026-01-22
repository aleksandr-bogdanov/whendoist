"""
Task sorting functions.

Pure functions for sorting tasks by various criteria.
Used by task_grouping.py for server-side sorting based on user preferences.

v0.15.0: Extracted from app/routers/pages.py
"""

from datetime import date
from typing import Any

# Type alias for task items (dict with 'task' key and metadata)
TaskItem = dict[str, Any]


def native_task_sort_key(task_item: TaskItem) -> tuple:
    """
    Sort key for unscheduled tasks: impact (asc = highest first), then position.

    Lower impact values (P1=1) sort before higher values (P4=4).
    Within the same impact level, lower position values come first.
    As a tiebreaker, older tasks (by created_at) come first.

    Args:
        task_item: Dict containing 'task' key with Task model instance

    Returns:
        Tuple suitable for sorting (impact, position, created_at)
    """
    task = task_item["task"]
    return (task.impact, task.position, task.created_at)


def scheduled_task_sort_key(task_item: TaskItem) -> tuple:
    """
    Sort key for scheduled tasks: date first (soonest first), then impact.

    Scheduled tasks are sorted chronologically because the date represents
    when the task needs to be done - earlier dates are more urgent regardless
    of impact level.

    For recurring tasks, uses the next_occurrence date instead of scheduled_date.

    Args:
        task_item: Dict containing 'task' key with Task model instance,
                   and optionally 'next_occurrence' for recurring tasks

    Returns:
        Tuple suitable for sorting (scheduled_date, impact, position)
    """
    task = task_item["task"]
    # For recurring tasks, use next occurrence; for regular tasks, use scheduled_date
    if task.is_recurring and task_item.get("next_occurrence"):
        scheduled = task_item["next_occurrence"]
    else:
        scheduled = task.scheduled_date or date.max
    return (scheduled, task.impact, task.position)


def completed_task_sort_key(task_item: TaskItem) -> tuple:
    """
    Sort key for completed tasks by completion date (most recent first), then impact.

    Uses instance_completed_at for recurring tasks, task.completed_at for regular tasks.
    Tasks without a completion timestamp are sorted to the end.

    Args:
        task_item: Dict containing 'task' key with Task model instance,
                   and optionally 'instance_completed_at' for recurring tasks

    Returns:
        Tuple suitable for sorting (negated timestamp, impact, position)
    """
    task = task_item["task"]
    # Get completion time - use instance completion for recurring tasks
    completed_at = task_item.get("instance_completed_at") or task.completed_at
    # Most recent first: negate timestamp for descending order, inf for None (end of list)
    timestamp = -completed_at.timestamp() if completed_at else float("inf")
    return (timestamp, task.impact, task.position)
