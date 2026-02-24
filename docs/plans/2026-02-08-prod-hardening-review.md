# Production Hardening Review

> **ARCHIVED:** Issues addressed in v0.40.0 on 2026-02-08 via [PR #67](https://github.com/aleksandr-bogdanov/whendoist/pull/67)

> Diagnostic review of production logs and Railway observability data from 2026-02-07/08.
> Conducted at v0.39.8. Covers error patterns, resource usage, cost analysis, and architectural gaps.

## Summary

The app is running but has compounding issues: **invisible errors** (empty exception messages in background loops), **memory as 97% of costs**, **no graceful shutdown** (database connections dropped on every deploy), and **healthcheck misconfiguration** (liveness used where readiness is needed). None are critical today at 2-user scale, but several will cause outages as the app grows.

---

## 1. Log Analysis

### 1.1 Empty Materialization Errors (every ~60 minutes)

```
[err] Materialization loop error:
[err] Materialization loop error:
[err] Materialization loop error:
```

**Pattern:** These fire roughly every 60 minutes, alternating with successful materialization runs. The error message is **empty** — no exception type, no traceback, no context.

**Root cause:** `app/tasks/recurring.py:168` logs `f"Materialization loop error: {e}"`. Python's `str(exception)` returns `""` for exceptions instantiated without message arguments (e.g., `TimeoutError()`, `ConnectionError()`, many asyncpg errors). The same issue exists in `app/database.py:38` with `f"Database session error: {e}"`.

**Timing analysis:** Successful materializations run on an exact 60-minute cadence (04:00, 05:00, 06:00...). The errors drift by ~1-2 minutes per hour (03:20, 04:20, 05:22, 06:23, 07:24...), consistent with `sleep(3600)` + error-handling overhead. This drift pattern suggests the errors may originate from a separate execution context or a transient failure partway through the sleep/execute cycle.

**Impact:** Production debugging is impossible. When the 19:12 database outage occurred, the logs showed only:

```
[err] Database session error:
[err] Request failed: GET /dashboard
[err] Database session error:
[err] Request failed: GET /dashboard
```

No way to distinguish connection timeout, pool exhaustion, PostgreSQL restart, or network partition.

**Affected files:**
- `app/tasks/recurring.py:168` — `logger.error(f"Materialization loop error: {e}")`
- `app/database.py:38` — `logger.error(f"Database session error: {e}")`

### 1.2 Database Session Outage (19:12 cluster)

```
2026-02-07T19:12:02  [err] Materialization loop error:
2026-02-07T19:12:22  [err] Database session error:
2026-02-07T19:12:22  [err] Request failed: GET /dashboard
2026-02-07T19:12:22  [err] Database session error:
2026-02-07T19:12:22  [err] Request failed: GET /dashboard
2026-02-07T19:12:23  [err] Database session error:
2026-02-07T19:12:23  [err] Request failed: GET /
2026-02-07T19:12:27  [err] Database session error:
2026-02-07T19:12:27  [err] Request failed: GET /dashboard
2026-02-07T19:12:47  [err] Database session error:
2026-02-07T19:12:47  [err] Request failed: GET /dashboard
```

**Pattern:** 5 user-facing 500 errors over 25 seconds. The materialization loop error at 19:12:02 preceded the request failures by 20 seconds, suggesting the database became unreachable and the background task hit it first.

**Impact:** Users saw 500 errors on dashboard and homepage. The app recovered automatically (likely via `pool_pre_ping` recycling stale connections), but there was no alerting or structured error data.

### 1.3 Connection Drops on Every Deploy

Every container shutdown produces PostgreSQL errors:

```
[err] could not receive data from client: Connection reset by peer (x3)
```

**Root cause:** The shutdown handler (`app/main.py:110-116`) cancels the materialization task but never calls `await engine.dispose()`. Active pool connections are abandoned, and PostgreSQL logs the forced disconnection.

**Frequency:** Every deployment. The logs show 6 container start/stop cycles in the review period (19:21, 19:39, 21:39, 01:53, 02:57, 03:00).

### 1.4 Container Churn

Multiple rapid start/stop cycles visible:

```
02:57:21  Starting Container
02:57:26  Starting Whendoist v0.39.8
02:57:30  Stopping Container         ← 9 seconds later
...
03:00:22  Starting Container
03:00:30  Startup complete (3.2s)
03:00:35  Stopping Container         ← 5 seconds later
```

Railway starts new containers, they pass `/health`, then get stopped — likely zero-downtime deployment replacing old containers. The app boots in ~2.5-3.2 seconds, which is fine, but each cycle produces connection-reset noise in PostgreSQL logs.

---

## 2. Observability Dashboard Analysis

Data from Railway observability, last 7 days.

### 2.1 Memory (dominant cost)

- **Range:** 80-200 MB (app), plus ~80 MB (PostgreSQL)
- **Pattern:** Sawtooth — gradual climb to ~200 MB, drop back to ~100 MB
- **Cost:** $1.55 of $1.61 total (97% of all costs)

The sawtooth pattern indicates object accumulation between GC cycles. Likely contributors:
- Materialization loads all users + tasks into a single session scope (`recurring.py:47-80`), accumulating ORM objects
- `expire_on_commit=False` keeps objects in the session identity map after commit
- In-memory `CalendarCache` holds event data indefinitely until TTL expiry
- Single-process uvicorn means all request state shares one Python heap

### 2.2 CPU

- **Range:** Near zero, occasional micro-spikes to 0.05 vCPU
- **Cost:** $0.03
- **Assessment:** The app is entirely I/O-bound (database + Google API). CPU is not a concern.

### 2.3 Disk

- **PostgreSQL volume:** Flat at ~100 MB
- **Assessment:** Stable. The `cleanup_old_instances()` job (90-day retention) is working. No growth concern at current scale.

### 2.4 Network Egress

- **Pattern:** Large initial burst (~30 MB) after deploy, then periodic smaller bursts (5-10 MB)
- **Assessment:** Initial burst is likely Google Calendar sync triggered by materialization on startup. Periodic bursts correspond to hourly materialization + token refresh cycles. Not a cost concern at $0.02.

### 2.5 Cost Summary

| Resource | Current | Estimated (7-day) | % of Total |
|----------|---------|-------------------|------------|
| Memory | $1.55 | ~$3.90 | 97% |
| CPU | $0.03 | ~$0.08 | 2% |
| Network | $0.02 | ~$0.05 | 1% |
| Volume | $0.02 | ~$0.05 | 1% |
| **Total** | **$1.61** | **~$4.24** | |

Memory is the only lever that matters for cost optimization.

---

## 3. Architecture Gaps

### 3.1 Healthcheck Misconfiguration

`railway.toml` configures:
```toml
healthcheckPath = "/health"
```

But `/health` is a liveness probe — it returns 200 if the process is alive, without checking database connectivity. The `/ready` endpoint checks the database but Railway doesn't use it.

**Consequence:** Railway will route traffic to containers that can't reach the database. This likely contributed to the 19:12 outage — the app was "healthy" per Railway but unable to serve requests.

### 3.2 Single Uvicorn Worker

```toml
startCommand = "uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT --no-access-log"
```

No `--workers` flag. Single process means:
- Background materialization task competes with request handling on the same event loop
- No crash isolation — a stuck coroutine affects all users
- A single Python GIL for template rendering (minor concern for async I/O app)

Acceptable at current scale but becomes a risk as traffic grows.

### 3.3 No Statement Timeout

The database engine (`app/database.py`) has no `connect_args` with `statement_timeout`. A runaway query holds a pool connection indefinitely. With `pool_size=5`, just 5 stuck queries exhaust the pool.

### 3.4 No Materialization Timeout

`materialize_all_instances()` runs with no timeout. It processes all users sequentially, including Google Calendar sync per user. If Google's API is slow or a user has pathological data, this can block for minutes.

### 3.5 Oversized Connection Pool

Current defaults: `pool_size=5`, `max_overflow=10` (up to 15 connections). With 2 active users and a single uvicorn worker, this is 5-7x more connections than needed. Each idle connection consumes memory on both the app and PostgreSQL sides.

---

## 4. What's Working Well

- **`pool_pre_ping=True`** — Catches stale connections before use. The 19:12 outage recovered automatically.
- **`pool_recycle=300`** — Prevents Railway's managed Postgres idle timeout from causing errors.
- **Rate limiting** — Properly configured per endpoint type (auth, demo, API, task creation).
- **Token refresh with DB locking** — `FOR UPDATE SKIP LOCKED` prevents duplicate refresh races.
- **Structured logging** — JSON format in production with request_id context (when it has data to log).
- **Prometheus metrics** — Pool health and request latency are tracked.
- **Instance cleanup job** — 90-day retention prevents table bloat.

---

## Related Documentation

- [Deployment Guide](DEPLOYMENT.md) — Railway setup and configuration
- [Performance Guide](PERFORMANCE.md) — Query optimization and background tasks
- [Security Guide](SECURITY.md) — Rate limiting and headers
