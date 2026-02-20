# Changelog

Development history of Whendoist. Per-patch details in git history.

---

## v0.54.1 — 2026-02-20

### Design Parity Phase 2 — CTA & Depth
- **Plan My Day button**: Gradient CTA treatment with purple glow shadow (`linear-gradient(135deg, #6D5EF6, #8B7CF7, #A78BFA)`)
- **Glass blur headers**: Main header and task panel header now use `backdrop-blur-md` for premium glass feel
- **Shadow system**: Added brand 3-tier shadow system (`--shadow-card`, `--shadow-raised`, `--shadow-cta`) with dark mode variants, applied to domain group cards and floating controls
- **Calendar card radius**: Scheduled task cards reduced from 10px to 6px for professional look

---

## v0.54.0 — 2026-02-20

### Design Parity Phase 1 — Brand Foundation
- **Canvas background**: Changed from pure white (#FFFFFF) to brand warm (#F8FAFC) for depth
- **Focus rings**: All focus rings now use brand purple (#6D5EF6) instead of generic zinc
- **Task row hovers**: Purple-tinted hover states (`rgba(109,94,246,0.04)`) instead of generic gray
- **Now-line**: Calendar current time indicator changed from red to brand purple
- **Impact rail rounding**: Task items have rounded left edge (`4px 0 0 4px`) matching legacy design
- **Calendar events**: Restyled from solid colored blocks to elegant outlined cards with colored left rail, dark text on light background — the single biggest visual improvement

---

## v0.53.9 — 2026-02-20

### Changed
- **Docs cleanup**: Archived 5 legacy frontend docs (Error Handling, Toast System, In-Place Mutations, Architecture Decision/Review) to `docs/plans/`. Updated README documentation index. Compacted CHANGELOG from 1867 to ~370 lines.

---

## v0.53.0–v0.53.8 — 2026-02-20

### Calendar Drag-and-Drop

- **Calendar context menus**: Right-click on scheduled tasks and recurring instances with full action set
- **Anytime drop zone**: Drag tasks to schedule date-only (no specific time)
- **Reschedule undo**: In-calendar rescheduling with toast + undo
- **Drag to date-group headers**: Reschedule overdue tasks onto "Today", "Tomorrow" headers
- **"Skip this one" context menu**: Right-click overdue recurring tasks to skip

### Fixed (8 patches)

- Calendar drop zones broken by dnd-kit Rect measurement in nested scroll containers — moved droppable outside scroll as overlay. See [docs/CALENDAR-DND.md](docs/CALENDAR-DND.md)
- Duplicate draggable IDs between task panel and calendar cards
- DragOverlay position drift and proportional sizing in scroll containers
- Phantom card position off by hours (double-counted scroll offset)
- DnD reschedule overwriting task duration to 30 minutes
- Parent tasks hidden by energy filter — now pass through based on subtask clarity
- Subtasks not draggable (missing `useDraggable`)

---

## v0.53.4–v0.53.5 — 2026-02-20

### Security & Hardening

- Rate limit key function fixed (per-user instead of always IP)
- ProxyHeadersMiddleware restricted to `127.0.0.1`
- Secret key fail-safe validator for production
- HSTS header added
- Undo mutation error handling (onError callbacks on all 7 undo paths)
- HTTP timeouts on all OAuth token exchanges and API clients
- Passphrase cleared from React state after encryption unlock
- N+1 queries fixed in batch-update endpoints
- Composite index `ix_task_user_parent(user_id, parent_id)`
- Console.error and error boundary logging gated behind `import.meta.env.DEV`

---

## v0.52.0–v0.52.3 — 2026-02-19/20

### Polish

- **Inbox → Thoughts** rename throughout all views, backend, and tests
- Thoughts hidden from Tasks page (belong exclusively on Thoughts page)
- Subtask metadata grid alignment with parent task columns
- Clock icon removed from task durations (kept only on parent aggregated time)
- Full header labels (Clarity/Duration/Impact) replacing abbreviations
- Stable event ordering on carousel swipe (deterministic sort tiebreaker)
- Event flicker eliminated with `placeholderData: keepPreviousData`
- Anytime section fixed height (34px single-row with horizontal scroll)

---

## v0.51.0–v0.51.9 — 2026-02-19

### Calendar Redesign

- **Extended day view**: Single 44-hour view (prev 9PM through next 5PM) with day separators
- **Anytime section**: Horizontal pill banner above time grid for date-only tasks
- **Continuous zoom**: Ctrl+wheel zooms smoothly, snaps to nearest step on save
- **5-panel carousel**: CSS scroll-snap with desktop pointer-drag swipe, replacing fragile transform-based approach (4 iterations)
- Live scroll updates for header date and anytime tasks
- Wider data fetch range (±5 days) eliminating event flicker on navigation
- `scrollend` event replacing debounce for instant swipe response

---

## v0.50.0–v0.50.6 — 2026-02-19

### Legacy Visual Parity

Complete React frontend restyling to match legacy Jinja2 aesthetic:
- Top horizontal tab navigation, W icon logo, emoji energy selector
- Task items with 2px impact rail, grid-aligned columns, brand colors
- Domain groups as card-style containers
- Spectrum gradient bar, Nunito + Quicksand fonts
- Calendar floating controls, rounded task cards

### Fixed (6 patches)

- Task list scrolling (native `overflow-y-auto` replacing Radix ScrollArea)
- Calendar pinch-to-zoom threshold (10px from 50px for trackpad)
- Duplicate "Today" columns (UTC vs local time mismatch)
- Sort header alignment, page max-width, header breathing room

---

## v0.49.0–v0.49.9 — 2026-02-18/19

### Post-Migration Bug Audit & Features

Major bug-fix and feature sprint after React migration:

- **Legacy frontend toggle**: `SERVE_LEGACY_FRONTEND=true` for parallel deployment
- **Mobile gestures**: Swipe complete/schedule, pull-to-refresh, long-press action sheet
- **Calendar features**: Drag-to-reschedule, instance cards, swipe navigation, auto-scroll during drag, phantom card drop indicator, cross-day drag, adjacent-day sync
- **Task interactions**: Context menus, kebab menus, inline add-task, date shortcuts
- **Undo toasts** on all operations with task names
- **Accessibility**: aria-live announcer, reduced motion support, 44px touch targets
- **Glass morphism**: Header, nav, energy selector with frosted glass effect
- **Demo pill widget** for demo users
- **Pending past instances banner** with bulk Complete/Skip
- **Network status monitoring** with persistent toasts
- **Error boundary** preventing white-screen crashes

### Fixed (~40 patches)

- Sort/filter persistence across reload, swipe cascade to subtasks, plan mode parallel scheduling, calendar time indicator, wizard domain deletion, encrypted text flash, CSRF token flow, subtask editing, domain group expand/collapse, and many more

---

## v0.48.0–v0.48.12 — 2026-02-17/18

### React SPA Launch

- **v0.48.0**: Removed all legacy frontend (18 Jinja2 templates, 25 JS modules, 22 CSS files, vendor libs, legacy routers, obsolete tests). Added keyboard shortcuts and motion animations.
- **Analytics page**: Interactive charts (completions, domain breakdown, heatmap, velocity trends)
- **Frontend CI**: TypeScript, Biome lint, and production build in GitHub Actions
- **Railway deployment**: Resolved railpack Node.js detection through multiple iterations (v0.48.3–v0.48.8)
- **Encryption hardening**: Fixed ciphertext flash, enable corruption race, child route rendering behind unlock dialog
- **CSRF flow**: Added token endpoint and axios interceptor for SPA
- **27 hardcoded query keys** replaced with generated helpers
- **11 backend endpoints** got response models for proper TypeScript codegen

---

## v0.47.0–v0.47.9 — 2026-02-17

### React SPA Migration

Built the entire React frontend from scratch:

- **v0.47.0**: Scaffold — Vite 6, React 19, TypeScript, TanStack Router/Query, Zustand, Tailwind v4, shadcn/ui, dnd-kit, orval
- **v0.47.1**: API codegen (82 types), encryption/passkey ports, Zustand stores, `use-crypto` hook
- **v0.47.2**: App shell, auth guard, login, theme provider, encryption unlock modal
- **v0.47.3**: Settings, Thoughts, Privacy/Terms pages, onboarding wizard
- **v0.47.4**: SPA serving, static assets, service worker, PWA meta tags, Railway build
- **v0.47.5**: Dashboard task panel with domain grouping, subtrees, encryption
- **v0.47.6**: Task editor sheet, quick add, recurrence picker, sort/filter/energy controls
- **v0.47.7**: Calendar panel — 3-day carousel, time grid, overlap detection, zoom, Plan My Day
- **v0.47.8**: Drag-and-drop — task-to-calendar, calendar-to-list, task-to-task reparenting
- **v0.47.9**: Mobile — swipe gestures, haptic feedback, long-press action sheet, gesture discovery

---

## v0.46.0–v0.46.7 — 2026-02-17

### Subtask System

- Depth-1 constraint (subtasks can't have subtasks)
- Completion cascade (parent → children)
- Expand/collapse containers with persisted state
- Create, reparent, and promote subtasks from UI
- Todoist import flattens deep nesting to depth-1
- JS modules preserve subtask containers during sort/drag/count

---

## v0.45.67–v0.45.99 — 2026-02-15/17

### Drag-and-Drop & Calendar Overhaul

- **Custom drag overlay**: Fixed-position clone follows cursor, morphs to event pill over calendar
- **Phantom card**: Drop indicator showing task title, time, impact rail with 15-minute snap
- **Auto-scroll**: Vertical scroll near top/bottom edges during drag
- **Cross-day drag**: Hover near edge for 500ms navigates to adjacent day
- **Adjacent-day sync**: Bidirectional mirroring of evening/morning tasks across day boundaries
- **Toast stacking**: Max 3 visible simultaneously with `Toast.undo()` convenience method
- **Snapshots**: Automated daily backups with content-hash dedup (6 new API endpoints)

### Fixed (30+ patches)

- Drag ghost offset (5 iterations from native ghost → clone → custom overlay)
- Adjacent-day mirroring edge cases (undo, clone cleanup, reschedule)
- Calendar completion/reopen visual state management
- Numerous undo toast and scroll-to-task fixes

---

## v0.45.30–v0.45.66 — 2026-02-13/15

### PWA & Mobile Polish

- **PWA viewport fix**: 3 independent iOS triggers identified and fixed — `overflow:hidden`, `position:fixed`, `100dvh` underreporting. See [docs/PWA-VIEWPORT-FIX.md](docs/PWA-VIEWPORT-FIX.md)
- **In-place mutations**: Surgical DOM updates replacing page reloads for all task operations
- **Calendar improvements**: Fixed calendar header, scroll-to-now, glass backdrop, swipe navigation
- **Recurring tasks**: Auto-populate scheduled_date, undo instance reschedule
- **Privacy policy**: Standalone page for Google OAuth verification
- **Claude Code skills**: `/fix-issue` and `/fix-all-issues` slash commands

---

## v0.45.0–v0.45.29 — 2026-02-12/13

### Thoughts Redesign & Misc

- **Chat-style Thoughts page**: Bottom-input layout, date separators, slide-up animations, glass morphism
- **Mobile polish**: Pull-to-refresh, parent task name wrapping, PWA safe areas
- **Sentry auto-fix workflow**: Auto-assigns issues to Copilot agent

---

## v0.44.0–v0.44.11 — 2026-02-11

### Mobile Redesign (Thoughts, Analytics, Settings)

Full-viewport scrolling, glass-morphism sticky headers, edge-to-edge layout, 44px touch targets. iMessage-style thought capture button. Toast improvements (undo duration, wrapping, full-width snackbar).

---

## v0.42.42–v0.43.3 — 2026-02-10/11

### Glass UI & Mobile UX Overhaul

- **Floating glass energy selector**: iOS-style segmented control above tab bar
- **Glass everywhere**: Header, task-list header, domain headers, tab bar — progressive iterations to Telegram-matched transparency levels
- **Nunito font**: System font → Nunito throughout
- **Gesture discovery**: Animated swipe hint, purple edge hint, long-press tooltip
- **Swipe-left schedules** (was delete; delete moved to long-press)
- **Mobile filter bar**: Full sort labels, gradient spectrum bar, 44px tap targets
- **Calendar fade gradient**: CSS `mask-image` on carousel

---

## v0.42.7–v0.42.41 — 2026-02-09/10

### v1.0 Security Audit & Calendar Features

**Security (15 patches)**:
- CSP hardening (self-hosted all vendor scripts)
- Rate limits on destructive endpoints
- Session fixation defense, backup import size limit
- Input validation (range, max_length, batch size)
- Offline mutation guards, HTMX CSRF injection
- domain_id IDOR fix, batch update rollback, /ready info leak fix

**Features**:
- Calendar zoom (+/- and Ctrl+scroll, persisted)
- Calendar card context menus (Skip, Unschedule, Edit, Delete)
- Actions menu (kebab ⋮) on all tasks with undo-based delete
- Universal departing animation for complete/schedule/delete

---

## v0.42.0–v0.42.6 — 2026-02-08/09

- Complete `safeFetch()` migration (zero plain `fetch()` in application code)
- Keyboard shortcuts: j/k navigation, c/e/x task actions, help modal

---

## v0.40.0–v0.41.1 — 2026-02-08

### Production Hardening & Toast Rewrite

- Database pool tuning, statement timeout (30s), graceful shutdown
- `safeFetch()` error recovery foundation with typed error classes
- Toast system rewrite: queue, type variants, action buttons, deduplication
- Keyboard shortcuts discoverability

---

## v0.39.0–v0.39.8 — 2026-02-07/08

- **Rename clarity to Mode**: clear/defined/open → autopilot/normal/brainstorm
- **Impact labels**: Unified to High/Mid/Low/Min
- **Demo account overhaul**: Realistic PM persona with ~50 tasks

---

## v0.37.0–v0.38.0 — 2026-02-07

### Task List Refinements

- Meta column opacity, ghost checkbox, clarity text labels, domain task counts
- Plan My Day contextual banner, calendar auto-advance after 8pm
- Past-tasks amber badge with Complete/Skip popover

---

## v0.34.0–v0.36.0 — 2026-02-06

### Header & Task List Redesign

- Two-row header layout with energy + view chips
- Flat scheduled/completed sections (no per-domain nesting)
- Brand-aligned spectrum gradient, segmented view toggle
- Collapsible sections, neutral subtask badges, impact labels

---

## v0.32.0–v0.33.1 — 2026-02-02/06

### Recurring Tasks & GCal Sync Hardening

- Skip instances, batch completion, recurrence bounds, drag reschedule
- Per-user sync lock, adaptive throttle, circuit breaker, calendar reuse
- Clarity rename: executable→clear, exploratory→open

---

## v0.31.0–v0.31.9 — 2026-02-02

### Google Calendar Task Sync

One-way sync to dedicated "Whendoist" calendar with impact-based colors. Settings UI, OAuth scope upgrade, fire-and-forget background sync. Non-blocking bulk sync with adaptive throttle.

---

## v0.30.0–v0.30.1 — 2026-02-01

- Subtask hierarchy in Todoist import
- Parent breadcrumb display and subtask count badges
- CI pipeline parallelization, Railway auto-deploy

---

## [0.24.0–0.29.0] — 2026-01 — Production Hardening

CSRF protection, health checks, observability (JSON logging, Prometheus, Sentry), PostgreSQL integration tests, API versioning (`/api/v1/*`), service extraction.

## [0.14.0–0.18.0] — 2026-01 — Performance & Testing

CTE-based analytics, SQL-level filtering, calendar caching, Alembic migrations, database indexes, rate limiting, CSP headers.

## [0.10.0] — 2026-01 — Mobile Adaptation

Service worker, bottom sheet, swipe gestures, long-press, pull-to-refresh, mobile tab layout.

## [0.9.0] — 2026-01 — Brand & Onboarding

WhenWizard 8-step flow, landing page animation, 70+ SVG icons, 21 illustrations, semantic CSS tokens, dark mode, accessibility.

## [0.8.0] — 2026-01 — E2E Encryption & Passkeys

AES-256-GCM with PBKDF2, WebAuthn/FIDO2 passkey unlock, global encryption toggle, Todoist import preview, Plan My Day undo.

## [0.7.0] — 2026-01 — Analytics & Backup

Analytics dashboard, backup/restore, completed task tracking, Todoist completed import.

## [0.6.0] — 2026-01 — Thought Cabinet

Quick capture page with promote-to-task, delete with undo.

## [0.5.0] — 2026-01 — UI Polish

Grid-based task layout, hour banding, border hierarchy refinements.

## [0.4.0] — 2026-01 — Native Task Management

Task dialog, recurrence picker, drag-to-trash, domain management, Todoist import.

## [0.3.0] — 2025-12 — Plan My Day

Click-and-drag time range selection, smart scheduling, PWA support.

## [0.2.0] — 2025-12 — Drag-and-Drop Scheduling

Drag tasks to calendar, 15-minute snapping, overlap detection, calendar carousel.

## [0.1.0] — 2025-12 — Initial Release

OAuth2 authentication, task display, energy-based filtering, calendar selection.
