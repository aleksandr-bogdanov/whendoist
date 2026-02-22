"""
Domain API endpoints.

Provides REST endpoints for managing task domains (formerly projects).
"""

import logging
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import DOMAIN_NAME_MAX_LENGTH
from app.database import get_db
from app.models import Domain, User
from app.routers.auth import require_user
from app.services.data_version import bump_data_version
from app.services.task_service import TaskService

# Regex to match control characters except \n (newline) and \t (tab)
CONTROL_CHAR_PATTERN = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

logger = logging.getLogger("whendoist.domains")

router = APIRouter(prefix="/domains", tags=["domains"])


# =============================================================================
# Request/Response Models
# =============================================================================


def _strip_control_chars(value: str) -> str:
    """Strip control characters except newline and tab."""
    return CONTROL_CHAR_PATTERN.sub("", value)


class DomainCreate(BaseModel):
    """Request body for creating a domain."""

    name: str
    color: str | None = None
    icon: str | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = _strip_control_chars(v).strip()
        if not v:
            raise ValueError("Name cannot be empty")
        if len(v) > DOMAIN_NAME_MAX_LENGTH:
            raise ValueError(f"Name cannot exceed {DOMAIN_NAME_MAX_LENGTH} characters")
        return v


class DomainUpdate(BaseModel):
    """Request body for updating a domain."""

    name: str | None = None
    color: str | None = None
    icon: str | None = None
    position: int | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = _strip_control_chars(v).strip()
        if not v:
            raise ValueError("Name cannot be empty")
        if len(v) > DOMAIN_NAME_MAX_LENGTH:
            raise ValueError(f"Name cannot exceed {DOMAIN_NAME_MAX_LENGTH} characters")
        return v


class DomainResponse(BaseModel):
    """Response model for a domain."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    color: str | None
    icon: str | None
    position: int
    is_archived: bool


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

    domains: list[DomainContentData] = Field(max_length=500)


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
    updated_count = 0
    errors = []

    # Pre-fetch all requested domains in a single query (M2: avoid N+1)
    domain_ids = [item.id for item in data.domains]
    db_result = await db.execute(select(Domain).where(Domain.id.in_(domain_ids), Domain.user_id == user.id))
    domains_by_id = {d.id: d for d in db_result.scalars().all()}

    updates_by_id = {item.id: item for item in data.domains}

    for domain_id in domain_ids:
        try:
            domain = domains_by_id.get(domain_id)
            if not domain:
                continue

            domain.name = updates_by_id[domain_id].name
            updated_count += 1
            await db.commit()
        except Exception as e:
            await db.rollback()
            errors.append({"id": domain_id, "error": "Update failed"})
            logger.warning(f"Failed to update domain {domain_id}: {e}")

    if updated_count > 0:
        await bump_data_version(db, user.id)
        await db.commit()

    result: dict[str, int | list[dict[str, str]]] = {
        "updated_count": updated_count,
        "total_requested": len(data.domains),
    }
    if errors:
        result["errors"] = errors
    return result
