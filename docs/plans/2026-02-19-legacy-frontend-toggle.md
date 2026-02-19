---
version:
pr:
created: 2026-02-19
---

# Legacy Frontend Toggle — Run Jinja2 and React in Parallel

## Context

The React SPA migration (v0.47.0–v0.48.0, PRs #318–#333) replaced the full-featured
Jinja2 frontend. The React version is still catching up on features. To keep the old
version accessible while React matures, we want to run **two Railway services from the
same codebase and database** — one serving React (default), one serving the legacy Jinja2
templates — controlled by a single environment variable.

## Approach

Add `SERVE_LEGACY_FRONTEND` env var (default `false`). When `true`, mount the Jinja2
templates and pages router instead of the React SPA fallback. Both services share the
same backend code, API routes, database, and migrations.

Restore deleted legacy files to their **original locations** (no `legacy/` subdirectory)
since nothing conflicts — React lives cleanly in `frontend/`.

## Steps

### 1. Add config flag

**File: `app/config.py`** (line ~35)

```python
# Legacy frontend toggle (serve Jinja2 templates instead of React SPA)
serve_legacy_frontend: bool = False
```

### 2. Restore deleted frontend files from commit `777b210`

Use `git checkout 777b210 -- <paths>` to restore:

**Templates (18 files):**
```
app/templates/base.html
app/templates/dashboard.html
app/templates/login.html
app/templates/settings.html
app/templates/analytics.html
app/templates/thoughts.html
app/templates/privacy.html
app/templates/terms.html
app/templates/showcase.html
app/templates/mobile-mockups.html
app/templates/_task_list.html
app/templates/_task_item.html
app/templates/_completed_tasks.html
app/templates/_scheduled_tasks.html
app/templates/_deleted_tasks.html
app/templates/_svg_sprites.html
app/templates/tasks/_task_form_content.html
app/templates/tasks/_task_sheet.html
```

**JavaScript (25 files):**
```
static/js/*.js  (all files from 777b210)
```

**CSS (22 files):**
```
static/css/*.css
static/css/components/*.css
static/css/pages/*.css
```

**Vendor libraries (5 files):**
```
static/vendor/air-datepicker.js
static/vendor/air-datepicker.css
static/vendor/htmx.min.js
static/vendor/apexcharts.min.js
static/vendor/pico.min.css
```

**PWA & misc:**
```
static/sw.js
static/manifest.json
```

**Router:**
```
app/routers/pages.py
```

Skip `task_editor.py` — it was never mounted. Skip debug/demo pages and deleted tests.

### 3. Conditional serving in `main.py`

Replace the `--- React SPA serving ---` section (lines 297–333) with conditional logic:

```python
if settings.serve_legacy_frontend:
    # --- Legacy Jinja2 frontend ---
    from app.routers import pages

    # Service worker from static/
    @app.get("/sw.js", include_in_schema=False)
    async def service_worker():
        sw_path = Path("static/sw.js")
        if sw_path.exists():
            return FileResponse(sw_path, media_type="application/javascript",
                                headers={"Service-Worker-Allowed": "/"})
        return JSONResponse({"error": "Not found"}, status_code=404)

    # Pages router (must be last — it has catch-all-ish routes)
    app.include_router(pages.router)

else:
    # --- React SPA serving --- (existing code, unchanged)
    ...
```

The `/static` mount at line 285 stays unconditional — both frontends need it (images for
legacy, images for emails/OG for React).

### 4. Railway deployment

**No changes to `railway.toml`** — the build command (`cd frontend && npm ci && npm run build`)
runs on both services. The legacy service simply ignores `frontend/dist/` because `main.py`
won't mount it when `SERVE_LEGACY_FRONTEND=true`. Building it is harmless and keeps
deployment simple (same build for both).

**Railway setup (manual, one-time):**
1. In Railway project, click "New Service" → select same repo + branch (master)
2. Name it "whendoist-legacy" (or similar)
3. Add variable: `SERVE_LEGACY_FRONTEND=true`
4. Share all other variables from the primary service (DATABASE_URL, SECRET_KEY, OAuth creds, etc.)
5. Assign a domain: e.g. `legacy.whendoist.com` or `old.whendoist.com`
6. Set `BASE_URL=https://legacy.whendoist.com` (for OAuth redirect URIs)

**OAuth note:** Google/Todoist OAuth callbacks redirect to `BASE_URL`. Each service needs
its own `BASE_URL` pointing to its own domain. Both callback URLs must be registered in
Google Cloud Console and Todoist app settings.

### 5. Version bump & changelog

- Bump version in `pyproject.toml`
- Run `uv lock`
- Update `CHANGELOG.md`
- PR title: `v0.49.8/feat: Legacy frontend toggle for parallel deployment`

## Files Modified

| File | Change |
|------|--------|
| `app/config.py` | Add `serve_legacy_frontend` field |
| `app/main.py` | Conditional SPA vs Jinja2 serving |
| `app/routers/pages.py` | Restored from `777b210` |
| `app/templates/**` | Restored (18 files) |
| `static/js/**` | Restored (25 files) |
| `static/css/**` | Restored (22 files) |
| `static/vendor/**` | Restored (5 files) |
| `static/sw.js` | Restored |
| `static/manifest.json` | Restored |
| `pyproject.toml` | Version bump |
| `uv.lock` | Lockfile sync |
| `CHANGELOG.md` | Version entry |

## Verification

1. **React mode (default):** `uv run uvicorn app.main:app` → serves React SPA at `/`
2. **Legacy mode:** `SERVE_LEGACY_FRONTEND=true uv run uvicorn app.main:app` → serves Jinja2 dashboard at `/dashboard`
3. **API works in both:** `curl localhost:8000/api/v1/me` returns user data regardless of mode
4. **Run checks:** `uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test`
5. **Frontend checks:** `cd frontend && npx tsc --noEmit && npx biome check . && npm run build`
