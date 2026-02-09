# V1.0 Final Ship Readiness Review — Phase 1: Independent Investigation

**Date:** 2026-02-09
**CI Status:** GREEN — 578 tests pass, 0 ruff/pyright errors

---

## 1. Auth Boundary

### Endpoints Traced

**A. `DELETE /api/v1/tasks/{task_id}` (archive task)**
- Auth: `Depends(require_user)` at `tasks.py:570`
- No session → 401 via `require_user` (`auth.py:54-60`)
- Expired session → Session middleware returns None, `require_user` raises 401
- Wrong user_id → `TaskService.archive_task()` calls `get_task()` which filters `Task.id == task_id, Task.user_id == self.user_id` (`task_service.py:218`). Returns None → 404.
- **CLEAN**: Fully protected.

**B. `POST /api/v1/backup/import` (backup restore)**
- Auth: `Depends(require_user)` at `backup.py:70`
- Service: `BackupService(db, user.id)` at `backup.py:91`. All imports use `self.user_id`.
- **CLEAN**: Fully protected.

**C. `POST /api/v1/import/wipe` (data wipe)**
- Auth: `Depends(get_current_user)` at `import_data.py:83` — note: returns `User | None`, then manual 401 check at line 91-92.
- **FINDING (LOW)**: Uses `get_current_user` (nullable) instead of `require_user` (non-null). Functionally equivalent due to manual check, but inconsistent pattern across 3 import endpoints (lines 83, 155, 220). If the manual check were ever removed by mistake, the endpoint would proceed with `user = None`.

### Areas Investigated and Found Clean
- All state-changing endpoints in `tasks.py`, `domains.py`, `instances.py`, `passkeys.py`, `preferences.py`, `backup.py`, `wizard.py`, `gcal_sync.py` use `Depends(require_user)`.
- Every service class constructor takes `user_id` and every query filters by it.
- Session cookie: `max_age=30 days`, `httponly`, `secure`, `samesite=lax` (`main.py:157-161`).
- `require_user` loads the User from DB on every request (`auth.py:45-60`), so deleted users can't use stale sessions.

---

## 2. Untrusted Input

### Schemas Traced (3 most complex)

**A. `TaskCreate` (16 fields) — `tasks.py:128-179`**
- title: control chars stripped, whitespace stripped, max 500, non-empty — CLEAN
- description: control chars stripped, max 10000 — CLEAN
- duration_minutes: `Field(ge=1, le=1440)` — CLEAN
- impact: `Field(ge=1, le=4)` — CLEAN
- clarity: validated to enum `{"autopilot", "normal", "brainstorm"}` — CLEAN
- **FINDING (MEDIUM)**: `recurrence_rule: dict | None` at line 143 — accepts arbitrary JSON dict with no schema validation, no size limit. Stored directly in JSONB column. An attacker could store a multi-MB JSON object. The `rrule()` call at `recurrence_service.py:116` uses defensive key extraction, but `interval` value at line 87 has no bounds — `interval: 0` or `interval: -1` could cause `rrule` to behave unexpectedly.

**B. `TaskUpdate` (15 fields) — `tasks.py:182-230`**
- **FINDING (MEDIUM)**: `clarity: str | None` at line 190 — NO validator. `TaskCreate` validates clarity at line 167-171, but `TaskUpdate` does not. Any string up to 20 chars (SQL column limit) can be stored. This is a validation gap between create and update paths.
- **FINDING (MEDIUM)**: `recurrence_rule: dict | None` — same arbitrary dict issue as `TaskCreate`.
- **FINDING (LOW)**: `position: int | None` at line 199 — no `ge`/`le` bounds. Extreme values accepted.

**C. `BackupTaskSchema` (18 fields) — `backup_service.py:47-68`**
- **FINDING (MEDIUM)**: `status: str` at line 55 — no enum validation. Valid values should be `{"pending", "completed", "archived"}`. Any string up to 20 chars accepted. Invalid statuses would make tasks invisible to status-based queries.
- **FINDING (MEDIUM)**: `clarity: str | None` at line 56 — no enum validation (same gap as TaskUpdate).
- **FINDING (LOW)**: `impact: int | None` at line 57 — no range validation (should be 1-4).
- **FINDING (LOW)**: `duration_minutes: int | None` at line 58 — no range validation (should be 1-1440).
- **FINDING (LOW)**: `external_id: str | None` and `external_source: str | None` at lines 65-66 — no max_length. SQL columns are String(255) and String(50); PostgreSQL will reject overlength values with DataError.

**D. `TaskContentData` (batch encryption) — `tasks.py:377-383`**
- **FINDING (MEDIUM)**: `title: str` and `description: str | None` have NO validators at all — no control char stripping, no max_length, no empty check. A 10MB title string would be accepted. Used by `POST /api/v1/tasks/batch-update` at line 730. The batch is capped at 5000 items but individual item sizes are unbounded.

### Cross-cutting: No SQL injection found. All queries use SQLAlchemy ORM parameterization. Jinja2 autoescaping is active; no `|safe` filter usage found.

---

## 3. Data Lifecycle (Task entity)

### Create → Read → Update → Soft-Delete → Hard-Delete → Wipe

**Create**: `TaskService.create_task()` at `task_service.py:227-286`. Sets `user_id`, creates Task + TaskInstance rows (if recurring) + async GCal sync. All paths (Todoist import, backup import, demo) correctly set `user_id`. CLEAN.

**Read**: `get_tasks()` at `task_service.py:123-212` always filters by `user_id`. Uses `selectinload` for subtasks, domain, parent — no N+1. CLEAN.

**Update**: `update_task()` at `task_service.py:288-325` uses field whitelist (`UPDATABLE_FIELDS`). Gets task via `get_task()` which filters by `user_id`. CLEAN.

**Soft-Delete (Archive)**: `archive_task()` at `task_service.py:360-371` sets `status="archived"`. `_archive_subtasks()` recursively archives children.
- **FINDING (MEDIUM)**: `get_instances_for_range()` at `recurrence_service.py:219-236` joins Task but does NOT filter `Task.status != "archived"`. Pending instances for archived tasks will still appear in calendar/instance views.

**Hard-Delete**: `delete_task()` at `task_service.py:424-432` exists but has **zero callers**. Dead code. DB cascades are correctly configured (`ondelete="CASCADE"` on all FKs). If called, would orphan Google Calendar events since it doesn't call the GCal unsync path.

**Data Wipe**: Three different implementations with inconsistent cleanup:
- **FINDING (MEDIUM)**: `BackupService._clear_user_data()` at `backup_service.py:325-333` does NOT delete `GoogleCalendarEventSync` records or clean up Google Calendar events. After backup restore, old GCal events become permanent orphans.
- Import wipe endpoint (`import_data.py:78-147`) correctly handles GCal cleanup.
- Demo reset (`demo_service.py:110-122`) is the most thorough — deletes all 10 record types.

### Subtask cascade: `cascade="all, delete-orphan"` + `ondelete="CASCADE"` — correctly configured at both ORM and DB levels.

---

## 4. Error Paths

### Endpoints Traced

**A. Todoist Import (`POST /api/v1/import/todoist`)**
- Multi-step: fetch token → call Todoist API (3 calls) → create domains → create tasks → commit.
- Transaction: single try/except with rollback. No partial writes on failure. CLEAN.
- **FINDING (MEDIUM)**: `str(e)` of any exception is returned to client in `ImportResponse.errors` at `todoist_import.py:149`. Could leak internal network details, API URLs, or DB error messages.
- **FINDING (LOW)**: Todoist HTTP client at `todoist.py:76-79` has no explicit timeout (uses httpx default ~5s per phase). Pagination loops at lines 171-189, 196-223 have no upper bound on pages fetched.

**B. GCal Sync Enable (`POST /api/v1/gcal-sync/enable`)**
- Multi-step: validate → create calendar → delete old sync records → update prefs → commit → background bulk sync.
- **FINDING (MEDIUM)**: If background bulk sync fails after creating some GCal events but before commit (`gcal_sync.py:114-154`), events orphan in Google Calendar. Eventually self-healing on re-enable.

**C. Backup Restore (`POST /api/v1/backup/import`)**
- Uses `begin_nested()` savepoint pattern — excellent. Partial import failures rollback correctly.
- **FINDING (MEDIUM)**: `BackupValidationError` is caught by generic `except Exception` at `backup.py:103`, returning HTTP 500 instead of 400. Specific validation messages are discarded.
- Size limit checked before JSON parse (10MB) — good defense against memory exhaustion.

### Cross-cutting: Global exception handler at `main.py:173-183` returns generic "Internal server error" — no stack trace leakage. All retry loops are properly bounded (max 3 retries).

---

## 5. Client-Server Contract

### Modules Traced

**A. `task-dialog.js`** — 7 API calls
- All mutations use `safeFetch()` — CSRF protected. CLEAN.
- Error handling: all calls in try/catch with `handleError()`, buttons disabled during async operations. CLEAN.
- **Finding cross-ref**: Sends `clarity` on task updates — server accepts any string due to missing `TaskUpdate` validator (see Finding in Section 2).

**B. `drag-drop.js`** — 5 API calls
- All mutations use `safeFetch()` — CSRF protected. CLEAN.
- Error handling: optimistic UI with rollback on failure. CLEAN.
- **FINDING (LOW)**: `executeDeleteNow` referenced in retry callback at `drag-drop.js:503` but actual function is named `executeDelete` at line 472. Retry button will throw `ReferenceError`.

**C. `task-complete.js`** — 4 API calls
- All mutations use `safeFetch()` — CSRF protected. CLEAN.
- **FINDING (MEDIUM)**: No double-click protection on completion gutter at `task-complete.js:54-76`. No debounce, throttle, or disabled state. Rapid clicks can cause concurrent `toggle-complete` API calls. Compare with `task-dialog.js` which properly disables buttons.

### CSRF coverage: All POST/PUT/DELETE/PATCH methods require `X-CSRF-Token` header (`csrf.py:33`). `safeFetch()` auto-injects it (`error-handler.js:276-287`). HTMX requests also get CSRF via `htmx:configRequest` listener. No raw `fetch()` calls found outside `safeFetch`. Exempt paths are only OAuth callbacks and health endpoints. CLEAN.

---

## 6. State Consistency

### Critical Findings

**A. WebAuthn Challenge Reuse (MEDIUM-HIGH)**
- `get_and_consume_challenge()` at `challenge_service.py:44-63` reads challenge, stores value, then deletes record. No `SELECT FOR UPDATE` or atomic delete-and-return. Two concurrent requests could both read the same challenge, enabling replay attacks. Mitigated by WebAuthn's built-in nonce checks, but the non-atomic pattern is a design weakness.

**B. Bulk Sync vs Concurrent Task Creation (MEDIUM-HIGH)**
- `bulk_sync()` at `gcal_sync.py:444-787` reads all tasks at start, processes them over minutes. Tasks created during sync get their fire-and-forget sync records. At the end, bulk sync deletes "orphaned" records for tasks not in its stale snapshot — incorrectly deleting the new task's sync record and GCal event.

**C. Concurrent Fire-and-Forget GCal Sync (MEDIUM)**
- `sync_task()` at `gcal_sync.py:178-282` checks if sync record exists, then creates/updates. Two concurrent fire-and-forget tasks (from rapid updates) can both read "no record" and both create, resulting in duplicate Google Calendar events.

**D. Partial Encryption Batch (MEDIUM)**
- `batch_update_tasks` at `tasks.py:730-788` commits every 25 items. Server crash mid-operation leaves some tasks encrypted and others plaintext. No way to detect or resume from partial state.

**E. Task Update Recurrence TOCTOU (MEDIUM)**
- `PUT /api/v1/tasks/{task_id}` at `tasks.py:498-564` reads task, saves `old_rule`, then calls `update_task` which reads again. Concurrent update could change recurrence between reads, causing incorrect instance regeneration decisions.

**F. Materialization IntegrityError Rollback Scope (MEDIUM)**
- `materialize_instances()` at `recurrence_service.py:179-186` catches `IntegrityError` from duplicate instance and calls `db.rollback()`. This rolls back ALL pending changes in the session, not just the failed insert — losing all previously-created instances in that batch.

### No optimistic concurrency (no version columns, no ETags) across any model. Last-write-wins on all updates.

---

## Summary Table

| # | Severity | Area | Finding | Evidence |
|---|----------|------|---------|----------|
| 1 | **MEDIUM-HIGH** | State | WebAuthn challenge non-atomic consume | `challenge_service.py:44-63` |
| 2 | **MEDIUM-HIGH** | State | Bulk sync deletes new tasks' GCal records | `gcal_sync.py:444-787` |
| 3 | **MEDIUM** | Input | `recurrence_rule: dict` accepts arbitrary unbounded JSON | `tasks.py:143,196` |
| 4 | **MEDIUM** | Input | `TaskUpdate.clarity` missing enum validation | `tasks.py:190` |
| 5 | **MEDIUM** | Input | `BackupTaskSchema.status` accepts any string | `backup_service.py:55` |
| 6 | **MEDIUM** | Input | `TaskContentData` batch update bypasses all validation | `tasks.py:377-383` |
| 7 | **MEDIUM** | Lifecycle | Archived task instances appear in calendar views | `recurrence_service.py:219-236` |
| 8 | **MEDIUM** | Lifecycle | Backup import doesn't clean GCal events | `backup_service.py:325-333` |
| 9 | **MEDIUM** | Error | Todoist import leaks `str(e)` to client | `todoist_import.py:149` |
| 10 | **MEDIUM** | Error | Backup validation error returns 500 not 400 | `backup.py:103` |
| 11 | **MEDIUM** | Error | GCal enable orphans events on background failure | `gcal_sync.py:114-154` |
| 12 | **MEDIUM** | Contract | No double-click protection on completion gutter | `task-complete.js:54-76` |
| 13 | **MEDIUM** | State | Concurrent fire-and-forget creates duplicate GCal events | `gcal_sync.py:178-282` |
| 14 | **MEDIUM** | State | Partial encryption batch leaves mixed state | `tasks.py:730-788` |
| 15 | **MEDIUM** | State | Task update recurrence TOCTOU | `tasks.py:498-564` |
| 16 | **MEDIUM** | State | Materialization rollback loses valid instances | `recurrence_service.py:179-186` |
| 17 | LOW | Auth | `import_data.py` uses nullable auth pattern | `import_data.py:83` |
| 18 | LOW | Input | `position` fields unbounded | `tasks.py:199`, `domains.py:63` |
| 19 | LOW | Input | Backup `impact`/`duration_minutes` unbounded | `backup_service.py:57-58` |
| 20 | LOW | Contract | `executeDeleteNow` undefined in retry callback | `drag-drop.js:503` |
| 21 | LOW | Error | Todoist pagination loops unbounded | `todoist.py:171-189` |
| 22 | LOW | Error | No explicit timeout on Todoist/OAuth HTTP clients | `todoist.py:76`, `google.py:56` |
| 23 | LOW | State | No optimistic concurrency (no version/ETag) | Global |

### Areas Found Clean
- **Multitenancy**: All queries filter by `user_id` — thoroughly checked across all services
- **SQL injection**: All queries use SQLAlchemy ORM parameterization
- **XSS**: Jinja2 autoescaping active, no `|safe` usage
- **CSRF**: Comprehensive coverage via `safeFetch` + middleware
- **Session security**: httponly, secure, samesite=lax, 30-day expiry, DB-validated
- **Rate limiting**: Applied to destructive endpoints
- **File upload**: Size limit enforced before parsing
- **Cascade deletes**: Correctly configured at both ORM and DB levels

---

# Phase 2: Adversarial Scenarios

## Attacker Scenarios

### A1: Can I read/modify/delete another user's data?

**Verdict: NO.** Every service class constructor takes `user_id` from the authenticated session. Every SQL query includes `user_id` in its WHERE clause. There is no endpoint that accepts a `user_id` parameter from the request body.

Specifically verified:
- `TaskService(db, user.id)` → all queries filter `Task.user_id == self.user_id`
- `RecurrenceService(db, user.id)` → all instance queries join Task and filter by user_id
- `BackupService(db, user.id)` → export/import scoped to user
- `PasskeyService(db, user.id)` → all passkey queries filter by user_id
- Batch endpoints silently skip unowned IDs (per CLAUDE.md rules)

**Evidence**: Checked all 17 service files. Zero cross-tenant data access paths found.

### A2: Stolen session cookie — blast radius?

**Verdict: FULL ACCOUNT ACCESS except encryption keys.**

With a valid session cookie, an attacker can:
- Read all tasks, domains, preferences, labels (via dashboard page or API)
- Create, modify, delete tasks
- Trigger data wipe (`POST /api/v1/import/wipe`)
- Export full backup (`GET /api/v1/backup/export`)
- Change preferences (timezone, theme, etc.)
- Enable/disable GCal sync

**Cannot**:
- Read encrypted task content (decryption happens client-side; keys are in the browser, not the session)
- Change password (there is no password — auth is via Google OAuth only)
- Register new passkeys (requires WebAuthn ceremony with PRF extension, which needs the encryption key)

**Mitigation**: Session is cookie-based with 30-day expiry. There is no "revoke all sessions" feature. No re-authentication for destructive operations like data wipe.

**FINDING (MEDIUM)**: No re-authentication required for data wipe. A stolen session can wipe all user data with a single API call. The wipe endpoint has rate limiting but no confirmation mechanism (confirmation is client-side only).

### A3: CSRF / Clickjacking

**Verdict: CSRF well-protected. Clickjacking partially protected.**

CSRF: All state-changing requests require `X-CSRF-Token` header. The token is stored in a meta tag (`<meta name="csrf-token">`) and injected by `safeFetch()`. Standard CSRF via form submission or image tags cannot include custom headers. **CLEAN.**

Clickjacking: Security headers middleware at `security.py` sets:
- `X-Frame-Options: DENY` — prevents framing entirely
- `Content-Security-Policy` includes `frame-ancestors 'none'`
**CLEAN.**

### A4: HTML injection / XSS

**Verdict: Well-protected.**

- Jinja2 autoescaping is enabled by default (FastAPI's `Jinja2Templates`)
- No `|safe` filter usage found in any template
- `|tojson` filter used for JS context — safe (produces JSON)
- Task titles in `data-*` attributes are HTML-entity-escaped by autoescaping
- **Potential vector**: Multiple JS files use `innerHTML` with template literals (e.g., `drag-drop.js:938`, `recurrence-picker.js:39`). If user-controlled data flows into these without escaping, XSS is possible. However, task data enters JS via `data-*` attributes (pre-escaped) or JSON API responses (not HTML-decoded). **Risk is low but not zero** — a thorough innerHTML audit would need to trace every data-* attribute read into innerHTML.

### A5: DoS against specific user

**Verdict: Rate limiting provides moderate protection.**

Cheapest attacks:
1. `POST /api/v1/tasks` — task creation is rate-limited per `TASK_MUTATION_LIMIT` (likely 30/minute based on other limits). Could create ~30 tasks/minute.
2. `GET /api/v1/tasks` — reading tasks is less restricted. With 500+ tasks, each page load queries tasks + instances + domains. Not particularly expensive.
3. `POST /api/v1/tasks/{id}/toggle-complete` — toggle endpoints are rate-limited. But rapid toggling with no debounce (Finding #12) means client-side double-clicks could amplify.

**Most effective DoS vector**: `POST /api/v1/import/todoist` — triggers multiple external API calls, heavy DB writes, and is rate-limited but at a higher threshold. An attacker with a valid session could trigger repeated imports.

The DB statement timeout is 30 seconds (`database.py:29`), preventing individual query runaway.

---

## Frustrated User Scenarios

### F1: Accidentally wiped data — can I recover?

**Verdict: NO automatic recovery. Backup export is the only safety net.**

- The wipe endpoint (`POST /api/v1/import/wipe`) permanently deletes all tasks, instances, and domains.
- There is no server-side "trash" or undo period — the DELETE SQL statements execute immediately.
- The client shows a confirmation dialog before wipe, but there is no server-side confirmation mechanism.
- **If the user has a backup export**: They can restore via `POST /api/v1/backup/import`.
- **If no backup exists**: Data is permanently lost.

**FINDING (LOW)**: No automatic backup-before-wipe. The server could create an auto-backup before wiping, giving users a recovery path.

### F2: Forgot encryption passphrase

**Verdict: Data is PERMANENTLY INACCESSIBLE.**

- Encryption is client-side (AES-GCM via `crypto.js`). The master key is derived from the passphrase via PBKDF2.
- The server stores only encrypted ciphertext — it cannot decrypt.
- If passkeys exist, the PRF-derived key can unwrap the master key. But if no passkeys and passphrase is forgotten, encrypted titles/descriptions are permanently garbled.
- The user can disable encryption (which attempts to re-encrypt as plaintext), but this requires the key to be present in the browser.

**This is by design** — E2E encryption means the server cannot help with key recovery. The UI should clearly warn about this.

### F3: 500 tasks + GCal sync — does it work?

**Verdict: YES, with caveats.**

- `bulk_sync()` processes all tasks/instances in a single background operation with adaptive rate throttling.
- `_AdaptiveThrottle` at `gcal_sync.py:108-152` starts with no delay and backs off on rate limits.
- Google Calendar API quota: ~1800 requests/minute for insert/update. With 500 tasks, bulk sync should complete in under a minute.
- Token expiration: `_ensure_valid_token()` at `gcal.py:188-218` proactively refreshes tokens when expired. Has 3 retries with 2-second backoff.
- Per-operation timeout: 30 seconds on the HTTP client (`gcal.py:97`).
- Overall timeout: `MATERIALIZATION_TIMEOUT_SECONDS` bounds the periodic job.

**FINDING**: If the user has 500 recurring tasks with 60 days of instances each (30,000 instances), the bulk sync could hit Google's daily quota limit. The sync would auto-disable with an error message.

### F4: Offline + tap complete/delete

**Verdict: Error shown, no data loss.**

- `task-complete.js:87-92` checks `navigator.onLine` before mutations and shows "No network — action not sent."
- `drag-drop.js:712-717` has the same offline check.
- `task-dialog.js` checks offline before submit, complete, and delete.
- If the network drops mid-request, `safeFetch()` catches the error and `handleError()` shows a toast with retry option.
- **No offline queue**: Actions are simply rejected. The user must retry when online.

### F5: Export backup, make changes, then import backup — what's lost?

**Verdict: ALL changes since the export are lost.**

- `import_all(data, clear_existing=True)` at `backup_service.py:198-323` first calls `_clear_user_data()` which deletes ALL tasks, instances, domains, and preferences.
- It then imports the backup data, which contains the state at export time.
- Any tasks created, modified, completed, or deleted after the export are permanently lost.
- The `begin_nested()` savepoint ensures atomicity — if import fails, the user's current data is restored.

**FINDING (MEDIUM)**: The backup import UI warns "This will replace all existing data!" but there is no option for a merge import. The import is always destructive.

---

## Additional Phase 2 Findings

| # | Severity | Finding | Evidence |
|---|----------|---------|----------|
| 24 | **MEDIUM** | No re-auth for data wipe — stolen session can wipe everything | `import_data.py:78-92` |
| 25 | LOW | No auto-backup before data wipe | `import_data.py:78-147` |
| 26 | LOW | innerHTML usage in JS with user data — XSS risk not fully audited | `drag-drop.js:938`, `recurrence-picker.js:39` |
