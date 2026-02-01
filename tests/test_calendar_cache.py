"""
Calendar cache tests.

Tests for the TTL-based calendar event caching system.

Performance optimization (v0.14.0)
"""

from datetime import date, timedelta

from app.services.calendar_cache import CACHE_TTL, CacheEntry, CalendarCache, _now_utc


class TestCacheEntry:
    """Tests for CacheEntry dataclass."""

    def test_cache_entry_not_expired_initially(self):
        """Fresh cache entry should not be expired."""
        entry = CacheEntry(events=[{"id": "1"}])
        assert not entry.is_expired()

    def test_cache_entry_expired_after_ttl(self):
        """Cache entry should be expired after TTL."""
        entry = CacheEntry(
            events=[{"id": "1"}],
            cached_at=_now_utc() - CACHE_TTL - timedelta(seconds=1),
        )
        assert entry.is_expired()

    def test_cache_entry_not_expired_just_before_ttl(self):
        """Cache entry should not be expired just before TTL."""
        entry = CacheEntry(
            events=[{"id": "1"}],
            cached_at=_now_utc() - CACHE_TTL + timedelta(seconds=10),
        )
        assert not entry.is_expired()


class TestCalendarCache:
    """Tests for CalendarCache class."""

    def test_cache_returns_cached_events(self):
        """Second call should return cached events without fetching."""
        cache = CalendarCache()
        events = [{"id": "1", "summary": "Test Event"}]
        today = date.today()

        # Set cache
        cache.set(1, ["cal1"], today, today, events)

        # Get should return same events
        result = cache.get(1, ["cal1"], today, today)
        assert result == events

    def test_cache_miss_returns_none(self):
        """Cache miss should return None."""
        cache = CalendarCache()
        today = date.today()

        result = cache.get(1, ["cal1"], today, today)
        assert result is None

    def test_expired_entry_returns_none(self):
        """Expired cache entry should return None."""
        cache = CalendarCache()
        events = [{"id": "1"}]
        today = date.today()

        # Set cache
        cache.set(1, ["cal1"], today, today, events)

        # Manually expire by setting cached_at in the past
        key = cache._make_key(1, ["cal1"], today, today)
        cache._cache[key].cached_at = _now_utc() - CACHE_TTL - timedelta(seconds=1)

        # Should return None and remove entry
        result = cache.get(1, ["cal1"], today, today)
        assert result is None
        assert key not in cache._cache

    def test_different_calendar_ids_different_cache(self):
        """Different calendar IDs should use different cache keys."""
        cache = CalendarCache()
        today = date.today()
        events1 = [{"id": "1"}]
        events2 = [{"id": "2"}]

        cache.set(1, ["cal1"], today, today, events1)
        cache.set(1, ["cal2"], today, today, events2)

        assert cache.get(1, ["cal1"], today, today) == events1
        assert cache.get(1, ["cal2"], today, today) == events2

    def test_calendar_ids_order_independent(self):
        """Calendar IDs order should not affect cache key."""
        cache = CalendarCache()
        today = date.today()
        events = [{"id": "1"}]

        # Set with one order
        cache.set(1, ["cal1", "cal2"], today, today, events)

        # Get with different order should return same events
        result = cache.get(1, ["cal2", "cal1"], today, today)
        assert result == events

    def test_different_users_different_cache(self):
        """Different users should have separate caches."""
        cache = CalendarCache()
        today = date.today()
        user1_events = [{"id": "user1"}]
        user2_events = [{"id": "user2"}]

        cache.set(1, ["cal1"], today, today, user1_events)
        cache.set(2, ["cal1"], today, today, user2_events)

        assert cache.get(1, ["cal1"], today, today) == user1_events
        assert cache.get(2, ["cal1"], today, today) == user2_events

    def test_invalidate_user_clears_all_entries(self):
        """Invalidate should clear all entries for a user."""
        cache = CalendarCache()
        today = date.today()
        tomorrow = today + timedelta(days=1)

        # Create multiple entries for user 1
        cache.set(1, ["cal1"], today, today, [{"id": "1"}])
        cache.set(1, ["cal2"], today, today, [{"id": "2"}])
        cache.set(1, ["cal1"], tomorrow, tomorrow, [{"id": "3"}])

        # Create entry for user 2
        cache.set(2, ["cal1"], today, today, [{"id": "user2"}])

        # Invalidate user 1
        removed = cache.invalidate_user(1)

        assert removed == 3
        assert cache.get(1, ["cal1"], today, today) is None
        assert cache.get(1, ["cal2"], today, today) is None
        assert cache.get(1, ["cal1"], tomorrow, tomorrow) is None

        # User 2 should still have their cache
        assert cache.get(2, ["cal1"], today, today) == [{"id": "user2"}]

    def test_cleanup_expired_removes_stale_entries(self):
        """Cleanup should remove all expired entries."""
        cache = CalendarCache()
        today = date.today()

        # Create some entries
        cache.set(1, ["cal1"], today, today, [{"id": "1"}])
        cache.set(2, ["cal1"], today, today, [{"id": "2"}])

        # Expire first entry
        key1 = cache._make_key(1, ["cal1"], today, today)
        cache._cache[key1].cached_at = _now_utc() - CACHE_TTL - timedelta(seconds=1)

        # Cleanup
        removed = cache.cleanup_expired()

        assert removed == 1
        assert cache.get(1, ["cal1"], today, today) is None
        assert cache.get(2, ["cal1"], today, today) == [{"id": "2"}]

    def test_stats_returns_correct_counts(self):
        """Stats should return correct entry counts."""
        cache = CalendarCache()
        today = date.today()

        # Create entries
        cache.set(1, ["cal1"], today, today, [])
        cache.set(2, ["cal1"], today, today, [])
        cache.set(3, ["cal1"], today, today, [])

        # Expire one
        key1 = cache._make_key(1, ["cal1"], today, today)
        cache._cache[key1].cached_at = _now_utc() - CACHE_TTL - timedelta(seconds=1)

        stats = cache.stats()

        assert stats["total_entries"] == 3
        assert stats["expired_entries"] == 1
        assert stats["active_entries"] == 2

    def test_clear_removes_all_entries(self):
        """Clear should remove all cache entries."""
        cache = CalendarCache()
        today = date.today()

        cache.set(1, ["cal1"], today, today, [])
        cache.set(2, ["cal1"], today, today, [])

        cache.clear()

        assert cache.stats()["total_entries"] == 0

    def test_empty_calendar_ids_returns_none(self):
        """Empty calendar IDs should always return None."""
        cache = CalendarCache()
        today = date.today()

        # Set with empty should be no-op
        cache.set(1, [], today, today, [{"id": "1"}])
        assert cache.stats()["total_entries"] == 0

        # Get with empty should return None
        result = cache.get(1, [], today, today)
        assert result is None
