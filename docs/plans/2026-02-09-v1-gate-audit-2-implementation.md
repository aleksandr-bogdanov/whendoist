# V1.0 Gate Audit #2 — Implementation Plan

> For Sonnet. Each task is a separate PR following the project's versioned PR workflow.
> Before each commit: `uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test`

---

## PR 1: Rate limit unprotected destructive endpoints

**Version bump:** patch (e.g. 0.42.11)
**Type:** fix
**Risk:** Low — additive change, no behavior modification
**Time:** ~15 minutes

### What to do

Add rate limit decorators to 6 endpoints that currently have none.

### File: `app/routers/import_data.py`

Add import at top if not present:
```python
from app.middleware.rate_limit import limiter, BACKUP_LIMIT, get_user_or_ip
```

Add decorator to these 3 endpoints:

1. **`POST /wipe`** (the `wipe_user_data` function) — add before the function:
   ```python
   @limiter.limit(BACKUP_LIMIT, key_func=get_user_or_ip)
   ```

2. **`GET /todoist/preview`** (the `preview_todoist_import` function) — add:
   ```python
   @limiter.limit(BACKUP_LIMIT, key_func=get_user_or_ip)
   ```

3. **`POST /todoist`** (the `import_todoist` function) — add:
   ```python
   @limiter.limit(BACKUP_LIMIT, key_func=get_user_or_ip)
   ```

All 3 endpoints need `request: Request` added to their function signature if not already present (slowapi requires it).

### File: `app/routers/gcal_sync.py`

Add import at top if not present:
```python
from app.middleware.rate_limit import limiter, BACKUP_LIMIT, get_user_or_ip
```

Add decorator to these 3 endpoints:

1. **`POST /enable`** — add `@limiter.limit(BACKUP_LIMIT, key_func=get_user_or_ip)`
2. **`POST /disable`** — add `@limiter.limit(BACKUP_LIMIT, key_func=get_user_or_ip)`
3. **`POST /sync`** (full-sync) — add `@limiter.limit(BACKUP_LIMIT, key_func=get_user_or_ip)`

All 3 need `request: Request` in their function signature.

### File: `app/routers/passkeys.py`

Add decorator to 1 endpoint:

1. **`DELETE /{passkey_id}`** — add `@limiter.limit(ENCRYPTION_LIMIT)` (import `ENCRYPTION_LIMIT` if not already imported). Needs `request: Request` in signature.

### Testing

- Existing rate limit tests in `tests/test_rate_limiting.py` — check the pattern there and add a test for at least one of the new endpoints (e.g. `test_import_wipe_rate_limited`).
- All existing tests must still pass.

### CHANGELOG entry

```
## [0.42.11] - 2026-02-09 — Rate Limit Destructive Endpoints

### Fixed
- **Unprotected destructive endpoints** — Added rate limits (5/min) to: import wipe, Todoist preview, Todoist import, GCal enable/disable/sync, passkey deletion
```

---

## PR 2: Add file upload size guard on backup import

**Version bump:** patch (e.g. 0.42.12)
**Type:** fix
**Risk:** Low — additive validation
**Time:** ~10 minutes

### What to do

Add a size check after reading the uploaded file, before parsing JSON.

### File: `app/routers/backup.py`

Find the import endpoint handler. After the line that reads the file content:
```python
content = await file.read()
```

Add immediately after:
```python
MAX_BACKUP_SIZE = 10 * 1024 * 1024  # 10 MB
if len(content) > MAX_BACKUP_SIZE:
    raise HTTPException(
        status_code=413,
        detail="Backup file too large (max 10 MB)",
    )
```

Move the constant to `app/constants.py` instead of inline:
```python
BACKUP_MAX_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
```

Then import and use:
```python
from app.constants import BACKUP_MAX_SIZE_BYTES
```

### Testing

Add a test in the backup test file (likely `tests/test_backup_validation.py`):
```python
async def test_import_rejects_oversized_file(self, ...):
    """Import rejects files larger than 10 MB."""
    # Create a content string larger than 10 MB
    large_content = '{"version": 1, "data": "' + 'x' * (11 * 1024 * 1024) + '"}'
    # POST to import endpoint
    # Assert 413 status code
```

### CHANGELOG entry

```
## [0.42.12] - 2026-02-09 — Backup Import Size Limit

### Fixed
- **No upload size limit on backup import** — Files larger than 10 MB now rejected with 413 before parsing, preventing memory exhaustion
```

---

## PR 3: Add session.clear() before OAuth login

**Version bump:** patch (e.g. 0.42.13)
**Type:** fix
**Risk:** Very low — defense-in-depth, no behavior change for normal users
**Time:** ~5 minutes

### What to do

Add `request.session.clear()` before setting `user_id` in both OAuth login paths.

### File: `app/routers/auth.py`

**Google OAuth callback** — Find the line that sets the session after successful Google login:
```python
request.session["user_id"] = str(user.id)
```

Add immediately BEFORE it:
```python
request.session.clear()
```

**Demo login** — Find the same pattern in the demo login handler and add `request.session.clear()` before it too.

There should be exactly 2 places where `request.session["user_id"]` is set after authentication.

### Testing

Existing auth tests should still pass. No new tests needed — this is defense-in-depth for session fixation that Starlette already handles implicitly.

### CHANGELOG entry

```
## [0.42.13] - 2026-02-09 — Session Fixation Defense-in-Depth

### Fixed
- **Session not cleared before login** — OAuth and demo login now explicitly clear the session before setting user_id, preventing theoretical session fixation
```

---

## PR 4: Add offline checks to secondary mutation paths

**Version bump:** patch (e.g. 0.42.14)
**Type:** fix
**Risk:** Low — additive guards, same pattern as PR #81
**Time:** ~30 minutes

### What to do

Add the same `isNetworkOnline()` check pattern used in PR #81 to the 4 highest-traffic missing paths. The pattern is identical everywhere:

```javascript
// Check network status before optimistic update
if (typeof isNetworkOnline === 'function' && !isNetworkOnline()) {
    if (window.Toast && typeof Toast.warning === 'function') {
        Toast.warning("You're offline — changes won't be saved until you reconnect.");
    }
    return;
}
```

### File: `static/js/task-dialog.js`

1. **`handleComplete()` function** (around line 1323) — Add the network check as the FIRST thing inside the function, before any DOM updates or API calls. This function is called when clicking the Complete/Reopen button in the task edit dialog.

2. **`handleDelete()` function** (around line 1211) — Add the network check as the FIRST thing. Lower priority since delete has a 5s delay, but consistency matters.

### File: `static/js/plan-tasks.js`

3. **`executePlan()` function** (around line 926) — Add the network check BEFORE the loop that calls `placeTaskOnCalendar()`. This is the "Plan My Day" batch scheduling — the most important missing path.

### File: `static/js/mobile-sheet.js`

4. **`_skipInstance()` method** (around line 377) — Add the network check before the optimistic UI update (`taskEl.classList.add('skipped')`).

### Testing

No automated tests for JS. Manual verification: disconnect network, try each action, confirm toast appears and no UI flickering.

### CHANGELOG entry

```
## [0.42.14] - 2026-02-09 — Offline Checks for Secondary Mutation Paths

### Fixed
- **Offline flickering on Plan My Day** — Batch scheduling now checks network before optimistic updates
- **Offline flickering on dialog complete/delete** — Task dialog complete and delete buttons now check network status
- **Offline flickering on mobile skip** — Mobile sheet skip instance checks network before optimistic update
```

---

## PR 5: Document scheduled_time timezone limitation

**Version bump:** patch (e.g. 0.42.15)
**Type:** fix
**Risk:** Very low — documentation only for this PR. The actual timezone fix is complex and deferred.
**Time:** ~15 minutes

### What to do

This is the most nuanced item. The bug: `recurrence_service.py:175` does `datetime.combine(occ_date, default_time, tzinfo=UTC)`, treating the bare `scheduled_time` as UTC when it's actually the user's local time.

For v1.0, we document this clearly. A proper fix (user timezone preference + TZ-aware materialization) is a larger effort.

### File: `app/templates/_task_dialog.html` (or wherever the recurrence time input is)

Add a help text / tooltip near the scheduled time input for recurring tasks:
```
Times are in UTC. If you're not in the UTC timezone, recurring task times may appear offset.
```

Find the scheduled time input field in the task dialog template. Add a small helper text below or beside it that's only visible when `is_recurring` is checked. Use existing CSS patterns for help text.

### File: `CHANGELOG.md` — Post-v1.0 Backlog section

The timezone item is already listed. No change needed.

### File: `docs/archive/2026-02-09-v1-gate-audit-2.md`

Already documents this. No change needed.

### CHANGELOG entry

```
## [0.42.15] - 2026-02-09 — Document Recurring Task Timezone Limitation

### Changed
- **Recurring task time input** — Added UTC timezone notice near scheduled time for recurring tasks, clarifying that times are stored and materialized in UTC
```

---

## PR Order and Dependencies

```
PR 1 (rate limits)      — independent, merge first
PR 2 (upload size)      — independent, can merge in parallel with PR 1
PR 3 (session clear)    — independent, can merge in parallel
PR 4 (offline checks)   — independent, can merge in parallel
PR 5 (timezone docs)    — independent, can merge in parallel
```

All 5 PRs are independent and can be developed on separate branches. Merge in order to avoid version conflicts — each bumps the patch version sequentially.

---

## Checklist for Each PR

1. [ ] Bump version in `pyproject.toml`
2. [ ] Run `uv lock`
3. [ ] Update `CHANGELOG.md` with version entry
4. [ ] Run `uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test`
5. [ ] PR title: `v{version}/{type}: Description`
6. [ ] Create PR via `gh pr create`
