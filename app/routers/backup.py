"""
Backup and restore API endpoints.

Provides endpoints for exporting and importing user data,
plus automated snapshot management.

Rate limited to 5 requests/minute per user due to computational expense.
"""

import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import BACKUP_MAX_SIZE_BYTES
from app.database import get_db
from app.middleware.rate_limit import BACKUP_LIMIT, get_user_or_ip, limiter
from app.models import User
from app.routers.auth import require_user
from app.services.backup_service import BackupService, BackupValidationError
from app.services.preferences_service import PreferencesService
from app.services.snapshot_service import SnapshotService

logger = logging.getLogger("whendoist")
router = APIRouter(prefix="/backup", tags=["backup"])


class ImportResponse(BaseModel):
    """Response from import operation."""

    success: bool
    domains: int
    tasks: int
    preferences: int


class SnapshotInfo(BaseModel):
    """Single snapshot metadata."""

    id: int
    size_bytes: int
    is_manual: bool
    created_at: str


class SnapshotListResponse(BaseModel):
    """List of snapshots plus enabled state."""

    snapshots: list[SnapshotInfo]
    enabled: bool


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

        # Check file size before parsing to prevent memory exhaustion
        if len(content) > BACKUP_MAX_SIZE_BYTES:
            raise HTTPException(
                status_code=413,
                detail="Backup file too large (max 10 MB)",
            )

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
        raise HTTPException(status_code=400, detail="Invalid JSON file") from e
    except BackupValidationError as e:
        logger.warning(f"Backup import failed - validation error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.error(f"Backup import failed: {e}", exc_info=True)
        await db.rollback()
        raise HTTPException(status_code=500, detail="Import failed") from e


# =============================================================================
# Snapshot Endpoints
# =============================================================================


@router.get("/snapshots", response_model=SnapshotListResponse)
@limiter.limit(BACKUP_LIMIT, key_func=get_user_or_ip)
async def list_snapshots(
    request: Request,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """List all snapshots with enabled state."""
    prefs_service = PreferencesService(db, user.id)
    prefs = await prefs_service.get_preferences()

    service = SnapshotService(db, user.id)
    rows = await service.list_snapshots()

    return SnapshotListResponse(
        snapshots=[
            SnapshotInfo(
                id=row.id,
                size_bytes=row.size_bytes,
                is_manual=row.is_manual,
                created_at=row.created_at.isoformat(),
            )
            for row in rows
        ],
        enabled=prefs.snapshots_enabled,
    )


@router.put("/snapshots/enabled")
@limiter.limit(BACKUP_LIMIT, key_func=get_user_or_ip)
async def toggle_snapshots(
    request: Request,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Toggle automatic snapshots on/off."""
    prefs_service = PreferencesService(db, user.id)
    prefs = await prefs_service.get_preferences()
    prefs.snapshots_enabled = not prefs.snapshots_enabled
    await db.commit()

    return {"enabled": prefs.snapshots_enabled}


@router.post("/snapshots")
@limiter.limit(BACKUP_LIMIT, key_func=get_user_or_ip)
async def create_manual_snapshot(
    request: Request,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a manual snapshot."""
    service = SnapshotService(db, user.id)
    snapshot = await service.create_snapshot(is_manual=True)
    await db.commit()

    if not snapshot:
        raise HTTPException(status_code=500, detail="Failed to create snapshot")

    return {
        "id": snapshot.id,
        "size_bytes": snapshot.size_bytes,
        "is_manual": snapshot.is_manual,
        "created_at": snapshot.created_at.isoformat() if snapshot.created_at else None,
    }


@router.get("/snapshots/{snapshot_id}/download")
@limiter.limit(BACKUP_LIMIT, key_func=get_user_or_ip)
async def download_snapshot(
    snapshot_id: int,
    request: Request,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Download a snapshot as a JSON file."""
    service = SnapshotService(db, user.id)
    data = await service.get_snapshot_data(snapshot_id)

    if data is None:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"whendoist_snapshot_{timestamp}.json"

    return Response(
        content=json.dumps(data, indent=2, ensure_ascii=False),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/snapshots/{snapshot_id}/restore")
@limiter.limit(BACKUP_LIMIT, key_func=get_user_or_ip)
async def restore_snapshot(
    snapshot_id: int,
    request: Request,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Restore user data from a snapshot."""
    snapshot_service = SnapshotService(db, user.id)
    data = await snapshot_service.get_snapshot_data(snapshot_id)

    if data is None:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    try:
        backup_service = BackupService(db, user.id)
        counts = await backup_service.import_all(data, clear_existing=True)
        await db.commit()

        return {
            "success": True,
            "domains": counts["domains"],
            "tasks": counts["tasks"],
            "preferences": counts["preferences"],
        }
    except BackupValidationError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.error(f"Snapshot restore failed: {e}", exc_info=True)
        await db.rollback()
        raise HTTPException(status_code=500, detail="Restore failed") from e


@router.delete("/snapshots/{snapshot_id}")
@limiter.limit(BACKUP_LIMIT, key_func=get_user_or_ip)
async def delete_snapshot(
    snapshot_id: int,
    request: Request,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a single snapshot."""
    service = SnapshotService(db, user.id)
    deleted = await service.delete_snapshot(snapshot_id)
    await db.commit()

    if not deleted:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    return {"success": True}
