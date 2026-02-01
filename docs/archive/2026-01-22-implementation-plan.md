# Whendoist v0.20.0 → v1.0.0 Implementation Plan

> Staged implementation of architectural improvements identified in the January 2026 review.
>
> **Created:** 2026-01-22
> **Reference:** `docs/ARCHITECTURAL-REVIEW-2026-01.md`

## Overview

Address 21 architectural issues in 6 stages, incrementing minor version each stage.

**Before each commit:**
```bash
uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test
```

**Thinking guidance:**
| Stage | Extended Thinking? | Reason |
|-------|-------------------|--------|
| 1 - Input Validation | No | Straightforward Pydantic validators |
| 2 - Calendar Robustness | **Yes** | Token refresh locking needs careful race condition analysis |
| 3 - Database & Performance | No | Simple config + migration |
| 4 - Testing Infrastructure | No | CI configuration is well-documented |
| 5 - Security Hardening | **Yes** | CSRF implementation has multiple valid approaches |
| 6 - Operational Polish | No | Small discrete tasks |

---

## Stage 1: Input Validation & Sanitization (v0.20.0)

**Priority:** CRITICAL - Security
**Effort:** Low
**Issues addressed:** #2 (Missing input validation)

### Tasks

1. Add Pydantic validators to `TaskCreate` and `TaskUpdate` in `app/routers/tasks.py`:
   - `title`: max_length=500, min_length=1, strip whitespace
   - `description`: max_length=10000
   - Strip control characters except `\n` and `\t`

2. Add validators to domain schemas in `app/routers/domains.py`:
   - `name`: max_length=255, min_length=1

3. Add validators to backup schemas in `app/services/backup_service.py`

4. Add rate limiting to task creation: `@limiter.limit("30/minute")` on POST /tasks

5. Add tests in `tests/test_input_validation.py`:
   - Test max length rejection
   - Test empty string rejection
   - Test control character stripping

### Files to modify
- `app/routers/tasks.py`
- `app/routers/domains.py`
- `app/services/backup_service.py`
- `tests/test_input_validation.py` (new)

### Commit message
```
feat: v0.20.0 - Input Validation

## Added
- Max length validators for task titles (500) and descriptions (10000)
- Max length validator for domain names (255)
- Control character stripping from user input
- Rate limiting on task creation (30/min)
- Input validation test suite

## Security
- Prevents storage abuse via oversized content
- Reduces XSS surface area
```

---

## Stage 2: Google Calendar Robustness (v0.21.0)

**Priority:** HIGH - Data correctness & reliability
**Effort:** Medium
**Issues addressed:** #3 (Token refresh race), #4 (Calendar not paginated)

### Tasks

1. Implement calendar pagination in `app/services/gcal.py`:
   - Add `nextPageToken` handling in `get_events()`
   - Loop until no more pages
   - Add `max_events` parameter with sensible default (1000)

2. Fix token refresh race condition:
   - Add database-based lock using `FOR UPDATE SKIP LOCKED` or advisory lock
   - Implement retry with exponential backoff (3 attempts, 1s/2s/4s)
   - Handle refresh token rotation (Google may return new refresh token)

3. Add proactive token refresh (refresh if expiring within 5 minutes)

4. Add tests in `tests/test_gcal.py`:
   - Test pagination handling (mock responses with nextPageToken)
   - Test concurrent refresh protection
   - Test retry on failure

### Files to modify
- `app/services/gcal.py`
- `app/auth/google.py` (retry logic)
- `tests/test_gcal.py` (new)

### Commit message
```
feat: v0.21.0 - Google Calendar Robustness

## Added
- Event pagination support (handles >250 events)
- Token refresh locking (prevents race conditions)
- Retry with exponential backoff for refresh failures
- Proactive token refresh (5 min before expiry)

## Fixed
- Race condition when multiple requests trigger token refresh
- Data truncation for users with busy calendars
```

---

## Stage 3: Database & Performance (v0.22.0)

**Priority:** HIGH - Scalability
**Effort:** Low-Medium
**Issues addressed:** #5 (DB pool config), #11 (external_id index), #7 (backup version), #12 (utcnow)

### Tasks

1. Make database pool configurable in `app/config.py`:
   ```python
   db_pool_size: int = 5
   db_max_overflow: int = 10
   db_pool_recycle: int = 300
   ```

2. Update `app/database.py` to use config values

3. Add index on `external_id` - create migration:
   ```bash
   just migrate-new "add_external_id_index"
   ```
   Add: `Index("ix_task_user_external", "user_id", "external_id")`

4. Add Prometheus metrics for connection pool:
   - `whendoist_db_pool_size`
   - `whendoist_db_pool_checkedout`

5. Update `.env.example` with pool configuration

6. Fix `datetime.utcnow()` in `backup_service.py` → `datetime.now(UTC)`

7. Fix backup service VERSION - import from `app.__version__`

### Files to modify
- `app/config.py`
- `app/database.py`
- `app/services/backup_service.py`
- `app/metrics.py`
- `alembic/versions/xxx_add_external_id_index.py` (new)
- `.env.example`

### Commit message
```
feat: v0.22.0 - Database & Performance

## Added
- Configurable DB pool via DB_POOL_SIZE, DB_MAX_OVERFLOW, DB_POOL_RECYCLE
- Index on (user_id, external_id) for faster Todoist imports
- Connection pool Prometheus metrics

## Fixed
- Deprecated datetime.utcnow() → datetime.now(UTC)
- Backup service version now synced with app version
```

---

## Stage 4: Testing Infrastructure (v0.23.0)

**Priority:** HIGH - Confidence
**Effort:** Medium
**Issues addressed:** #6 (Test DB mismatch), #16 (E2E coverage)

### Tasks

1. Add PostgreSQL integration tests to CI (`.github/workflows/ci.yml`):
   ```yaml
   services:
     postgres:
       image: postgres:16-alpine
       env:
         POSTGRES_USER: test
         POSTGRES_PASSWORD: test
         POSTGRES_DB: test
       ports:
         - 5432:5432
   ```

2. Mark critical tests with `@pytest.mark.integration`:
   - Task service CRUD operations
   - Backup import/export
   - Encryption multitenancy tests

3. Update `pyproject.toml` pytest configuration:
   ```toml
   [tool.pytest.ini_options]
   markers = [
       "unit: SQLite unit tests (fast)",
       "integration: PostgreSQL integration tests",
       "e2e: Playwright browser tests",
   ]
   ```

4. Add CI job that specifically runs `pytest -m integration`

5. Expand E2E test coverage in `tests/e2e/`:
   - Task CRUD flow test
   - Encryption enable/disable flow test

### Files to modify
- `.github/workflows/ci.yml`
- `pyproject.toml`
- `tests/conftest.py`
- `tests/test_task_service.py` (new)
- `tests/e2e/test_task_crud.py` (new)
- `tests/e2e/test_encryption_flow.py` (new)

### Commit message
```
feat: v0.23.0 - Testing Infrastructure

## Added
- PostgreSQL service in CI workflow
- Integration test marker and CI job
- Task service integration tests
- E2E tests for task CRUD and encryption flows

## Changed
- Critical path tests now run against PostgreSQL in CI
```

---

## Stage 5: Security Hardening (v0.24.0)

**Priority:** MEDIUM - Defense in depth
**Effort:** Medium
**Issues addressed:** #10 (CSRF), #9 (JS errors), #15 (CSP nonce), #13 (hardcoded colors)

### Tasks

1. Implement CSRF protection:
   - Add CSRF token generation to session
   - Add `csrf_token` hidden field to all forms
   - Validate token on POST/PUT/DELETE requests
   - Return 403 on mismatch

2. Standardize JavaScript error handling:
   - Create `static/js/error-handler.js` utility:
     ```javascript
     window.handleError = (error, userMessage) => {
         console.error(error);
         Toast.show(userMessage || 'Something went wrong', 'error');
     };
     ```
   - Update all catch blocks to use this

3. Remove unused CSP nonce generation in `app/middleware/security.py`:
   - Delete lines 24-26 (nonce generation that's never used)

4. Move hardcoded colors to constants:
   - Add `IMPACT_COLORS` to `app/constants.py`
   - Update `analytics_service.py` to use it

5. Add CSRF protection tests

### Files to modify
- `app/middleware/security.py`
- `app/routers/auth.py` (add CSRF validation)
- `app/templates/base.html` (add CSRF meta tag)
- `app/templates/*.html` (add CSRF to forms)
- `static/js/error-handler.js` (new)
- `static/js/*.js` (update error handling)
- `app/constants.py`
- `app/services/analytics_service.py`
- `tests/test_csrf.py` (new)

### Commit message
```
feat: v0.24.0 - Security Hardening

## Added
- CSRF token protection for all forms
- Standardized JS error handling with user notifications
- IMPACT_COLORS constant for design system consistency

## Removed
- Unused CSP nonce generation code

## Security
- Defense in depth against CSRF attacks
```

---

## Stage 6: Operational Polish (v0.25.0) ✅ COMPLETE

**Priority:** LOW - Polish
**Effort:** Low
**Issues addressed:** #8 (magic numbers), #18 (instance cleanup), #20 (health checks), #21 (build manifest)

### Tasks — All Completed

1. ✅ **External service health checks** - Enhanced `/ready` endpoint with:
   - Database connectivity check (required)
   - Google Calendar status (informational)
   - Structured `checks` object in response

2. ✅ **TaskInstance cleanup job** - Added `cleanup_old_instances()` in `app/tasks/recurring.py`:
   - Deletes completed/skipped instances older than 90 days
   - Runs alongside hourly materialization
   - Constant `INSTANCE_RETENTION_DAYS = 90` in constants.py

3. ✅ **Analytics constants** - Added to `app/constants.py`:
   ```python
   HEATMAP_WEEKS = 12
   VELOCITY_DAYS = 30
   RECURRING_STATS_LIMIT = 10
   TITLE_TRUNCATE_LENGTH = 40
   ```

4. ✅ **Build manifest automation** - Already implemented in release workflow's `update-manifest` job

5. ✅ **Documentation updates**:
   - README.md: Enhanced health check documentation
   - ARCHITECTURAL-REVIEW-2026-01.md: Marked all Stage 6 issues as fixed
   - PRODUCTION-ROADMAP.md: Updated with v1.0.0 completion

6. ✅ **Version: v0.25.0** - Operational polish complete

### Files to modify
- `app/main.py` (health checks)
- `app/tasks/recurring.py` (cleanup job)
- `app/constants.py`
- `app/services/analytics_service.py`
- `.github/workflows/release.yml`
- `README.md`
- `docs/ARCHITECTURAL-REVIEW-2026-01.md`
- `docs/PRODUCTION-ROADMAP.md`

### Commit message (if v1.0.0)
```
feat: v1.0.0 - Production Ready

## Added
- External service health checks (degraded mode support)
- TaskInstance cleanup job (90-day retention)
- Centralized analytics constants

## Changed
- Build manifest now auto-generated in CI

## Documentation
- Updated README with new environment variables
- Marked all addressed issues in architectural review

🎉 First stable release
```

---

## Future Consideration (Post v1.0)

These are bigger architectural changes, suitable for v2.0 planning:

### Encryption Key Storage Investigation
- Research IndexedDB with origin isolation
- Evaluate Web Crypto non-extractable keys
- Consider WebAuthn PRF as sole unlock method

### ES Modules Migration
- Replace IIFEs with proper ES module imports
- Add bundler (Vite or esbuild)
- Enable tree-shaking

### API Documentation
- Generate documentation site from OpenAPI spec
- Add client SDK generation
- Publish to docs subdomain

---

## Quick Reference

```bash
# Start a stage
git checkout -b stage-N-description

# After implementation
uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test

# Commit
git add -A && git commit  # Use provided message

# Merge
git checkout master && git merge stage-N-description
git tag vX.Y.0
git push origin master --tags
```
