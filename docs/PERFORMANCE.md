# Performance Optimization Guide

> Technical documentation for v0.14.0 performance optimizations.

## Overview

v0.14.0 addresses N+1 queries and performance bottlenecks identified in the [Architectural Review](2026-01-22-ARCHITECTURAL-REVIEW-1.md). The optimizations reduce query counts by 60%+ and move expensive operations to background tasks.

### Results Summary

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Analytics queries | 26+ | ~10 | 60% reduction |
| Recurring stats queries | 1 + 2N (21 for 10 tasks) | 2 | O(N) → O(1) |
| Task filtering | Python list comprehensions | SQL WHERE | Reduced memory |
| Calendar API calls | Every page load | 5-min cache | 80%+ reduction |
| Instance materialization | Request-time blocking | Background startup + hourly | Non-blocking |

---

## Architecture

### 1. Analytics Query Optimization

**File:** `app/services/analytics_service.py`

#### Problem

The original analytics service made 26+ separate database queries:
- 2 queries per recurring task for stats (N+1 pattern)
- Separate queries for tasks vs instances
- Duplicate queries for heatmap and velocity (both need daily counts)

#### Solution

**CTE-Based Unified Queries**

Use Common Table Expressions (CTEs) with `UNION ALL` to combine Task and TaskInstance queries:

```python
from sqlalchemy import union_all, literal

async def _get_all_completions(self, start: datetime, end: datetime) -> list[dict]:
    """Single query for all completions (tasks + instances)."""
    # Query 1: Completed tasks
    task_query = (
        select(
            Task.completed_at,
            Task.impact,
            Task.domain_id,
            Task.created_at,
            literal(False).label("is_instance"),
        )
        .where(
            Task.user_id == self.user_id,
            Task.status == "completed",
            Task.completed_at >= start,
            Task.completed_at < end,
        )
    )

    # Query 2: Completed instances
    instance_query = (
        select(
            TaskInstance.completed_at,
            Task.impact,
            Task.domain_id,
            Task.created_at,
            literal(True).label("is_instance"),
        )
        .join(Task, TaskInstance.task_id == Task.id)
        .where(
            TaskInstance.user_id == self.user_id,
            TaskInstance.status == "completed",
            TaskInstance.completed_at >= start,
            TaskInstance.completed_at < end,
        )
    )

    # Combine with UNION ALL
    combined = union_all(task_query, instance_query)
    result = await self.db.execute(combined)
    return [dict(row._mapping) for row in result.all()]
```

**Batch Recurring Stats**

Replace N+1 loop with single batch query using `GROUP BY`:

```python
async def _get_recurring_stats(self, task_ids: list[int]) -> dict[int, dict]:
    """Batch query for recurring task stats (2 queries instead of 2N)."""
    if not task_ids:
        return {}

    # Single query with GROUP BY
    query = (
        select(
            TaskInstance.task_id,
            func.count().label("total"),
            func.count()
            .filter(TaskInstance.status == "completed")
            .label("completed"),
        )
        .where(TaskInstance.task_id.in_(task_ids))
        .group_by(TaskInstance.task_id)
    )

    result = await self.db.execute(query)
    return {
        row.task_id: {"total": row.total, "completed": row.completed}
        for row in result.all()
    }
```

**Shared Daily Counts**

Compute daily counts once for both heatmap and velocity:

```python
async def _get_daily_counts(self, start: date, end: date) -> dict[date, int]:
    """Single query for daily completion counts (heatmap + velocity)."""
    # Tasks by day
    task_daily = (
        select(
            cast(Task.completed_at, Date).label("d"),
            func.count().label("count"),
        )
        .where(...)
        .group_by(cast(Task.completed_at, Date))
    )

    # Instances by day
    instance_daily = (
        select(
            cast(TaskInstance.completed_at, Date).label("d"),
            func.count().label("count"),
        )
        .where(...)
        .group_by(cast(TaskInstance.completed_at, Date))
    )

    # Combine and sum
    combined = union_all(task_daily, instance_daily).cte("daily")
    query = (
        select(combined.c.d, func.sum(combined.c.count).label("total"))
        .group_by(combined.c.d)
    )

    result = await self.db.execute(query)
    return {row.d: row.total for row in result.all()}
```

#### Query Count Breakdown

| Operation | Before | After |
|-----------|--------|-------|
| Get domains | 1 | 1 |
| Pending count | 1 | 1 |
| All completions | 2 | 1 (UNION ALL) |
| Daily counts | 4 (heatmap + velocity) | 1 (shared) |
| Recurring stats | 1 + 2N | 2 (batch) |
| Week comparison | 4 | 1 |
| Streaks | 2 | 1 |
| **Total (10 recurring)** | **26+** | **~10** |

---

### 2. Task Filtering Optimization

**Files:** `app/services/task_service.py`, `app/routers/pages.py`

#### Problem

Task filtering happened in Python after fetching all tasks:

```python
# BEFORE: Fetch all, filter in Python
all_tasks = await task_service.get_tasks(status=None)
domain_tasks = [t for t in all_tasks if t.domain_id is not None]
inbox_tasks = [t for t in all_tasks if t.domain_id is None]
```

This loads unnecessary data into memory and doesn't leverage database indexes.

#### Solution

**New SQL Filter Parameters**

```python
# app/services/task_service.py
async def get_tasks(
    self,
    domain_id: int | None = None,
    status: str | None = "pending",
    top_level_only: bool = False,
    include_subtasks: bool = False,
    has_domain: bool | None = None,           # NEW
    exclude_statuses: list[str] | None = None,  # NEW
) -> list[Task]:
    query = select(Task).where(Task.user_id == self.user_id)

    # ... existing filters ...

    # Filter by domain presence
    if has_domain is True:
        query = query.where(Task.domain_id.isnot(None))
    elif has_domain is False:
        query = query.where(Task.domain_id.is_(None))

    # Exclude specific statuses
    if exclude_statuses:
        query = query.where(Task.status.notin_(exclude_statuses))

    result = await self.db.execute(query)
    return list(result.scalars().all())
```

**Updated Call Sites**

```python
# AFTER: Filter in SQL
# Dashboard - tasks with domains
tasks = await task_service.get_tasks(
    status=None,
    top_level_only=True,
    has_domain=True
)

# Thought Cabinet - inbox tasks (no domain)
inbox_tasks = await task_service.get_tasks(
    status="pending",
    top_level_only=True,
    has_domain=False
)

# Settings - exclude deleted/archived
active_tasks = await task_service.get_tasks(
    status=None,
    exclude_statuses=["deleted", "archived"]
)
```

#### Benefits

- Database does filtering using indexes
- Less memory usage (only needed rows transferred)
- Cleaner, more declarative code

---

### 3. Calendar Event Caching

**File:** `app/services/calendar_cache.py`

#### Problem

Google Calendar API calls on every page load:
- Slow (network latency)
- Rate-limited
- Same events fetched repeatedly within short timeframes

#### Solution

**TTL-Based In-Memory Cache**

```python
from datetime import UTC, datetime, timedelta
from dataclasses import dataclass, field

CACHE_TTL = timedelta(minutes=5)

def _now_utc() -> datetime:
    """Get current UTC time (timezone-aware)."""
    return datetime.now(UTC)

@dataclass
class CacheEntry:
    events: list[Any]
    cached_at: datetime = field(default_factory=_now_utc)

    def is_expired(self) -> bool:
        return _now_utc() - self.cached_at > CACHE_TTL

class CalendarCache:
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
        cal_hash = hashlib.md5(
            ",".join(sorted(calendar_ids)).encode()
        ).hexdigest()[:8]
        return f"{user_id}:{cal_hash}:{start_date}:{end_date}"

    def get(self, user_id, calendar_ids, start_date, end_date) -> list | None:
        """Get cached events if present and not expired."""
        if not calendar_ids:
            return None

        key = self._make_key(user_id, calendar_ids, start_date, end_date)
        entry = self._cache.get(key)

        if entry is None:
            return None

        if entry.is_expired():
            del self._cache[key]
            return None

        return entry.events

    def set(self, user_id, calendar_ids, start_date, end_date, events) -> None:
        """Store events in cache."""
        if not calendar_ids:
            return
        key = self._make_key(user_id, calendar_ids, start_date, end_date)
        self._cache[key] = CacheEntry(events=events, cached_at=_now_utc())

    def invalidate_user(self, user_id: int) -> int:
        """Invalidate all cache entries for a user."""
        keys_to_delete = [k for k in self._cache if k.startswith(f"{user_id}:")]
        for k in keys_to_delete:
            del self._cache[k]
        return len(keys_to_delete)

# Global singleton
_calendar_cache: CalendarCache | None = None

def get_calendar_cache() -> CalendarCache:
    global _calendar_cache
    if _calendar_cache is None:
        _calendar_cache = CalendarCache()
    return _calendar_cache
```

**Cache Invalidation**

Invalidate when user changes calendar selection:

```python
# app/routers/api.py
@router.post("/api/calendars/{calendar_id}/toggle")
async def toggle_calendar(...):
    # ... toggle logic ...
    get_calendar_cache().invalidate_user(user.id)
    return {"status": "ok"}
```

#### Cache Key Design

```
{user_id}:{calendar_hash}:{start_date}:{end_date}
    1    :  a1b2c3d4    : 2024-01-15 : 2024-01-21
```

- **user_id**: Ensures user isolation (multitenancy)
- **calendar_hash**: MD5 of sorted calendar IDs (order-independent)
- **date range**: Exact match required

---

### 4. Background Instance Materialization

**Files:** `app/tasks/__init__.py`, `app/tasks/recurring.py`, `app/main.py`

#### Problem

Recurring task instances were materialized on every dashboard request:
- Blocking operation during page load
- Wasted work (instances don't change between rapid page views)
- Poor user experience (slow page loads)

#### Solution

**Background Task Module**

```python
# app/tasks/recurring.py
import asyncio
from app.database import async_session_factory
from app.services.recurrence_service import RecurrenceService

MATERIALIZATION_HORIZON_DAYS = 60
MATERIALIZATION_INTERVAL_SECONDS = 3600  # 1 hour

async def materialize_all_instances() -> dict[str, Any]:
    """Materialize instances for all users with recurring tasks."""
    stats = {"users_processed": 0, "tasks_processed": 0}

    async with async_session_factory() as db:
        # Find all users with active recurring tasks
        users_query = (
            select(User.id)
            .distinct()
            .join(Task, Task.user_id == User.id)
            .where(Task.is_recurring == True, Task.status == "pending")
        )

        result = await db.execute(users_query)
        user_ids = [row[0] for row in result.all()]

        for user_id in user_ids:
            service = RecurrenceService(db, user_id)
            await service.ensure_instances_materialized(
                horizon_days=MATERIALIZATION_HORIZON_DAYS
            )
            stats["users_processed"] += 1

        await db.commit()

    return stats

async def run_materialization_loop() -> None:
    """Background loop that periodically materializes instances."""
    while True:
        try:
            await asyncio.sleep(MATERIALIZATION_INTERVAL_SECONDS)
            await materialize_all_instances()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Materialization loop error: {e}")

_materialization_task: asyncio.Task[None] | None = None

def start_materialization_background() -> None:
    global _materialization_task
    _materialization_task = asyncio.create_task(run_materialization_loop())

def stop_materialization_background() -> None:
    global _materialization_task
    if _materialization_task:
        _materialization_task.cancel()
        _materialization_task = None
```

**Lifespan Integration**

```python
# app/main.py
from app.tasks.recurring import (
    materialize_all_instances,
    start_materialization_background,
    stop_materialization_background,
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Running initial instance materialization...")
    stats = await materialize_all_instances()
    logger.info(f"Materialized instances for {stats['users_processed']} users")

    start_materialization_background()

    yield

    # Shutdown
    stop_materialization_background()
```

#### Timing

| Event | When |
|-------|------|
| Initial materialization | App startup (blocking, ensures fresh instances) |
| Background refresh | Every 60 minutes |
| Horizon | 60 days ahead |

---

### 5. Query Timing Logs

**File:** `app/utils/timing.py`

#### Purpose

Measure and log execution time of critical operations for performance monitoring.

#### Implementation

```python
import functools
import logging
import time
from collections.abc import Callable
from typing import Any

logger = logging.getLogger("whendoist.timing")

def log_timing(name: str) -> Callable:
    """Decorator to log execution time of async functions."""
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            start = time.perf_counter()
            try:
                return await func(*args, **kwargs)
            finally:
                elapsed = (time.perf_counter() - start) * 1000
                logger.info(f"{name}: {elapsed:.1f}ms")
        return wrapper
    return decorator
```

#### Usage

```python
from app.utils.timing import log_timing

class AnalyticsService:
    @log_timing("analytics.comprehensive_stats")
    async def get_comprehensive_stats(self, start_date, end_date):
        # ... implementation ...
```

**Log Output:**
```
INFO whendoist.timing: analytics.comprehensive_stats: 45.2ms
```

---

## Testing

### Test Files

| File | Purpose |
|------|---------|
| `tests/test_calendar_cache.py` | Cache hit/miss, TTL, invalidation |
| `tests/test_task_filtering.py` | SQL filter parameters |

### Running Performance Tests

```bash
# Run all performance-related tests
uv run pytest tests/test_calendar_cache.py tests/test_task_filtering.py -v

# Run with timing output
uv run pytest tests/test_calendar_cache.py -v --durations=10
```

### Key Test Cases

```python
# test_calendar_cache.py
def test_cache_returns_cached_events():
    """Cache hit returns stored events."""

def test_expired_entry_returns_none():
    """Expired cache returns None and removes entry."""

def test_invalidate_user_clears_all_entries():
    """User invalidation removes all user's cache entries."""

def test_calendar_ids_order_independent():
    """Same calendars in different order hit same cache."""

# test_task_filtering.py
async def test_has_domain_true_returns_tasks_with_domain():
    """has_domain=True filters to tasks with domain_id."""

async def test_exclude_statuses_filters_out_specified():
    """exclude_statuses removes tasks with those statuses."""
```

---

## Configuration

### Environment Variables

No new environment variables. All configuration uses sensible defaults:

| Setting | Default | Location |
|---------|---------|----------|
| `CACHE_TTL` | 5 minutes | `app/services/calendar_cache.py` |
| `MATERIALIZATION_INTERVAL_SECONDS` | 3600 (1 hour) | `app/tasks/recurring.py` |
| `MATERIALIZATION_HORIZON_DAYS` | 60 | `app/tasks/recurring.py` |

### Adjusting for Production

For high-traffic deployments, consider:

1. **Redis Cache**: Replace in-memory `CalendarCache` with Redis for multi-process support
2. **Shorter TTL**: Reduce cache TTL if calendar changes need faster propagation
3. **Materialization Interval**: Increase for lower server load, decrease for fresher instances

---

## Monitoring

### Key Metrics to Watch

1. **Analytics page load time** — Target: < 500ms
2. **Cache hit rate** — Higher is better (check logs for "cache hit" vs "cache miss")
3. **Background task execution time** — Should complete within minutes
4. **Query timing logs** — Watch for slow queries

### Log Messages

```
# Cache operations
Calendar cache hit: user=1, events=15
Calendar cache miss: user=1
Calendar cache expired: user=1
Invalidated 3 cache entries for user 1

# Background materialization
Running initial instance materialization...
Materialized instances for 5 users
Started background instance materialization (1 hour interval)

# Query timing
analytics.comprehensive_stats: 45.2ms
```

---

## Future Improvements

### Planned

1. **Redis caching** — For multi-worker deployments (tracked in PRODUCTION-ROADMAP.md)
2. **Query result caching** — Cache analytics results with short TTL
3. **Incremental materialization** — Only process changed recurring tasks

### Not Implemented (Low Priority)

1. **Read replicas** — Overkill for current scale
2. **Database sharding** — Single PostgreSQL handles expected load
3. **CDN for static assets** — Already fast enough

---

## Related Documentation

- [Architectural Review](2026-01-22-ARCHITECTURAL-REVIEW-1.md) — Full list of 25 tracked issues
- [Production Roadmap](PRODUCTION-ROADMAP.md) — v0.11.0 → v1.0.0 plan
- [Migrations Guide](MIGRATIONS.md) — Database schema changes
