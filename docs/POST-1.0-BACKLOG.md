# Post-v1.0 Backlog

> Features and improvements deferred past v1.0. One line per item — plans linked where they exist.
>
> See also: [Competitive Gap Analysis](COMPETITIVE-GAP-ANALYSIS.md) — full feature comparison vs. Todoist, TickTick, Things 3, Fantastical, Any.do, Google Tasks, Motion, Reclaim.ai, Sunsama.

---

## Shipped

Everything below has been implemented and verified in the codebase.

- ~~**Bulk operations**~~ — Multi-select shipped in v0.55.90–v0.55.96 — [plan](plans/2026-03-02-multi-select-batch-operations.md)
- **Instance support in batch ops** — FAB, batch edit, batch drag, and context menu all handle instances
- **Batch drag overlay for instances** — Overlay says "items" when selection contains instances
- **⌘+A feedback** — Toast shows task + instance count breakdown on select-all
- **Batch edit "mixed values"** — Shows "Mixed" placeholder when selected tasks have differing field values
- **Popover viewport awareness** — All selects use `position="popper"` (Floating UI auto-flip)
- **Shift+Click range selection** — Contiguous range in task list and calendar (including cross-section)
- **Lasso / drag-select on calendar** — Click+drag draws selection rectangle with auto-scroll
- **Command palette batch expansion** — Reschedule, Unschedule, Edit, Complete, Today, Tomorrow, Delete
- **Task search** — Fuzzy full-text search via fuse.js, ⌘K palette with filters, recents, and quick-create
- **Undo/Redo** — Toast undo for complete, reschedule, edit, delete, skip, and all batch operations
- **PWA install** — Manifest, service worker, app shortcuts, iOS viewport fix, update prompt
- **Timezone-aware scheduling** — `RecurrenceService._to_utc_datetime()` with `ZoneInfo` conversion
- **Recurrence start vs scheduled date** — Bidirectional sync logic keeps both in sync
- **Instance cleanup on rule change** — `regenerate_instances()` called when rule/time/dates change
- **Rapid toggle drops sync** — Per-user `asyncio.Lock` prevents concurrent bulk syncs
- **Bulk sync timeout** — `asyncio.wait_for()` with `MATERIALIZATION_TIMEOUT_SECONDS`
- **Orphan calendar events** — `clear_all_events()` on re-enable; full calendar delete on disable
- **Passkey deletion rate limit** — `@limiter.limit(ENCRYPTION_LIMIT)` on DELETE endpoint
- **Calendar subscription export** — RFC 5545 iCal feed with RRULE, token auth, in-memory cache
- **Offline mutation guards** — Axios request interceptor checks `navigator.onLine` on all requests + persistent offline toast via `useNetworkStatus`
- **Analytics aging stats bounded** — `_get_aging_stats()` now has both date (`AGING_STATS_HISTORY_DAYS=730`) and count (`AGING_STATS_LIMIT=5000`) bounds
- **Instance cleanup audit trail** — `cleanup_old_instances` logs per-user/per-status breakdown before bulk delete
- **Task activity log** — Per-task + per-user event history with hybrid encrypted/plaintext field diffs — [plan](plans/2026-03-04-activity-log.md)

---

## v1.1–v1.5: Stability & Refinement

### Product

- ~~**Task activity log**~~ — Shipped — [plan](plans/2026-03-04-activity-log.md)
- **Offline write queue** — IndexedDB mutation queue with sync-on-reconnect
- **Encryption passphrase change** — Re-encrypt without disable/re-enable cycle
- **Scheduled export automation** — Automated periodic backups beyond manual snapshots
- **Multi-timezone calendar** — Secondary timezone labels on the time grid for remote workers — [investigation](plans/2026-03-02-multi-timezone-investigation.md)

### Recurring Tasks

- **Monthly 31st skips short months** — Needs UI warning for months with <31 days
- **Skip → toggle gives completed** — Backend `toggle_instance_completion` sends skipped→completed (frontend works around it via dedicated `unskip` endpoint)

### GCal Sync

- **Fire-and-forget skips lock** — `_fire_and_forget_bulk_sync` in tasks.py and instances.py doesn't acquire per-user lock

### Infrastructure (Trigger-Based)

- **Redis rate limiting** — Required before `replicas > 1` (in-memory counters are per-process)
- **Redis calendar cache** — Required before multi-worker deployment
- **JS test infrastructure** — Prerequisite for offline queue, encryption testing, frontend complexity
- **Honeycomb/OpenTelemetry** — Distributed tracing for performance profiling

---

## v2.0: Integrations & Intelligence

- **Public API & API keys** — API key auth, rate limiting, OpenAPI docs — [investigation](plans/2026-03-02-integration-ecosystem-investigation.md)
- **Webhooks** — Event-driven notifications on task mutations (requires API keys first)
- **Zapier/Make.com integration** — Triggers (task completed) and actions (create task)
- **Todoist live sync** — Bidirectional sync (currently one-time import only)
- **Pattern learning** — Suggest scheduling from usage history
- **Smart scheduling** — AI-assisted, user-controlled (not auto-scheduling)
- **Advanced analytics** — Time tracking, estimation accuracy (actual vs estimated)

---

## v3.0: Collaboration

- **Team workspaces** — Shared task domains with role-based access
- **Task assignment** — Delegation and ownership transfer
- **Shared views** — Collaborative dashboards and calendars

---

## Not in Scope

- Native iOS/Android apps
- Recurring task templates library
- Premium/paid tiers

---

## What We've Built (feature timeline)

A concrete list of everything shipped, from first commit to today.

**Core Task Management**
- Task CRUD with domains (projects), priority (impact), clarity, and duration
- Subtask hierarchy (depth-1) with drag-and-drop reparenting and completion cascade
- Task sorting by domain, impact, clarity, duration, and custom position
- Inline editing with interactive attribute pills
- Quick add with smart input parsing (`#domain`, `!priority`, `?clarity`, `30m`, `tomorrow`, `//notes`)
- Inline add in domain groups and subtask ghost rows
- Task archiving (soft delete) with restore and undo
- Energy filter — toggle between Full/High/Low/All energy views

**Calendar**
- Day view calendar with extended 44-hour single-day timeline (yesterday evening → tomorrow morning)
- Touch carousel with swipe navigation (mobile) and trackpad/wheel (desktop)
- Drag-and-drop scheduling — drag tasks from list to calendar time slots
- Drag-to-reschedule within calendar (single and batch)
- Anytime section for unscheduled tasks on a specific date
- Date group header drops, time slot snapping (15-min intervals)
- Context menus on calendar cards (complete, skip, reschedule, unschedule, delete)
- Phantom card preview during drag showing exact drop position
- Auto-scroll when dragging near edges

**Recurring Tasks**
- Recurrence rules (daily, weekdays, weekly, monthly, yearly) with start/end bounds
- Instance materialization in background task (60-day lookahead)
- Per-instance actions: complete, skip, unskip, reschedule
- Batch completion for past instances
- Timezone-aware instance generation via ZoneInfo
- Automatic instance regeneration when rules change

**Google Calendar Sync**
- Two-way push sync — tasks appear as GCal events, changes reflected back
- Per-user locking to prevent concurrent syncs
- Token refresh during long-running syncs
- Bulk sync with progress tracking and timeout protection
- Calendar creation/reuse on enable, full cleanup on disable
- Recurring instance sync (all-day and timed events)

**iCal Calendar Feed**
- RFC 5545 subscription URL for Apple Calendar, Outlook, Google Calendar
- RRULE for recurring tasks (not materialized instances)
- Token-based authentication with IP rate limiting
- In-memory cache with data_version invalidation

**Plan My Day**
- Interactive time range selection — drag on calendar to select scheduling window
- Auto-scheduling algorithm considering existing tasks, events, and instances
- Pluggable strategy architecture (compact first-fit)
- Undo via toast, escape to cancel

**Command Palette & Search**
- ⌘K global search palette with fuzzy matching (fuse.js)
- Command mode (`>` prefix) with ~23 commands across 6 categories
- Task action drilldown (→ or Tab to see actions for a result)
- Creation fallthrough — create tasks or capture thoughts directly from search
- Smart filters (`@today`, `@overdue`, `#Domain`, `@completed`)
- Subtask search with "Parent > Subtask" display
- Recent tasks and "Right Now" counts in empty state
- Keyboard shortcuts displayed alongside commands (training pattern)
- Mobile search button in bottom nav

**Multi-Select & Batch Operations**
- ⌘/Ctrl+Click toggle, Shift+Click range, ⌘+A select all
- Lasso (click+drag) selection on calendar with auto-scroll
- Floating action bar with batch complete, delete, reschedule, unschedule, edit, skip
- Batch context menu (right-click selected items)
- Batch drag on calendar — phantom shadows for all selected items
- Batch edit popover (impact, clarity, duration, domain) with "Mixed" detection
- Single toast with single undo for every batch operation
- Instance-aware: all operations handle tasks and recurring instances together
- Command palette batch actions

**Thoughts (Inbox)**
- Capture-first brainstorm page — type ideas, triage later
- Chat-style mobile layout with glassmorphic UI
- Triage drawer (bottom sheet) with smart input, domain/impact/schedule/duration/clarity pickers
- Desktop split-pane: thought list + inspector side-by-side
- Convert thought to task with full metadata
- Delete with undo

**Analytics**
- Completion stats, velocity chart, week-over-week comparison
- Active hours area chart, resolution time donut
- Domain breakdown, impact distribution
- Recurring task progress bars
- Streaks and heatmap
- Range selector (7d / 30d / 90d / 1y)

**Authentication & Security**
- Google OAuth login with CSRF protection
- WebAuthn passkeys (register, authenticate, delete) with rate limiting
- End-to-end encryption (AES-256-GCM) for task titles, descriptions, domain names
- Client-side encryption/decryption at TanStack Query layer
- Encryption setup, disable, and key verification flows
- Session management, CSRF tokens, nonce-based CSP
- Rate limiting on destructive endpoints
- Input validation (Pydantic) with sanitized error responses

**Data Management**
- Todoist one-time import (projects → domains, tasks with metadata)
- JSON backup export/import with encryption metadata
- Scheduled export snapshots (daily, configurable retention)
- Data wipe with GCal cleanup
- Demo accounts (multi-tenant, isolated per session)

**PWA & Mobile**
- Installable PWA with manifest, service worker, and app shortcuts
- iOS PWA viewport fix (screen.height-based `--app-height`)
- Bottom pill navigation with glassmorphic treatment
- Mobile swipe gestures (right: complete, left: schedule)
- Long-press context menus, haptic feedback
- Mobile task edit drawer (bottom sheet)
- Touch-optimized targets (44px+), safe area handling
- PWA update prompt with toast

**Desktop Experience**
- Split-pane dashboard: task list + calendar/editor side panel
- Inline task detail panel (edit without leaving dashboard)
- Keyboard shortcuts for navigation (j/k), actions (e, n, d), and all operations
- Shortcuts help modal with full reference
- Drag-and-drop reparenting with visual ghost placeholders

**Design & Polish**
- Brand-aligned design system with impact-colored rails and domain icons
- Dark mode with proper glass effects and contrast
- Apple Glass treatment: frosted headers, nav bar, energy selector
- Empty state illustrations with subtle animations
- Landing page with demo login
- Onboarding wizard (swipeable, 5 steps)
- Error boundaries with code splitting
- Unified toast system (10s duration, single constant)

**Infrastructure**
- FastAPI backend with SQLAlchemy async ORM
- PostgreSQL (prod) / SQLite (dev/test) via Alembic migrations
- React 19 SPA with TanStack Router/Query, Tailwind v4, shadcn/ui
- Orval API codegen from OpenAPI spec
- Zustand stores for client-side state
- Sentry integration with performance tracing
- CI pipeline: ruff, pyright, biome, tsc, pytest
- Railway deployment with railpack

---

*Source: v1.0 gate audits (`docs/plans/2026-02-09-*.md`), CHANGELOG.md, ongoing investigations*
