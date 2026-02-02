# Changelog

Development history of Whendoist, condensed into major milestones.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [0.32.13] - 2026-02-02 — Skip Recurring Task Instances

### Added
- **Skip action for recurring task instances** — right-click the completion gutter on a recurring task to show a context menu with "Skip this instance" option
- **Mobile skip support** — added "Skip instance" button to mobile task action sheet and task edit form for recurring tasks
- **Skipped instance visual styling** — skipped instances show with italic strikethrough and reduced opacity, distinct from completed tasks; includes dark mode support

---

## [0.32.12] - 2026-02-02 — Completion Visual Mismatch Fix

### Fixed
- **Task list date/completion mismatch for recurring tasks** — when today's instance is completed, the task list now shows "Today ✓" instead of the next occurrence date (e.g., "Feb 04"), resolving the confusing visual where a checked checkbox appeared next to a future date
- Pass `today` to the task list partial endpoint so it's available for the template

---

## [0.32.11] - 2026-02-02 — Weekly Preset Day of Week

### Fixed
- **Weekly preset ambiguity** — selecting "Weekly" recurrence now auto-selects today's day of week (e.g., "Every Monday" on a Monday) instead of sending a bare `{ freq: 'weekly', interval: 1 }` with no day, which relied on unpredictable backend defaults. Applied to both desktop dialog and mobile recurrence picker.

---

## [0.32.10] - 2026-02-02 — Prevent Recurrence Rule Data Loss

### Fixed
- **Recurrence rule data loss on edit** — editing a task with advanced recurrence fields (week_of_month, month_of_year) no longer silently drops those fields on save; both desktop dialog and mobile picker now preserve unknown fields
- **Desktop dialog missing yearly frequency** — added "years" option to the custom recurrence frequency select
- **Desktop dialog missing day-of-month for monthly** — added day-of-month input that shows when monthly frequency is selected
- **Desktop dialog `populateCustomRecurrence()` incomplete** — now restores day_of_month and correctly shows/hides freq-dependent UI rows

---

## [0.32.9] - 2026-02-02 — Recurring Task UX Fixes

### Fixed
- **`aria-pressed` wrong for recurring tasks** — screen readers now correctly report completion state for recurring task instances (was always "false" because it checked `task.status` instead of instance completion)
- **Toast text for recurring task completion** — gutter click now shows "Done for today" / "Reopened for today" instead of generic "Task completed" / "Task reopened"

---

## [0.32.8] - 2026-02-02 — GCal Sync Docs Consolidation

### Changed
- Consolidated three GCal sync docs into single [docs/GCAL-SYNC.md](docs/GCAL-SYNC.md) describing current architecture
- Archived `GCAL-SYNC-PLAN.md`, `GCAL-SYNC-HARDENING.md`, `GCAL-HABITS-CLUTTER.md` (fully implemented)
- Fixed stale doc links in CHANGELOG and archived cross-references

---

## [0.32.7] - 2026-02-02 — Sync Recurring Task Instances on Create/Update

### Fixed
- **Recurring task instances not syncing to GCal on create/update** — creating or updating a recurring task now triggers a bulk sync so all materialized instances appear on Google Calendar immediately, instead of waiting for the hourly background job

---

## [0.32.6] - 2026-02-02 — Faster Deploys

Instance materialization now runs as a background task after the server starts accepting connections, instead of blocking startup. This fixes intermittent Railway healthcheck failures where the 30-second window expired during heavy materialization + GCal sync work.

### Fixed
- **Intermittent deploy failures** — healthcheck no longer times out waiting for materialization to complete
- Server responds to `/health` immediately after migrations and DB connectivity check

### Changed
- Initial instance materialization runs in the background task loop (first iteration is immediate, then hourly)

---

## [0.32.5] - 2026-02-02 — Recurring Tasks Don't Clutter GCal

Recurring tasks (habits) only sync to Google Calendar when scheduled for a specific time. Unscheduled recurring tasks stay in Whendoist, keeping your calendar clean.

### Changed
- **Recurring tasks without a time slot no longer sync to GCal** — daily habits like "Sport machen" or "Чтение книги" stay in Whendoist unless time-blocked
- **One-off tasks always sync** — with or without a time (all-day event if no time)
- Removed "Include date-only tasks as all-day events" setting (replaced by the new rule)
- Existing habit events in GCal are automatically cleaned up on next sync

### Removed
- `gcal_sync_all_day` preference — no longer needed

See [docs/archive/2026-02-02-gcal-habits-clutter.md](docs/archive/2026-02-02-gcal-habits-clutter.md) for background.

---

## [0.32.4] - 2026-02-02 — GCal Sync Hardening Round 2

Second round of GCal sync reliability fixes. See [docs/archive/2026-02-02-gcal-sync-hardening.md](docs/archive/2026-02-02-gcal-sync-hardening.md) for full details.

### Fixed
- **Disable sync hangs / toggle stays on** — replaced per-event deletion loop (384 events x 1s throttle = 6+ min timeout) with single `delete_calendar` API call
- **Enable sync blocks for minutes** — moved `clear_all_events` from enable handler to background task
- **Progress stuck at "0 events"** — added in-memory progress tracking (DB hasn't committed during sync)
- **Disable during sync doesn't stop it** — added in-memory cancellation signal checked before each API call
- Improved error logging with full tracebacks, added frontend error alerts for disable failures

### Changed
- **5x faster bulk sync** — API throttle reduced from 1.0s to 0.2s per call (~5 QPS). 384 events: ~80s instead of ~6.5 min
- **Snappier UI** — optimistic toggle state, "Enabling..."/"Disabling..." feedback, 1s poll interval (was 3s)
- Removed dead `delete_all_synced_events()` method

---

## [0.31.9] - 2026-02-02 — Settings Redesign & Uniform GCal Event Color

### Changed
- **Settings: Consolidated Google Calendar into Integrations** — Google Calendars and Task Sync panels merged into an expandable section under the Google Calendar row in Integrations, matching the Todoist pattern. CONNECTIONS section went from 3 panels to 1
- **Settings: Whendoist calendar hidden from toggle list** — the sync output calendar is no longer shown as a toggleable calendar; instead it appears as a status hint next to the Task Sync label
- **Settings: Calendar toggles use fetch** — replaced HTMX-based calendar toggles with plain fetch calls for reliability inside expandable sections
- **GCal events inherit calendar color** — events synced to Google Calendar no longer set per-event `colorId` based on impact level; they inherit the Whendoist calendar's color instead, which the user can configure in Google Calendar settings
- Removed `GCAL_COMPLETED_COLOR_ID` and `GCAL_IMPACT_COLOR_MAP` constants (no longer needed)

---

## [0.31.8] - 2026-02-02 — Drag-and-Drop Duration Fix

### Fixed
- **Drag-and-drop overwrites task duration to 30 minutes** — the drop handler now sends `duration_minutes` to the API, preventing the backend validator from replacing the existing duration with the default

---

## [0.31.7] - 2026-02-02 — GCal Sync Hardening

### Fixed
- **Lock race condition** — per-user sync lock now uses `setdefault` to prevent TOCTOU on concurrent init
- **Throttle orphan deletion** — orphan event cleanup in bulk_sync and delete_all_synced_events now uses adaptive throttle to avoid rate limits
- **Calendar reuse clears stale events** — re-enabling sync on an existing "Whendoist" calendar now drops all events and sync records, then recreates from scratch to prevent orphans/duplicates
- **Removed dead constant** — `GCAL_SYNC_BATCH_RATE_LIMIT` was defined but never used

### Changed
- UI clarifies that sync may take up to 10 minutes depending on number of tasks
- Sync records are always cleared on enable (not just when calendar ID changes) since events are recreated

---

## [0.31.6] - 2026-02-02 — Fully Async GCal Sync

### Changed
- **All sync operations are now server-side background tasks** — enable, re-sync, and all-day toggle all return instantly
- Full-sync endpoint fires background task instead of blocking the HTTP request
- Status endpoint exposes `syncing` boolean so UI knows when sync is in progress
- Re-sync button polls status every 3s, shows live event count while syncing
- Page load auto-detects running sync and shows progress on re-sync button

---

## [0.31.5] - 2026-02-02 — GCal Sync: Non-blocking, Adaptive Throttle, Dedup

### Fixed
- **Bulk sync runs in background** — enable returns instantly, no more hanging UI
- **Adaptive throttle** — starts at 1 QPS, automatically slows down when rate-limited (adds +3s penalty per hit)
- **Reuse existing calendar** — `find_or_create_calendar` detects existing "Whendoist" calendar, cleans up duplicates instead of creating new ones every enable
- **Per-user sync lock** — prevents concurrent bulk syncs (double-click, rapid re-enable)
- **Rate limit vs permission 403** — Google `usageLimits` domain 403s retry with 5s/10s/20s backoff instead of permanently disabling sync
- Stale sync records cleared only when calendar ID changes (not on every re-enable)
- UI disables enable button during operation, all-day toggle ignores sync errors

---

## [0.31.2] - 2026-02-02 — GCal Sync Circuit Breaker

### Fixed
- Bulk sync now aborts immediately on calendar-level errors (403/404) instead of retrying hundreds of tasks
- Auto-disables sync and clears stale calendar ID when calendar is deleted externally or access is lost
- Settings page shows error banner when sync is auto-disabled, with clear guidance to re-enable
- Fire-and-forget background tasks log warnings (not debug) for calendar-level failures
- Re-enable always creates a fresh calendar instead of reusing a potentially stale ID

---

## [0.31.1] - 2026-02-02 — Sync Completed Todoist Imports

### Fixed
- Completed tasks imported from Todoist now sync to Google Calendar using `completed_at` date as fallback when `scheduled_date` is missing

---

## [0.31.0] - 2026-02-02 — Google Calendar Task Sync

### Added
- One-way sync: scheduled tasks appear in a dedicated "Whendoist" calendar in Google Calendar
- Impact-based event colors: P1=Tomato, P2=Tangerine, P3=Banana, P4=Sage
- Completed tasks show with "✓ " prefix and Graphite color
- Recurring task instances synced individually (no RRULE)
- Settings UI: enable/disable sync toggle, all-day event toggle, re-sync button
- OAuth scope upgrade flow for calendar write access (incremental consent)
- Dashboard deduplication: filters out events from the Whendoist sync calendar
- `duration_minutes` auto-set to 30 when `scheduled_time` is provided without a duration
- New database table `google_calendar_event_syncs` for sync state tracking
- API endpoints: `/api/v1/gcal-sync/enable`, `/disable`, `/status`, `/full-sync`
- Fire-and-forget background sync on task create/update/complete/delete

### Changed
- Google OAuth now supports optional write scope for calendar sync
- Encryption users see sync toggle greyed out (requires plaintext titles)

---

## [0.30.1] - 2026-02-01 — Quieter Production Logs

### Changed
- Startup logs now include version and boot timing (e.g., `Starting Whendoist v0.30.1 ... Startup complete (2.5s)`)
- Migration script is quiet on no-op (single line instead of 10-line banner)
- Materialization logs include task counts; silent at INFO level when idle
- Alembic context info downgraded from WARNING to DEBUG in production
- Periodic materialization loop only logs at INFO when work is actually done

---

## [0.30.0] - 2026-02-01 — Subtask Hierarchy & CI/CD Simplification

### Added
- Subtask hierarchy in Todoist import (two-pass import preserving parent-child relationships)
- Parent breadcrumb display and subtask count badges in task list
- Cascade delete confirmation when deleting parent tasks

### Changed
- CI pipeline: all 3 jobs (lint, typecheck, test) run in parallel
- Deployment: Railway auto-deploys on merge with "Wait for CI" gate

### Removed
- Release workflow, build provenance system, build manifest scripts

## [0.24.0–0.29.0] - 2026-01 — Production Hardening

### Added
- CSRF protection with synchronizer token pattern
- Health checks on `/ready` endpoint (database, Google Calendar)
- Observability: structured JSON logging, Prometheus metrics, Sentry integration
- PostgreSQL integration tests with service containers
- Centralized constants and cleanup jobs

### Changed
- API versioning with `/api/v1/*` routes
- Business logic extracted from routes to dedicated services
- Legacy `/api/*` routes removed

## [0.14.0–0.18.0] - 2026-01 — Performance & Testing

### Added
- CTE-based analytics queries (26+ queries down to ~10)
- SQL-level task filtering (replaces Python filtering)
- Calendar event caching (5-minute TTL)
- Alembic migrations with async SQLAlchemy support
- Database indexes for common query patterns

### Changed
- Rate limiting: 10 req/min auth, 5 req/min encryption
- CSP headers and PBKDF2 600k iterations (OWASP 2024)

## [0.10.0] - 2026-01 — Mobile Adaptation

### Added
- Service worker for offline caching
- Bottom sheet component with swipe-to-dismiss
- Task swipe gestures (right to complete, left to delete)
- Long-press action sheet and haptic feedback
- Pull-to-refresh and network status indicators
- Mobile tab layout (Tasks/Schedule)

## [0.9.0] - 2026-01 — Brand & Onboarding

### Added
- WhenWizard 8-step onboarding flow
- Landing page task-to-calendar animation
- 70+ stroke-based SVG icons and 21 illustrations
- Icon sprite system and brand assets

### Changed
- Migrated to semantic CSS tokens with full dark mode
- Accessibility: ARIA labels, skip-to-content, prefers-reduced-motion

## [0.8.0] - 2026-01 — E2E Encryption & Passkeys

### Added
- AES-256-GCM encryption with PBKDF2 key derivation
- WebAuthn/FIDO2 passkey unlock (PRF extension)
- Global encryption toggle for task titles, descriptions, domain names
- Todoist import preview dialog
- Plan My Day undo with toast

## [0.7.0] - 2026-01 — Analytics & Backup

### Added
- Analytics dashboard with ApexCharts
- Backup/restore (JSON export/import)
- Completed task tracking with visual aging
- Todoist completed task import

### Changed
- Migrated to Todoist API v1

## [0.6.0] - 2026-01 — Thought Cabinet

### Added
- Quick capture page with promote-to-task action
- Delete with undo toast

## [0.5.0] - 2026-01 — UI Polish

### Added
- Grid-based task layout with fixed-width columns
- Hour banding and time axis on calendar

### Changed
- Refined border hierarchy and hover states

## [0.4.0] - 2026-01 — Native Task Management

### Added
- Task dialog with full editing (title, description, schedule, duration, impact, clarity)
- Recurrence picker for repeating tasks
- Drag-to-trash deletion
- Domain management and Todoist import

## [0.3.0] - 2025-12 — Plan My Day

### Added
- Click-and-drag time range selection
- Smart scheduling algorithm
- PWA support (fullscreen, safe area)

## [0.2.0] - 2025-12 — Drag-and-Drop Scheduling

### Added
- Drag tasks from list to calendar
- 15-minute interval snapping and duration-based event sizing
- Overlap detection (max 3 columns)
- Calendar carousel (15 days)

## [0.1.0] - 2025-12 — Initial Release

### Added
- OAuth2 authentication (Todoist, Google Calendar)
- Task fetching, display, and grouping by project
- Energy-based task filtering
- Settings page for calendar selection
