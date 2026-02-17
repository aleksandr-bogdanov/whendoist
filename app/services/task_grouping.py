"""
Task grouping service.

Groups tasks by domain with flat scheduled/completed sections.

Active (unscheduled, pending) tasks are grouped by domain.
Scheduled and completed tasks are collected into flat cross-domain lists,
sorted by date.

v0.15.0: Extracted from app/routers/pages.py
v0.33.1: Hardcode section defaults, flatten scheduled/completed sections
v0.46.2: Subtask containers — subtasks nested under parents, not flat
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
GroupedTasks = dict[str, Any]  # Return type: domain_groups + flat scheduled/completed


def build_native_task_item(
    task: Task,
    next_instances: dict[int, dict] | None = None,
    instance_completed_at: datetime | None = None,
    subtask_count: int | None = None,
) -> TaskItem:
    """
    Create a task item dict from native Task model.

    Args:
        task: The task to build item for
        next_instances: Dict of task_id -> {date, id} for recurring tasks
        instance_completed_at: For recurring tasks, the completion time of today's instance
        subtask_count: Number of subtasks (None = auto-detect from eager-loaded relationship)

    Returns:
        Dict with task metadata suitable for API response rendering
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

    # Get parent name for breadcrumb display (if parent was eagerly loaded)
    parent_name = None
    if task.parent_id and "parent" in sa_inspect(task).dict and task.parent:
        parent_name = task.parent.title

    # Only access subtasks if already eagerly loaded (avoids lazy loading in async context)
    subtasks = []
    if "subtasks" in sa_inspect(task).dict:
        subtasks = [build_native_task_item(s, next_instances) for s in (task.subtasks or [])]

    # Derive subtask_count from eagerly loaded subtasks if not explicitly provided
    if subtask_count is None:
        subtask_count = len(subtasks)

    return {
        "task": task,
        "clarity_display": clarity_display(clarity),
        "next_occurrence": next_occurrence,
        "next_instance_id": next_instance_id,
        "subtasks": subtasks,
        "parent_name": parent_name,
        "subtask_count": subtask_count,
        "completion_age_class": completion_age_class,
        "instance_completed_at": instance_completed_at,
    }


def group_tasks_by_domain(
    tasks: list[Task],
    domains: list[Domain],
    next_instances: dict[int, dict] | None = None,
    today_instance_completions: dict[int, datetime] | None = None,
    user_prefs: UserPreferences | None = None,
) -> GroupedTasks:
    """
    Group tasks by domain with flat scheduled/completed sections.

    Active (unscheduled, pending) tasks are grouped by domain.
    Scheduled and completed tasks are collected into flat cross-domain lists.
    Subtasks are nested under their parent via eager-loaded relationships,
    not included as flat entries.

    Args:
        tasks: List of tasks to group
        domains: All user domains
        next_instances: Dict of task_id -> next instance date for recurring tasks
        today_instance_completions: Dict of task_id -> completed_at for today's recurring instances
        user_prefs: User preferences for filtering/sorting

    Returns:
        Dict with 'domain_groups', 'scheduled_tasks', 'completed_tasks'
    """
    domains_map = {d.id: d for d in domains}

    # User-controlled preferences
    retention_days = user_prefs.completed_retention_days if user_prefs else 3
    hide_recurring_after = user_prefs.hide_recurring_after_completion if user_prefs else False

    # Collect tasks into three buckets: active by domain, scheduled flat, completed flat
    active_by_domain: dict[int | None, list[TaskItem]] = {}
    all_scheduled: list[TaskItem] = []
    all_completed: list[TaskItem] = []

    def _is_completed(task: Task, instance_completed_at: datetime | None) -> bool:
        return task.status == "completed" or task.completed_at is not None or bool(instance_completed_at)

    for task in tasks:
        # Skip subtasks — they appear nested under their parent container
        if task.parent_id is not None:
            continue

        instance_completed_at = today_instance_completions.get(task.id) if today_instance_completions else None
        is_scheduled = task.scheduled_date is not None
        is_task_completed = _is_completed(task, instance_completed_at)

        if is_task_completed:
            completed_at = instance_completed_at if task.is_recurring else task.completed_at
            if not TaskService.is_within_retention_window(completed_at, retention_days):
                continue
            if task.is_recurring and hide_recurring_after and instance_completed_at:
                continue

        # subtask_count derived from eagerly loaded subtasks (None = auto-detect)
        task_item = build_native_task_item(task, next_instances, instance_completed_at)

        # Route into the correct bucket
        if is_task_completed:
            all_completed.append(task_item)
        elif is_scheduled:
            all_scheduled.append(task_item)
        else:
            active_by_domain.setdefault(task.domain_id, []).append(task_item)

    # Sort each bucket
    for domain_tasks in active_by_domain.values():
        domain_tasks.sort(key=native_task_sort_key)
        for task_item in domain_tasks:
            task_item["subtasks"].sort(key=native_task_sort_key)
    all_scheduled.sort(key=scheduled_task_sort_key)
    all_completed.sort(key=completed_task_sort_key)

    # Build domain groups (active tasks only)
    domain_groups: list[DomainWithTasks] = []
    for domain_id, domain_tasks in active_by_domain.items():
        domain_groups.append(
            {
                "domain": domains_map.get(domain_id) if domain_id else None,
                "tasks": domain_tasks,
            }
        )
    # Sort: named domains alphabetically, Inbox (None) last
    domain_groups.sort(key=lambda d: (d["domain"] is None, d["domain"].name.lower() if d["domain"] else "zzz"))

    return {
        "domain_groups": domain_groups,
        "scheduled_tasks": all_scheduled,
        "completed_tasks": all_completed,
    }
