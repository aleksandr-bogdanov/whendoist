# V1.0 Gate Audit #3 — Implementation Plan

> For Sonnet. Each task is a separate PR following the project's versioned PR workflow.
> Before each commit: `uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test`

---

## PR 1: Sanitize exception messages in HTTP responses

**Version bump:** 0.42.16
**Type:** fix
**Risk:** Low — changes error messages only, no behavior change
**Time:** ~10 minutes

### What to do

Replace raw exception strings in HTTPException `detail` with generic messages.
The exception is already logged server-side (via `logger.error` / `logger.exception`),
so no information is lost — we're just stopping it from reaching the client.

### File: `app/routers/backup.py`

**Line ~102** — JSONDecodeError handler. Change:
```python
raise HTTPException(status_code=400, detail=f"Invalid JSON file: {e}") from e
```
To:
```python
raise HTTPException(status_code=400, detail="Invalid JSON file") from e
```

**Line ~106** — Generic exception handler. Change:
```python
raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}") from e
```
To:
```python
raise HTTPException(status_code=500, detail="Import failed") from e
```

### File: `app/routers/import_data.py`

**Line ~177** — Todoist preview exception handler. Change:
```python
raise HTTPException(status_code=500, detail=str(e)) from e
```
To:
```python
raise HTTPException(status_code=500, detail="Todoist preview failed") from e
```

### File: `app/routers/passkeys.py`

**Line ~177** — Registration verification. Change:
```python
raise HTTPException(status_code=400, detail=f"Registration verification failed: {e}") from e
```
To:
```python
raise HTTPException(status_code=400, detail="Registration verification failed") from e
```

**Line ~264** — Authentication verification. Change:
```python
raise HTTPException(status_code=400, detail=f"Authentication verification failed: {e}") from e
```
To:
```python
raise HTTPException(status_code=400, detail="Authentication verification failed") from e
```

### Testing

All existing tests must pass. No new tests needed — behavior is the same, just
sanitized messages.

### CHANGELOG entry

```
## [0.42.16] - 2026-02-09 — Sanitize Error Responses

### Fixed
- **Exception details in HTTP responses** — Error endpoints no longer expose raw exception messages (DB errors, library internals) to clients; details are logged server-side only
```

---

## PR 2: Self-host CDN scripts, tighten CSP

**Version bump:** 0.42.17
**Type:** fix
**Risk:** Medium — changing asset loading, test thoroughly in browser
**Time:** ~30 minutes

### Background

The CSP `script-src` includes `https://cdn.jsdelivr.net` which allows loading ANY
npm package as a script — a known CSP bypass vector. We self-host the 3 JS libraries
and 2 CSS files, then remove jsdelivr from the CSP entirely.

`'unsafe-inline'` stays in `script-src` for now — the templates use ~45 inline `onclick`
handlers that would need refactoring to `addEventListener`. That's a separate effort.

### Step 1: Download vendor files

Create the directory `static/vendor/` and download these files:

```bash
mkdir -p static/vendor
curl -o static/vendor/htmx.min.js "https://cdn.jsdelivr.net/npm/htmx.org@2.0.4/dist/htmx.min.js"
curl -o static/vendor/air-datepicker.js "https://cdn.jsdelivr.net/npm/air-datepicker@3/air-datepicker.js"
curl -o static/vendor/air-datepicker.css "https://cdn.jsdelivr.net/npm/air-datepicker@3/air-datepicker.css"
curl -o static/vendor/pico.min.css "https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css"
curl -o static/vendor/apexcharts.min.js "https://cdn.jsdelivr.net/npm/apexcharts"
```

### Step 2: Update template references

**File: `app/templates/base.html`**

Find (~line 59):
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css">
```
Replace with:
```html
<link rel="stylesheet" href="/static/vendor/pico.min.css">
```

Find (~line 60):
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/air-datepicker@3/air-datepicker.css">
```
Replace with:
```html
<link rel="stylesheet" href="/static/vendor/air-datepicker.css">
```

Find (~line 95):
```html
<script src="https://cdn.jsdelivr.net/npm/htmx.org@2.0.4/dist/htmx.min.js"></script>
```
Replace with:
```html
<script src="/static/vendor/htmx.min.js"></script>
```

Find (~line 96):
```html
<script src="https://cdn.jsdelivr.net/npm/air-datepicker@3/air-datepicker.js"></script>
```
Replace with:
```html
<script src="/static/vendor/air-datepicker.js"></script>
```

**File: `app/templates/analytics.html`**

Find (~line 206):
```html
<script src="https://cdn.jsdelivr.net/npm/apexcharts"></script>
```
Replace with:
```html
<script src="/static/vendor/apexcharts.min.js"></script>
```

### Step 3: Remove jsdelivr from CSP

**File: `app/middleware/security.py`**

Remove `https://cdn.jsdelivr.net` from **both** `script-src` and `style-src` directives.
Also remove it from `font-src` if present.

The CSP should become:
```python
csp = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline'; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "img-src 'self' data: https:; "
    "font-src 'self' https://fonts.gstatic.com; "
    "connect-src 'self' https://accounts.google.com https://www.googleapis.com "
    "https://fonts.googleapis.com https://fonts.gstatic.com; "
    "frame-ancestors 'none'; "
    "base-uri 'self'; "
    "form-action 'self' https://accounts.google.com https://todoist.com;"
)
```

Update the comment at line 23 to explain the remaining `'unsafe-inline'`:
```python
# Note: 'unsafe-inline' required for ~45 onclick handlers in templates.
# Tracked for nonce-based CSP refactor in Post-v1.0 Backlog.
```

### Step 4: Update .gitignore

Make sure `static/vendor/` is NOT in `.gitignore` — these files should be committed.

### Testing

- All existing tests must pass
- Verify in browser: dashboard loads, analytics charts render, date picker works,
  HTMX task list updates work
- Check browser console for CSP violations (should be none)
- The test `test_security_headers.py` may assert on the CSP header value — update
  the expected string if so

### CHANGELOG entry

```
## [0.42.17] - 2026-02-09 — Self-Host Vendor Scripts, Tighten CSP

### Security
- **CSP hardening** — Removed `https://cdn.jsdelivr.net` from Content-Security-Policy; all vendor scripts (htmx, air-datepicker, ApexCharts) and stylesheets (Pico CSS) now self-hosted from `/static/vendor/`, eliminating CDN-based CSP bypass vector

### Technical Details
- `'unsafe-inline'` remains in `script-src` — ~45 inline `onclick` handlers in templates require it; nonce-based CSP is a Post-v1.0 Backlog item
- Google Fonts remains in `style-src` and `font-src` (external CSS, not scripts)
```

---

## PR 3: Clean up GCal events on data wipe

**Version bump:** 0.42.18
**Type:** fix
**Risk:** Low — additive guard before existing wipe logic
**Time:** ~15 minutes

### What to do

Before deleting tasks in the wipe endpoint, check if the user has GCal sync enabled.
If so, delete sync records and fire a background task to delete the Whendoist calendar
from Google Calendar (same pattern as the disable endpoint).

### File: `app/routers/import_data.py`

Add these imports at the top (some may already be present):
```python
import asyncio
import logging

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Domain, GoogleCalendarEventSync, GoogleToken, Task, TaskInstance, TodoistToken, User, UserPreferences
from app.services.gcal import GoogleCalendarClient
```

In the `wipe_user_data` function, **before** the existing task deletion block (before
the comment `# Get task IDs for this user to delete instances`), add:

```python
    # Clean up GCal sync if enabled — delete calendar and sync records
    # before wiping tasks (otherwise sync records cascade-delete but
    # Google Calendar events orphan)
    prefs_result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == user.id)
    )
    prefs = prefs_result.scalar_one_or_none()
    if prefs and prefs.gcal_sync_enabled and prefs.gcal_sync_calendar_id:
        calendar_id = prefs.gcal_sync_calendar_id
        try:
            token_result = await db.execute(
                select(GoogleToken).where(GoogleToken.user_id == user.id)
            )
            google_token = token_result.scalar_one_or_none()
            if google_token:
                async with GoogleCalendarClient(db, google_token) as client:
                    await client.delete_calendar(calendar_id)
        except Exception:
            logger.warning(
                f"Failed to delete GCal calendar during wipe for user {user.id}, "
                "events may remain in Google Calendar"
            )

        # Clean up sync state regardless of API success
        await db.execute(
            delete(GoogleCalendarEventSync).where(
                GoogleCalendarEventSync.user_id == user.id
            )
        )
        prefs.gcal_sync_enabled = False
        prefs.gcal_sync_calendar_id = None
        prefs.gcal_sync_error = None
```

This goes right after the auth check (`if not user: raise ...`) and before the
existing `# Get task IDs for this user to delete instances` block.

Note: The GCal API call is inline (not fire-and-forget) because it's a single
`delete_calendar` call that's fast, and we need the calendar deleted before we
wipe the sync records. If it fails, we log a warning and continue with the wipe.

### Testing

All existing tests must pass. Optionally add a unit test in the import tests that
verifies the wipe endpoint doesn't error when the user has `gcal_sync_enabled=True`
(mock the GCal client).

### CHANGELOG entry

```
## [0.42.18] - 2026-02-09 — Clean Up GCal Events on Data Wipe

### Fixed
- **Orphaned GCal events after data wipe** — Import wipe now deletes the Whendoist calendar from Google Calendar before removing tasks, preventing orphaned events that were invisible to subsequent syncs
```

---

## PR Order and Dependencies

```
PR 1 (exception messages) — independent, merge first
PR 2 (CSP self-host)      — independent, can merge in parallel
PR 3 (wipe GCal cleanup)  — independent, can merge in parallel
```

All 3 PRs are independent. Merge in order to avoid version conflicts.

---

## Post-v1.0 Backlog Additions

After all 3 PRs are merged, add this item to the CHANGELOG Post-v1.0 Backlog
under **Security & Hardening**:

```markdown
- **Nonce-based CSP** — `script-src` still uses `'unsafe-inline'` because ~45 `onclick` handlers in templates need it. Full fix: refactor all inline event handlers to `addEventListener`, generate per-request nonce in middleware, update CSP to `script-src 'self' 'nonce-{value}'`.
```

---

## Checklist for Each PR

1. [ ] Bump version in `pyproject.toml`
2. [ ] Run `uv lock`
3. [ ] Update `CHANGELOG.md` with version entry
4. [ ] Run `uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test`
5. [ ] PR title: `v{version}/{type}: Description`
6. [ ] Create PR via `gh pr create`
