"""
Data version tracking for snapshot optimization.

Bumps a monotonic counter on the User model whenever user-initiated
data mutations occur. The snapshot background loop uses this counter
to skip unchanged users without performing a full data export.
"""

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User


async def bump_data_version(db: AsyncSession, user_id: int) -> None:
    """
    Increment the user's data_version counter.

    Called after user-initiated mutations (task/domain/preference changes).
    NOT called for system-initiated changes (auto-materialization, GCal sync).

    Uses atomic SQL increment to avoid read-modify-write races.
    Rides the caller's transaction — no extra commit needed.
    """
    await db.execute(update(User).where(User.id == user_id).values(data_version=User.data_version + 1))
