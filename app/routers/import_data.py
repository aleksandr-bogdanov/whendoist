"""
Data import API endpoints.

Provides endpoints for importing data from external sources (Todoist)
and wiping user data for testing.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.rate_limit import BACKUP_LIMIT, get_user_or_ip, limiter
from app.models import (
    Domain,
    GoogleCalendarEventSync,
    GoogleToken,
    Task,
    TaskInstance,
    TodoistToken,
    User,
    UserPreferences,
)
from app.routers.auth import get_current_user
from app.services.gcal import GoogleCalendarClient
from app.services.todoist import TodoistClient
from app.services.todoist_import import TodoistImportService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/import", tags=["import"])


class WipeResponse(BaseModel):
    """Response from wipe operation."""

    success: bool
    instances_deleted: int
    tasks_deleted: int
    domains_deleted: int


class ImportPreviewResponse(BaseModel):
    """Preview of what will be imported from Todoist."""

    projects_count: int
    tasks_count: int
    subtasks_count: int
    completed_count: int
    projects: list[dict]  # {name, task_count, color}


class ImportOptions(BaseModel):
    """Options for Todoist import."""

    include_completed: bool = True
    completed_limit: int = 200
    skip_existing: bool = True


class ImportResponse(BaseModel):
    """Response from import operation."""

    success: bool
    domains_created: int
    domains_skipped: int  # Already existed (duplicate)
    tasks_created: int
    tasks_skipped: int  # Already existed (duplicate)
    tasks_completed: int  # Completed tasks imported
    parent_tasks_imported: int  # Parent tasks imported with children
    tasks_need_clarity: int  # Tasks without clarity label
    errors: list[str]


@router.post("/wipe", response_model=WipeResponse)
@limiter.limit(BACKUP_LIMIT, key_func=get_user_or_ip)
async def wipe_user_data(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_current_user),
):
    """
    Delete all tasks and domains for the current user.

    This is a destructive operation for testing purposes.
    No external service connection required.
    """
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Clean up GCal sync if enabled — delete calendar and sync records
    # before wiping tasks (otherwise sync records cascade-delete but
    # Google Calendar events orphan)
    prefs_result = await db.execute(select(UserPreferences).where(UserPreferences.user_id == user.id))
    prefs = prefs_result.scalar_one_or_none()
    if prefs and prefs.gcal_sync_enabled and prefs.gcal_sync_calendar_id:
        calendar_id = prefs.gcal_sync_calendar_id
        try:
            token_result = await db.execute(select(GoogleToken).where(GoogleToken.user_id == user.id))
            google_token = token_result.scalar_one_or_none()
            if google_token:
                async with GoogleCalendarClient(db, google_token) as client:
                    await client.delete_calendar(calendar_id)
        except Exception:
            logger.warning(
                f"Failed to delete GCal calendar during wipe for user {user.id}, events may remain in Google Calendar"
            )

        # Clean up sync state regardless of API success
        await db.execute(delete(GoogleCalendarEventSync).where(GoogleCalendarEventSync.user_id == user.id))
        prefs.gcal_sync_enabled = False
        prefs.gcal_sync_calendar_id = None
        prefs.gcal_sync_error = None

    # Get task IDs for this user to delete instances
    task_ids_result = await db.execute(select(Task.id).where(Task.user_id == user.id))
    task_ids = [row[0] for row in task_ids_result.fetchall()]

    # Delete task instances (must be deleted before tasks due to FK constraint)
    instances_deleted = 0
    if task_ids:
        instance_result = await db.execute(delete(TaskInstance).where(TaskInstance.task_id.in_(task_ids)))
        instances_deleted: int = instance_result.rowcount  # type: ignore[assignment]

    # Delete all tasks for this user
    task_result = await db.execute(delete(Task).where(Task.user_id == user.id))
    tasks_deleted: int = task_result.rowcount  # type: ignore[assignment]

    # Delete all domains for this user
    domain_result = await db.execute(delete(Domain).where(Domain.user_id == user.id))
    domains_deleted: int = domain_result.rowcount  # type: ignore[assignment]

    await db.commit()

    logger.info(
        f"User {user.id} wiped data: instances={instances_deleted}, tasks={tasks_deleted}, domains={domains_deleted}"
    )

    return WipeResponse(
        success=True,
        instances_deleted=instances_deleted,
        tasks_deleted=tasks_deleted,
        domains_deleted=domains_deleted,
    )


@router.get("/todoist/preview", response_model=ImportPreviewResponse)
@limiter.limit(BACKUP_LIMIT, key_func=get_user_or_ip)
async def preview_todoist_import(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_current_user),
):
    """
    Preview what will be imported from Todoist.

    Returns counts and project list without actually importing anything.
    """
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Get Todoist token
    todoist_token = (await db.execute(select(TodoistToken).where(TodoistToken.user_id == user.id))).scalar_one_or_none()

    if not todoist_token:
        raise HTTPException(
            status_code=400,
            detail="Todoist not connected. Connect your Todoist account first.",
        )

    try:
        async with TodoistClient(todoist_token.access_token) as client:
            # Fetch projects and tasks
            projects = await client.get_projects()
            tasks = await client.get_all_tasks()
            completed = await client.get_completed_tasks(limit=200)

            # Count subtasks
            subtasks_count = sum(1 for t in tasks if t.parent_id is not None)
            top_level_count = len(tasks) - subtasks_count

            # Group tasks by project
            project_task_counts: dict[str, int] = {}
            for task in tasks:
                project_task_counts[task.project_id] = project_task_counts.get(task.project_id, 0) + 1

            # Build project list (exclude Inbox)
            project_list = []
            for p in projects:
                if p.name.lower() != "inbox":
                    project_list.append(
                        {
                            "name": p.name,
                            "task_count": project_task_counts.get(p.id, 0),
                            "color": p.color,
                        }
                    )

            return ImportPreviewResponse(
                projects_count=len([p for p in projects if p.name.lower() != "inbox"]),
                tasks_count=top_level_count,
                subtasks_count=subtasks_count,
                completed_count=len(completed),
                projects=sorted(project_list, key=lambda x: -x["task_count"]),
            )
    except Exception as e:
        logger.exception(f"Todoist preview failed: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail="Todoist preview failed") from e


@router.post("/todoist", response_model=ImportResponse)
@limiter.limit(BACKUP_LIMIT, key_func=get_user_or_ip)
async def import_from_todoist(
    request: Request,
    options: ImportOptions | None = None,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_current_user),
):
    """
    Import all projects and tasks from connected Todoist account.

    Creates domains from Todoist projects and tasks with their attributes.
    Skips items that have already been imported (tracked by external_id).
    """
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Use defaults if no options provided
    if options is None:
        options = ImportOptions()

    # Get Todoist token
    todoist_token = (await db.execute(select(TodoistToken).where(TodoistToken.user_id == user.id))).scalar_one_or_none()

    if not todoist_token:
        raise HTTPException(
            status_code=400,
            detail="Todoist not connected. Connect your Todoist account first.",
        )

    service = TodoistImportService(db, user.id, todoist_token.access_token)
    result = await service.import_all(
        skip_existing=options.skip_existing,
        include_completed=options.include_completed,
        completed_limit=options.completed_limit,
    )

    logger.info(
        f"User {user.id} imported from Todoist: {result.domains_created} domains, "
        f"{result.tasks_created} tasks, {result.tasks_completed} completed"
    )

    return ImportResponse(
        success=len(result.errors) == 0,
        domains_created=result.domains_created,
        domains_skipped=result.domains_skipped,
        tasks_created=result.tasks_created,
        tasks_skipped=result.tasks_skipped,
        tasks_completed=result.tasks_completed,
        parent_tasks_imported=result.parent_tasks_imported,
        tasks_need_clarity=result.tasks_need_clarity,
        errors=result.errors,
    )
