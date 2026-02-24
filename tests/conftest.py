"""
Test fixtures for Whendoist.

Test Categories:
- @pytest.mark.unit: SQLite-based unit tests (fast, isolated)
- @pytest.mark.integration: PostgreSQL container tests (production parity)
"""

import pytest
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import Base


@pytest.fixture
async def db_session():
    """Create an in-memory SQLite database for fast unit testing."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)

    # Enable FK enforcement so ON DELETE CASCADE works in SQLite
    @event.listens_for(engine.sync_engine, "connect")
    def _set_sqlite_pragma(dbapi_conn, _connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        yield session

    await engine.dispose()


@pytest.fixture(scope="session")
def postgres_container():
    """
    Start PostgreSQL container for integration tests.

    Scope is session-level to reuse container across all integration tests.
    Requires Docker to be running.
    """
    try:
        from testcontainers.postgres import PostgresContainer
    except ImportError:
        pytest.skip("testcontainers[postgres] not installed")
        return

    try:
        with PostgresContainer("postgres:16-alpine") as postgres:
            yield postgres
    except Exception as e:
        # Docker not running or container failed to start
        pytest.skip(f"PostgreSQL container unavailable: {e}")


@pytest.fixture
async def pg_session(postgres_container):
    """
    Create async session with real PostgreSQL for integration testing.

    Use this fixture for tests that need PostgreSQL-specific features
    or to verify production database compatibility.
    """
    # Convert sync URL to async
    # testcontainers returns postgresql+psycopg2:// or postgresql://
    sync_url = postgres_container.get_connection_url()
    async_url = sync_url.replace("postgresql+psycopg2://", "postgresql+asyncpg://").replace(
        "postgresql://", "postgresql+asyncpg://"
    )

    engine = create_async_engine(
        async_url,
        echo=False,
        pool_pre_ping=True,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # expire_on_commit=False is required for async SQLAlchemy to avoid
    # lazy loading errors (MissingGreenlet). Use explicit refresh when needed.
    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        yield session

    # Clean up tables after each test
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()
