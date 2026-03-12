---
version:
pr:
created: 2026-03-12
---

# Remove Legacy Jinja2 Frontend

## Context

The legacy Jinja2/HTMX/vanilla JS frontend has been superseded by the React SPA since ~v0.49.8.
It's gated behind `SERVE_LEGACY_FRONTEND=true` (defaults to False) and is not deployed in production.
A git tag `legacy-frontend-final` has been created on the current commit to preserve the full
working state for future reference. Time to strip it from the codebase entirely.

## Step 1: Delete legacy files

Delete these directories and files entirely:

| Path | What | Count |
|------|------|-------|
| `app/templates/` | Jinja2 templates | 18 files |
| `app/routers/pages.py` | Legacy page routes (917 lines) | 1 file |
| `static/css/` | Legacy stylesheets | 22 files |
| `static/js/` | Legacy JavaScript | 25 files |
| `static/vendor/` | Vendor libs (htmx, pico, apexcharts) | 5 files |
| `static/sw.js` | Legacy service worker | 1 file |
| `static/manifest.json` | Legacy PWA manifest | 1 file |
| `static/img/` | Legacy images/icons/brand SVGs | ~47 files |

After the above, `static/` will be empty — delete the directory itself.

**Why `static/img/` is safe to delete:** The React SPA serves its own icons from
`frontend/public/icons/`, illustrations from `frontend/public/illustrations/`, and
favicon from `frontend/public/favicon.svg`. Zero references to `static/img/` exist
in `frontend/src/` or any Python code outside legacy templates.

## Step 2: Modify Python files

### `app/main.py`

- **Remove line 304-305:** The `/static` mount and its comment — nothing remains in `static/`
- **Remove lines 317-334:** The entire `if settings.serve_legacy_frontend:` block
- **Dedent lines 336-402:** The `else:` block (React SPA serving) becomes unconditional

### `app/config.py`

- **Remove lines 35-36:** The `serve_legacy_frontend: bool = False` field and its comment

### `app/middleware/security.py`

- **Remove lines 28-31:** Legacy template detection and conditional CSP
- **Replace with:** `script_src = f"'self' 'nonce-{nonce}'"`
  (Always use nonce-based CSP — no more `unsafe-inline` fallback)

## Step 3: Remove Jinja2 dependency

### `pyproject.toml`

- **Remove line 26:** `"jinja2>=3.1.6"` from dependencies
- Run `uv lock` to sync the lockfile

## Step 4: Clean up dead reference in React SPA

### `frontend/src/routes/_authenticated/settings.lazy.tsx` (line 1854)

- Dead link `href="/static/debug-pwa.html"` — file doesn't exist. Remove or fix this reference.

## Step 5: Archive documentation (don't delete)

### Move `docs/LEGACY-FRONTEND.md` → `docs/plans/2026-02-19-legacy-frontend-docs.md`

Rename to match the plans/ convention. Add frontmatter noting it's archived.

### Update `README.md` (line 258)

Remove the documentation index entry:
```
| [Legacy Frontend](docs/LEGACY-FRONTEND.md) | Running Jinja2 + React in parallel on Railway |
```

### Update `CHANGELOG.md`

Add version entry for the removal.

## Step 6: Version bump & lockfile

- Bump `pyproject.toml` version: `0.65.19` → `0.65.20`
- Run `uv lock`

## Step 7: Update memory

- Update `MEMORY.md` to remove references to legacy frontend existence
- Remove the "Legacy templates" file structure entry

## Verification

```bash
# Backend checks
uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test

# Frontend checks
cd frontend && npx tsc -p tsconfig.app.json --noEmit && npx biome check . && npm run build

# Confirm no dangling references
grep -r "serve_legacy" app/          # should return nothing
grep -r "pages.router" app/          # should return nothing
grep -r "Jinja2Templates" app/       # should return nothing
grep -r "static/js\|static/css\|static/vendor" .  # should return nothing (except docs/plans)

# Confirm tag exists
git tag -l "legacy-frontend-final"   # should show the tag
```

## PR

- Title: `v0.65.20/chore: Remove legacy Jinja2 frontend`
- Type: `chore`
