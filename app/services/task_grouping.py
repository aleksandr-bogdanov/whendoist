"""
Task grouping service.

Groups tasks by domain with support for user preferences on section ordering,
visibility filtering, and date-based sorting.

v0.15.0: Extracted from app/routers/pages.py
"""

import contextlib
from datetime import datetime
from typing import Any

from sqlalchemy import inspect as sa_inspect

from app.models import Domain, Task, UserPreferences
from app.services.labels import Clarity, clarity_display
from app.services.task_service import TaskService
from app.services.task_sorting import (
    completed_task_sort_key,
    native_task_sort_key,
    scheduled_task_sort_key,
)

# Type aliases
TaskItem = dict[str, Any]  # Task with metadata and subtasks
DomainWithTasks = dict[str, Any]  # Domain with its tasks


def build_native_task_item(
    task: Task,
    next_instances: dict[int, dict] | None = None,
    instance_completed_at: datetime | None = None,
) -> TaskItem:
    """
    Create a task item dict from native Task model.

    Args:
        task: The task to build item for
        next_instances: Dict of task_id -> {date, id} for recurring tasks
        instance_completed_at: For recurring tasks, the completion time of today's instance

    Returns:
        Dict with task metadata suitable for template rendering
    """
    # Map clarity string to Clarity enum for display
    clarity = None
    if task.clarity:
        with contextlib.suppress(ValueError):
            clarity = Clarity(task.clarity)

    # Get next occurrence for recurring tasks
    next_occurrence = None
    next_instance_id = None
    if task.is_recurring and next_instances:
        instance_info = next_instances.get(task.id)
        if instance_info:
            next_occurrence = instance_info["date"]
            next_instance_id = instance_info["id"]

    # Determine completion age class for visual aging
    # For recurring tasks, use instance completion time; for regular tasks, use task completion time
    completed_at = instance_completed_at if task.is_recurring else task.completed_at
    completion_age_class = TaskService.get_completion_age_class(completed_at, task.status)

    # Only access subtasks if already eagerly loaded (avoids lazy loading in async context)
    subtasks = []
    if "subtasks" in sa_inspect(task).dict:
        subtasks = [build_native_task_item(s, next_instances) for s in (task.subtasks or [])]

    return {
        "task": task,
        "clarity_display": clarity_display(clarity),
        "next_occurrence": next_occurrence,
        "next_instance_id": next_instance_id,
        "subtasks": subtasks,
        "completion_age_class": completion_age_class,
        "instance_completed_at": instance_completed_at,
    }


def group_tasks_by_domain(
    tasks: list[Task],
    domains: list[Domain],
    next_instances: dict[int, dict] | None = None,
    today_instance_completions: dict[int, datetime] | None = None,
    user_prefs: UserPreferences | None = None,
) -> list[DomainWithTasks]:
    """
    Group tasks by domain, sorted by impact.

    Args:
        tasks: List of tasks to group
        domains: All user domains
        next_instances: Dict of task_id -> next instance date for recurring tasks
        today_instance_completions: Dict of task_id -> completed_at for today's recurring instances
        user_prefs: User preferences for filtering/sorting

    Returns:
        List of domain dicts, each containing 'domain' and 'tasks' keys
    """
    domains_map = {d.id: d for d in domains}
    tasks_by_domain: dict[int | None, list[TaskItem]] = {}

    # Get preference values with defaults
    retention_days = user_prefs.completed_retention_days if user_prefs else 3
    show_completed_in_list = user_prefs.show_completed_in_list if user_prefs else True
    show_scheduled_in_list = user_prefs.show_scheduled_in_list if user_prefs else True
    move_to_bottom = user_prefs.completed_move_to_bottom if user_prefs else True
    completed_sort_by_date = user_prefs.completed_sort_by_date if user_prefs else True
    scheduled_to_bottom = user_prefs.scheduled_move_to_bottom if user_prefs else True
    scheduled_sort_by_date = user_prefs.scheduled_sort_by_date if user_prefs else True
    hide_recurring_after = user_prefs.hide_recurring_after_completion if user_prefs else False

    for task in tasks:
        # Get instance completion time for recurring tasks
        instance_completed_at = today_instance_completions.get(task.id) if today_instance_completions else None

        # Check if task is scheduled (has a date assigned)
        is_scheduled = task.scheduled_date is not None

        # Hide scheduled tasks if preference is off (they'll still show on calendar)
        if is_scheduled and not show_scheduled_in_list:
            # Still show completed scheduled tasks if they're within retention window
            is_task_completed = task.status == "completed" or task.completed_at is not None or instance_completed_at
            if not is_task_completed:
                continue

        # Determine if task should be shown
        # Check status, completed_at (for regular tasks), and instance_completed_at (for recurring tasks)
        is_task_completed = task.status == "completed" or task.completed_at is not None or instance_completed_at
        if is_task_completed:
            # Check retention window
            completed_at = instance_completed_at if task.is_recurring else task.completed_at
            if not TaskService.is_within_retention_window(completed_at, retention_days):
                continue

            # Check if completed should show in list
            if not show_completed_in_list:
                continue

            # Check hide recurring after completion setting
            if task.is_recurring and hide_recurring_after and instance_completed_at:
                continue

        task_item = build_native_task_item(task, next_instances, instance_completed_at)
        domain_id = task.domain_id
        tasks_by_domain.setdefault(domain_id, []).append(task_item)

    # Sort tasks within each domain
    domains_with_tasks: list[DomainWithTasks] = []

    def is_completed_task(task_item: TaskItem) -> bool:
        """Check if a task should be considered completed for sorting purposes."""
        # Has visual aging class (completed_at is set)
        if task_item["completion_age_class"]:
            return True
        # Task status is completed (fallback for tasks without completed_at)
        task = task_item["task"]
        if task.status == "completed":
            return True
        # Recurring task with instance completed today
        return bool(task_item["instance_completed_at"])

    def is_scheduled_task(task_item: TaskItem) -> bool:
        """Check if a task has a scheduled date (counts as scheduled for separation)."""
        task = task_item["task"]
        return task.scheduled_date is not None

    for domain_id, domain_tasks in tasks_by_domain.items():
        # Separate tasks into groups for proper sorting
        unscheduled_pending = [t for t in domain_tasks if not is_completed_task(t) and not is_scheduled_task(t)]
        scheduled_pending = [t for t in domain_tasks if not is_completed_task(t) and is_scheduled_task(t)]
        completed = [t for t in domain_tasks if is_completed_task(t)]

        # Sort each group:
        # - Unscheduled: by impact (P1 first)
        # - Scheduled: by date (soonest first) when grouped at bottom, otherwise by impact
        # - Completed: by completion date (most recent first) when grouped at bottom, otherwise by impact
        unscheduled_pending.sort(key=native_task_sort_key)
        if scheduled_to_bottom and scheduled_sort_by_date:
            scheduled_pending.sort(key=scheduled_task_sort_key)
        else:
            scheduled_pending.sort(key=native_task_sort_key)
        if move_to_bottom and completed_sort_by_date:
            completed.sort(key=completed_task_sort_key)
        else:
            completed.sort(key=native_task_sort_key)

        if move_to_bottom and scheduled_to_bottom:
            # Both completed and scheduled at bottom: unscheduled -> scheduled -> completed
            domain_tasks = unscheduled_pending + scheduled_pending + completed
        elif move_to_bottom and not scheduled_to_bottom:
            # Only completed at bottom: (unscheduled + scheduled interleaved) -> completed
            all_pending = unscheduled_pending + scheduled_pending
            all_pending.sort(key=native_task_sort_key)
            domain_tasks = all_pending + completed
        elif not move_to_bottom and scheduled_to_bottom:
            # Only scheduled at bottom: (unscheduled + completed_unscheduled) -> (scheduled + completed_scheduled)
            completed_unscheduled = [t for t in completed if not is_scheduled_task(t)]
            completed_scheduled = [t for t in completed if is_scheduled_task(t)]
            all_unscheduled = unscheduled_pending + completed_unscheduled
            all_scheduled = scheduled_pending + completed_scheduled
            all_unscheduled.sort(key=native_task_sort_key)
            all_scheduled.sort(key=scheduled_task_sort_key)
            domain_tasks = all_unscheduled + all_scheduled
        else:
            # Neither at bottom: all tasks interleaved by impact
            all_tasks = unscheduled_pending + scheduled_pending + completed
            all_tasks.sort(key=native_task_sort_key)
            domain_tasks = all_tasks

        for task_item in domain_tasks:
            task_item["subtasks"].sort(key=native_task_sort_key)

        domains_with_tasks.append(
            {
                "domain": domains_map.get(domain_id) if domain_id else None,
                "tasks": domain_tasks,
            }
        )

    # Sort: named domains alphabetically, Inbox (None) last
    domains_with_tasks.sort(key=lambda d: (d["domain"] is None, d["domain"].name.lower() if d["domain"] else "zzz"))

    return domains_with_tasks
