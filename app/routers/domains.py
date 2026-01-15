"""
Domain API endpoints.

Provides REST endpoints for managing task domains (formerly projects).
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User
from app.routers.auth import require_user
from app.services.task_service import TaskService

logger = logging.getLogger("whendoist.domains")

router = APIRouter(prefix="/api/domains", tags=["domains"])


# =============================================================================
# Request/Response Models
# =============================================================================


class DomainCreate(BaseModel):
    """Request body for creating a domain."""

    name: str
    color: str | None = None
    icon: str | None = None


class DomainUpdate(BaseModel):
    """Request body for updating a domain."""

    name: str | None = None
    color: str | None = None
    icon: str | None = None
    position: int | None = None


class DomainResponse(BaseModel):
    """Response model for a domain."""

    id: int
    name: str
    color: str | None
    icon: str | None
    position: int
    is_archived: bool

    class Config:
        from_attributes = True


# =============================================================================
# Endpoints
# =============================================================================


@router.get("", response_model=list[DomainResponse])
async def list_domains(
    include_archived: bool = False,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all domains for the current user."""
    service = TaskService(db, user.id)
    domains = await service.get_domains(include_archived=include_archived)
    return domains


@router.get("/{domain_id}", response_model=DomainResponse)
async def get_domain(
    domain_id: int,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single domain by ID."""
    service = TaskService(db, user.id)
    domain = await service.get_domain(domain_id)
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")
    return domain


@router.post("", response_model=DomainResponse, status_code=201)
async def create_domain(
    data: DomainCreate,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new domain."""
    service = TaskService(db, user.id)
    domain = await service.create_domain(
        name=data.name,
        color=data.color,
        icon=data.icon,
    )
    await db.commit()
    return domain


@router.put("/{domain_id}", response_model=DomainResponse)
async def update_domain(
    domain_id: int,
    data: DomainUpdate,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a domain."""
    service = TaskService(db, user.id)
    domain = await service.update_domain(
        domain_id=domain_id,
        name=data.name,
        color=data.color,
        icon=data.icon,
        position=data.position,
    )
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")
    await db.commit()
    return domain


@router.delete("/{domain_id}", status_code=204)
async def delete_domain(
    domain_id: int,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Archive a domain (soft delete)."""
    service = TaskService(db, user.id)
    domain = await service.archive_domain(domain_id)
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")
    await db.commit()


# =============================================================================
# Batch Update Endpoint (for encryption)
# =============================================================================


class DomainContentData(BaseModel):
    """Single domain's content for batch update."""

    id: int
    name: str


class BatchUpdateDomainsRequest(BaseModel):
    """Request body for batch updating domain names."""

    domains: list[DomainContentData]


@router.post("/batch-update", status_code=200)
async def batch_update_domains(
    data: BatchUpdateDomainsRequest,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Batch update domain names.

    Used when enabling encryption (to save encrypted names) or
    disabling encryption (to save decrypted names).

    Commits after each item to prevent connection timeouts.
    Returns count of domains updated.
    """
    service = TaskService(db, user.id)
    updated_count = 0
    errors = []

    for item in data.domains:
        try:
            domain = await service.get_domain(item.id)
            if not domain:
                continue

            await service.update_domain(domain_id=item.id, name=item.name)
            updated_count += 1
            await db.commit()
        except Exception as e:
            # Log but continue - don't fail entire batch for one item
            errors.append({"id": item.id, "error": str(e)})
            logger.warning(f"Failed to update domain {item.id}: {e}")

    result: dict[str, int | list[dict[str, str]]] = {
        "updated_count": updated_count,
        "total_requested": len(data.domains),
    }
    if errors:
        result["errors"] = errors
    return result
