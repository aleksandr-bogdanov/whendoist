# Changelog

Development history of Whendoist, condensed into major milestones.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [0.31.3] - 2026-02-02 — GCal Sync Rate Limiting & Reliability

### Fixed
- Distinguish Google API rate limit 403 from permission 403 — rate limits now retry with exponential backoff instead of permanently disabling sync
- Add 150ms delay between bulk sync API calls to avoid hitting Google's rate limit
- Clean stale sync records when re-enabling sync — prevents duplicate events across calendars
- Enable endpoint now returns failure when initial bulk sync auto-disables sync (previously returned `success: true`)
- UI disables enable button during sync to prevent rapid re-enable clicks
- All-day toggle's background full-sync no longer logs 400 errors when sync is disabled

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
