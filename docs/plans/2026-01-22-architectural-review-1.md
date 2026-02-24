# Whendoist Architectural Review

> Comprehensive security, scalability, and production-readiness assessment.
>
> **Review Date:** 2025-01-22
> **Current Version:** v0.10.1
> **Reviewer:** Claude Opus 4.5

---

## Executive Summary

This document identifies 25 areas of concern across security, scalability, code quality, and production-readiness. Issues are categorized by severity and include recommended remediation approaches.

**Issue Breakdown:**
- 🔴 Critical: 4 issues (blocks production deployment)
- 🟠 High: 4 issues (security/performance risks)
- 🟡 Medium: 7 issues (technical debt)
- 🟣 Low: 10 issues (production polish)

---

## 🔴 Critical Issues

### 1. In-Memory Challenge Storage for WebAuthn

**Location:** `app/routers/passkeys.py:24-38`

```python
# Store challenges temporarily keyed by user_id
# In production, use Redis with TTL
_challenges: dict[int, bytes] = {}
```

**Problem:** WebAuthn challenges are stored in a module-level dict. This:
- **Doesn't survive process restarts** — users mid-authentication will fail
- **Doesn't work with multiple workers** — uvicorn with `--workers 2` breaks passkey authentication entirely
- **No TTL** — challenges accumulate forever (memory leak)
- **Race condition** — concurrent authentications from the same user overwrite each other

**Impact:** Production deployment with load balancers or multiple workers is impossible without data loss.

**Remediation:** Use Redis or database-backed challenge storage with TTL.

---

### 2. No Database Migrations

**Location:** CLAUDE.md documents this as intentional pre-v1.0

The database is dropped and recreated via `Base.metadata.create_all()`. This means:
- **Data loss on schema changes** — any structural change wipes all user data
- **No way to evolve schema safely** — adding a column means users lose everything
- **Impossible to deploy updates to production** with real users

**Impact:** Blocks any production deployment with persistent data.

**Remediation:** Implement Alembic migrations before v1.0.

---

### 3. Session-Based Encryption Key Storage

**Location:** `static/js/crypto.js:170-178`

```javascript
async function storeKey(key) {
    cachedKey = key;
    const keyData = await exportKey(key);
    sessionStorage.setItem(KEY_STORAGE_KEY, keyData);
}
```

**Problem:** The raw AES-256 key is stored in sessionStorage as base64. This is accessible to:
- Any XSS attack (via `sessionStorage.getItem()`)
- Browser extensions
- Developer tools

**Impact:** A single XSS vulnerability exposes all encrypted data.

**Remediation:**
- Use non-extractable CryptoKey objects where possible
- Consider IndexedDB with origin isolation
- Implement CSP headers to mitigate XSS

---

### 4. Backup Import Validation

**Location:** `app/services/backup_service.py:54-145`

**Problems:**
- No validation of data format/types before processing
- Import with `clear_existing=True` permanently deletes all user data **before** validation
- Malformed JSON could cause crashes mid-import
- No transaction rollback on partial failure

**Impact:** A corrupted or malicious backup file could cause permanent data loss.

**Remediation:** Validate entire backup before clearing, use transactions.

---

## 🟠 Security Concerns

### 5. No Rate Limiting

**Location:** All API endpoints

The codebase has no rate limiting on:
- Login attempts (OAuth flows)
- API endpoints
- Password/passphrase verification (`Crypto.unlockEncryption`)
- Task creation

**Risk:** Brute-force attacks on encryption passphrase (offline once salt/test_value obtained).

**Remediation:** Implement slowapi or similar rate limiting middleware.

---

### 6. PBKDF2 Iteration Count

**Location:** `static/js/crypto.js:20`

```javascript
const PBKDF2_ITERATIONS = 100000;  // OWASP minimum, don't reduce
```

While meeting OWASP minimums, modern guidance recommends **600,000+ iterations** for PBKDF2-SHA256 or switching to Argon2id. Current setting allows ~10,000-50,000 guesses/second on modern GPUs.

**Remediation:** Increase to 600,000 or implement Argon2id via WebAssembly.

---

### 7. OAuth State Validation

**Location:** `app/routers/auth.py`

The OAuth state parameter handling should be audited to ensure:
- State is cryptographically random
- State is validated on callback
- State expires after use

**Remediation:** Audit and document OAuth state handling.

---

### 8. Google Token Refresh Race Conditions

**Location:** `app/services/gcal.py`

Token refresh during calendar operations:
- No mutex/lock for concurrent refresh attempts
- Partial state on refresh failure
- No retry mechanism

**Remediation:** Implement token refresh locking and retry logic.

---

## 🟡 Scalability & Performance Issues

### 9. N+1 Query Problem in Analytics

**Location:** `app/services/analytics_service.py`

`get_comprehensive_stats` makes **20+ queries** per page load:
- `_get_all_completions` (2 queries)
- `_get_pending_count` (1 query)
- `_get_domain_breakdown` (3 queries)
- `_get_impact_distribution` (2 queries)
- `_calculate_streaks` (2 queries)
- `_get_heatmap_data` (2 queries)
- `_get_week_comparison` (4 queries)
- `_get_velocity_data` (2 queries)
- `_get_recurring_stats` (N+1 per recurring task)
- `_get_aging_stats` (1 query)

**Remediation:** Use CTEs, window functions, or batch queries.

---

### 10. In-Memory Task Filtering

**Location:** `app/routers/pages.py:389-408`

```python
all_tasks = await task_service.get_tasks(status=None, top_level_only=True)
tasks = [t for t in all_tasks if t.domain_id is not None]
```

Loads all tasks then filters in Python. Should be database filter.

**Remediation:** Add `domain_id IS NOT NULL` filter to query.

---

### 11. Recurring Task Instance Materialization

**Location:** `app/services/recurrence_service.py`

`ensure_instances_materialized()` runs on every dashboard load:
- Queries all recurring tasks
- Calculates next occurrences
- Creates instances if missing

Doesn't scale with many recurring tasks.

**Remediation:** Background job or lazy materialization.

---

### 12. Missing Database Indexes

**Location:** `app/models.py`

No indexes defined. Critical queries do full table scans:

```python
select(Task).where(Task.user_id == user_id, Task.status == "pending")
```

**Required indexes:**
- `Task(user_id, status)`
- `Task(user_id, scheduled_date)`
- `TaskInstance(task_id, instance_date)`
- `Domain(user_id)`

---

### 13. Synchronous Calendar Sync

**Location:** `app/routers/pages.py:513-555`

Google Calendar events fetched synchronously during page load. If Google API is slow, dashboard hangs.

**Remediation:** Cache with background refresh or async JavaScript loading.

---

## 🔵 Architecture & Design Concerns

### 14. Frontend JavaScript Architecture

**Location:** `static/js/*.js`

Every JS file uses IIFEs and attaches to `window`:
```javascript
(function() {
    window.createScheduledTaskElement = createScheduledTaskElement;
})();
```

**Problems:**
- No module system
- Global namespace pollution
- Load order dependencies
- Hard to test
- No tree-shaking

**Remediation:** Migrate to ES modules or bundler (Vite, esbuild).

---

### 15. Mixed Responsibility in pages.py

**Location:** `app/routers/pages.py` (989 lines)

Handles:
- Task grouping logic
- Sorting algorithms
- Date calculations
- Template rendering
- Calendar event processing

**Remediation:** Extract to separate services/utilities.

---

### 16. No API Versioning

**Location:** All `/api/*` endpoints

No version prefix. Breaking changes will break clients with no deprecation path.

**Remediation:** Add `/api/v1/` prefix.

---

### 17. Hardcoded Business Rules

**Locations:**
- `preferences_service.py:62`: `if completed_retention_days not in (1, 3, 7)`
- `analytics_service.py:264`: `impact_counts = {1: 0, 2: 0, 3: 0, 4: 0}`
- `labels.py`: `Clarity = Enum("Clarity", [...])`

**Remediation:** Centralize in constants/config module.

---

### 18. Test Database Mismatch

**Location:** `tests/conftest.py`

```python
engine = create_async_engine("sqlite+aiosqlite:///:memory:")
```

SQLite differs from PostgreSQL in:
- Date/time handling
- JSON support
- Constraint behavior
- Type coercion

**Remediation:** Use testcontainers-python for PostgreSQL tests.

---

### 19. Silent Frontend Errors

**Location:** `static/js/*.js`

Most async operations log errors but don't notify users:
```javascript
} catch (err) {
    log.error(`Failed to delete task ${taskId}:`, err);
}
```

**Remediation:** User-facing error toasts for all operations.

---

## 🟣 Production Readiness Gaps

### 20. No Health Check Endpoint

No `/health` or `/ready` endpoint for:
- Load balancer health checks
- Kubernetes probes
- Deployment verification

---

### 21. No Structured Logging

```python
logger.debug(f"Failed to fetch calendar {selection.calendar_id}: {e}")
```

Needs JSON structured logging with correlation IDs.

---

### 22. No Monitoring/Metrics

No instrumentation for:
- Request latency
- Error rates
- Database query times
- External API latency

---

### 23. Version Drift

`pyproject.toml` says `0.8.0`, CLAUDE.md says `v0.10.1`.

---

### 24. No CORS Configuration

If API used by mobile apps or separate frontend, CORS needs explicit configuration.

---

### 25. Missing Dev Dependencies

pyright runs in CI but isn't in `pyproject.toml` dev dependencies.

---

## Priority Matrix

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| 🔴 Critical | In-memory challenge storage | Medium | Blocks multi-worker |
| 🔴 Critical | No migrations | High | Blocks production |
| 🔴 Critical | Key in sessionStorage | Medium | XSS leaks key |
| 🔴 Critical | Backup import validation | Low | Data loss risk |
| 🟠 High | No rate limiting | Medium | Brute force |
| 🟠 High | Missing indexes | Low | Performance |
| 🟠 High | Analytics N+1 queries | Medium | Slow pages |
| 🟠 High | PBKDF2 iterations | Low | Offline attacks |
| 🟡 Medium | Frontend JS architecture | High | Maintainability |
| 🟡 Medium | SQLite vs Postgres tests | Medium | False confidence |
| 🟡 Medium | No API versioning | Low | Future breaking |
| 🟡 Medium | pages.py mixed concerns | Medium | Maintainability |
| 🟡 Medium | Calendar sync blocking | Medium | UX |
| 🟡 Medium | Instance materialization | Medium | Performance |
| 🟡 Medium | Hardcoded business rules | Low | Maintainability |
| 🟣 Low | Health endpoint | Low | Ops |
| 🟣 Low | Structured logging | Low | Debugging |
| 🟣 Low | Metrics/monitoring | Medium | Observability |
| 🟣 Low | Version sync | Low | Clarity |
| 🟣 Low | CORS config | Low | API clients |
| 🟣 Low | Dev dependencies | Low | DX |
| 🟣 Low | OAuth state audit | Low | Security |
| 🟣 Low | Token refresh locks | Low | Reliability |
| 🟣 Low | Silent frontend errors | Low | UX |
| 🟣 Low | Error boundaries | Low | Reliability |

---

## Next Steps

See `PRODUCTION-ROADMAP.md` for the detailed implementation plan addressing these issues in prioritized stages leading to v1.0.
