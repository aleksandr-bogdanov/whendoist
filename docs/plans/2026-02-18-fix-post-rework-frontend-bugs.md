---
version:
pr:
created: 2026-02-18
---

# Fix: Post-Rework Frontend Bugs (Route Collision + Settings Crash)

## Context

After the React SPA migration (v0.47-v0.48), the deployed app has critical bugs:
1. **Dashboard shows no tasks** (even though analytics sees them)
2. **Thoughts page is empty** (same root cause)
3. **Settings page crashes**: `n.commit.slice is not a function`

## Root Cause Analysis

### Bug 1 (Critical): Legacy `api.py` shadows `GET /api/v1/tasks`

The legacy Todoist integration router (`app/routers/api.py:28`) registers its own
`GET /api/v1/tasks` endpoint that returns Todoist-format data. In `main.py`:

```python
# Line 292 — registered FIRST
app.include_router(api.router)        # api.py has prefix="/api/v1", defines GET /tasks

# Line 295 — registered SECOND (but never reached for GET /tasks!)
app.include_router(api_v1.router)     # v1/__init__.py also prefix="/api/v1", includes tasks.router
```

FastAPI matches the first registered route. So `GET /api/v1/tasks` hits the **legacy
Todoist endpoint** which either:
- Returns HTTP 400 "Todoist not connected" (user has no Todoist token) → empty task list
- Returns Todoist-format data (wrong schema: `content` instead of `title`, etc.) → broken rendering

The frontend (`tasks/tasks.ts:54`) calls `GET /api/v1/tasks` expecting
`AppRoutersTasksTaskResponse[]` (native task format) but gets the wrong response.

**Thoughts page** reuses the same tasks query, so it's also empty.

**Analytics** works because it uses `/api/v1/analytics/...` — no collision.

**Task creation/updates work** because `POST /api/v1/tasks`, `PUT /api/v1/tasks/{id}`,
etc. have no legacy equivalents — only `GET /tasks` collides.

### Bug 2: Settings `commit.slice()` crash

- Backend `build_info.py:67` returns `"commit": get_git_commit()` → a **dict**: `{"sha": "abc...", "short": "abc1234"}`
- Frontend `settings.tsx:1216` casts it as `{ commit?: string }` and calls `buildInfo.commit.slice(0, 7)` at line 1226
- Object has no `.slice()` method → TypeError crashes the settings page

## Plan

### Step 1: Remove legacy Todoist endpoints from `api.py`

**File:** `app/routers/api.py`

Remove these endpoints that are dead code (SPA doesn't use them) and conflict with new routes:
- `GET /tasks` (line 128) — conflicts with native tasks endpoint
- `POST /tasks/commit` (line 408) — Todoist commit, unused by SPA
- `GET /sentry-test` (line 478) — move to build_info or remove

Also remove the now-unused models: `TaskResponse`, `TaskMetadataResponse`,
`ScheduledTaskUpdate`, `CommitTasksRequest`, `CommitTaskResult`, `CommitTasksResponse`.

**Keep** these legacy endpoints that are still actively used by the frontend:
- `GET /projects` — used by wizard (`onboarding-wizard.tsx:22`)
- `GET /events` — used by calendar panel (`calendar-panel.tsx:7`)
- `GET /calendars` — used by settings and wizard (`settings.tsx:28`, `onboarding-wizard.tsx:22`)
- `POST /calendars/{calendar_id}/toggle` — used by settings
- `POST /calendars/selections` — used by wizard

Also remove the unused imports that were only needed for the deleted endpoints
(e.g., `parse_labels`, `clarity_display`, `TodoistClient`).

### Step 2: Fix `commit.slice()` in settings

**File:** `frontend/src/routes/_authenticated/settings.tsx` (line 1216, 1226)

Change the type cast and usage to handle the actual response format:

```typescript
// Before
const buildInfo = buildQuery.data as { version?: string; commit?: string } | undefined;
// ...
{buildInfo.commit.slice(0, 7)}

// After
const buildInfo = buildQuery.data as {
  version?: string;
  commit?: { sha: string; short: string };
} | undefined;
// ...
{buildInfo.commit.short}
```

### Step 3: Regenerate OpenAPI spec and orval types

After fixing the backend:
1. Start the dev server locally, fetch the OpenAPI spec
2. Run `cd frontend && npx orval` to regenerate API types
3. This will remove the dead Todoist task hooks from `api/api.ts`
4. Verify that calendar/event hooks are still generated correctly

### Step 4: Clean up unused Todoist imports in api.py

After removing the Todoist task endpoints, remove unused imports:
- `TodoistClient`, `parse_labels`, `clarity_display`

Keep what's still needed for calendar/project endpoints.

## Files to Modify

| File | Change |
|------|--------|
| `app/routers/api.py` | Remove `GET /tasks`, `POST /tasks/commit`, `GET /sentry-test`, and related models/imports |
| `frontend/src/routes/_authenticated/settings.tsx` | Fix `commit` type and usage (line 1216, 1226) |
| `frontend/openapi.json` | Regenerate (remove duplicate task endpoints) |
| `frontend/src/api/` | Regenerate via orval (remove dead Todoist task hooks) |

## Verification

1. `uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test` — all pass
2. `cd frontend && npx tsc --noEmit && npx biome check . && npm run build` — all pass
3. Manual: Dashboard should show native tasks
4. Manual: Thoughts page should show thoughts (tasks with no domain)
5. Manual: Settings page should render without crash, showing commit hash
6. Manual: Calendar panel should still show Google Calendar events
7. Manual: Onboarding wizard calendar selection should still work
