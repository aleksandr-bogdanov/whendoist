"""
API v1 Router.

Aggregates all API routers under /api/v1 prefix.

v0.15.0: Architecture Cleanup
v0.16.0: Removed legacy /api/* routes (pre-1.0, no backwards compatibility needed)
"""

from fastapi import APIRouter

from app.routers import (
    backup,
    build_info,
    domains,
    import_data,
    instances,
    passkeys,
    preferences,
    tasks,
    wizard,
)

router = APIRouter(prefix="/api/v1")

# Include all API routers
router.include_router(tasks.router)
router.include_router(domains.router)
router.include_router(preferences.router)
router.include_router(passkeys.router)
router.include_router(instances.router)
router.include_router(backup.router)
router.include_router(import_data.router)
router.include_router(build_info.router)
router.include_router(wizard.router)
