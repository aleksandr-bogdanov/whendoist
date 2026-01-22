"""
Backup and restore API endpoints.

Provides endpoints for exporting and importing user data.

Rate limited to 5 requests/minute per user due to computational expense.
"""

import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.rate_limit import BACKUP_LIMIT, get_user_or_ip, limiter
from app.models import User
from app.routers.auth import require_user
from app.services.backup_service import BackupService

logger = logging.getLogger("whendoist")
router = APIRouter(prefix="/backup", tags=["backup"])


class ImportResponse(BaseModel):
    """Response from import operation."""

    success: bool
    domains: int
    tasks: int
    preferences: int


@router.get("/export")
@limiter.limit(BACKUP_LIMIT, key_func=get_user_or_ip)
async def export_backup(
    request: Request,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Export all user data as a JSON file.

    Returns a downloadable JSON file with all tasks, domains, and preferences.
    """
    service = BackupService(db, user.id)
    data = await service.export_all()

    # Create filename with timestamp
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"whendoist_backup_{timestamp}.json"

    # Return as downloadable JSON file
    return Response(
        content=json.dumps(data, indent=2, ensure_ascii=False),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/import", response_model=ImportResponse)
@limiter.limit(BACKUP_LIMIT, key_func=get_user_or_ip)
async def import_backup(
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Import user data from a backup JSON file.

    WARNING: This will replace all existing data!
    """
    try:
        # Read and parse the uploaded file
        content = await file.read()
        data = json.loads(content.decode("utf-8"))

        service = BackupService(db, user.id)
        counts = await service.import_all(data, clear_existing=True)

        return ImportResponse(
            success=True,
            domains=counts["domains"],
            tasks=counts["tasks"],
            preferences=counts["preferences"],
        )
    except json.JSONDecodeError as e:
        logger.error(f"Backup import failed - invalid JSON: {e}")
        raise HTTPException(status_code=400, detail=f"Invalid JSON file: {e}") from e
    except Exception as e:
        logger.error(f"Backup import failed: {e}", exc_info=True)
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}") from e
