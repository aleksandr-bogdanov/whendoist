# Legacy Frontend (Parallel Deployment)

During the React SPA migration, the original Jinja2/HTMX frontend runs alongside the
new React frontend so users keep full functionality while React catches up on features.

Both versions share the same codebase, database, and API — the only difference is which
frontend is served to the browser.

## How It Works

A single environment variable controls which frontend is served:

| Variable | Value | Frontend |
|----------|-------|----------|
| `SERVE_LEGACY_FRONTEND` | `false` (default) | React SPA from `frontend/dist/` |
| `SERVE_LEGACY_FRONTEND` | `true` | Jinja2 templates from `app/templates/` |

The toggle lives in `app/config.py` and the conditional routing in `app/main.py`.

### What's shared (both modes)

- FastAPI backend, all middleware, auth flow
- API routes at `/api/v1/*`
- Database (same `DATABASE_URL`, same migrations)
- OAuth endpoints at `/auth/*`
- Health/readiness checks at `/health`, `/ready`, `/metrics`
- Static images at `/static/img/`

### What differs by mode

| Aspect | React (default) | Legacy |
|--------|----------------|--------|
| Page routes | SPA fallback → `frontend/dist/index.html` | `app/routers/pages.py` → Jinja2 templates |
| CSS/JS | Vite bundles at `/assets/` | Files at `/static/css/`, `/static/js/` |
| Service worker | `frontend/dist/sw.js` | `static/sw.js` |
| PWA manifest | `frontend/dist/manifest.webmanifest` | `static/manifest.json` |
| Vendor libs | Bundled by Vite | `static/vendor/` (Pico CSS, HTMX, etc.) |

## Railway Setup

Two Railway services deploy from the same repo and branch, sharing the same Postgres database.

### 1. Create the legacy service

In your Railway project:

1. Click **"+ New"** → **"GitHub Repo"** → select the whendoist repository
2. Name the service `whendoist-legacy`
3. It will use the same `railway.toml` build config as the primary service

### 2. Configure environment variables

The legacy service needs all the same variables as the primary service, plus the toggle.

**Shared variables** (copy from primary service or use Railway's shared variables):

```bash
DATABASE_URL=<same-postgres-url>
SECRET_KEY=<same-secret-key>
GOOGLE_CLIENT_ID=<same>
GOOGLE_CLIENT_SECRET=<same>
TODOIST_CLIENT_ID=<same>
TODOIST_CLIENT_SECRET=<same>
SENTRY_DSN=<same-or-separate>
```

**Legacy-specific variables:**

```bash
SERVE_LEGACY_FRONTEND=true
BASE_URL=https://legacy.whendoist.com
```

`BASE_URL` must be different because OAuth redirect URIs are derived from it.

### 3. Assign a domain

1. Go to the legacy service → **Settings** → **Networking** → **Custom Domain**
2. Add `legacy.whendoist.com` (or your chosen subdomain)
3. Create a CNAME record in your DNS pointing to Railway's hostname
4. Railway handles SSL automatically

### 4. Register OAuth callback URLs

Both services need their callback URLs registered with OAuth providers.

**Google Cloud Console** ([console.cloud.google.com](https://console.cloud.google.com)):

1. Go to **APIs & Services** → **Credentials** → your OAuth 2.0 Client
2. Under **Authorized redirect URIs**, add:
   ```
   https://legacy.whendoist.com/auth/google/callback
   ```
   (Keep the existing `https://whendoist.com/auth/google/callback`)

**Todoist Developer Console** ([developer.todoist.com](https://developer.todoist.com)):

1. Go to your app settings
2. Under **OAuth redirect URL**, add:
   ```
   https://legacy.whendoist.com/auth/todoist/callback
   ```

### 5. Verify

After deploy:

- `https://legacy.whendoist.com/dashboard` → Jinja2 dashboard
- `https://whendoist.com/dashboard` → React SPA dashboard
- Both hit the same database — tasks created in one appear in the other

## Local Development

Run the legacy frontend locally:

```bash
SERVE_LEGACY_FRONTEND=true uv run uvicorn app.main:app --reload --port 8000
```

Or add to `.env`:

```bash
SERVE_LEGACY_FRONTEND=true
```

No need to build the React frontend when running in legacy mode.

## File Inventory

Legacy frontend files restored from v0.46.7 (`777b210`):

| Path | Count | Description |
|------|-------|-------------|
| `app/routers/pages.py` | 1 | Page routes (dashboard, settings, analytics, etc.) |
| `app/templates/` | 18 | Jinja2 templates (base, dashboard, settings, etc.) |
| `static/js/` | 25 | JS modules (task management, drag-drop, crypto, etc.) |
| `static/css/` | 22 | Stylesheets (dashboard, mobile, components, etc.) |
| `static/vendor/` | 5 | Third-party libs (Pico CSS, HTMX, ApexCharts, etc.) |
| `static/sw.js` | 1 | Legacy service worker |
| `static/manifest.json` | 1 | Legacy PWA manifest |

## Removing the Legacy Frontend

Once React has full feature parity:

1. Delete all files listed above
2. Remove `serve_legacy_frontend` from `app/config.py`
3. Remove the `if settings.serve_legacy_frontend:` branch from `app/main.py`
4. Remove the legacy Railway service
5. Remove the legacy callback URLs from Google/Todoist consoles
