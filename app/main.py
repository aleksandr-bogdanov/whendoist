import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.sessions import SessionMiddleware

from app import __version__
from app.config import get_settings
from app.logging_config import setup_logging
from app.metrics import PrometheusMiddleware, get_metrics
from app.middleware.csrf import CSRFMiddleware
from app.middleware.rate_limit import limiter
from app.middleware.request_id import RequestIDMiddleware
from app.middleware.security import SecurityHeadersMiddleware
from app.routers import api, auth, pages
from app.routers import v1 as api_v1
from app.sentry_integration import init_sentry

# Setup logging first
setup_logging()
logger = logging.getLogger("whendoist")

# Initialize Sentry (optional - only if SENTRY_DSN is set)
init_sentry()

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
        from app.tasks.recurring import (
            materialize_all_instances,
            start_materialization_background,
            stop_materialization_background,
        )

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

        # Run initial instance materialization
        logger.info("Running initial instance materialization...")
        try:
            stats = await materialize_all_instances()
            logger.info(f"Initial materialization: {stats['users_processed']} users processed")
        except Exception as e:
            logger.warning(f"Initial materialization failed (non-fatal): {e}")

        # Start background materialization loop
        start_materialization_background()

    except Exception as e:
        logger.error(f"Startup failed: {e}")
        raise

    yield

    # Shutdown
    logger.info("Shutting down Whendoist...")
    try:
        from app.tasks.recurring import stop_materialization_background

        stop_materialization_background()
    except Exception as e:
        logger.warning(f"Error stopping background tasks: {e}")


# Determine if running in development (for conditional docs exposure)
_is_dev = settings.base_url.startswith("http://localhost") or settings.base_url.startswith("http://127.0.0.1")

app = FastAPI(
    title="Whendoist",
    description="WHEN do I do my tasks?",
    version=__version__,
    lifespan=lifespan,
    # Expose OpenAPI docs only in development
    docs_url="/docs" if _is_dev else None,
    redoc_url="/redoc" if _is_dev else None,
)

# Rate limiter setup
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]

# Determine if running in production (Railway sets RAILWAY_ENVIRONMENT)
is_production = settings.base_url.startswith("https://")

# Security headers middleware (outermost - applied last to response)
app.add_middleware(SecurityHeadersMiddleware)

# Request ID middleware (adds X-Request-ID header and logging context)
app.add_middleware(RequestIDMiddleware)

# Prometheus metrics middleware (tracks request count/latency)
app.add_middleware(PrometheusMiddleware)

# Session middleware for signed cookies
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.secret_key,
    session_cookie="whendoist_session",
    max_age=60 * 60 * 24 * 30,  # 30 days
    same_site="lax",
    https_only=is_production,
)

# CSRF protection middleware (must be after SessionMiddleware)
app.add_middleware(CSRFMiddleware)


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


@app.get("/metrics", include_in_schema=False)
async def metrics():
    """Prometheus metrics endpoint."""
    from starlette.responses import Response

    from app.database import engine
    from app.metrics import update_db_pool_metrics

    # Update pool metrics before returning
    update_db_pool_metrics(engine.pool)

    return Response(content=get_metrics(), media_type="text/plain; charset=utf-8")


@app.get("/ready", include_in_schema=False)
async def readiness_check():
    """Readiness check - app can serve requests (includes DB and external service checks)."""
    from sqlalchemy import text

    from app import __version__
    from app.database import async_session_factory

    checks: dict[str, str] = {}
    is_ready = True

    # Check database connectivity (required)
    try:
        async with async_session_factory() as db:
            await db.execute(text("SELECT 1"))
        checks["database"] = "connected"
    except Exception as e:
        logger.error(f"Database check failed: {e}")
        checks["database"] = f"error: {e}"
        is_ready = False

    # Check Google Calendar API (optional - only if user has connected)
    # This is informational only; degraded mode is acceptable
    try:
        async with async_session_factory() as db:
            # Just check if any valid tokens exist (don't actually call Google API)
            result = await db.execute(text("SELECT COUNT(*) FROM google_tokens WHERE access_token IS NOT NULL"))
            token_count = result.scalar() or 0
            if token_count > 0:
                checks["google_calendar"] = f"configured ({token_count} users)"
            else:
                checks["google_calendar"] = "no users connected"
    except Exception as e:
        # Table might not exist yet, or other issue - non-fatal
        checks["google_calendar"] = "unavailable"
        logger.debug(f"Google Calendar check skipped: {e}")

    status = "ready" if is_ready else "degraded"
    status_code = 200 if is_ready else 503

    return JSONResponse(
        {"status": status, "checks": checks, "version": __version__},
        status_code=status_code,
    )


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
# Auth router (no /api prefix - uses /auth)
app.include_router(auth.router)

# Todoist/Calendar API (has its own /api prefix internally)
app.include_router(api.router)

# API v1 routes at /api/v1/*
app.include_router(api_v1.router)

# Page routes (HTML pages, must be last)
app.include_router(pages.router)
