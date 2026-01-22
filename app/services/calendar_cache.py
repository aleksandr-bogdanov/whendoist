"""
Calendar event caching with TTL.

In-memory cache for Google Calendar events to reduce API calls.
Cache is per-user and keyed by date range and calendar selection.

Performance optimization (v0.14.0):
- 5-minute TTL for calendar events
- Cache invalidation when calendar selection changes
- Periodic cleanup of expired entries
"""

import hashlib
import logging
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Any

logger = logging.getLogger("whendoist.calendar_cache")

# Cache TTL: 5 minutes
CACHE_TTL = timedelta(minutes=5)


def _now_utc() -> datetime:
    """Get current UTC time (timezone-aware)."""
    return datetime.now(UTC)


@dataclass
class CacheEntry:
    """Cached calendar events with timestamp."""

    events: list[Any]
    cached_at: datetime = field(default_factory=_now_utc)

    def is_expired(self) -> bool:
        """Check if this cache entry has expired."""
        return _now_utc() - self.cached_at > CACHE_TTL


class CalendarCache:
    """
    In-memory cache for Google Calendar events.

    Cache key format: user_id:hash(calendar_ids):start_date:end_date

    Thread-safe for read-only operations. Write operations should be
    atomic for single-process deployments. For multi-process deployments,
    consider using Redis instead.
    """

    def __init__(self) -> None:
        self._cache: dict[str, CacheEntry] = {}

    def _make_key(
        self,
        user_id: int,
        calendar_ids: list[str],
        start_date: date,
        end_date: date,
    ) -> str:
        """Generate cache key from parameters."""
        # Sort calendar IDs for consistent hashing
        cal_hash = hashlib.md5(",".join(sorted(calendar_ids)).encode()).hexdigest()[:8]
        return f"{user_id}:{cal_hash}:{start_date}:{end_date}"

    def get(
        self,
        user_id: int,
        calendar_ids: list[str],
        start_date: date,
        end_date: date,
    ) -> list[Any] | None:
        """
        Get cached events if present and not expired.

        Args:
            user_id: User ID
            calendar_ids: List of calendar IDs being fetched
            start_date: Start of date range
            end_date: End of date range

        Returns:
            Cached events list, or None if cache miss or expired.
        """
        if not calendar_ids:
            return None

        key = self._make_key(user_id, calendar_ids, start_date, end_date)
        entry = self._cache.get(key)

        if entry is None:
            logger.debug(f"Calendar cache miss: user={user_id}")
            return None

        if entry.is_expired():
            logger.debug(f"Calendar cache expired: user={user_id}")
            del self._cache[key]
            return None

        logger.debug(f"Calendar cache hit: user={user_id}, events={len(entry.events)}")
        return entry.events

    def set(
        self,
        user_id: int,
        calendar_ids: list[str],
        start_date: date,
        end_date: date,
        events: list[Any],
    ) -> None:
        """
        Store events in cache.

        Args:
            user_id: User ID
            calendar_ids: List of calendar IDs
            start_date: Start of date range
            end_date: End of date range
            events: List of calendar events to cache
        """
        if not calendar_ids:
            return

        key = self._make_key(user_id, calendar_ids, start_date, end_date)
        self._cache[key] = CacheEntry(events=events, cached_at=_now_utc())
        logger.debug(f"Calendar cache set: user={user_id}, events={len(events)}")

    def invalidate_user(self, user_id: int) -> int:
        """
        Invalidate all cache entries for a user.

        Call when user changes calendar selection.

        Args:
            user_id: User ID to invalidate

        Returns:
            Number of entries removed.
        """
        keys_to_delete = [k for k in self._cache if k.startswith(f"{user_id}:")]
        for k in keys_to_delete:
            del self._cache[k]

        if keys_to_delete:
            logger.debug(f"Invalidated {len(keys_to_delete)} cache entries for user {user_id}")

        return len(keys_to_delete)

    def cleanup_expired(self) -> int:
        """
        Remove all expired entries.

        Call periodically to prevent memory growth.

        Returns:
            Number of entries removed.
        """
        expired = [k for k, v in self._cache.items() if v.is_expired()]
        for k in expired:
            del self._cache[k]

        if expired:
            logger.debug(f"Cleaned up {len(expired)} expired calendar cache entries")

        return len(expired)

    def stats(self) -> dict[str, int]:
        """Return cache statistics for monitoring."""
        total = len(self._cache)
        expired = sum(1 for v in self._cache.values() if v.is_expired())
        return {
            "total_entries": total,
            "expired_entries": expired,
            "active_entries": total - expired,
        }

    def clear(self) -> None:
        """Clear all cache entries. Useful for testing."""
        self._cache.clear()


# Global cache instance (singleton)
_calendar_cache: CalendarCache | None = None


def get_calendar_cache() -> CalendarCache:
    """Get the global calendar cache instance."""
    global _calendar_cache
    if _calendar_cache is None:
        _calendar_cache = CalendarCache()
    return _calendar_cache
