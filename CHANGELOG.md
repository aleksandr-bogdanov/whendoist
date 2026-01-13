# Changelog

All notable changes to Whendoist are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Task encryption integration (encrypt on submit, decrypt on display)
- Time blocking templates
- Redesign domain management UX
- Redesign CMPCT view
- WhenWizard setup flow (first launch or Settings → configure integrations, domains)

### Known Issues
- None currently tracked

---

## [0.8.1] - 2026-01-13

### Summary
**Hotfix** — Improved logging and fixed database connection pool issues.

### Fixed

- **Database Connection Stability** — Fixed "connection is closed" errors:
  - Added `pool_pre_ping=True` to detect and recycle stale connections
  - Added `pool_recycle=300` to refresh connections every 5 minutes
  - Configured proper `pool_size` and `max_overflow` settings
- **Clean Exception Logging** — Readable tracebacks instead of wall of text:
  - Filters out library internals, shows only app code
  - Clean box format with exception type, message, and traceback
  - Global exception handler returns proper 500 JSON response
- **Quieter Logs** — Reduced noise from asyncpg and uvicorn.access loggers

---

## [0.8.0] - 2026-01-11

### Summary
**E2E Encryption & Polish** — Optional end-to-end encryption for task data, polished Todoist import with preview, Plan My Day undo, compact task modal, and various UX improvements.

### Added

- **E2E Encryption** — Optional end-to-end encryption for task data:
  - Uses Web Crypto API with AES-256-GCM encryption
  - PBKDF2 key derivation from user passphrase (100,000 iterations, SHA-256)
  - Key stored in sessionStorage (cleared on logout/tab close)
  - Security panel in Settings to enable/disable encryption
  - Passphrase unlock modal on page load when encryption is enabled
  - Encryption salt and test value stored in UserPreferences
- **Todoist Import Preview** — Preview dialog before importing from Todoist:
  - Shows project count, task count, subtask count, completed count
  - Option to include/exclude completed tasks
  - Cancel or proceed with import
- **Plan My Day Undo** — Toast with undo button after auto-scheduling tasks
  - Stores original state (scheduled date/time) before scheduling
  - Restores original state when undo clicked
- **Cancel Button** — Task dialogs now have Cancel + primary action buttons
- **External Created At** — `external_created_at` field on Task model for preserving Todoist creation dates
- **Code Provenance** — Verify that deployed code matches GitHub source:
  - Build Provenance panel in Settings with version/commit info
  - "Verify Build" modal with file hashes and verification instructions
  - GitHub Actions release workflow with artifact attestations
  - SHA256 hashes for all static files, SRI hashes for key files
  - Build manifest at `static/build-manifest.json`
  - API endpoints: `/api/build/info`, `/api/build/verify`, `/api/build/hashes`

### Changed

- **Compact Task Modal** — Reduced padding, heights, and made form more compact
- **Scheduled Task Separation** — Scheduled tasks appear below unscheduled in Task List
  - Scheduled tasks have dashed border and muted styling
- **Recurring Task Completion** — Fixed Complete button in Edit Task modal to properly toggle today's instance
- **Analytics Domain Chart** — Removed Inbox from domain pie chart
- **Analytics Task Age** — Now uses `external_created_at` (Todoist creation date) when available

### Technical

- Added `crypto.js` for client-side encryption/decryption
- Added `encryption_enabled`, `encryption_salt`, `encryption_test_value` to UserPreferences
- Added `/api/preferences/encryption` endpoints (GET status, POST setup, POST disable)
- Added `get_encryption_context()` helper to pass encryption settings to all templates
- Added passphrase unlock modal to base template
- Added `get_or_create_today_instance()` to RecurrenceService for recurring task completion
- Updated toggle-complete API endpoint to handle recurring tasks
- Added preview endpoint `/api/import/todoist/preview` with ImportPreviewResponse
- Added ImportOptions model with `include_completed` and `completed_limit`
- Added `external_created_at` field to Task model and backup service
- Modified task ordering with SQLAlchemy CASE expression for schedule-based sorting
- Added `.btn-secondary` CSS class to dialog.css
- Added `build_info.py` router with `/api/build/info`, `/api/build/verify`, `/api/build/hashes` endpoints
- Added `scripts/generate-build-manifest.py` for build artifact generation
- Added `.github/workflows/release.yml` for automated releases with signed tags and attestations
- Settings page now includes Build Provenance panel with version info and Verify Build modal

---

## [0.7.0] - 2026-01-11

### Summary
**Task Completion Features** — Visual aging for completed tasks, user preferences for task display, comprehensive Analytics dashboard, Todoist API v1 migration with completed task import, and JSON backup/restore.

### Added

- **Backup & Restore** — Export and import all user data as JSON from Settings page
  - Download backup with timestamped filename
  - Restore from backup file (replaces all existing data)
  - Includes domains, tasks, task instances, and preferences
- **Task Completion Visibility** — Completed tasks remain visible for a configurable retention window (1/3/7 days) in both Task List and Calendar
- **Visual Aging** — Completed tasks fade based on completion time:
  - Today: greyed text with strikethrough
  - Older: muted grey (70% opacity) with strikethrough
- **Analytics Dashboard** — Comprehensive statistics page with ApexCharts visualizations:
  - Overview stats: completed, pending, completion rate, current streak
  - Daily completions bar chart
  - Domain breakdown donut chart
  - Best days (day of week) distribution
  - Active hours (hour of day) area chart
  - GitHub-style contribution heatmap (12 weeks)
  - Impact distribution (P1-P4 breakdown)
  - Velocity trend with 7-day rolling average
  - Task aging distribution
  - Recurring task completion rates
  - Recent completions log
  - Date range selector (7D / 30D / 90D)
- **Completed Tasks Settings** — Simplified settings panel:
  - **Show in Task List** — Toggle visibility of completed tasks in Task List (Calendar always shows them as history)
  - **Keep visible for** — Retention window (1/3/7 days) applies to both Task List and Calendar
  - **Position in Task List** — Move completed to bottom or keep in place
  - **Hide recurring after completing today** — For clean "remaining work only" view
- **Todoist Completed Task Import** — Import recently completed tasks for analytics history
- **User Preferences Model** — Backend storage for task display preferences

### Changed

- **Todoist API Migration** — Migrated from REST API v2 to API v1 for all operations
- **Recurring tasks in left panel** — Now show "done today" state when instance is completed
- **Calendar** — Always shows completed tasks (within retention window) since it's historical data
- **Completed task opacity** — Changed from 25% to 70% for better readability
- **Navigation** — Added Analytics to header nav, renamed CSS classes from `space-item` to `nav-item`

### Technical

- Migrated `TodoistClient` to Todoist API v1:
  - Changed base URL from `rest/v2` to `api/v1`
  - Updated pagination to cursor-based (`next_cursor`)
  - Labels now returned as names directly (not IDs)
  - Added `get_completed_tasks()` method
- Added `UserPreferences` model with 4 task display preferences
- Added `PreferencesService` for preference CRUD
- Added `AnalyticsService` with comprehensive statistics methods
- Added `/api/preferences` endpoints (GET/PUT)
- Added `/analytics` page route
- Added `completion_age_class` to task items for CSS styling
- Added clarity parsing from completed task content (`@executable`, `@defined`, `@exploratory`)
- Removed `url` field from `TodoistTask` (not available in API v1)
- Integrated ApexCharts for all analytics visualizations
- Added `BackupService` for data export/import
- Added `/api/backup/export` and `/api/backup/import` endpoints

---

## [0.6.0] - 2026-01-06
Fixed:
2+ anytime tasks make the 'yesterday' shift calendar down comparing to the next day (when scrolled horizontally)
Redesigned Settings page to match new design language
Redesigned FAB button to match new design language
Dynamic Add task for Domain section footers.
added support 'complete task'

### Summary
Redesigned **Thought Cabinet** page to match the Tasks page aesthetic. Establishes visual consistency across the app with shared typography, layout patterns, and interaction states.

### Added

- **Thought Cabinet page** — Quick capture for ideas, tasks, and notes
  - Capture input with keyboard hint (Enter to capture)
  - Thoughts list panel with dense row styling
  - Promote to Task action (opens task dialog)
  - Delete with undo toast (5-second grace period)
  - Empty state messaging

### Changed

- **Page layout** — Full-width grey surface with centered content (1180px max-width, same as Tasks)
- **Typography** — ALL CAPS system with proper letter-spacing matching Tasks headers
- **Title plate** — Subtle white background with hairline border
- **Panel styling** — Same 12px border-radius and surfaces as Tasks panels
- **Row density** — Compact rows (12px 16px padding) with border-bottom dividers
- **Actions** — Hidden until hover with pointer-events control
- **Capture card** — Centered at 860px max-width with keycap hint styling

### Design Patterns

- `.page-surface` — Shared grey background container (used across all pages)
- `.thoughts-container` — Centered max-width wrapper (matches Tasks)
- `.thought-row` — Dense row with inset dividers, hover tint, hidden actions
- Responsive breakpoints at 900px and 600px

---

## [0.5.0] - 2026-01-05

### Summary
Major UI polish release focused on the **Tasks page**. Establishes a calm, enterprise-grade aesthetic with improved information hierarchy, tint-based interactions, and a consistent visual grammar across task list and calendar.

### Added

- **Grid-based task layout** — Duration, Impact, and Clarity in fixed-width columns with proper alignment
- **Column separators in header** — Vertical lines centered in column gaps (header only, not rows)
- **Inset row dividers** — Separator lines start after the impact rail, not cutting through it
- **Hour banding on calendar** — Alternating row backgrounds for easier scanning
- **Major hour lines** — Stronger border every 2 hours for visual rhythm
- **Time axis gutter** — 54px label column with right-aligned tabular numbers

### Changed

- **Task row hover** — Now uses neutral slate tint instead of purple wash
- **Selection state** — Purple tint reserved exclusively for selected items
- **Impact rail** — Implemented as pseudo-element for cleaner rendering
- **Day separator** — Changed from heavy slab to subtle line + centered pill
- **Anytime lane** — Tray-style container with white task cards inside
- **Text contrast** — Bumped all text colors for better readability
- **Border system** — Refined 3-tier hierarchy (hair/normal/strong)
- **Sort header** — Removed rounded border, text color only for active state
- **Column widths** — Duration 68px, Impact 56px, Clarity 80px, Gap 12px

### Fixed

- **Calendar cell width** — No longer expands with long task text (min-width: 0)
- **Tasks spanning day separator** — Duration display now correct across boundaries
- **Trash bin drop zone** — Active area covers entire button, not just top portion
- **Scheduled task positioning** — Removed conflicting position: relative override
- **Drag rescheduling** — Tasks no longer disappear during calendar drag operations

### Design System

See [DESIGN.md](./DESIGN.md) for comprehensive documentation of the Tasks page design patterns.

---

## [0.4.0] - 2026-01-04

### Added

- **Native task management** — Create, edit, and delete tasks directly in Whendoist
  - Task dialog with title, description, schedule, due date, duration, impact, and clarity
  - Recurrence picker for repeating tasks (daily, weekly, monthly, custom)
  - Delete button in edit dialog
- **Drag-to-trash** — Drag tasks from panel or calendar to trash bin to delete
- **Domain management** — Create and organize task domains/projects
- **Todoist import** — One-click import of existing Todoist tasks
- **Task instances** — Recurring task instance tracking
- **Version badge** in header (v0.4)

### Changed

- **Energy filter task counts** — Domain headers now show "visible/total" when filtered (e.g., "3/5")
- Deleting a parent task now cascades to delete all subtasks
- Plan My Day selection now works correctly in adjacent-day sections (prev evening, next morning)
- Improved Plan My Day visual highlight with subtle inset glow

### Fixed

- Plan My Day time selection accuracy using actual DOM positions
- Vertical alignment of energy buttons and Plan My Day button
- Selection overlay positioning in hour grid with borders
- Removed unwanted scroll behavior when entering Plan mode

---

## [0.3.0] - 2025-12-30

### Added

- **Plan feature** - Auto-schedule tasks into selected time ranges
  - Click-and-drag time range selection on calendar
  - Bidirectional selection (drag up or down)
  - Smart scheduling algorithm respects existing events
- **PWA support** - Add to home screen on iOS and Android
  - Fullscreen standalone mode
  - Safe area support for notched devices
- **Mobile-optimized compact mode** - Vertical layout with touch support
- **Touch support** for Plan feature on mobile devices
- `data-due-date` and `data-is-recurring` attributes for date-aware scheduling

### Changed

- Tasks without `@clarity` labels are now hidden from task list
- Projects with no visible tasks are automatically hidden
- Energy filter completely hides non-matching tasks (previously greyed out)
- Renamed "Stack" feature to "Plan" throughout codebase
- Inbox project moved to bottom, collapsed by default
- Improved mobile responsive layout with configurable panel ratios

### Fixed

- Plan selection works in both directions (top-to-bottom and bottom-to-top)
- Tasks without duration default to 30 minutes
- Algorithm skips tasks that don't fit instead of advancing slots

---

## [0.2.0] - 2025-12-28

### Added

- **Drag-and-drop scheduling** - Drag tasks from list to calendar
- 15-minute interval snapping for precise scheduling
- Duration-based event height visualization
- Reschedule by dragging scheduled tasks
- Remove scheduled tasks by dragging out of calendar
- Overlap detection with side-by-side display (max 3 columns)
- Commit scheduled tasks to Todoist API
- Calendar carousel (15 days: 7 before, today, 7 after)
- "Today" floating button for quick navigation

---

## [0.1.0] - 2025-12-27

### Added

- OAuth2 authentication for Todoist and Google Calendar
- Fetch and display tasks from Todoist
- Fetch and display events from Google Calendar
- Dashboard with 2:1 layout (tasks : calendar)
- Energy-based task filtering (Zombie / Normal / Focus)
- Task grouping by project with collapsible sections
- Settings page for Google Calendar selection
- Clarity labels parsing (`@executable`, `@defined`, `@exploratory`)
- Duration parsing from task description (`d:30m`, `d:2h`, `d:1h30m`)

---

[unreleased]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.8.0...HEAD
[0.8.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/aleksandr-bogdanov/whendoist/releases/tag/v0.1.0
