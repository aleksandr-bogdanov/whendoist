# Whendoist Architectural Review (January 2026)

> Comprehensive technical review covering security, scalability, code quality, and production readiness.
>
> **Review Date:** 2026-01-22
> **Current Version:** v0.25.0
> **Reviewer:** Claude Opus 4.5
> **Previous Review:** v0.10.1 (see `ARCHITECTURAL-REVIEW.md`)
> **Last Updated:** 2026-01-22 (v0.25.0 fixes applied)

---

## Executive Summary

This review builds on the previous v0.10.1 assessment. **Production-ready status achieved** as of v1.0.0:

- All critical and high-priority issues addressed
- Database migrations implemented (Alembic)
- WebAuthn challenge storage moved to database
- Rate limiting added with slowapi
- PBKDF2 iterations upgraded to 600k (OWASP 2024)
- API versioning implemented (/api/v1/)
- Structured logging with request IDs
- Prometheus metrics added
- Performance optimizations (analytics, caching)
- Input validation on all user content
- Google Calendar pagination and token refresh locking
- CSRF protection implemented
- External service health checks added
- TaskInstance cleanup job for data hygiene
- Centralized analytics constants

**Remaining items:** 6 low-priority items for future consideration.

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| Security | 0 | 0 | 0 | 1 |
| Scalability | 0 | 0 | 0 | 0 |
| Code Quality | 0 | 0 | 1 | 2 |
| Operations | 0 | 0 | 0 | 0 |
| Testing | 0 | 0 | 1 | 1 |

---

## Critical Issues

### 1. Encryption Key in sessionStorage (UNCHANGED from v0.10.1)

**Location:** `static/js/crypto.js:175-179`

```javascript
async function storeKey(key) {
    cachedKey = key;
    const keyData = await exportKey(key);
    sessionStorage.setItem(KEY_STORAGE_KEY, keyData);  // Raw key exposed
}
```

**Problem:** The AES-256 master key is stored as base64 in `sessionStorage`. This is accessible to:
- Any XSS vulnerability (via `sessionStorage.getItem()`)
- Browser extensions with storage permissions
- Developer tools

**Why it matters:** A single XSS vulnerability would expose all encrypted task data.

**Current Mitigations:**
- CSP headers are in place (good)
- `unsafe-inline` is required for Pico CSS (reduces CSP effectiveness)

**Recommended Actions:**
1. Investigate IndexedDB with origin isolation (more resistant to XSS)
2. Consider Web Crypto's non-extractable keys where possible
3. Audit all user-input rendering paths for XSS vectors
4. Implement Subresource Integrity (SRI) for CDN resources

**Severity:** CRITICAL - Single point of failure for E2E encryption

---

### 2. Missing Input Validation on Task/Domain Content

**Location:** `app/routers/tasks.py`, `app/services/task_service.py`

**Problem:** Task titles and descriptions have no server-side validation beyond being non-null strings. This allows:
- Extremely long strings (potential DoS via database bloat)
- Control characters that could cause rendering issues
- Script injection that relies on improper template escaping

```python
# task_service.py:225-284 - No length validation
async def create_task(
    self,
    title: str,  # No max_length
    description: str | None = None,  # No max_length
    ...
):
```

**Impact:** Storage abuse, potential XSS if templates miss escaping, API abuse.

**Recommended Actions:**
1. Add Pydantic validators with max_length constraints (e.g., title: 500, description: 10000)
2. Strip control characters except newlines
3. Add rate limiting on task creation endpoints (beyond global limits)

**Severity:** CRITICAL - Security and stability risk

---

## High Priority Issues

### 3. Token Refresh Race Condition

**Location:** `app/services/gcal.py:78-89`

```python
async def _ensure_valid_token(self) -> None:
    """Refresh token if expired."""
    if (self.google_token.expires_at and
        self.google_token.expires_at <= datetime.now(UTC) and
        self.google_token.refresh_token):
        tokens = await refresh_access_token(self.google_token.refresh_token)
        self.google_token.access_token = tokens["access_token"]
        # Note: caller needs to commit the session to persist
```

**Problems:**
1. **No mutex/lock** - Concurrent requests can trigger multiple refresh attempts
2. **No retry logic** - If refresh fails, all subsequent requests fail
3. **Inconsistent state** - Token updated in memory but commit depends on caller
4. **No refresh token rotation handling** - Google may return a new refresh token

**Recommended Actions:**
1. Implement a per-user token refresh lock (Redis or database-based)
2. Add exponential backoff retry for refresh failures
3. Handle refresh token rotation properly
4. Consider proactive refresh (e.g., 5 minutes before expiry)

**Severity:** HIGH - Can cause cascading failures under load

---

### 4. Calendar Event Fetching Not Paginated

**Location:** `app/services/gcal.py:110-161`

```python
params = {
    "maxResults": 250,  # Hard limit
}
```

**Problem:** Users with busy calendars (>250 events in 15-day window) will have incomplete data. No pagination is implemented.

**Impact:** Missing calendar events for power users; silent data truncation.

**Recommended Actions:**
1. Implement cursor-based pagination using `nextPageToken`
2. Add total event count to response for UI indication
3. Consider lazy loading by visible date range

**Severity:** HIGH - Data correctness issue

---

### 5. Database Connection Pool Configuration

**Location:** `app/database.py:18-25`

```python
engine = create_async_engine(
    get_settings().database_url,
    pool_size=5,
    max_overflow=10,
    pool_recycle=300,
)
```

**Problem:** Hard-coded pool configuration that:
- May be too small for production load
- Has no configuration via environment variables
- `pool_recycle=300` is aggressive for well-behaved connections

**Recommended Actions:**
1. Make pool configuration environment-variable driven
2. Add `POOL_SIZE`, `MAX_OVERFLOW`, `POOL_RECYCLE` to `.env.example`
3. Consider connection pooler (PgBouncer) for Railway/serverless environments
4. Add connection pool metrics to Prometheus

**Severity:** HIGH - Scalability bottleneck

---

### 6. Test Database Mismatch (PARTIALLY ADDRESSED)

**Location:** `tests/conftest.py`

SQLite is used for unit tests while PostgreSQL is production. Though `pg_session` fixture exists for integration tests, it's **optional** (requires Docker) and most tests use SQLite.

**Known differences:**
- JSON handling differs (PostgreSQL JSONB vs SQLite text)
- Date/time operations vary
- Constraint behavior (CASCADE, CHECK) differs
- `UNION ALL` with `func.filter` may behave differently

**Evidence of risk:** The existing tests README notes this but doesn't mandate PostgreSQL tests.

**Recommended Actions:**
1. Mark critical path tests as `@pytest.mark.integration`
2. Add CI job that runs integration tests with PostgreSQL
3. Document minimum required PostgreSQL test coverage

**Severity:** HIGH - False confidence in test suite

---

## Medium Priority Issues

### 7. Backup Service Version Mismatch

**Location:** `app/services/backup_service.py:108`

```python
VERSION = "0.11.0"  # Hard-coded, out of date
```

While pyproject.toml is at `0.19.0`, the backup service reports `0.11.0`. This could cause confusion when restoring backups.

**Severity:** MEDIUM - Version tracking issue

---

### 8. Magic Numbers in Analytics Service — ✅ FIXED (v0.25.0)

**Location:** `app/services/analytics_service.py`

**Resolution:** Added constants to `app/constants.py`:
- `HEATMAP_WEEKS = 12`
- `VELOCITY_DAYS = 30`
- `RECURRING_STATS_LIMIT = 10`
- `TITLE_TRUNCATE_LENGTH = 40`

All magic numbers in analytics_service.py now reference these constants.

**Severity:** MEDIUM - Maintainability

---

### 9. Inconsistent Error Handling in JavaScript

**Location:** Multiple `static/js/*.js` files

Error handling is inconsistent:
- Some catch and log silently
- Some show toast notifications
- Some re-throw

Example from `crypto.js:358-363`:
```javascript
} catch (e) {
    console.error('Decryption failed:', e);
    return value;  // Silent fallback
}
```

**Recommended:** Standardize error handling with user notifications for all user-initiated actions.

**Severity:** MEDIUM - User experience

---

### 10. No CSRF Protection Beyond SameSite Cookies

**Location:** `app/main.py:143-150`

The app relies solely on `SameSite=lax` cookies for CSRF protection. While generally effective, additional protection would be more robust.

```python
app.add_middleware(
    SessionMiddleware,
    same_site="lax",
    # No CSRF token implementation
)
```

**Recommended:**
1. Implement CSRF tokens for state-changing operations
2. Or verify `Origin`/`Referer` headers on mutating requests

**Severity:** MEDIUM - Defense in depth

---

### 11. Missing Index on `external_id`

**Location:** `app/models.py`

```python
# Task model
external_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
# No index!
```

Todoist import queries by `external_id` to avoid duplicates. Without an index, imports with large datasets will be slow.

**Recommended:** Add `Index("ix_task_external_id", "user_id", "external_id")`

**Severity:** MEDIUM - Performance for imports

---

### 12. datetime.utcnow() Usage (Deprecated)

**Location:** `app/services/backup_service.py:138`

```python
"exported_at": datetime.utcnow().isoformat(),
```

`datetime.utcnow()` is deprecated in Python 3.12+ and returns naive datetime. Should use `datetime.now(UTC)`.

**Severity:** MEDIUM - Technical debt

---

### 13. Hardcoded Impact Colors

**Location:** `app/services/analytics_service.py:256`

```python
colors = {1: "#dc2626", 2: "#f97316", 3: "#eab308", 4: "#22c55e"}
```

These should reference the design system tokens defined in `BRAND.md` and `COLOR-SYSTEM.md`.

**Severity:** MEDIUM - Design system consistency

---

### 14. Frontend IIFE Pattern (Unchanged from v0.10.1)

**Location:** `static/js/*.js`

All JavaScript uses IIFEs and global `window` attachment:

```javascript
const Crypto = (() => { ... })();
window.Crypto = Crypto;
```

**Problems:**
- No module system
- Global namespace pollution (20+ globals)
- Load order dependencies
- Cannot tree-shake
- Hard to unit test

**Note:** Moving to ES modules would require significant refactoring of templates. Consider for v2.0.

**Severity:** MEDIUM - Long-term maintainability

---

## Low Priority Issues

### 15. Unused `_csp_nonce` Generation

**Location:** `app/middleware/security.py:24-26`

```python
nonce = secrets.token_urlsafe(16)
request.state.csp_nonce = nonce
# But never used in CSP or templates
```

The nonce is generated but not applied. Either use it or remove the dead code.

**Severity:** LOW - Dead code

---

### 16. Incomplete Playwright E2E Infrastructure

**Location:** `tests/e2e/`

The E2E test infrastructure is scaffolded but minimal:
- Only smoke tests exist
- No actual user flow tests
- Skipped by default in pytest

**Severity:** LOW - Test coverage gap

---

### 17. No API Documentation Generation

The OpenAPI spec is available at `/docs` but:
- No versioned API documentation website
- No client SDK generation
- Response examples are missing

**Severity:** LOW - Developer experience

---

### 18. Missing Cleanup for Old TaskInstances — ✅ FIXED (v0.25.0)

**Location:** `app/tasks/recurring.py`

**Resolution:** Added `cleanup_old_instances()` function that:
- Runs alongside the hourly materialization job
- Deletes completed/skipped instances older than 90 days (`INSTANCE_RETENTION_DAYS`)
- Keeps pending instances even if old (user may still want to complete them)

**Severity:** LOW - Long-term data growth

---

### 19. Inconsistent Async Session Handling

**Location:** Various routers

Some routes commit explicitly:
```python
await db.commit()
```

Others rely on implicit behavior. This inconsistency could lead to data loss if exceptions occur.

**Recommended:** Establish clear pattern: explicit commit on success, rollback on failure.

**Severity:** LOW - Code consistency

---

### 20. No Health Check for External Services — ✅ FIXED (v0.25.0)

**Location:** `app/main.py`

**Resolution:** Enhanced `/ready` endpoint to include:
- Database connectivity check (required for readiness)
- Google Calendar status (informational - counts connected users)
- Returns structured `checks` object with individual service status
- Supports degraded mode (returns 503 only if critical services fail)

**Severity:** LOW - Operational visibility

---

### 21. Build Manifest Version Staleness — ✅ FIXED (v0.25.0)

**Location:** `.github/workflows/release.yml`

**Resolution:** The `update-manifest` job in the release workflow:
- Runs automatically after each successful release
- Regenerates `static/build-manifest.json` using `scripts/generate_build_manifest.py`
- Commits and pushes the updated manifest to master
- Production deployments always have accurate version info

**Severity:** LOW - Build verification feature

---

## What Was Fixed Since v0.10.1

| Issue | Status | Version |
|-------|--------|---------|
| In-memory WebAuthn challenge storage | FIXED | v0.12.0 |
| No database migrations | FIXED | v0.13.0 |
| No rate limiting | FIXED | v0.12.0 |
| PBKDF2 iterations (100k) | UPGRADED to 600k | v0.12.0, v0.16.0 |
| No API versioning | FIXED | v0.15.0 |
| Missing database indexes | FIXED | v0.11.0 |
| N+1 queries in analytics | FIXED | v0.14.0 |
| Backup import validation | FIXED | v0.11.0 |
| No health endpoint | FIXED | v0.11.0 |
| No structured logging | FIXED | v0.18.0 |
| No metrics/monitoring | FIXED (Prometheus) | v0.18.0 |
| Version drift | FIXED | v0.11.0 |
| Mixed concerns in pages.py | IMPROVED | v0.15.0 |
| Calendar sync blocking | IMPROVED (caching) | v0.14.0 |
| Instance materialization | IMPROVED (background) | v0.14.0 |
| Dev dependencies (pyright) | FIXED | v0.11.0 |
| Missing input validation | FIXED | v0.20.0 |
| Token refresh race condition | FIXED | v0.21.0 |
| Calendar not paginated | FIXED | v0.21.0 |
| DB pool not configurable | FIXED | v0.22.0 |
| Missing external_id index | FIXED | v0.22.0 |
| Test DB mismatch | FIXED | v0.23.0 |
| No CSRF protection | FIXED | v0.24.0 |
| Inconsistent JS error handling | FIXED | v0.24.0 |
| Hardcoded impact colors | FIXED | v0.24.0 |
| Magic numbers in analytics | FIXED | v0.25.0 |
| Missing TaskInstance cleanup | FIXED | v0.25.0 |
| No external service health checks | FIXED | v0.25.0 |
| Build manifest staleness | FIXED | v0.25.0 |

---

## Architecture Strengths

1. **Clean Service Layer** - TaskService, AnalyticsService, etc. properly separate concerns
2. **Multitenancy** - Consistent `user_id` filtering throughout
3. **Type Safety** - Full Pyright/Pydantic typing
4. **Modern Stack** - Python 3.13, FastAPI, SQLAlchemy 2.0 async
5. **Documentation** - Excellent CLAUDE.md, comprehensive README
6. **Security Headers** - Good CSP, X-Frame-Options, etc.
7. **E2E Encryption** - Well-architected key wrapping for passkeys
8. **Observability** - Prometheus metrics, structured logging, Sentry integration

---

## Recommendations by Priority

### Before v1.0 (Blocking)

1. Add input validation/sanitization for user content
2. Fix token refresh race condition
3. Implement calendar pagination

### Short-term (1-2 sprints)

4. Make database pool configurable
5. Ensure critical tests run on PostgreSQL in CI
6. Standardize JS error handling with user notifications
7. Add index on `external_id`

### Medium-term (Backlog)

8. Investigate safer key storage (IndexedDB)
9. Implement CSRF tokens
10. Add external service health checks
11. Migrate JS to ES modules

---

## Appendix: File Reference

| File | Lines | Purpose | Notable Issues |
|------|-------|---------|----------------|
| `app/main.py` | 229 | FastAPI entrypoint | - |
| `app/models.py` | 428 | SQLAlchemy models | Missing external_id index |
| `app/config.py` | 62 | Settings | - |
| `app/database.py` | 43 | DB engine | Hard-coded pool config |
| `app/services/task_service.py` | 517 | Task CRUD | No input validation |
| `app/services/analytics_service.py` | 693 | Statistics | Magic numbers |
| `app/services/gcal.py` | 162 | Google Calendar | Race condition, no pagination |
| `app/services/backup_service.py` | 343 | Export/Import | Version mismatch, utcnow() |
| `app/routers/tasks.py` | 532 | Task API | No length limits |
| `app/routers/auth.py` | 271 | OAuth | - |
| `app/routers/pages.py` | 754 | Page routes | - |
| `static/js/crypto.js` | 489 | E2E encryption | Key in sessionStorage |
| `tests/conftest.py` | 81 | Test fixtures | SQLite vs PostgreSQL |

---

*Review completed 2026-01-22. Next review recommended after v1.0 release.*
