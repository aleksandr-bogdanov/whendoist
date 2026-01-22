import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.sessions import SessionMiddleware

from app.config import get_settings
from app.logging_config import setup_logging
from app.middleware.rate_limit import limiter
from app.middleware.security import SecurityHeadersMiddleware
from app.routers import (
    api,
    auth,
    backup,
    build_info,
    domains,
    import_data,
    instances,
    pages,
    passkeys,
    preferences,
    tasks,
    wizard,
)

# Setup logging first
setup_logging()
logger = logging.getLogger("whendoist")

settings = get_settings()


def _run_migrations() -> None:
    """Run database migrations synchronously (called from async context via executor)."""
    import subprocess

    result = subprocess.run(
        ["python", "scripts/migrate.py"],
        capture_output=True,
        text=True,
    )
    if result.stdout:
        for line in result.stdout.strip().split("\n"):
            logger.info(f"migrate: {line}")
    if result.stderr:
        for line in result.stderr.strip().split("\n"):
            logger.warning(f"migrate: {line}")
    if result.returncode != 0:
        logger.error(f"Migration failed with exit code {result.returncode}")
        raise RuntimeError("Database migration failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio

    logger.info("Starting Whendoist...")
    logger.info(f"Base URL: {settings.base_url}")
    try:
        # Run migrations on startup (Railway releaseCommand not working with Railpack)
        logger.info("Running database migrations...")
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _run_migrations)
        logger.info("Migrations complete")

        from sqlalchemy import text

        from app.database import async_session_factory
        from app.services.challenge_service import ChallengeService

        # Verify database connectivity
        async with async_session_factory() as db:
            await db.execute(text("SELECT 1"))
            logger.info("Database connected")

            # Clean up expired WebAuthn challenges on startup
            try:
                deleted = await ChallengeService.cleanup_expired(db)
                if deleted > 0:
                    logger.info(f"Cleaned up {deleted} expired WebAuthn challenges")
            except Exception as e:
                if "webauthn_challenges" in str(e).lower():
                    logger.warning("WebAuthn challenges table not found")
                else:
                    raise
    except Exception as e:
        logger.error(f"Startup failed: {e}")
        raise
    yield
    logger.info("Shutting down Whendoist...")


app = FastAPI(
    title="Whendoist",
    description="WHEN do I do my tasks?",
    version="0.13.0",
    lifespan=lifespan,
)

# Rate limiter setup
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]

# Determine if running in production (Railway sets RAILWAY_ENVIRONMENT)
is_production = settings.base_url.startswith("https://")

# Security headers middleware (outermost - applied last to response)
app.add_middleware(SecurityHeadersMiddleware)

# Session middleware for signed cookies
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.secret_key,
    session_cookie="whendoist_session",
    max_age=60 * 60 * 24 * 30,  # 30 days
    same_site="lax",
    https_only=is_production,
)


# Global exception handler for unexpected errors only
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Log unexpected exceptions cleanly and return 500."""
    # Don't catch HTTPException - let FastAPI handle those
    if isinstance(exc, HTTPException):
        raise exc
    logger.exception(f"Request failed: {request.method} {request.url.path}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


# Health check endpoints for Railway and load balancers
@app.get("/health", include_in_schema=False)
async def health_check():
    """Basic liveness check - app is running."""
    from app import __version__

    return JSONResponse({"status": "healthy", "version": __version__})


@app.get("/ready", include_in_schema=False)
async def readiness_check():
    """Readiness check - app can serve requests (includes DB check)."""
    from sqlalchemy import text

    from app import __version__
    from app.database import async_session_factory

    try:
        async with async_session_factory() as db:
            await db.execute(text("SELECT 1"))
        return JSONResponse({"status": "ready", "database": "connected", "version": __version__})
    except Exception as e:
        logger.error(f"Readiness check failed: {e}")
        return JSONResponse({"status": "not_ready", "database": str(e)}, status_code=503)


# Service worker route - served from root for proper scope
@app.get("/sw.js", include_in_schema=False)
async def service_worker():
    sw_path = Path("static/sw.js")
    if sw_path.exists():
        return FileResponse(
            sw_path,
            media_type="application/javascript",
            headers={"Service-Worker-Allowed": "/"},
        )
    return JSONResponse({"error": "Service worker not found"}, status_code=404)


# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Include routers
# Note: tasks.router must come before api.router to avoid route conflict
# (both define /api/tasks - native tasks should take priority)
app.include_router(auth.router)
app.include_router(tasks.router)
app.include_router(domains.router)
app.include_router(preferences.router)
app.include_router(passkeys.router)
app.include_router(backup.router)
app.include_router(api.router)
app.include_router(instances.router)
app.include_router(import_data.router)
app.include_router(build_info.router)
app.include_router(wizard.router)
app.include_router(pages.router)
