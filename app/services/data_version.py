"""
Data version tracking for snapshot optimization.

Bumps a monotonic counter on the User model whenever user-initiated
data mutations occur. The snapshot background loop uses this counter
to skip unchanged users without performing a full data export.
"""

import logging

from sqlalchemy import text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User

logger = logging.getLogger("whendoist.data_version")


async def bump_data_version(db: AsyncSession, user_id: int) -> None:
    """
    Increment the user's data_version counter.

    Called after user-initiated mutations (task/domain/preference changes).
    NOT called for system-initiated changes (auto-materialization, GCal sync).

    On PostgreSQL, uses a savepoint with a short statement timeout (2s) to
    avoid blocking the main transaction on row-lock contention. If another
    transaction holds the lock, the savepoint rolls back and the main
    mutation succeeds without the version bump — the snapshot service just
    does one extra pass.

    On SQLite (tests), runs the UPDATE directly (no contention possible).
    """
    dialect = db.bind.dialect.name if db.bind else "unknown"

    if dialect == "postgresql":
        try:
            async with db.begin_nested():
                await db.execute(text("SET LOCAL statement_timeout = '2000'"))
                await db.execute(update(User).where(User.id == user_id).values(data_version=User.data_version + 1))
        except Exception:
            logger.warning("data_version bump skipped for user %d (lock contention)", user_id)
    else:
        # SQLite / other dialects — no contention risk, run directly
        await db.execute(update(User).where(User.id == user_id).values(data_version=User.data_version + 1))
