# React SPA Migration — Session Prompts

Copy-paste each prompt into a fresh Claude Code session. Work on a feature branch per PR. Each prompt is self-contained — Claude doesn't need prior session context.

**Before starting:** Read `docs/plans/2026-02-17-react-spa-migration.md` for the full plan and tech stack.

---

## PR 1: Foundation + Auth + Pages

Branch: `feat/react-spa-foundation`

Create the branch first:
```bash
git checkout -b feat/react-spa-foundation
```

---

### Phase 1 — Scaffold

```
We're migrating the Whendoist frontend from Jinja2 + vanilla JS to React + TypeScript. This is Phase 1: scaffolding the frontend project.

Read the migration plan at docs/plans/2026-02-17-react-spa-migration.md for full context on the tech stack.

Create a `frontend/` directory in the project root with a complete React + TypeScript setup:

1. Initialize with Vite 6 + React + TypeScript template
2. Install and configure ALL of these:
   - React 19 with React Compiler (babel-plugin-react-compiler as Vite plugin)
   - TypeScript in strict mode
   - TanStack Router (file-based routing) + TanStack Query v5
   - Zustand (state management)
   - Tailwind CSS v4 (use the new v4 setup — @import "tailwindcss" in CSS, minimal/no config file)
   - shadcn/ui (init with New York style, zinc base color, CSS variables ON)
   - Biome (linting + formatting — replaces ESLint + Prettier)
   - orval (OpenAPI codegen — config pointing at http://localhost:8000/openapi.json)
   - vite-plugin-pwa (basic config: app name "Whendoist", theme color "#6D5EF6", standalone display mode)
   - Motion (framer-motion successor) for animations
   - dnd-kit (@dnd-kit/core + @dnd-kit/sortable + @dnd-kit/utilities)
   - @use-gesture/react for touch gestures
   - Zod for validation
   - lucide-react for icons
   - sonner for toast notifications
   - axios for HTTP client (orval will use it)

3. Install these shadcn/ui components: button, dialog, sheet, dropdown-menu, select, input, textarea, label, checkbox, toggle, tooltip, separator, badge, tabs, collapsible, popover, avatar, switch, card, scroll-area

4. Set up the basic file structure:
   ```
   frontend/src/
   ├── main.tsx          (entry point with QueryClientProvider, RouterProvider)
   ├── App.tsx           (TanStack Router root)
   ├── routes/
   │   ├── __root.tsx    (root layout)
   │   └── index.tsx     (redirect placeholder)
   ├── components/ui/    (shadcn components land here)
   ├── lib/
   │   └── utils.ts      (cn() helper)
   └── styles/
       └── globals.css   (Tailwind directives)
   ```

5. Configure biome.json with reasonable defaults (indent: 2 spaces, double quotes for JSX, single quotes for JS — or just the defaults).

6. Add scripts to frontend/package.json:
   - dev, build, preview, lint (biome check), format (biome format), typecheck (tsc --noEmit), generate-api (orval)

7. Add a `.gitignore` in frontend/ for node_modules, dist, .env

Make sure `npm run dev` starts successfully and shows a blank page. Make sure `npm run build` produces output in frontend/dist/. Make sure `npx tsc --noEmit` passes with no errors.

Do NOT modify any existing Python code, templates, or JS files in this phase.
```

---

### Phase 2 — API Layer + Crypto + Stores

```
We're migrating Whendoist to a React SPA. Phase 2: API layer, encryption port, and state stores.

Read the migration plan: docs/plans/2026-02-17-react-spa-migration.md

The frontend/ directory was scaffolded in Phase 1 with React 19, TypeScript, TanStack Query, Zustand, orval, and all dependencies.

This phase has 3 parts:

## Part A: orval API Codegen

1. Start the FastAPI dev server (uv run uvicorn app.main:app --reload) and verify http://localhost:8000/openapi.json returns the OpenAPI spec.

2. Configure orval.config.ts to generate:
   - TypeScript interfaces from all Pydantic schemas
   - TanStack Query v5 hooks (useQuery/useMutation) for every endpoint
   - Use axios as the HTTP client
   - Output to frontend/src/api/generated/

3. Run `npx orval` and fix any generation issues. The generated code should compile with `npx tsc --noEmit`.

4. Create frontend/src/lib/api-client.ts:
   - Axios instance with baseURL "" (same origin)
   - withCredentials: true (for session cookies)
   - Response interceptor: on 401 → redirect to /login
   - This instance should be used by orval's generated code (configure via orval's mutator option)

## Part B: Crypto Module Port

Port the encryption module from vanilla JS to TypeScript.

Read the existing files for reference:
- static/js/crypto.js — AES-256-GCM encryption with PBKDF2 key derivation
- static/js/passkey.js — WebAuthn PRF-based key wrapping

Create frontend/src/lib/crypto.ts:
- Port ALL functions from crypto.js to TypeScript
- Use the same Web Crypto API calls (SubtleCrypto)
- PBKDF2 with 600,000 iterations (OWASP 2024)
- AES-256-GCM with random 12-byte IVs
- Key derivation from passphrase + salt
- encryptField(plaintext, key) → base64 ciphertext
- decryptField(ciphertext, key) → plaintext
- Batch encrypt/decrypt helpers
- Export typed interfaces for all parameters

Create frontend/src/lib/passkey.ts:
- Port WebAuthn PRF-based key wrapping from passkey.js
- registerPasskey, unlockWithPasskey, wrapMasterKey, unwrapMasterKey
- TypeScript interfaces for credential data

## Part C: State Stores + Query Config

Create frontend/src/lib/query-client.ts:
- TanStack Query client with config: staleTime 30s, retry 1, refetchOnWindowFocus true

Create frontend/src/stores/crypto-store.ts (Zustand):
- State: encryptionEnabled (bool), derivedKey (CryptoKey | null), isUnlocked (bool), salt (string | null)
- Actions: setKey, clearKey, setEnabled, unlock, lock
- The derived key lives in memory only (equivalent to current sessionStorage approach, but better — no serialization needed since CryptoKey stays as CryptoKey)

Create frontend/src/stores/ui-store.ts (Zustand):
- State: theme ('light' | 'dark' | 'system'), energyLevel (1 | 2 | 3), sortField, sortDirection, showScheduled, showCompleted, expandedDomains (Set<number>), expandedSubtasks (Set<number>), selectedTaskId (number | null)
- Actions: setTheme, setEnergyLevel, toggleSort, toggleView, toggleExpanded, selectTask
- Persist theme and energy to localStorage

Create frontend/src/hooks/use-crypto.ts:
- Custom hook that wraps TanStack Query's queryFn with decryption
- Pattern: fetch → decrypt title/description/domain.name → return plaintext
- Only decrypt fields that looksEncrypted (38+ base64 chars)
- For mutations: encrypt before sending
- Uses derivedKey from crypto-store

Verify: `npx tsc --noEmit` passes. orval-generated hooks are importable.
```

---

### Phase 3 — Layout + Theme + Toast + Auth

```
We're migrating Whendoist to a React SPA. Phase 3: app layout, theme, toasts, and authentication.

Read the migration plan: docs/plans/2026-02-17-react-spa-migration.md

The frontend/ has React 19, TanStack Router/Query, orval-generated API hooks, crypto module, and Zustand stores from prior phases.

## Auth Flow Context

Whendoist uses Google OAuth with server-side sessions:
1. User clicks "Sign in with Google" → browser navigates to /auth/google (FastAPI route)
2. OAuth dance happens server-side → callback sets session cookie → redirects to /dashboard
3. SPA reads session cookie automatically (same origin, withCredentials: true)
4. On 401 from any API call → the axios interceptor redirects to /login

There is NO client-side auth state to manage — the session cookie IS the auth. To check if logged in, call any API endpoint — if it returns 200, user is authed; if 401, they're not.

Read for reference: app/routers/auth.py (OAuth routes, session handling)

## What to Build

### 1. Root Layout (frontend/src/routes/__root.tsx)
- Wraps all routes with QueryClientProvider, theme class on <html>, Toaster (sonner)
- Sets up the router outlet

### 2. Auth Guard Layout (frontend/src/routes/_authenticated.tsx)
- TanStack Router layout route — wraps all protected pages
- On mount: call GET /api/v1/preferences (or any lightweight authed endpoint)
- If 401 → redirect to /login
- While checking: show loading spinner
- If encryption is enabled and not unlocked → show EncryptionUnlock modal
- Pass user preferences to child routes via router context

### 3. Login Page (frontend/src/routes/login.tsx)
- Read app/templates/login.html for feature reference (don't port the animated hero — keep it simple)
- "Sign in with Google" button that navigates to /auth/google (full page navigation, not SPA)
- Clean centered card layout with shadcn Card component
- Show demo login button if enabled (check /api/v1/build/info or a config endpoint)

### 4. App Shell (frontend/src/components/layout/app-shell.tsx)
- Read app/templates/base.html and app/templates/dashboard.html for layout reference
- Desktop: sidebar (left) + main content area
- Mobile: full-width content + bottom nav bar
- Use Tailwind responsive classes (hidden on mobile, visible on desktop, etc.)

### 5. Header (frontend/src/components/layout/header.tsx)
- Logo/app name (left), user avatar + menu (right)
- Dropdown menu: Settings, Analytics, Logout
- On mobile: hamburger menu or simplified

### 6. Sidebar (frontend/src/components/layout/sidebar.tsx)
- Navigation links: Dashboard, Thoughts, Analytics, Settings
- Domain list (from GET /api/v1/domains) — icon + name, colored dot
- Active route highlighted

### 7. Mobile Nav (frontend/src/components/layout/mobile-nav.tsx)
- Bottom tab bar: Dashboard, Thoughts, Analytics, Settings
- Active tab highlighted with icon + label

### 8. Theme Provider (frontend/src/components/theme-provider.tsx)
- Read static/js/theme.js for reference
- Apply "dark" class to <html> based on ui-store theme preference
- Respect system preference when set to "system"
- Tailwind's dark: variant handles the rest

### 9. Encryption Unlock Modal (frontend/src/components/encryption-unlock.tsx)
- Read static/js/crypto.js (setupEncryption, unlockEncryption, verifyPassphrase)
- Modal with passphrase input field
- "Unlock with Passkey" button if WebAuthn supported (uses passkey.ts)
- On successful unlock → store derived key in crypto-store → close modal
- Shown by auth guard when encryption_enabled && !isUnlocked

### 10. Index Route (frontend/src/routes/index.tsx)
- Redirect: if authed → /dashboard, else → /login

Make sure all routes work: /, /login, /dashboard (can be a stub page for now). Dark mode toggles correctly. Toast shows when triggered. Login redirects to Google OAuth. Encryption unlock modal appears when needed.
```

---

### Phase 4 — Settings + Thoughts + Legal + Wizard

```
We're migrating Whendoist to a React SPA. Phase 4: all non-dashboard pages.

Read the migration plan: docs/plans/2026-02-17-react-spa-migration.md

The frontend/ has the full foundation: React, routing, API hooks, crypto, layout shell, auth guard, theme, toasts.

## Pages to Build

### 1. Settings Page (frontend/src/routes/_authenticated/settings.tsx)

Read app/templates/settings.html for the full feature set. Port ALL settings:

**Sections:**
- **Display**: Theme selector (light/dark/system)
- **Timezone**: Timezone picker (dropdown with common IANA timezones)
- **Google Calendar**: Connect/disconnect button, calendar list with enable/disable toggles, write scope upgrade
  - Connected state: show list of calendars from GET /api/v1/calendars
  - Each calendar has an enable/disable switch → POST /api/v1/calendars/{id}/toggle
  - "Connect" navigates to /auth/google (full page, OAuth flow)
  - "Disconnect" calls /auth/todoist/disconnect (or equivalent)
- **Google Calendar Sync**: Enable/disable Whendoist→GCal one-way sync (GET/POST /api/v1/gcal-sync/status, /enable, /disable)
- **Todoist**: Connect/disconnect, import button → import preview modal → confirm import
  - Uses GET /api/v1/import/todoist/preview and POST /api/v1/import/todoist
- **Encryption**: Enable/disable E2E encryption panel
  - Read static/js/crypto.js for the enable/disable flow
  - Enable: enter passphrase → derive key → encrypt all data (batch-update) → save salt + test value
  - Disable: confirm → decrypt all data (batch-update) → clear encryption settings
  - Passkey management: list passkeys, register new, delete existing (GET/POST/DELETE /api/v1/passkeys)
- **Domains**: List domains with edit (name, icon, color), reorder, archive
  - Inline editing with save/cancel
  - Color picker and emoji picker for icon
  - Drag to reorder (simple list, can use dnd-kit from existing deps)
- **Data**: Export backup (GET /api/v1/backup/export), import backup, snapshots list, wipe data
  - Snapshot toggles, manual snapshot button, restore from snapshot
- **Keyboard Shortcuts**: Reference card (static display of shortcuts)
- **About**: App version (from GET /api/v1/build/info), links to privacy/terms

Use shadcn components: Card, Switch, Select, Button, Dialog (for confirmations), Input, Label, Separator, Badge.

### 2. Thoughts Page (frontend/src/routes/_authenticated/thoughts.tsx)

Read app/templates/thoughts.html for reference.

This is the "inbox" — tasks without a domain. Chat-like bubble UI.

- Fetch tasks via GET /api/v1/tasks with a filter for tasks without a domain
  - IMPORTANT: Check if the API supports filtering for domain_id=null. If not, we need to add this to the backend. Read app/routers/v1/tasks.py to check the query params.
  - If the API doesn't support it, add an optional `domain_id` query param that accepts "none" as a special value to filter for NULL domain_id. Modify app/routers/v1/tasks.py and app/services/task_service.py.
- Display as a list of "thought bubbles" with timestamps
- Input box at bottom for quick task creation (POST /api/v1/tasks with no domain_id)
- Encrypt title before sending if encryption is enabled

### 3. Legal Pages

- frontend/src/routes/privacy.tsx — Read app/templates/privacy.html, port the content as static JSX
- frontend/src/routes/terms.tsx — Read app/templates/terms.html, port the content as static JSX
- These are public (no auth guard) — put them outside _authenticated layout

### 4. Onboarding Wizard (frontend/src/components/wizard/onboarding-wizard.tsx)

Read static/js/wizard.js for the full 7-step flow.

Steps:
1. Welcome
2. Energy levels explanation (Zombie/Normal/Deep Focus)
3. Connect Google Calendar (navigates to /auth/google?write_scope=true)
4. Select calendars (after connection, show calendar list with toggles)
5. Import from Todoist (connect + preview + import)
6. Create domains (name, icon, color — mini domain creator)
7. Summary → "Open Dashboard" button

- Show wizard if GET /api/v1/wizard/status returns not completed
- Mark complete on finish: POST /api/v1/wizard/complete
- Swipeable steps on mobile (use @use-gesture for horizontal swipe between steps)
- Progress dots at bottom

### 5. Dashboard Stub

Update frontend/src/routes/_authenticated/dashboard.tsx to show a basic placeholder:
"Dashboard is being built — check Settings and Thoughts pages in the meantime."

After building all pages, verify: Settings page loads with real data, all toggles work, Google Calendar section shows calendars, encryption enable/disable works end-to-end, Thoughts page shows inbox tasks, legal pages render, wizard works for new users.
```

---

### Phase 5 — FastAPI SPA Serving + PWA

```
We're migrating Whendoist to a React SPA. Phase 5: make FastAPI serve the built React app and finalize PWA setup.

Read the migration plan: docs/plans/2026-02-17-react-spa-migration.md

The frontend/ is fully built with auth, layout, settings, thoughts, legal pages, and wizard. Now we need FastAPI to serve it.

## Part A: FastAPI SPA Serving

Read app/main.py to understand the current app setup (middleware, route registration, static file mounts).

Modify app/main.py:

1. After ALL API route registrations (router.include_router calls), add SPA static file serving:

   ```python
   import os
   from fastapi.staticfiles import StaticFiles
   from fastapi.responses import FileResponse

   # Serve SPA static assets (JS, CSS bundles)
   spa_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
   if os.path.exists(spa_dist):
       # Serve /assets/* for Vite's hashed bundles
       app.mount("/assets", StaticFiles(directory=os.path.join(spa_dist, "assets")), name="spa-assets")

       # SPA fallback: all non-API, non-auth routes serve index.html
       @app.get("/{path:path}")
       async def spa_fallback(path: str):
           # Don't catch API routes or auth routes
           if path.startswith(("api/", "auth/")):
               raise HTTPException(404)
           return FileResponse(os.path.join(spa_dist, "index.html"))
   ```

2. IMPORTANT: The catch-all route must be registered AFTER all other routes (API, auth, static files). FastAPI matches routes in registration order.

3. Keep the /auth/* routes working (Google OAuth needs full-page navigation, not SPA routing).

4. Keep the existing /static/* mount for legacy files during migration (old JS, CSS, icons). These will be deleted in PR 2.

5. Keep serving /openapi.json and /docs (FastAPI's built-in Swagger UI) for development.

## Part B: OAuth Redirect Fix

Read app/routers/auth.py — find where the Google OAuth callback redirects after successful login. Currently it probably redirects to "/" or "/dashboard". Make sure it redirects to "/dashboard" (the SPA will handle routing from there).

Also check: after logout (/auth/logout), it should redirect to "/" which the SPA will show as the login page.

## Part C: PWA Finalization

1. Read the current static/manifest.json for reference. Update the vite-plugin-pwa config in frontend/vite.config.ts to include:
   - name: "Whendoist"
   - short_name: "Whendoist"
   - theme_color: "#6D5EF6"
   - background_color: "#ffffff" (light) — or match current
   - display: "standalone"
   - icons: reference the existing icons from static/icons/ (copy them to frontend/public/icons/)
   - start_url: "/"
   - scope: "/"

2. Copy PWA assets from static/ to frontend/public/:
   - Icons (apple-touch-icon, favicon, etc.)
   - Any splash screen images

3. iOS PWA viewport fix — Add this inline script to frontend/index.html BEFORE the React bundle loads (in <head>):
   ```html
   <script>
     // iOS PWA viewport fix: screen.height is always correct
     if (window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches) {
       document.documentElement.style.setProperty('--app-height', screen.height + 'px');
     }
   </script>
   ```
   Read static/js/mobile-core.js and docs/PWA-VIEWPORT-FIX.md for the full context on why this is needed.

4. Add iOS meta tags to frontend/index.html:
   ```html
   <meta name="apple-mobile-web-app-capable" content="yes">
   <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
   <meta name="apple-mobile-web-app-title" content="Whendoist">
   <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
   ```

## Part D: Build + Deploy Config

1. Create or update railway.toml (or Procfile) to include frontend build:
   Read the current deployment config to understand how Railway builds the app.
   The build step needs to:
   - Install Node.js deps: cd frontend && npm ci
   - Build frontend: cd frontend && npm run build
   - Install Python deps: uv sync
   - Start: uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT

2. Make sure the Vite build output path (frontend/dist/) matches what app/main.py expects.

## Verification

1. Build the frontend: cd frontend && npm run build
2. Start FastAPI: uv run uvicorn app.main:app --reload
3. Visit http://localhost:8000/ — should show the React app (login page or dashboard)
4. Visit http://localhost:8000/settings — should serve index.html (SPA routing handles it)
5. Visit http://localhost:8000/api/v1/tasks — should return JSON (not index.html)
6. Visit http://localhost:8000/auth/google — should start OAuth flow (not SPA)
7. Visit http://localhost:8000/docs — should show FastAPI Swagger UI
8. Test the full login flow: login → dashboard → settings → logout → login page
```

---

## PR 1 Finalization

```
We're finishing PR 1 of the React SPA migration. The foundation is complete: scaffold, API layer, crypto, auth, layout, settings, thoughts, legal, wizard, and FastAPI SPA serving.

Read CLAUDE.md for PR workflow requirements.

1. Bump version in pyproject.toml from 0.46.7 to 0.47.0
2. Run: uv lock
3. Update CHANGELOG.md with a v0.47.0 entry:
   - "React SPA foundation: migrated auth, settings, thoughts, legal pages, and onboarding wizard from Jinja2 to React + TypeScript"
4. Run the full check suite: uv run ruff format . && uv run ruff check . && uv run pyright app/
5. Run frontend checks: cd frontend && npm run typecheck && npx biome check .
6. Run Python tests: just test
7. Fix any issues found.
8. Commit all changes and create a PR:
   - Title: v0.47.0/feat: React SPA foundation with auth, settings, and page migration
   - Base: master
```

---

## PR 2: Complete Dashboard

Create the branch:
```bash
git checkout -b feat/react-spa-dashboard
```

---

### Phase 6 — Task Display: List + Subtrees + Domains

```
We're migrating Whendoist to a React SPA. Phase 6: rendering the task list with domain groups and subtask hierarchy.

Read the migration plan: docs/plans/2026-02-17-react-spa-migration.md

The frontend/ has the full foundation from PR 1 (React, routing, API hooks with orval, crypto middleware, layout, auth). The dashboard route exists as a stub.

## Context: Data Shape

Read app/routers/v1/tasks.py to understand the task response shape, especially:
- TaskResponse: all fields (title, description, domain_id, parent_id, duration_minutes, impact, clarity, scheduled_date, status, completed_at, subtasks[], etc.) — note: due_date was removed in v0.54.6
- How subtasks are returned (nested in parent's `subtasks` array)

Read app/routers/v1/domains.py for DomainResponse shape.

Read app/templates/_task_list.html to understand the current rendering:
- Tasks grouped by domain
- Within each domain: top-level tasks only (subtasks nested under parents)
- Scheduled section at bottom (tasks with scheduled_date)
- Completed section at bottom (tasks with completed_at)

## What to Build

### 1. Dashboard Page (frontend/src/routes/_authenticated/dashboard.tsx)
- Two-panel layout on desktop: task list (left, ~55%) + calendar (right, ~45%)
- On mobile: single panel with tabs (tasks vs calendar) — just show task panel for now, calendar comes in Phase 8
- Fetch tasks: use the orval-generated hook for GET /api/v1/tasks
- Fetch domains: use the orval-generated hook for GET /api/v1/domains
- Apply encryption decryption middleware (the hook from use-crypto.ts should handle this)
- Group tasks by domain client-side

### 2. TaskItem (frontend/src/components/task/task-item.tsx)
- Checkbox (left) — just visual for now, completion comes in Phase 7
- Title (with text-decoration: line-through if completed)
- Metadata row: duration chip, impact chip (P1-P4 with color), clarity icon, due date, recurring badge
- Subtask count indicator (if has subtasks)
- Click on task → select it (store in ui-store.selectedTaskId)
- Indent level prop for subtasks (padding-left based on depth)

Read app/constants.py for:
- IMPACT_LABELS: {1: "High", 2: "Mid", 3: "Low", 4: "Min"}
- IMPACT_COLORS: {1: "#dc2626", 2: "#f97316", 3: "#eab308", 4: "#22c55e"}

### 3. SubtaskTree (frontend/src/components/task/subtask-tree.tsx)
- Recursive component: renders a task's subtasks, each subtask can have its own subtasks
- Expand/collapse toggle (chevron icon) — state in ui-store.expandedSubtasks
- Indented rendering (depth prop increments)
- Subtask count badge on parent when collapsed

### 4. DomainGroup (frontend/src/components/task/domain-group.tsx)
- Collapsible section: domain icon + name + task count + chevron
- Uses shadcn Collapsible component
- Expand/collapse state in ui-store.expandedDomains (default: all expanded)
- Color accent from domain.color (left border or header background tint)
- Contains a TaskList of top-level tasks (parent_id === null) for that domain

### 5. TaskList (frontend/src/components/task/task-list.tsx)
- Renders a flat list of TaskItem components
- For each task with subtasks: render TaskItem + SubtaskTree (if expanded)

### 6. ScheduledSection (frontend/src/components/task/scheduled-section.tsx)
- Collapsible section showing tasks with scheduled_date
- Grouped by date (Today, Tomorrow, date headers)
- Controlled by ui-store.showScheduled toggle

### 7. CompletedSection (frontend/src/components/task/completed-section.tsx)
- Collapsible section showing completed tasks
- Respects retention days from user preferences
- Controlled by ui-store.showCompleted toggle

### 8. TaskPanel (frontend/src/components/dashboard/task-panel.tsx)
- Assembles: filter bar (stub) + domain groups + scheduled section + completed section
- Scrollable container
- "No tasks" empty state

## Data Flow

```
GET /api/v1/tasks → decrypt → all tasks (flat list with parent_id)
GET /api/v1/domains → decrypt → all domains

Client-side processing:
1. Separate: top-level (parent_id=null) vs subtasks
2. Group top-level by domain_id
3. Separate: pending vs scheduled vs completed
4. Sort within groups (default: clarity → impact → duration)
5. Render domain groups with nested subtask trees
```

Done when: Dashboard shows all tasks grouped by domain, subtasks nested and expandable, scheduled/completed sections work, encryption decrypts titles correctly. Mobile shows single-column layout.
```

---

### Phase 7 — Task CRUD + Sort + Filter + Energy

```
We're migrating Whendoist to a React SPA. Phase 7: task create/edit/complete, sorting, filtering, energy selector.

Read the migration plan: docs/plans/2026-02-17-react-spa-migration.md

The dashboard now renders tasks with domain groups and subtask trees (Phase 6).

## Reference Files

Read these for feature parity:
- static/js/task-sheet.js — right-side editor panel
- static/js/task-dialog.js — quick add modal
- static/js/task-complete.js — completion logic (optimistic UI, undo, cascade)
- static/js/task-sort.js — sort by impact/duration/clarity
- static/js/task-list-options.js — view chips, settings panel, retention
- static/js/energy-selector.js — energy level filtering
- static/js/recurrence-picker.js — recurrence rule builder
- app/templates/tasks/_task_form_content.html — form fields

## What to Build

### 1. Task Editor Sheet (frontend/src/components/task/task-editor.tsx)
- Right-side sheet (shadcn Sheet component) — opens from right edge
- Mode: create or edit (prefill fields in edit mode)
- Fields:
  - Title (text input, required)
  - Description (textarea)
  - Domain (select dropdown from domains list)
  - Parent task (select dropdown — for creating subtasks)
  - Clarity: Autopilot / Normal / Brainstorm (radio group or segmented control)
  - Impact: P1 High / P2 Mid / P3 Low / P4 Min (radio pills with colors)
  - Duration: preset buttons (15, 30, 60, 120, 240 min) or custom input
  - Due date + time (date picker + optional time)
  - Scheduled date + time (date picker + optional time)
  - Recurrence toggle + recurrence picker
  - Delete button (edit mode only, with confirmation dialog)
- Save: POST /api/v1/tasks (create) or PUT /api/v1/tasks/{id} (update)
- Encrypt title + description before saving if encryption enabled
- On success: invalidate tasks query, close sheet, show success toast
- Dirty tracking: warn before closing with unsaved changes

### 2. Task Quick Add (frontend/src/components/task/task-quick-add.tsx)
- Modal dialog (shadcn Dialog) — minimal fields
- Just: title + domain selector
- Defaults: impact P4, clarity normal, no dates
- Fast creation workflow: type title, press Enter to save
- On save: invalidate tasks query, close modal, show toast

### 3. Recurrence Picker (frontend/src/components/task/recurrence-picker.tsx)
- Read static/js/recurrence-picker.js for the full feature set
- Presets: None, Daily, Weekdays, Weekly, Monthly, Custom
- Custom: every N days/weeks/months/years
- Weekly: day-of-week checkboxes
- Monthly: day-of-month selector
- Start date + optional end date
- Returns a recurrence_rule object matching the backend's expected JSON format

### 4. Task Completion (in task-item.tsx)
- Clicking the checkbox calls POST /api/v1/tasks/{id}/toggle-complete
- Optimistic update: immediately mark as completed in TanStack Query cache
- If task has subtasks: cascade complete them too (update cache + API calls)
- If recurring: handle instance completion (POST /api/v1/instances/{id}/toggle-complete)
- On failure: rollback cache + show error toast
- Undo: show toast with "Undo" action for 5 seconds → uncomplete on click
- Read static/js/task-complete.js for edge cases (recurring, cascade, undo timing)

### 5. Sort Controls (frontend/src/components/dashboard/sort-controls.tsx)
- Sort buttons in task panel header: Impact, Duration, Clarity
- Click to sort, click again to reverse
- Active sort field highlighted
- Sort state in ui-store (sortField + sortDirection)
- Client-side sort: the task list re-renders sorted (no API call)
- Default: clarity ASC → impact ASC → duration ASC

### 6. Filter/View Bar (frontend/src/components/dashboard/filter-bar.tsx)
- View toggle chips: "Scheduled" (show/hide scheduled section), "Completed" (show/hide completed section)
- Active chip highlighted
- State in ui-store (showScheduled, showCompleted)

### 7. Energy Selector (frontend/src/components/dashboard/energy-selector.tsx)
- Three pills: Zombie (1), Normal (2), Deep Focus (3)
- Active pill highlighted
- Energy level in ui-store
- Filtering logic:
  - Level 1 (Zombie): only show tasks with clarity="autopilot"
  - Level 2 (Normal): show clarity="autopilot" + "normal" (hide "brainstorm")
  - Level 3 (Deep Focus): show all tasks
- Filter applied client-side before rendering

### 8. Settings Panel (frontend/src/components/dashboard/settings-panel.tsx)
- Gear icon button in task panel header → opens dropdown/popover
- Retention days: 1d / 3d / 7d segmented control (saves to preferences API)
- Hide recurring after completion toggle
- Show all scheduled / Show all completed buttons
- Restore deleted tasks button → modal listing archived tasks with restore option

### 9. Wire Up Trigger Points
- "q" shortcut and FAB button → open TaskQuickAdd
- "n" shortcut and "New Task" button in header → open TaskEditor (create mode)
- Click on task title (or "e" shortcut on selected task) → open TaskEditor (edit mode)
- These shortcuts will be finalized in Phase 11 but wire up the button triggers now

Done when: Full CRUD works (create, edit, delete tasks). Completion with optimistic updates and undo. Sort by impact/duration/clarity. Energy filter shows/hides tasks. View chips toggle sections. Recurrence picker works for scheduling.
```

---

### Phase 8 — Calendar + Time Slots

```
We're migrating Whendoist to a React SPA. Phase 8: calendar carousel with time slots, Google Calendar events, and plan mode.

Read the migration plan: docs/plans/2026-02-17-react-spa-migration.md

The dashboard has the task panel with full CRUD, sort, filter, and energy selector (Phase 7).

## Reference Files

- app/templates/dashboard.html — search for the calendar/day-view HTML structure
- static/js/drag-drop.js — time slot rendering, overlap detection, zoom
- static/js/plan-tasks.js — auto-scheduling algorithm
- static/js/mobile-tabs.js — tasks/schedule tab switching

## What to Build

### 1. Dashboard Layout (update frontend/src/components/dashboard/dashboard-layout.tsx)
- Desktop: split pane — TaskPanel (left) + CalendarPanel (right)
- Use CSS grid or flexbox with a draggable divider (optional) or fixed 55/45 split
- Mobile: single panel with tabs at top (Tasks | Calendar)
- Mobile tab state in ui-store

### 2. CalendarPanel (frontend/src/components/calendar/calendar-panel.tsx)
- Horizontal scrollable carousel of day columns
- Centered on today, can scroll to past/future days
- CSS scroll-snap for snapping to day boundaries
- Show ~3 days on desktop, 1 day on mobile
- Date header on each column (day name + date)
- "Today" button to scroll back to current day

### 3. DayColumn (frontend/src/components/calendar/day-column.tsx)
- Vertical time grid: hours from early morning to late night
- Time ruler on the left (hour labels)
- Grid lines every hour, subdivisions every 15 minutes
- Render Google Calendar events and scheduled Whendoist tasks as positioned cards
- Zoom level: controlled by user preference (calendar_hour_height from preferences API)
- Mouse wheel zoom: change hour height (30px–100px range), save to preferences

### 4. CalendarEvent (frontend/src/components/calendar/calendar-event.tsx)
- Google Calendar event card: title, time range, color from calendar
- Positioned absolutely based on start/end time
- Read-only (can't edit Google events from Whendoist)
- Fetch events: use the orval-generated hook for GET /api/v1/events with date range params

### 5. ScheduledTask (frontend/src/components/calendar/scheduled-task.tsx)
- Whendoist task card on the calendar: title, duration indicator
- Positioned based on scheduled_time, height based on duration_minutes
- Styled differently from Google events (Whendoist brand color)
- Clickable → opens task editor sheet

### 6. Overlap Handling
- When events/tasks overlap in time: display side-by-side (reduce width, offset horizontally)
- Simple algorithm: detect overlapping time ranges, divide available width among overlapping items

### 7. Plan Mode (frontend/src/components/calendar/plan-mode.tsx + frontend/src/hooks/use-plan-tasks.ts)
- "Plan My Day" button in calendar header
- Read static/js/plan-tasks.js for the algorithm:
  1. Collect visible unscheduled tasks matching energy filter
  2. Sort: date-matched first → smaller duration → higher priority
  3. Find free slots between existing calendar events
  4. First-fit bin packing: place each task in first slot with enough space
  5. Show preview of placements → confirm to save
- On confirm: batch PUT to schedule each task with the assigned datetime
- Cancel to discard placements

### 8. Mobile Tabs (update mobile layout)
- On mobile: show tabs "Tasks" and "Calendar" at top of dashboard
- Switching tabs shows/hides TaskPanel vs CalendarPanel
- Calendar tab shows single day column (today by default)
- Swipe left on a task (from Phase 10) should switch to calendar tab

Done when: Calendar carousel renders with day columns and time slots. Google Calendar events appear. Scheduled Whendoist tasks appear at correct times. Overlap handling works. Zoom works. Plan mode auto-schedules tasks. Mobile tabs switch between task list and calendar.
```

---

### Phase 9 — Drag and Drop

```
We're migrating Whendoist to a React SPA. Phase 9: drag-and-drop for task reordering, reparenting, and scheduling.

Read the migration plan: docs/plans/2026-02-17-react-spa-migration.md

The dashboard has task list + calendar panel with all display features (Phases 6-8).

## Reference Files

- static/js/drag-drop.js — the full drag-drop implementation (calendar scheduling, reorder)
- static/js/task-sort.js — task reordering within lists

## What to Build with dnd-kit

### 1. DnD Context (frontend/src/components/task/task-dnd-context.tsx)
- Wrap the dashboard with DndContext from @dnd-kit/core
- Sensors: PointerSensor (mouse) + TouchSensor (mobile)
- Touch activation constraint: { delay: 250, tolerance: 5 } — to distinguish from swipe gestures
- Mouse activation constraint: { distance: 8 } — prevent accidental drags
- DragOverlay: shows a visual copy of the dragged task

### 2. Task Reordering
- Tasks within a domain group are sortable (using @dnd-kit/sortable)
- SortableContext wraps each domain group's task list
- On drop: update task positions via API (PUT /api/v1/tasks/{id} with new position)
- Optimistic reorder: immediately update the list, rollback on API failure
- Only top-level tasks are sortable (subtasks maintain their order under parent)

### 3. Task Reparenting (drag onto another task → make subtask)
- When dragging a task OVER another task (not above/below but ON it), highlight the target as "drop to make subtask"
- Visual indicator: target task gets a colored border/highlight
- On drop onto task: PUT /api/v1/tasks/{id} with parent_id = target task's ID
- Inverse: drag a subtask out to the root level → PUT with parent_id = null
- Constraint: don't allow dropping a parent onto its own subtask (circular reference)

### 4. Drag to Calendar (schedule)
- Dragging a task from the task list to a calendar time slot
- Calendar time slots are droppable targets (useDroppable from @dnd-kit/core)
- 15-minute snap grid: round drop position to nearest 15 minutes
- On drop: PUT /api/v1/tasks/{id} with scheduled_date + scheduled_time
- Show ghost preview on the calendar while dragging over it

### 5. Drag Overlay (frontend/src/components/task/task-drag-overlay.tsx)
- Custom drag preview: compact version of the task (title + impact chip)
- Follows cursor/finger with slight offset
- Semi-transparent background

### 6. Reschedule by Drag
- Already-scheduled tasks on the calendar can be dragged to a different time slot
- Same 15-minute snap grid
- API update on drop

### 7. Remove from Calendar
- Drag a scheduled task off the calendar back to the task list
- Clears scheduled_date and scheduled_time

### Integration Notes
- dnd-kit's collision detection needs customization:
  - For reorder: use closestCenter
  - For reparent: detect "hovering over center of task" vs "hovering between tasks"
  - For calendar: detect which time slot is closest
- May need a custom collision detection function that switches behavior based on drop target type

Done when: All three drag operations work (reorder, reparent, schedule). Drag overlay follows cursor. Calendar snap grid works. Touch dragging works on mobile with the activation delay. No conflicts with swipe gestures (swipe is Phase 10).
```

---

### Phase 10 — Mobile: Swipe + Sheet + Haptics

```
We're migrating Whendoist to a React SPA. Phase 10: mobile experience — swipe gestures, bottom sheet, haptic feedback, and mobile polish.

Read the migration plan: docs/plans/2026-02-17-react-spa-migration.md

The dashboard is functionally complete with drag-and-drop (Phase 9).

## Reference Files

- static/js/task-swipe.js — swipe-right to complete, swipe-left to schedule
- static/js/mobile-sheet.js — iOS-style bottom sheet with swipe-to-dismiss
- static/js/haptics.js — vibration patterns
- static/js/device-detection.js — device capability detection
- static/js/gesture-discovery.js — first-run swipe hints
- static/js/sticky-domain.js — floating domain label on scroll
- static/js/mobile-core.js — iOS viewport fixes

## What to Build

### 1. Device Detection Hook (frontend/src/hooks/use-device.ts)
- Detect: touch device, mouse device, hybrid, iOS, Android, PWA standalone mode, reduced motion
- Apply CSS classes to body: touch-device, mouse-device, pwa-mode
- Return capabilities object for conditional rendering

### 2. Viewport Hook (frontend/src/hooks/use-viewport.ts)
- Manage --app-height CSS property (from screen.height on iOS PWA)
- Detect virtual keyboard open/close (resize events)
- Add keyboard-open class to body when keyboard is visible
- Read docs/PWA-VIEWPORT-FIX.md for the full context

### 3. Haptics Hook (frontend/src/hooks/use-haptics.ts)
- Check navigator.vibrate support
- Patterns: light (10ms), medium (20ms), heavy (30ms), success ([10,50,10]), warning ([30,50,30]), error ([50,30,50,30,50]), dragStart (15ms), drop ([10,40,10])
- Respect prefers-reduced-motion (no vibration if set)
- Configurable enable/disable

### 4. Swipe Gesture (frontend/src/components/task/task-swipe-row.tsx)
- Wrap each TaskItem with a swipe gesture layer using @use-gesture/react
- Swipe right:
  - Visual phases: peek at 40px (green tint), commit at 100px (checkmark icon appears), trigger at 130px
  - On trigger: complete task + haptic success
  - Animate task sliding out
- Swipe left:
  - Switch to calendar tab (mobile tabs state change)
- Conflict resolution with vertical scroll:
  - Track first 50ms of gesture — if primarily vertical, cancel horizontal swipe
  - If primarily horizontal, prevent scroll and handle swipe
- Multi-touch cancellation (two fingers = pinch-to-zoom, not swipe)
- IMPORTANT: must not conflict with dnd-kit's TouchSensor (dnd-kit uses delay: 250ms, swipe is immediate horizontal movement)

### 5. Bottom Sheet (frontend/src/components/mobile/bottom-sheet.tsx)
- iOS/Android-style modal sheet from bottom
- Swipe down to dismiss
- Backdrop click to dismiss
- Snap points: auto (content height) or full
- Focus trapping for accessibility
- Can use a library like vaul (shadcn recommends it) or build custom with @use-gesture

### 6. Task Action Sheet (frontend/src/components/mobile/task-action-sheet.tsx)
- Triggered by long-press on a task (300ms)
- Uses BottomSheet component
- Actions: Edit, Complete/Uncomplete, Schedule, Skip (if recurring), Delete
- Delete shows cascade confirmation if task has subtasks
- Haptic warning on dangerous actions (delete)

### 7. Gesture Discovery (frontend/src/components/gesture-discovery.tsx)
- First-run experience for mobile users
- Animate the first task with a swipe hint (task slides right, tooltip appears)
- Show once per user (localStorage flag: gesture-hint-shown)
- Long-press tooltip after first task interaction (localStorage: longpress-hint-shown)

### 8. Sticky Domain Header (frontend/src/components/mobile/sticky-domain.tsx)
- On mobile: as user scrolls through task list, show current domain name as a floating header
- Crossfade between domain names as scroll crosses domain boundaries
- Only visible on mobile (< 900px viewport)

### 9. Mobile Tab Swipe
- On mobile dashboard: swipe left/right between Tasks and Calendar tabs
- Use @use-gesture for the horizontal swipe on the tab content area
- Don't conflict with task-level swipe (tab swipe is on the container, task swipe is on individual rows)

Done when: Swipe-to-complete works with visual phases and haptic feedback. Long-press opens action sheet. Bottom sheet is dismissible. Gesture hints appear for first-time users. Sticky domain header works on scroll. All gestures work without conflicting with drag-and-drop.
```

---

### Phase 11 — Keyboard Shortcuts + Animations + Legacy Cleanup

```
We're migrating Whendoist to a React SPA. Phase 11: keyboard shortcuts, animations, and deleting ALL legacy frontend code.

Read the migration plan: docs/plans/2026-02-17-react-spa-migration.md

The dashboard is fully functional with all interactions (Phases 6-10).

## Reference Files

- static/js/shortcuts.js — keyboard shortcut system

## Part A: Keyboard Shortcuts

Create frontend/src/hooks/use-shortcuts.ts:
- Global keyboard listener (useEffect on document.addEventListener)
- Context-aware: different shortcuts when dialog/sheet is open
- Register/unregister pattern for modular shortcuts

Shortcuts to implement:
- ? → Show shortcuts help modal
- q → Open quick add task dialog
- n → Open task editor sheet (create mode)
- j → Select next task in list
- k → Select previous task in list
- c → Toggle complete on selected task
- e or Enter → Open editor for selected task
- x → Delete selected task (with confirmation)
- Escape → Close any open modal/sheet/dialog

Create frontend/src/components/shortcuts-help.tsx:
- Modal listing all shortcuts in categorized groups (Global, Task List, Task Editor)
- Triggered by ? key
- Clean table layout

Task selection state:
- ui-store.selectedTaskId tracks which task is selected
- Selected task gets a highlight ring/background
- j/k move selection through the visible task list (respecting domain groups)

## Part B: Animations with Motion

Add animations throughout the dashboard:

1. Task completion: AnimatePresence — task slides out to the right and fades, then list items animate up to fill the gap (layout animation)
2. Task creation: new task fades in and expands from zero height
3. List reorder: layout prop on Motion.div — items animate smoothly to new positions during sort
4. Subtask expand/collapse: animate height from 0 to auto (use Motion's height animation)
5. Sheet open/close: slide in from right edge with backdrop fade
6. Bottom sheet: slide up from bottom with spring physics
7. Toast enter/exit: slide in from top-right, slide out
8. Modal: backdrop fade + content scale up
9. Domain group collapse: smooth height animation
10. Calendar day transition: crossfade between days in carousel

Use Motion's AnimatePresence for enter/exit animations and layout prop for position changes.

## Part C: Delete ALL Legacy Frontend Code

This is the satisfying part. Delete everything:

```
DELETE static/js/theme.js
DELETE static/js/device-detection.js
DELETE static/js/haptics.js
DELETE static/js/crypto.js
DELETE static/js/passkey.js
DELETE static/js/energy-selector.js
DELETE static/js/task-sheet.js
DELETE static/js/task-dialog.js
DELETE static/js/task-complete.js
DELETE static/js/task-swipe.js
DELETE static/js/mobile-sheet.js
DELETE static/js/task-sort.js
DELETE static/js/task-mutations.js
DELETE static/js/drag-drop.js
DELETE static/js/plan-tasks.js
DELETE static/js/mobile-core.js
DELETE static/js/mobile-tabs.js
DELETE static/js/sticky-domain.js
DELETE static/js/task-list-options.js
DELETE static/js/shortcuts.js
DELETE static/js/gesture-discovery.js
DELETE static/js/recurrence-picker.js
DELETE static/js/wizard.js
DELETE static/js/error-handler.js
DELETE static/js/toast.js

DELETE static/css/dashboard.css
DELETE static/css/mobile.css
DELETE static/css/app.css
DELETE static/css/brand.css
DELETE static/css/tokens.css
DELETE static/css/login.css
DELETE static/css/dialog.css
DELETE static/css/legal.css
DELETE static/css/wizard.css
DELETE static/css/components/  (entire directory)
DELETE static/css/pages/  (entire directory)

DELETE static/vendor/  (htmx, pico, air-datepicker — if this directory exists, check first)

DELETE app/templates/  (entire directory — all Jinja2 templates)

DELETE app/routers/pages.py  (Jinja2 page routes)
DELETE app/routers/task_editor.py  (HTMX task editor routes)

DELETE tests/test_js_module_contract.py  (no longer relevant)
```

Also:
- Remove any Jinja2/template imports from app/main.py
- Remove the /static/css/ and /static/js/ mounts from app/main.py (keep /static/icons/ if PWA icons are still there, otherwise move them to frontend/public/)
- Remove HTMX-related imports and middleware
- Update app/main.py to ONLY serve: /api/v1/*, /auth/*, /openapi.json, /docs, and the SPA catch-all

Verify nothing references the deleted files. Run: uv run ruff check . && uv run pyright app/ && cd frontend && npm run typecheck

Done when: Keyboard shortcuts work. Animations are smooth. ALL legacy code is deleted. The app runs entirely from the React SPA. No Jinja2, no vanilla JS, no HTMX.
```

---

## PR 2 Finalization

```
We're finishing PR 2 of the React SPA migration. The complete dashboard is built with all interactions, and all legacy frontend code has been deleted.

Read CLAUDE.md for PR workflow requirements.

1. Bump version in pyproject.toml to 0.48.0
2. Run: uv lock
3. Update CHANGELOG.md with a v0.48.0 entry:
   - "Complete React SPA dashboard: task list with subtask hierarchy, full CRUD, drag-and-drop (reorder, reparent, schedule), swipe gestures, calendar carousel with plan mode, keyboard shortcuts, animations. Deleted all legacy Jinja2 templates, vanilla JS modules, and CSS files."
4. Run the full check suite: uv run ruff format . && uv run ruff check . && uv run pyright app/
5. Run frontend checks: cd frontend && npm run typecheck && npx biome check .
6. Run Python tests: just test (some tests may need updating if they reference deleted template routes)
7. Fix any issues.
8. Commit and create PR:
   - Title: v0.48.0/feat: Complete React SPA dashboard with all interactions, delete legacy frontend
   - Base: master
```

---

## PR 3: Analytics + Polish

```bash
git checkout -b feat/react-spa-analytics
```

---

### Phase 12 — Analytics Page + API

```
We're migrating Whendoist to a React SPA. Phase 12: analytics page and API endpoint.

Read the migration plan: docs/plans/2026-02-17-react-spa-migration.md

The full SPA is running (PR 1 + PR 2 merged). The analytics page is the last missing feature.

## Reference Files

- app/templates/analytics.html — the current analytics page with all chart types
- app/services/analytics_service.py — the service that computes analytics data
- app/routers/pages.py — the old route that assembled analytics context (this was deleted in PR 2, check git history if needed: git show HEAD~1:app/routers/pages.py)

## Part A: Analytics API Endpoint

The analytics data is currently assembled in the pages router and passed to the Jinja2 template. We need a JSON API endpoint.

Create or modify app/routers/v1/analytics.py:

```python
router = APIRouter(prefix="/analytics", tags=["analytics"])

@router.get("/")
async def get_analytics(
    days: int = Query(default=30, ge=7, le=90),
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Return analytics data for the specified time range."""
    service = AnalyticsService(db, user.id)
    # Call the same service methods that pages.py used
    # Return as JSON
```

Read app/services/analytics_service.py to understand what methods are available and what data shape they return. The endpoint should return everything the template currently uses:
- total_completed, total_pending, completion_rate
- daily_completions (array of {date, count})
- by_domain (array of {domain_name, count})
- by_day_of_week (array of {day, count})
- heatmap_data (weeks × days grid)
- impact_distribution (P1-P4 counts)
- velocity_data (trend over time)
- recurring_stats (most completed recurring tasks)
- streaks (current, longest)

Register the new router in app/routers/v1/__init__.py.

Run orval to regenerate the API hooks: cd frontend && npx orval

## Part B: Analytics Page

Create frontend/src/routes/_authenticated/analytics.tsx:

Use Recharts (install: npm install recharts) for all charts:

1. Stat Cards row: Total Completed, Completion Rate, Current Streak, Longest Streak
2. Daily Completions: Bar chart (date × count), day range selector (7d / 30d / 90d)
3. Domain Breakdown: Donut/pie chart with domain colors
4. Day of Week: Horizontal bar chart (Mon-Sun)
5. Activity Heatmap: GitHub-style grid (weeks × days, color intensity = count)
6. Impact Distribution: Stacked bar or pie (P1-P4 with impact colors)
7. Velocity Trend: Line chart showing completions trend
8. Top Recurring Tasks: Simple list with completion counts

Responsive layout: 2-column grid on desktop, single column on mobile.
Dark mode support: Recharts supports custom colors — use Tailwind CSS variables.

Create frontend/src/components/analytics/:
- stat-card.tsx
- daily-chart.tsx
- domain-breakdown.tsx
- day-of-week-chart.tsx
- heatmap.tsx
- impact-chart.tsx
- velocity-chart.tsx
- recurring-list.tsx

Done when: Analytics page shows all charts with real data. Day range selector (7/30/90) works. Charts look good in dark mode. Responsive layout works.
```

---

### Phase 13 — CI + Docs + Final Polish

```
We're finishing the React SPA migration. Phase 13: CI pipeline, documentation, and final polish.

Read CLAUDE.md for all project conventions.

## Part A: CI Pipeline

Read .github/workflows/ to understand the current CI setup.

Add frontend build and checks to the CI workflow:

```yaml
# Add to the existing workflow (or create a new job):
frontend:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '22'
        cache: 'npm'
        cache-dependency-path: frontend/package-lock.json
    - run: cd frontend && npm ci
    - run: cd frontend && npx tsc --noEmit
    - run: cd frontend && npx biome check .
    - run: cd frontend && npm run build
```

Make sure the existing Python CI still works (tests, ruff, pyright).

If the Python tests reference deleted templates or routes, fix or remove those tests.

## Part B: Documentation

Update CLAUDE.md:
- Add a "Frontend" section with commands:
  ```
  cd frontend && npm run dev          # Dev server (port 5173, proxies API to 8000)
  cd frontend && npm run build        # Production build
  cd frontend && npx orval            # Regenerate API types from OpenAPI spec
  cd frontend && npx biome check .    # Lint + format check
  cd frontend && npx vitest           # Run tests
  ```
- Add frontend conventions:
  - Components in frontend/src/components/, grouped by feature
  - API hooks are auto-generated by orval — never write fetch calls manually
  - Encryption is handled at the TanStack Query layer — components always receive plaintext
  - Use shadcn/ui components as building blocks
  - Tailwind for styling — no CSS files
  - Biome for lint + format (not ESLint/Prettier)

Update README.md:
- Update the tech stack section to reflect React + TypeScript
- Add frontend setup instructions (npm install, npm run dev)
- Update the documentation index with any new docs

Update CHANGELOG.md with the v0.49.0 entry.

## Part C: Clean Up

1. Check for any remaining references to deleted files (grep for "templates/", "static/js/", "static/css/", "jinja", "htmx")
2. Remove any unused Python dependencies related to Jinja2/templates (check pyproject.toml)
   - Keep Jinja2 if FastAPI still uses it for anything (like email templates), otherwise remove
3. Verify the frontend/dist/ directory is in .gitignore (should not be committed)
4. Verify frontend/node_modules/ is in .gitignore
5. Make sure `npm run build` and the full Python check suite pass:
   uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test
   cd frontend && npm run typecheck && npx biome check . && npm run build

## Part D: PR

1. Bump version in pyproject.toml to 0.49.0
2. Run: uv lock
3. Commit and create PR:
   - Title: v0.49.0/feat: Analytics page, CI pipeline, and migration cleanup
   - Base: master
```

---

## Quick Reference: PR → Phase → Branch

| PR | Branch | Phases | Version |
|----|--------|--------|---------|
| 1 | `feat/react-spa-foundation` | 1-5 + PR1 finalization | v0.47.0 |
| 2 | `feat/react-spa-dashboard` | 6-11 + PR2 finalization | v0.48.0 |
| 3 | `feat/react-spa-analytics` | 12-13 | v0.49.0 |
