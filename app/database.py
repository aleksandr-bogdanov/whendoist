import logging
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

logger = logging.getLogger("whendoist.db")


class Base(DeclarativeBase):
    pass


# Create engine with connection pool health checks
# pool_pre_ping=True detects and recycles stale/closed connections
engine = create_async_engine(
    get_settings().database_url,
    echo=False,
    pool_pre_ping=True,  # Check connection health before use
    pool_size=5,  # Default pool size
    max_overflow=10,  # Allow up to 10 extra connections under load
    pool_recycle=300,  # Recycle connections after 5 minutes
)

async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession]:
    async with async_session_factory() as session:
        try:
            yield session
        except Exception as e:
            logger.error(f"Database session error: {e}")
            await session.rollback()
            raise


async def create_tables() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
