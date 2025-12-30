import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from app.config import get_settings
from app.database import create_tables
from app.logging_config import setup_logging
from app.routers import api, auth, pages

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
    version="0.1.0",
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


# Health check endpoint for Railway
@app.get("/health", include_in_schema=False)
async def health_check():
    return JSONResponse({"status": "healthy"})


# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Include routers
app.include_router(auth.router)
app.include_router(api.router)
app.include_router(pages.router)
