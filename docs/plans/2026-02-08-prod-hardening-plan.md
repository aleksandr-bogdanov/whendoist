# Production Hardening Plan

> **ARCHIVED:** Fully implemented in v0.40.0 on 2026-02-08 via [PR #67](https://github.com/aleksandr-bogdanov/whendoist/pull/67)
>
> Implementation plan based on [2026-02-08-prod-hardening-review.md](2026-02-08-prod-hardening-review.md).
> Three phases ordered by impact: observability first, then stability, then cost.

---

## Phase 1 — Observability & Correctness

*Goal: Make production debuggable. Every error should include exception type, message, and traceback.*

### 1.1 Fix Empty Error Logging

**Files:** `app/tasks/recurring.py`, `app/database.py`

Replace `logger.error(f"... {e}")` with `logger.exception()` which automatically includes the full traceback. Also include the exception class name for quick scanning.

**`app/tasks/recurring.py:167-168`** — Materialization loop:
```python
# Before
except Exception as e:
    logger.error(f"Materialization loop error: {e}")

# After
except Exception as e:
    logger.exception(f"Materialization loop error: {type(e).__name__}: {e}")
```

**`app/tasks/recurring.py:76-77`** — Per-user materialization:
```python
# Before
except Exception as e:
    logger.error(f"Failed to materialize for user {user_id}: {e}")

# After
except Exception as e:
    logger.exception(f"Failed to materialize for user {user_id}: {type(e).__name__}: {e}")
```

**`app/database.py:37-38`** — Database session errors:
```python
# Before
except Exception as e:
    logger.error(f"Database session error: {e}")

# After
except Exception as e:
    logger.exception(f"Database session error: {type(e).__name__}: {e}")
```

### 1.2 Switch Healthcheck to Readiness Probe

**File:** `railway.toml`

```toml
# Before
healthcheckPath = "/health"

# After
healthcheckPath = "/ready"
```

This ensures Railway only routes traffic to containers with verified database connectivity. The `/ready` endpoint already exists and checks the database with `SELECT 1`.

### 1.3 Graceful Shutdown — Dispose Engine Pool

**File:** `app/main.py` (lifespan shutdown block, lines 109-116)

Add `await engine.dispose()` to cleanly close all pool connections before the container exits. This eliminates the PostgreSQL "Connection reset by peer" warnings on every deploy.

```python
# After (shutdown section of lifespan)
logger.info("Shutting down Whendoist...")
try:
    from app.tasks.recurring import stop_materialization_background
    stop_materialization_background()
except Exception as e:
    logger.warning(f"Error stopping background tasks: {e}")

# Clean up database connections
from app.database import engine
await engine.dispose()
```

---

## Phase 2 — Stability

*Goal: Prevent runaway operations from exhausting resources or blocking request handling.*

### 2.1 Materialization Timeout

**File:** `app/tasks/recurring.py`

Wrap the materialization call in `asyncio.wait_for()` with a 5-minute timeout. If materialization takes longer than that, something is wrong (pathological user data, slow Google API, etc.).

```python
# In run_materialization_loop(), around the materialize + cleanup calls
import asyncio

MATERIALIZATION_TIMEOUT_SECONDS = 300  # 5 minutes

async def _run_cycle() -> None:
    stats = await materialize_all_instances()
    cleanup = await cleanup_old_instances()
    if stats["tasks_processed"] > 0 or cleanup["deleted_count"] > 0:
        logger.info(
            f"Periodic materialization: {stats['tasks_processed']} tasks updated, "
            f"{cleanup['deleted_count']} old instances cleaned"
        )

# In the loop body:
await asyncio.wait_for(_run_cycle(), timeout=MATERIALIZATION_TIMEOUT_SECONDS)
```

Add `MATERIALIZATION_TIMEOUT_SECONDS = 300` to `app/constants.py`.

### 2.2 PostgreSQL Statement Timeout

**File:** `app/database.py`

Add a server-side statement timeout via `connect_args`. This prevents any single query from holding a connection indefinitely.

```python
engine = create_async_engine(
    _settings.database_url,
    echo=False,
    pool_pre_ping=True,
    pool_size=_settings.db_pool_size,
    max_overflow=_settings.db_max_overflow,
    pool_recycle=_settings.db_pool_recycle,
    connect_args={
        "server_settings": {"statement_timeout": "30000"},  # 30 seconds
    },
)
```

30 seconds is generous for a task scheduling app. No query should take that long. The materialization loop creates its own sessions, so this applies there too.

### 2.3 Per-User Session Scope in Materialization

**File:** `app/tasks/recurring.py`

Currently, `materialize_all_instances()` opens a single session for all users (`async with async_session_factory() as db:`). This means ORM objects for all users accumulate in the session identity map until the entire loop finishes.

Refactor to commit and release per user:

```python
async def materialize_all_instances() -> dict[str, Any]:
    stats = {"users_processed": 0, "tasks_processed": 0}

    # Step 1: Get user IDs (lightweight query, separate session)
    async with async_session_factory() as db:
        users_query = (
            select(User.id).distinct()
            .join(Task, Task.user_id == User.id)
            .where(Task.is_recurring == True, Task.status == "pending")
        )
        result = await db.execute(users_query)
        user_ids = [row[0] for row in result.all()]

    if not user_ids:
        return stats

    # Step 2: Process each user in its own session scope
    for user_id in user_ids:
        try:
            async with async_session_factory() as db:
                prefs_service = PreferencesService(db, user_id)
                timezone = await prefs_service.get_timezone()
                service = RecurrenceService(db, user_id, timezone=timezone)
                tasks_count = await service.ensure_instances_materialized(
                    horizon_days=MATERIALIZATION_HORIZON_DAYS
                )
                await db.commit()
                stats["users_processed"] += 1
                stats["tasks_processed"] += tasks_count
        except Exception as e:
            logger.exception(f"Failed to materialize for user {user_id}: {type(e).__name__}: {e}")
            continue

    # Step 3: GCal sync (also per-user session)
    for user_id in user_ids:
        try:
            async with async_session_factory() as db:
                prefs_result = await db.execute(
                    select(UserPreferences).where(UserPreferences.user_id == user_id)
                )
                prefs = prefs_result.scalar_one_or_none()
                if prefs and prefs.gcal_sync_enabled:
                    from app.services.gcal_sync import GCalSyncService
                    sync_service = GCalSyncService(db, user_id)
                    result = await sync_service.bulk_sync()
                    await db.commit()
                    if "error" in result:
                        logger.warning(f"GCal sync auto-disabled for user {user_id}: {result['error']}")
        except Exception as e:
            logger.warning(f"GCal sync after materialization failed for user {user_id}: {e}")

    if stats["tasks_processed"] > 0:
        logger.info(f"Materialized: {stats['users_processed']} users, {stats['tasks_processed']} tasks updated")

    return stats
```

This releases ORM objects after each user instead of accumulating them all. Direct memory reduction.

---

## Phase 3 — Cost Optimization

*Goal: Reduce the $1.55/week memory cost without impacting functionality.*

### 3.1 Right-Size Connection Pool

**File:** `app/config.py`

Reduce pool defaults. With 2 users and a single uvicorn worker, 5 persistent connections and 10 overflow is excessive.

```python
# Before
db_pool_size: int = 5
db_max_overflow: int = 10

# After
db_pool_size: int = 2
db_max_overflow: int = 3
```

This caps connections at 5 (from 15). Each idle asyncpg connection uses ~1-2 MB on the app side plus resources on PostgreSQL. If the app scales to multiple workers later, these can be bumped via environment variables.

### 3.2 Reduce Pool Recycle Interval

**File:** `app/config.py`

With `pool_pre_ping=True` already catching stale connections, the 5-minute recycle is redundant churn. Increase to match Railway's typical Postgres idle timeout.

```python
# Before
db_pool_recycle: int = 300

# After
db_pool_recycle: int = 1800  # 30 minutes
```

This reduces connection teardown/rebuild frequency, saving the overhead of TCP handshake + SSL negotiation + asyncpg protocol setup every 5 minutes per connection.

### 3.3 Consider: Explicit GC After Materialization

**File:** `app/tasks/recurring.py`

If per-user session scoping (2.3) doesn't sufficiently flatten the sawtooth, add an explicit `gc.collect()` after the materialization cycle to release ORM objects sooner:

```python
import gc

# At end of run_materialization_loop cycle, after logging
gc.collect()
```

This is a last resort — Phase 2.3 should handle most of the memory pressure. Monitor memory after deploying Phase 2 before adding this.

---

## Implementation Order

| # | Item | Phase | Files Changed | Risk |
|---|------|-------|---------------|------|
| 1 | Fix empty error logging | 1.1 | `recurring.py`, `database.py` | None |
| 2 | Switch healthcheck to `/ready` | 1.2 | `railway.toml` | Low — `/ready` returns 503 if DB is down, which is the correct behavior but could delay container readiness during DB maintenance |
| 3 | Graceful engine disposal | 1.3 | `main.py` | None |
| 4 | Materialization timeout | 2.1 | `recurring.py`, `constants.py` | Low — a stuck cycle will be cancelled and retried next hour |
| 5 | Statement timeout | 2.2 | `database.py` | Low — 30s is generous; monitor for false positives on analytics queries |
| 6 | Per-user session scope | 2.3 | `recurring.py` | Medium — changes the transaction boundary; needs test verification |
| 7 | Right-size pool | 3.1 | `config.py` | Low — can be overridden via env vars if needed |
| 8 | Increase pool recycle | 3.2 | `config.py` | Low — `pool_pre_ping` covers stale connections |

**Suggested PR grouping:**
- **PR 1 (Phase 1):** Items 1-3 — observability + correctness
- **PR 2 (Phase 2):** Items 4-6 — stability
- **PR 3 (Phase 3):** Items 7-8 — cost optimization

Each phase can be deployed and validated independently before moving to the next.

---

## Validation

After each phase, verify in Railway logs:

**Phase 1:**
- [ ] Materialization errors now include exception type + traceback
- [ ] Database session errors include exception type + traceback
- [ ] No "Connection reset by peer" on clean deploys
- [ ] Railway uses `/ready` for health checks (visible in deploy logs)

**Phase 2:**
- [ ] `MATERIALIZATION_TIMEOUT_SECONDS` appears in constants
- [ ] Long-running queries are killed at 30s (test by temporarily lowering timeout)
- [ ] Materialization logs show per-user processing (one commit per user)

**Phase 3:**
- [ ] Memory sawtooth amplitude decreases (monitor for 24-48 hours)
- [ ] Pool metrics (`/metrics`) show lower `whendoist_db_pool_size`
- [ ] No connection errors from undersized pool

---

## Not Doing (and Why)

| Idea | Why Not |
|------|---------|
| Multiple uvicorn workers | Adds complexity (shared background task coordination). Revisit when traffic justifies it. |
| Redis caching | Single-process app; in-memory cache is simpler and sufficient at current scale. |
| PgBouncer | Connection pooling is handled by SQLAlchemy. Railway's managed Postgres handles the rest. |
| Alerting / PagerDuty | Premature at 2-user scale. Sentry is already integrated for error tracking. |
| Read replicas | Current query load is trivial. Revisit if analytics queries become bottleneck. |

---

## Related Documentation

- [Production Hardening Review](PROD-HARDENING-REVIEW.md) — Diagnostic findings this plan addresses
- [Deployment Guide](DEPLOYMENT.md) — Railway setup and configuration
- [Performance Guide](PERFORMANCE.md) — Query optimization and background tasks
