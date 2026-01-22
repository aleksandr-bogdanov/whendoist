"""
Test fixtures for Whendoist.

Test Categories:
- @pytest.mark.unit: SQLite-based unit tests (fast, isolated)
- @pytest.mark.integration: PostgreSQL container tests (production parity)
- @pytest.mark.e2e: Playwright browser tests (requires running server)
"""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import Base


@pytest.fixture
async def db_session():
    """Create an in-memory SQLite database for fast unit testing."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)

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
    sync_url = postgres_container.get_connection_url()
    async_url = sync_url.replace("postgresql://", "postgresql+asyncpg://")

    engine = create_async_engine(
        async_url,
        echo=False,
        pool_pre_ping=True,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        yield session

    # Clean up tables after each test
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()
