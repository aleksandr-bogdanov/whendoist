import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from app.config import get_settings
from app.database import create_tables
from app.logging_config import setup_logging
from app.routers import api, auth, backup, build_info, domains, import_data, instances, pages, preferences, tasks

# Setup logging first
setup_logging()
logger = logging.getLogger("whendoist")

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Whendoist...")
    logger.info(f"Base URL: {settings.base_url}")
    try:
        await create_tables()
        logger.info("Database tables ready")
    except Exception as e:
        logger.error(f"Database connection failed: {e}")
        raise
    yield
    logger.info("Shutting down Whendoist...")


app = FastAPI(
    title="Whendoist",
    description="WHEN do I do my tasks?",
    version="0.8.2",
    lifespan=lifespan,
)

# Determine if running in production (Railway sets RAILWAY_ENVIRONMENT)
is_production = settings.base_url.startswith("https://")

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


# Health check endpoint for Railway
@app.get("/health", include_in_schema=False)
async def health_check():
    return JSONResponse({"status": "healthy"})


# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Include routers
# Note: tasks.router must come before api.router to avoid route conflict
# (both define /api/tasks - native tasks should take priority)
app.include_router(auth.router)
app.include_router(tasks.router)
app.include_router(domains.router)
app.include_router(preferences.router)
app.include_router(backup.router)
app.include_router(api.router)
app.include_router(instances.router)
app.include_router(import_data.router)
app.include_router(build_info.router)
app.include_router(pages.router)
