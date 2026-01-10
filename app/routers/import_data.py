"""
Data import API endpoints.

Provides endpoints for importing data from external sources (Todoist)
and wiping user data for testing.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import TodoistToken, User
from app.routers.auth import get_current_user
from app.services.todoist_import import TodoistImportService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/import", tags=["import"])


class WipeResponse(BaseModel):
    """Response from wipe operation."""

    success: bool
    instances_deleted: int
    tasks_deleted: int
    domains_deleted: int


class ImportResponse(BaseModel):
    """Response from import operation."""

    success: bool
    domains_created: int
    domains_skipped: int  # Already existed (duplicate)
    tasks_created: int
    tasks_skipped: int  # Already existed (duplicate)
    tasks_completed: int  # Completed tasks imported
    parents_flattened: int  # Parent tasks merged into subtasks
    tasks_need_clarity: int  # Tasks without clarity label
    errors: list[str]


@router.post("/wipe", response_model=WipeResponse)
async def wipe_user_data(
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_current_user),
):
    """
    Delete all tasks and domains for the current user.

    This is a destructive operation for testing purposes.
    """
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Get Todoist token (needed to instantiate service, even for wipe)
    todoist_token = (await db.execute(select(TodoistToken).where(TodoistToken.user_id == user.id))).scalar_one_or_none()

    if not todoist_token:
        raise HTTPException(
            status_code=400,
            detail="Todoist not connected. Connect Todoist first to use import features.",
        )

    service = TodoistImportService(db, user.id, todoist_token.access_token)
    result = await service.wipe_user_data()

    logger.info(f"User {user.id} wiped data: {result}")

    return WipeResponse(
        success=True,
        instances_deleted=result["instances_deleted"],
        tasks_deleted=result["tasks_deleted"],
        domains_deleted=result["domains_deleted"],
    )


@router.post("/todoist", response_model=ImportResponse)
async def import_from_todoist(
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

    # Get Todoist token
    todoist_token = (await db.execute(select(TodoistToken).where(TodoistToken.user_id == user.id))).scalar_one_or_none()

    if not todoist_token:
        raise HTTPException(
            status_code=400,
            detail="Todoist not connected. Connect your Todoist account first.",
        )

    service = TodoistImportService(db, user.id, todoist_token.access_token)
    result = await service.import_all(skip_existing=True)

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
        parents_flattened=result.parents_flattened,
        tasks_need_clarity=result.tasks_need_clarity,
        errors=result.errors,
    )
