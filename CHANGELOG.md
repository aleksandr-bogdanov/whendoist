# Changelog

Development history of Whendoist, organized by release.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Iterative UI polish runs are collapsed into grouped entries — see git history for per-patch details.

---

## v0.48.6 — 2026-02-18

### Fixed
- Railway build: added root `package-lock.json` so railpack detects Node.js (package.json alone is insufficient)

---

## v0.48.5 — 2026-02-18

### Fixed
- Railway build: added minimal root `package.json` (no deps) so railpack detects Node.js and installs npm for frontend SPA build

---

## v0.48.4 — 2026-02-18

### Changed
- Switched Railway builder from nixpacks back to railpack (root `package.json` with Playwright was the actual issue, now deleted)
- Removed `nixpacks.toml` — railpack auto-detects Python + Node.js from `pyproject.toml` and `frontend/package.json`

---

## v0.48.3 — 2026-02-18

### Fixed
- Railway deployment: switched from `railpack` to `nixpacks` builder with explicit Node.js 22 setup
- Removed root `package.json` with Playwright dependencies that confused the builder into installing browser binaries
- Added `nixpacks.toml` to ensure Node.js is available for frontend SPA build
- Removed redundant `releaseCommand` (migrations already run in app lifespan startup)

---

## v0.48.2 — 2026-02-18

### Added
- Frontend CI job: TypeScript type-checking, Biome lint, and production build in GitHub Actions
- Frontend commands and conventions section in CLAUDE.md
- React + TypeScript tech stack in README.md with frontend setup instructions

### Changed
- Updated stale comments referencing deleted Jinja2 templates and vanilla JS modules
- Updated CSP middleware comment to reflect React SPA architecture

### Removed
- `jinja2` Python dependency (no longer used after React SPA migration)

---

## v0.48.1 — 2026-02-18

### Added
- Analytics page with interactive charts: daily completions, domain breakdown (donut), day-of-week, activity heatmap, impact distribution, velocity trend, recurring task rates, resolution time
- Day range selector (7d/30d/90d) for analytics time window
- Analytics REST API endpoint (GET /api/v1/analytics) returning comprehensive statistics as JSON
- Recent completions API endpoint (GET /api/v1/analytics/recent-completions)

---

## v0.48.0 — 2026-02-17

### Added
- Keyboard shortcuts system: ?, q, n, j/k navigation, c/e/x task actions, Escape
- Shortcuts help modal with categorized shortcut reference
- First-run toast hinting at keyboard shortcuts for desktop users
- Motion animations: task enter/exit (slide + fade), subtask expand/collapse, domain group layout animation, list reorder

### Removed
- All legacy Jinja2 templates (app/templates/ — 18 files)
- All vanilla JavaScript modules (static/js/ — 25 files)
- All legacy CSS files (static/css/ — 22 files)
- Vendor libraries: HTMX, Pico CSS, ApexCharts, Air Datepicker (static/vendor/)
- Legacy service worker and manifest (static/sw.js, static/manifest.json)
- Legacy page router (app/routers/pages.py) and task editor router (app/routers/task_editor.py)
- Legacy debug pages (static/debug-drag.html, static/debug-pwa.html)
- Obsolete JS contract tests (test_js_module_contract.py, test_hotfix_0_8_6.py, test_hotfix_0_8_8.py, test_task_item_partial.py)
- Removed JS contract test classes from remaining hotfix tests

---

## v0.47.9 — 2026-02-17

### Added
- Mobile swipe gestures: swipe right to complete tasks, swipe left to switch to calendar tab
- Visual swipe phases: peek (40px), commit (100px), trigger (130px) with green/blue indicators
- Haptic feedback engine: named vibration patterns (light, medium, success, warning, etc.)
- Long-press task action sheet: edit, complete, schedule, skip, delete actions via bottom sheet
- Bottom sheet component using vaul with swipe-to-dismiss
- Device detection hook: touch, mouse, hybrid, iOS, Android, PWA, reduced motion
- Viewport management hook: iOS PWA height fix, virtual keyboard detection
- Gesture discovery: first-time animated swipe hint and long-press tooltip
- Sticky domain header: floating domain name on mobile that crossfades during scroll
- TouchSensor added to dnd-kit for mobile drag-and-drop (250ms delay to avoid swipe conflicts)

---


## v0.47.8 — 2026-02-17

### Added
- Drag-and-drop: drag tasks from task list to calendar day columns to schedule them (15-minute snap grid)
- Drag-and-drop: drag scheduled tasks back to task list to unschedule
- Drag-and-drop: drag a task onto another task to make it a subtask (reparenting with circular reference prevention)
- Custom drag overlay: compact task card with title and impact badge follows cursor while dragging
- Calendar drop zones: day columns highlight with dashed border and tinted background when dragging over
- Task list drop zone: highlights when dragging a scheduled task back for unscheduling
- Drop target highlighting on tasks during reparenting hover
- Optimistic updates with rollback for all drag operations (schedule, unschedule, reparent)

---


## v0.47.7 — 2026-02-17

### Added
- Calendar panel: 3-day carousel with time grid, Google Calendar events, scheduled Whendoist tasks
- Day columns with hour grid (6am-11pm), current time indicator (red line), 30-minute subdivisions
- Overlap detection: side-by-side display when events/tasks overlap (max 3 columns)
- Zoom controls: +/- buttons and Ctrl+scroll wheel, persisted to localStorage (30-100px per hour)
- Date navigation: prev/next day buttons, "Today" quick-jump
- Plan My Day: auto-scheduling dialog — first-fit bin packing of unscheduled tasks into free calendar slots
- Desktop split pane: task list (55%) + calendar (45%) side by side
- Mobile tabs: Tasks / Calendar tab bar with show/hide switching
- Calendar event cards with calendar color, scheduled task cards with impact color border

---

## v0.47.6 — 2026-02-17

### Added
- Task Editor Sheet: right-side panel for creating and editing tasks with all fields (title, description, domain, parent, impact, clarity, duration, dates, recurrence)
- Task Quick Add dialog: minimal modal with title + domain, Enter to save
- Recurrence Picker: presets (None, Daily, Weekdays, Weekly, Monthly, Custom) with custom interval, day-of-week, day-of-month, and start/end bounds
- Task completion: checkbox click with optimistic updates, cascading subtask completion, undo toast
- Sort controls: clickable column headers for Impact, Duration, Clarity with toggle direction
- Filter bar: view toggle chips for Scheduled and Completed sections
- Energy selector: Zombie/Normal/Focus pills with client-side clarity filtering
- Dashboard settings panel: retention days selector, hide recurring toggle
- Dashboard header toolbar: New Task button, Quick Add button, integrated controls

---

## v0.47.5 — 2026-02-17

### Added
- React dashboard task panel: tasks grouped by domain with collapsible sections
- Task item component with impact badges, clarity labels, duration chips, due date indicators
- Subtask tree with expand/collapse toggle and nested indentation
- Scheduled section: tasks grouped by date (Today, Tomorrow, day headers)
- Completed section: sorted by completion date, collapsible
- Client-side task processing: energy filtering, multi-field sorting, domain grouping
- Encryption-aware task display: transparent decryption via crypto store integration
- Task utility library: sorting, filtering, grouping, date formatting helpers

---

## v0.47.4 — 2026-02-17

### Added
- FastAPI SPA serving: catch-all route serves React app's `index.html` for client-side routing
- SPA static asset mounting (`/assets/*`, `/icons/*`, `/manifest.webmanifest`, `/registerSW.js`)
- Service worker fallback: prefers SPA service worker (`frontend/dist/sw.js`) over legacy
- iOS PWA meta tags: apple-touch-icon, apple-mobile-web-app-capable, status bar style
- Inline viewport fix script in `<head>`: sets `--app-height` from `screen.height` for iOS PWA
- PWA icons copied to `frontend/public/icons/` (app icons, maskable icons, apple-touch-icons)
- Enhanced PWA manifest: shortcuts, maskable icons, categories, orientation, start_url, scope
- Railway build command for frontend (`cd frontend && npm ci && npm run build`)

### Fixed
- TypeScript error: `tasks_imported` → `tasks_created` in settings and wizard import success toast

---

## v0.47.3 — 2026-02-17

### Added
- Settings page: theme, timezone, Google Calendar, GCal sync, Todoist import, encryption (enable/disable with batch encrypt/decrypt, passkey management), domains CRUD, data management (export/import/snapshots/wipe), keyboard shortcuts, about section
- Thoughts page: chat-bubble inbox for tasks without a domain, quick capture input, client-side encryption support
- Privacy Policy and Terms of Service as public React routes (ported from Jinja2 templates)
- Onboarding wizard: 7-step flow (welcome, energy levels, calendar connect, calendar select, Todoist import, create domains, summary) shown to new users
- Wizard integration in auth guard layout — automatically shows for users who haven't completed onboarding
- Updated dashboard stub with navigation links

---

## v0.47.2 — 2026-02-17

### Added
- React SPA app shell: header with theme toggle and user menu, sidebar with nav links and domain list, mobile bottom nav bar
- Auth guard layout route (`_authenticated`): session check via `/api/v1/me`, encryption unlock modal integration
- Login page with Google OAuth button and demo login support
- Theme provider: light/dark/system modes with OS preference sync and meta theme-color updates
- Encryption unlock modal: passphrase entry with passkey (WebAuthn PRF) fallback
- `/api/v1/me` backend endpoint: user profile, encryption status, calendar connection flag
- `test_value` field added to encryption status API response for client-side passphrase verification
- Dashboard, Settings, Analytics, Thoughts stub pages under authenticated layout
- PWA standalone viewport fix CSS and iOS safe area padding
- Biome config: Tailwind v4 directive parsing, import organization

### Fixed
- TypeScript 5.9 `Uint8Array<ArrayBufferLike>` type errors in crypto and passkey modules (build-mode compatibility)
- Biome `node:` protocol import for vite config

---

## v0.47.1 — 2026-02-17

### Added
- orval API codegen: 82 TypeScript model types and TanStack Query hooks for all endpoints
- E2E encryption module port (`crypto.ts`): PBKDF2 key derivation, AES-256-GCM encrypt/decrypt, batch operations
- WebAuthn passkey module port (`passkey.ts`): PRF-based key wrapping, registration/authentication flows
- Zustand stores: `crypto-store` (encryption state + derived key), `ui-store` (theme, energy, sort, view preferences)
- `use-crypto` hook: transparent decrypt-on-fetch / encrypt-on-mutate integration with TanStack Query

### Changed
- Migrated biome.json to v2.4.2 schema
- Fixed `api-client.ts` baseURL to empty string (prevents double-prefixing with orval paths)
- Reduced TanStack Query staleTime from 60s to 30s

---


## v0.47.0 — 2026-02-17

### Added
- React SPA frontend scaffold (`frontend/` directory)
- Vite 6 + React 19 + TypeScript (strict mode) with React Compiler
- TanStack Router (file-based routing) + TanStack Query v5
- Zustand, Tailwind CSS v4, shadcn/ui (20 components), Biome
- orval config for OpenAPI codegen, vite-plugin-pwa
- Motion, dnd-kit, @use-gesture/react, Zod, lucide-react, sonner, axios

---

## v0.46.7 — 2026-02-17

### Improved
- `fix-all-issues` skill: adds Sentry integration, regression detection (searches closed issues before creating new ones), and fixes Sentry resolve API endpoint

---

## v0.46.6 — 2026-02-17

### Fixed
- JS modules now preserve subtask containers during sort, drag-drop, and task count updates
- Task sort (`applySort`) uses `:scope > .task-item` to select only top-level tasks and moves subtask containers with their parent
- Drag-drop insertion uses `:scope > .task-item` to avoid flattening subtasks into the main list
- Task count calculations in task-complete and task-mutations skip nested subtask items
- Energy filter CSS hides subtask containers when their parent task is filtered out

## v0.46.5 — 2026-02-17

### Fixed
- Completion cascade uses direct query instead of relationship to avoid stale subtask list with `expire_on_commit=False`

## v0.46.4 — 2026-02-17

### Added
- Reparent subtasks: move tasks between parents via "Parent task" picker in edit dialog
- Promote subtasks: "Promote to task" button promotes a subtask to a top-level task
- `parent_id` is now an updatable field — supports `PUT /api/v1/tasks/{id}` with `parent_id`
- `_next_position()` helper in TaskService for DRY position calculation
- DOM helpers `promoteTask()` and `reparentTask()` in TaskMutations module
- Validation: can't reparent to self, to a subtask, to a recurring task, or a container with children

## v0.46.3 — 2026-02-17

### Added
- Create subtasks from UI: "Add subtask" row opens task dialog with parent context
- Task dialog shows breadcrumb ("Subtask of: ...") and hides domain selector when creating subtasks
- Domain auto-inherited from parent task; recurring task check blocks subtask creation
- Subtask inserted into parent's container in DOM; first subtask triggers parent re-fetch for container
- `TaskMutations.updateSubtaskCount()` for dynamic subtask count badge updates

## v0.46.2 — 2026-02-17

### Added
- Expand/collapse subtask containers: parent tasks render as collapsible groups with nested children
- Subtasks only appear under their parent container, not in flat Scheduled/Completed sections
- Expand/collapse state persisted in localStorage per parent task ID
- Subtask count badge on parent tasks derived from eager-loaded relationship (no separate query)
- "Add subtask" row inside each subtask container (wired in PR 3)

### Removed
- Breadcrumb display (`parent name ->`) for subtasks — replaced by visual nesting
- External `subtask_counts` dict — subtask count now auto-detected from eager-loaded data

## v0.46.1 — 2026-02-17

### Added
- Completion cascade: completing a parent task (container) marks all pending subtasks as completed
- Uncompleting a parent does NOT uncomplete children (intentional — child work is preserved)
- Cascaded subtasks are unsynced from Google Calendar when parent is completed
- Frontend cascades completion visually to all child elements and removes their calendar cards
- `moveTaskToCompleted` now moves child task elements alongside the parent

## v0.46.0 — 2026-02-17

### Added
- Depth-1 subtask constraint: subtasks cannot have subtasks (max nesting depth = 1)
- Mutual exclusion: recurring tasks cannot have children, tasks with children cannot become recurring
- Todoist import flattens deep nesting to depth-1 (grandchildren become direct children of root ancestor)
- Todoist import strips recurrence from parent tasks that have children
- Alembic migration to flatten existing deep nesting and strip parent recurrence in production data
- Service-layer validation returns 422 for constraint violations

## v0.45.99 — 2026-02-17

### Fixed
- Trash delete undo race: clicking undo within 350ms no longer causes restored elements to be removed by the pending animation timeout
- Completion undo with rapid toggles: each task now tracks its own animation timeout, so undoing Task A no longer cancels Task B's animation
- Null guard in `handleAnytimeDrop` prevents crash when `.date-only-tasks` container is missing
- Null guard in `syncCardToAdjacentCalendars` prevents crash when `recalculateOverlaps` receives null
- Skip instance now recalculates calendar overlaps after removing cards

## v0.45.98 — 2026-02-17

### Fixed
- Rapid drag operations no longer stack multiple undo toasts — toasts now dedup by task ID, replacing the previous toast instead of creating a new one

## v0.45.97 — 2026-02-17

### Fixed
- Adjacent-day calendar mirrors: unschedule (drag-out + quick-action button) now removes synced clones from all calendars instead of leaving ghost cards
- Wrong undo date for adjacent-day tasks: unschedule and reschedule undo now uses the task's actual date, not the host calendar's date
- Drag-to-unschedule now shows an undo toast (previously had no undo, unlike every other operation)
- Drag-to-unschedule recurring instances now correctly calls skip API instead of modifying the parent task
- Reschedule undo for regular tasks now restores to original position instead of fully unscheduling
- Undo-unschedule, task dialog edits, and instance reschedule undo now sync restored cards to adjacent-day mirrors
- Anytime banner drop now cleans up synced calendar clones when moving a mirrored task

## v0.45.96 — 2026-02-17

### Fixed
- Google token refresh now rolls back DB session on statement timeout, preventing `PendingRollbackError` from poisoning subsequent queries in the same request

## v0.45.95 — 2026-02-17

### Fixed
- Zoom level no longer resets when dropping a task — `initZoom` now skips height reset on re-init (triggered by `refreshTaskList` → `DragDrop.init()`)
- Trash bin no longer gets stuck in red highlighted state — `drag-over` class cleared at start of each new drag and `hideTrashBin` resets inline styles
- Auto-scroll trigger zone increased from 60px to 100px for easier activation

## v0.45.94 — 2026-02-17

### Fixed
- Drag overlay no longer flies in from top-left — clone resets `position: static` to prevent inherited absolute positioning from calendar cards
- Phantom card time and title no longer glued together — added margin between timestamp and task name
- Phantom card text more readable — uses `--text-secondary` instead of double-muted `--text-muted` + opacity

## v0.45.93 — 2026-02-17

### Added
- Custom drag overlay replaces native browser ghost — fixed-position clone follows cursor with compact styling, morphs to event pill shape over calendar (`body.over-calendar` toggle)
- Phantom card drop indicator — merged old drop-indicator + drag-highlight-overlay into a single element showing task title, time, impact rail, and dashed border (80ms snap animation between 15-minute positions)
- Auto-scroll during drag — hour-grid scrolls vertically when cursor is within 60px of top/bottom edge, with accelerating speed
- Cross-day drag navigation — hovering near calendar panel left/right edge for 500ms navigates to adjacent day via existing `navigateToDay`
- Redesigned trash bin — SVG icon from `ui-icons.svg#trash` replaces emoji, "Delete" label always visible, subtle red tint in default state

### Fixed
- Dark mode ghost tokens — added `--ghost-bg`/`--ghost-border` overrides for dark theme (higher opacity for visibility on dark backgrounds)

## v0.45.92 — 2026-02-17

### Fixed
- Drop position now uses element-top instead of cursor — removed custom drag overlay in favor of native ghost, added `getSlotAtGrabTop` using `elementFromPoint` to find the correct hour slot at the dragged element's top edge. Grabbing a task by its bottom no longer schedules it an hour too late.
- Time/duration hidden from native drag ghost — `scheduled-task-left` gets `visibility: hidden` synchronously at dragstart so the ghost shows only the task name while the drop indicator shows the target time

## v0.45.91 — 2026-02-17

### Fixed
- Scheduled tasks no longer instantly unschedule on drag start — deferred `visibility:hidden` and class changes to next animation frame so the browser doesn't cancel the drag when the source element is modified during the synchronous `dragstart` handler

## v0.45.90 — 2026-02-17

### Fixed
- Drag ghost now follows grab point — replaced unreliable native ghost and clone-based `setDragImage` with a custom drag overlay that follows the cursor via `drag` events. Suppresses native ghost with 1x1 transparent image, renders a clone at the grab offset. Immune to CSS context issues (transform, overflow, compositing layers) that caused all previous approaches to silently fall back to (0,0) offset.

## v0.45.89 — 2026-02-17

### Fixed
- (Superseded by v0.45.90) Attempted native drag ghost + double-rAF — worked on debug page but not in actual app CSS context

## v0.45.88 — 2026-02-17

### Fixed
- Restored clone-based `setDragImage` — removing it caused layout glitches (task rendering under wrong hour slot). Drag offset remains best-effort; proper fix deferred.

## v0.45.87 — 2026-02-17

### Fixed
- Drag offset: removed clone-based `setDragImage` entirely — browser's native drag behavior already preserves cursor offset, clone kept failing silently and falling back to (0,0)
- Adjacent-day sync is now bidirectional — moving a task to 10pm in today's main calendar now appears in tomorrow's "previous evening", and vice versa
- Undo and error callbacks clean up all synced copies across calendars

## v0.45.86 — 2026-02-17

### Fixed
- Drag clone now sets explicit height, off-screen positioning, and opacity for reliable `setDragImage` across browsers (rAF removed clone too early, grid collapsed without height)
- Adjacent-day rescheduling no longer duplicates synced clones in the main calendar — previous clone is removed before appending new one
- Undo and error callbacks now clean up synced adjacent-day clones from the DOM

## v0.45.85 — 2026-02-16

### Fixed
- JS files now have cache-busting `?v=` query params (CSS had them, JS didn't) — browsers no longer serve stale scripts after deploy
- Drag preview uses clone-based `setDragImage` for reliable offset across browsers (Safari ignored offset on original element)
- Dropping a task into adjacent-day area (next morning / previous evening) now syncs the element to the main calendar for that date without reload

## v0.45.84 — 2026-02-16

### Fixed
- Recurring task "skip" button no longer lost when dragging from Anytime banner to timed slot and back
- Drag preview now follows cursor grab point instead of always showing at top-left
- Adjacent-day hours (previous evening, next morning) now render Google Calendar events and scheduled tasks

## v0.45.83 — 2026-02-16

### Fixed
- Recurring task completion now reliably detects recurrence via API response (`instance_id`), not just frontend data attribute

## v0.45.82 — 2026-02-16

### Fixed
- Reopen toast now has an undo button (was missing — only completions had undo)
- Completing a recurring task now re-fetches next occurrence instead of moving to Completed section

## v0.45.81 — 2026-02-16

### Fixed
- Completing a task from the calendar context menu now greys out the card instead of removing it
- Undo after calendar completion now un-greys the card instantly (no reload needed)
- Reopening a completed scheduled task now returns it to the Scheduled section (was going to Domain)
- Reopened tasks no longer retain grey completion styling
- Completion/reopen toasts now show the task name (e.g., "Buy groceries" completed)

## v0.45.80 — 2026-02-16

### Fixed
- Task completion from calendar card now moves the task-list item to the Completed section (was only showing checkmark without moving)
- Changing duration of a completed task no longer removes it from the calendar
- Right-click context menu now includes Complete/Reopen action for all tasks

### Changed
- Increased toast notification timeouts: undo window from 5s to 10s, all other toast types also extended for better visibility

## v0.45.79 — 2026-02-16

### Fixed
- Downgrade migration failure logging from `error`/`exception` to `warning` to prevent false Sentry alerts during transient deployment races

## v0.45.78 — 2026-02-16

### Fixed
- Downgrade bulk sync abort logging from `error` to `warning` for expected conditions (calendar access revoked, token expired) to prevent false Sentry alerts

## v0.45.77 — 2026-02-16

### Fixed
- Plan My Day: tasks now schedule into all free slots, not just the first one — a GCal event mid-day no longer causes tasks to pile up before it while leaving the afternoon empty

### Added
- Pluggable scheduler config: `PlanTasks.setConfig()` supports `bufferBetweenTasks`, `bufferBeforeEvent`, `bufferAfterEvent`, and `priorityWeight`
- Extracted `_sortTasks()` method for configurable task prioritization

## v0.45.76 — 2026-02-16

### Changed
- Simplify plan file frontmatter — remove `status` field, keep only `version`, `pr`, `created`

## v0.45.75 — 2026-02-16

### Fixed
- Skip recurring instance: calendar no longer renders skipped instances after refresh
- Skip recurring instance: task list now shows next occurrence immediately instead of crossing out current date

## v0.45.74 — 2026-02-16

### Fixed
- Stop logging expected HTTP responses (404, validation errors) as database errors in `get_db` — eliminates false Sentry alerts when instances are deleted between page load and user interaction

## v0.45.73 — 2026-02-16

### Fixed
- Clamp calendar drop position quarter index to [0, 3] — prevents negative minutes (e.g., `07:-15:00`) when cursor is above slot edge during drag-drop or touch scheduling

## v0.45.72 — 2026-02-16

### Added
- `docs/SNAPSHOTS.md` — architecture doc covering storage tradeoffs, dedup, background loop, and why not Celery/S3

## v0.45.71 — 2026-02-16

### Fixed
- Snapshot list items now align with settings rows (matching padding, background, button sizing)
- Snapshot action buttons use consistent `btn-sm` sizing with smaller inline variant
- Delete button uses standard `btn-sm--danger` style instead of custom danger-text class

## v0.45.70 — 2026-02-16

### Fixed
- Snapshot downloads now have same field order as backup exports (removed `sort_keys` from stored blob)

## v0.45.69 — 2026-02-16

### Changed
- Simplified snapshot config: removed frequency/retention dropdowns, hardcoded daily + 10 retention
- Removed `snapshots_frequency` and `snapshots_retain_count` from `UserPreferences`
- Toggle endpoint changed from `PUT /snapshots/schedule` to `PUT /snapshots/enabled`

## v0.45.68 — 2026-02-15

### Added
- Automatic export snapshots with configurable frequency (daily/weekly/monthly)
- Content-hash deduplication: inactive users generate zero additional storage
- Snapshot management UI in Settings > Backup panel (toggle, frequency, retention, create/download/restore/delete)
- Background loop checks every 30 minutes for due snapshots
- Manual snapshot creation ("Create Now" button)
- Restore from any snapshot with typed confirmation
- New `ExportSnapshot` model and `export_snapshots` table
- New `UserPreferences` columns: `snapshots_enabled`, `snapshots_frequency`, `snapshots_retain_count`
- 6 new API endpoints under `/api/v1/backup/snapshots`

## v0.45.67 — 2026-02-15

### Changed
- Toast system: single-toast model → stacked toasts (max 3 visible simultaneously)
- All delete operations (menu, dialog, trash) now use immediate API + undo via restore
- Unschedule now uses immediate API + undo via reschedule
- Added `Toast.undo(message, callback)` convenience method with consistent 5s duration
- Removed `flushPendingDeletion` infrastructure (no longer needed with immediate API calls)
- Normalized all undo callers to use `Toast.undo()` (task-complete, task-dialog, drag-drop, task-list-options, plan-tasks)

## v0.45.66 — 2026-02-15

### Removed

- Copilot setup steps workflow (replaced by /fix-all-issues)
- Sentry auto-fix workflow (replaced by /fix-all-issues)

## v0.45.65 — 2026-02-15

### Fixed
- Recurring tasks now auto-populate `scheduled_date` from `recurrence_start` or today when no scheduled date is set (both create and update)
- Handles case where `recurrence_start` is also null (user picks recurrence type without explicit start date)
- `moveTaskToScheduledSection()` now adds `.scheduled` CSS class for proper muted styling
- Scheduled tasks moved via DOM are no longer draggable

## v0.45.64 — 2026-02-15

### Fixed
- (Superseded by v0.45.65)

## v0.45.63 — 2026-02-14

### Fixed
- Undo recurring instance reschedule now restores card to original time slot (was skipping instead)
- Scroll-to-task after unschedule/move now centers the task on screen (was scrolling past it)
- Setting recurrence via task dialog now updates recurring icon and date immediately (was requiring reload)
- Setting scheduled date via task dialog on recurring tasks now moves task to scheduled section immediately


## v0.45.62 — 2026-02-14

### Fixed
- Undo scheduling now properly restores task to unscheduled section (was refreshing before API call completed)
- Recurring instance scheduling now shows toast with undo (undo skips the instance)


## v0.45.61 — 2026-02-14

### Fixed
- Scheduling toast now shows with undo button — "Scheduled 'taskName' for Feb 15" with undo to revert
- Unschedule toast now includes task name — '"taskName" unscheduled' instead of generic 'Task unscheduled'
- Right-click unschedule from task list now removes the calendar card (was leaving it orphaned)
- Undo unschedule from task list now correctly restores the calendar card



## v0.45.60 — 2026-02-14

### Fixed
- Undo on restore toast now works reliably — reloads deleted tasks list via HTMX instead of fragile DOM re-insertion


## v0.45.59 — 2026-02-14

### Fixed
- Restore task toast now includes undo button — pressing undo re-archives the task, removes the calendar card, and re-inserts it into the Deleted list


## v0.45.58 — 2026-02-14

### Fixed
- Restore task toast now shows task name (e.g. `"My task" restored` instead of generic `Task restored`)
- Restored scheduled tasks now reappear on the calendar immediately (restore endpoint returns full task data, frontend calls `updateCalendarItem`)


## v0.45.57 — 2026-02-14

### Fixed
- Archived (deleted) tasks reappearing on calendar after page refresh — calendar queries now exclude archived tasks


## v0.45.56 — 2026-02-14

### Fixed
- Deleted tasks not appearing in Deleted subview until page refresh — task deletion uses a 2–5s undo delay before calling the API; navigating to the Deleted view now flushes any pending deletion first


## v0.45.55 — 2026-02-14

### Fixed
- Calendar hour-grid scroll jump when swiping between days — all grids now stay synced continuously

## v0.45.54 — 2026-02-14

### Fixed
- **Calendar trackpad swipe broken on macOS** — Removed `overscroll-behavior-x: none` from `.hour-grid` (was blocking horizontal scroll chaining to carousel) and `scroll-behavior: smooth` from carousel (was fighting scroll-snap on trackpad input). Added `overscroll-behavior-x: contain` on carousel to prevent browser back-navigation.

---

## v0.45.53 — 2026-02-14

### Fixed
- **Desktop calendar swipe dead** — Added pointer-based drag-to-swipe on the calendar carousel so desktop users can click-drag horizontally to switch days. Touch devices continue using native scroll.

---

## v0.45.52 — 2026-02-14

### Fixed
- **Completed tasks persist on calendar** — Completing a task now removes its calendar card (`.scheduled-task` / `.date-only-task`). Editing a completed task no longer re-creates the calendar card.

---

## v0.45.51 — 2026-02-14

### Fixed
- **Calendar quick action overlapping checkbox** — On medium/long duration calendar tasks, the quick action button now shifts left of the complete checkbox instead of overlapping it.

---

## v0.45.50 — 2026-02-14

### Fixed
- **Health check query error** — Fixed `column "access_token" does not exist` error on every deploy by updating health check to query `access_token_encrypted` (column was renamed when encryption was added).

---

## v0.45.49 — 2026-02-14

### Removed
- **PWA debug badge** — Viewport fix confirmed working on iPhone 15 Pro Max; removed the live overlay from `base.html`. Static debug page (`/static/debug-pwa.html`) and Settings footer link remain for future testing.

---


## v0.45.48 — 2026-02-14

### Fixed
- **PWA bottom gap (for real)** — `100dvh` and `window.innerHeight` underreport by 59px on iOS PWA standalone (Settings/Analytics/Thoughts still showed 873px instead of 932px even after v0.45.47 position:static fix). Root cause: iOS Safari's viewport height calculation is unreliable in standalone mode. Fix: use `screen.height` (always correct) via early inline `<script>` in `<head>` that sets `--app-height` before first paint, and `mobile-core.js` for resize events. Standalone CSS blocks now use `height: var(--app-height, 100vh) !important` instead of `100dvh`.

---

## v0.45.47 — 2026-02-14

### Fixed
- **PWA bottom gap on all non-Tasks pages** — Root cause: `position: fixed` on page containers (Thoughts, Analytics, Settings) removed them from normal document flow, collapsing html/body to 0px height. iOS Safari interprets zero-height body as "no content" and shrinks the viewport by `safe-area-inset-top` (59px) even with `overflow: visible`. Fix: reverted all page containers from `position: fixed; inset: 0` to `position: static` with `height: var(--app-height, 100vh)`, plus `height: 100dvh !important` in standalone mode. Elements in normal flow keep html/body at full content height, preventing the viewport shrink. Bumped service worker cache to v18.

---

## v0.45.46 — 2026-02-14

### Added
- **PWA debug badge on all pages** — Shows viewport dimensions, computed styles (overflow, position, height), bounding rects, and gap measurement for the active page container in standalone mode; visible on Tasks (working) vs Settings (broken) for side-by-side comparison

---

## v0.45.45 — 2026-02-14

### Fixed
- **PWA bottom gap on Settings/Analytics (for real this time)** — Three root causes: (1) `position: fixed; inset: 0` was inside a nested `@media (display-mode: standalone)` block that didn't apply reliably on iOS; moved to the general mobile block matching the Thoughts page pattern; (2) Pico CSS `body>main { padding-block: 1rem }` (specificity 0,0,2) was beating our `main { padding: 0 }` (0,0,1), adding 16px top padding to `<main>`; overridden with `body > main { padding-block: 0 !important }`; (3) service worker `CACHE_VERSION` was stuck at `v16`, potentially serving stale CSS; bumped to `v17`

---

## v0.45.44 — 2026-02-14

### Fixed
- **Unscheduling a task from Scheduled section doesn't move it back** — `updateTaskInPlace` called `moveTaskToUnscheduledSection` which only reorders within the same list; when the task is in `#section-sched`, now calls `moveFromScheduledToDomain` instead to do the proper cross-section move back to its domain group

## v0.45.43 — 2026-02-14

### Fixed
- **PWA bottom gap on Settings/Analytics** — `height: 100dvh` approach failed because Pico CSS `body>main { padding-block: 1rem }` offsets the page container within `<main>`, and the layout chain leaves a gap at the bottom; switched to `position: fixed; inset: 0` (same pattern as Thoughts page) which bypasses all parent constraints

---

## v0.45.42 — 2026-02-14

### Fixed
- **New scheduled tasks stay in domain group** — `insertNewTask()` never checked for `scheduled_date`, so tasks created via "Add task" with a scheduled date appeared in the domain group instead of the Scheduled section; now creates `#section-sched` dynamically if it doesn't exist (same pattern as `#section-done`), then moves the task there and adds a calendar card when applicable

## v0.45.40 — 2026-02-14

### Fixed
- **PWA bottom gap on all pages** — `overflow: visible` fix from v0.45.39 only worked on Tasks page; the mobile body-scroll-lock (`height: 100% !important`) was constraining html/body to the shrunken viewport on other pages; removed `height: 100%` and added `height: auto !important` in standalone override so all pages (Settings, Analytics, Thoughts) get the full-screen viewport

### Added
- **PWA Viewport Fix documentation** — new `docs/PWA-VIEWPORT-FIX.md` explaining the iOS Safari viewport shrinking bug, root cause, fix, and prevention rules
- **Permanent PWA Debug link** — Settings footer has a "PWA Debug" link to `/static/debug-pwa.html` for diagnosing viewport issues on any device
- **CLAUDE.md rule #8** — never set `overflow: hidden` on `html`/`body` in PWA standalone mode

### Removed
- Temporary in-app debug overlay from settings page

---

## v0.45.39 — 2026-02-14

### Fixed
- **PWA bottom gap: actual root cause** — Pico CSS sets `overflow-x: hidden` on `:root` and `body`; per CSS spec, root overflow propagates to the viewport; on iOS PWA standalone, `overflow: hidden` on the viewport causes it to shrink by `safe-area-inset-top` (59px), making `100dvh = 873px` instead of `932px`; overriding to `overflow: visible !important` restores full-screen viewport

---

## v0.45.38 — 2026-02-14

### Fixed
- **PWA bottom gap root cause found and fixed** — `min-height: -webkit-fill-available` on html/body caused iOS to shrink the CSS viewport by `safe-area-inset-top` (59px), making `100dvh`/`innerHeight` report 873px instead of 932px; overriding to `min-height: 0` in standalone mode restores the full viewport
- **Removed html/body overflow:hidden** — the previous approach of locking html/body to viewport height with overflow:hidden was counterproductive; it interacted with `-webkit-fill-available` to shrink the viewport further

---

## v0.45.37 — 2026-02-14

### Fixed
- **Completely disable zoom on iPhone PWA** — added `maximum-scale=1.0, user-scalable=no` to viewport meta and global `touch-action: manipulation` via `*` selector to prevent pinch-to-zoom and double-tap-to-zoom everywhere

---

## v0.45.36 — 2026-02-14

### Fixed
- **PWA bottom gap fully eliminated** — locked `html/body` to `100dvh` with `overflow: hidden` in standalone mode; prevents body-level scroll that created visible gap below page containers
- **Main container overflow locked** — `main.container-fluid` gets `height: 100%; overflow: hidden` in PWA standalone, ensuring no body-level scroll from page container heights

---

## v0.45.35 — 2026-02-14

### Fixed
- **Double-tap zoom on rapid calendar nav taps** — added `touch-action: manipulation` to `.day-nav-btn` so fast taps advance days instead of triggering Safari zoom
- **Stale cached "today" in PWA** — added client-side reconciliation that detects when the service worker serves a cached page with the wrong "today" and corrects the calendar markers (or forces a reload if the real today is outside the rendered range)

---

## v0.45.34 — 2026-02-14

### Fixed
- **Calendar nav skipping dates on rapid tap** — replaced live `scrollLeft` calculation with intent-based `targetDayIndex` so rapid taps always advance correctly
- **Calendar nav buttons too small on mobile** — enlarged from 20×20px to 28×28px with 18px SVG icons and 48px touch targets
- **No active/press feedback on nav buttons** — added `:active` state with scale + purple background for instant tactile feedback
- **Taller mobile calendar header** — increased padding for better visual weight and button spacing

---

## v0.45.33 — 2026-02-14

### Fixed
- **PWA bottom grey gap eliminated** — removed `main` bottom safe-area padding on mobile; each page already handles its own bottom spacing
- **Calendar glass header backdrop** — added frosted-glass `::before` layer so content no longer scrolls visibly behind the transparent header
- **Tab switch scroll restoration** — double-rAF ensures layout is committed after `display:none → flex` toggle before restoring scroll position
- **Thoughts header overlap** — bumped glass mask opaque zone from 40% to 55% so content doesn't show through the blur
- **Analytics/Settings PWA height** — added `100dvh` height override for analytics and settings pages in PWA standalone mode (previously only dashboard panels had it)

---

## v0.45.32 — 2026-02-13

### Fixed
- **PWA content overlap resolved** — `--header-h` standalone override was being clobbered by a later `--header-h: 44px` at same specificity; moved into the standalone media query block so safe-area-inset-top is used for content offset
- **PWA bottom gap in dark mode** — `body` now gets matching background-color alongside `html` in standalone mode
- **Calendar swipe navigation restored** — `.hour-grid` had `touch-action: pan-y` which blocked horizontal swipes from reaching the carousel; changed to `pan-x pan-y`
- **Mobile tabs scroll save/restore** — selector was `.calendar-scroll` (doesn't exist) instead of `.calendar-carousel`

### Added
- **Fixed calendar day header** — date label and nav buttons now live above the carousel so they stay put during horizontal swipes; day label updates via IntersectionObserver
- **Schedule toast** — editing a task to add a scheduled date now shows a confirmation toast ("Scheduled 'title' for Jan 6")

---

## v0.45.31 — 2026-02-13

### Fixed
- **Calendar day navigation restored** — `todayCalendar` variable was out of scope in the DOMContentLoaded handler after scroll-to-now refactor; "Go to Today" button and IntersectionObserver now work again
- **PWA safe areas actually work** — shorthand `padding` rule was clobbering the standalone `padding-top` override; split to longhand and moved standalone override after the base rule in both light and dark mode
- **Task moves to scheduled section after dialog save** — `moveTaskToScheduledSection` now does a cross-section move into `#section-sched` when the sectioned layout is active, matching the pattern used by `moveTaskToCompleted`

---

## v0.45.30 — 2026-02-13

### Fixed
- **Calendar now scrolls to current time on mobile** — `scrollIntoView` was a no-op on the hidden calendar panel; now deferred to the first tab switch via `MobileTabs`
- **Editing a task's schedule via the dialog now updates its calendar card** — new `TaskMutations.updateCalendarItem()` removes the old card and creates a new one at the correct position
- **Unscheduling a task from the calendar now shows an undo toast** — matches the undo pattern used by delete and complete actions; API call is deferred 2 seconds
- **PWA mode: header no longer cramped near the notch** — `!important` on `padding-top` in the nested standalone media query overrides the mobile shorthand
- **PWA mode: no more white gap at the bottom** — panels use stable `100vh` instead of `var(--app-height)` in standalone mode (no dynamic address bar)

---

## v0.45.29 — 2026-02-13

### Added
- **Claude Code skills checked into repo** — `/fix-issue <number>` and `/fix-all-issues` slash commands for automated end-to-end issue resolution (investigate, fix, PR, merge)

---

## v0.45.28 — 2026-02-13

### Fixed
- **Task item partial no longer crashes with KeyError: 'request'** — `_task_list.html` had a `url_for()` call at module level (outside any macro) which requires `request` in the Jinja2 context; when `_task_item.html` imported the macro via `{% from %}`, Jinja2 executed the module-level code without context, causing the error. Replaced with a static path.

---

## v0.45.27 — 2026-02-13

### Fixed
- **Sentry auto-fix workflow now actually triggers Copilot** — switched from commenting `@copilot` (ignored by bots) to assigning `copilot-swe-agent[bot]` via the REST API with `agent_assignment` parameters

---

## v0.45.26 — 2026-02-13

### Fixed
- **Mobile: pull-to-refresh indicator no longer gets stuck** — when a pull gesture is abandoned mid-drag (user scrolls up or scroll position changes), the indicator now hides immediately instead of staying visible
- **Mobile: pull-to-refresh feels smoother** — CSS transitions disabled during drag for instant finger-following, rubber-band dampening for natural resistance, rAF-batched DOM updates, and native overscroll prevented during gesture
- **Mobile: pull-to-refresh waits for actual data** — refresh now waits for HTMX `afterSettle` instead of an arbitrary 500ms timeout, with a 5s safety fallback

---

## v0.45.25 — 2026-02-13

### Fixed
- **Mobile: parent task names no longer truncated to 1 line** — breadcrumb above child tasks now wraps up to 2 lines instead of cutting off long parent names

---

## v0.45.23 — 2026-02-12

### Added
- **Standalone privacy policy page** — `/privacy` now serves a full page (not a redirect) with expanded coverage of Google API data usage, data storage, cookies, and deletion rights. Required for Google OAuth verification.
- **Terms & Privacy links in settings footer** — legal links now accessible from the app

---

## v0.45.22 — 2026-02-12

### Fixed
- **Save button stuck disabled after in-place edit** — `openDialog()` now resets `submitBtn.disabled = false`, fixing the button becoming inaccessible after editing a task (especially after domain changes).
- **Unschedule not moving task out of Scheduled section** — `moveTaskToUnscheduledSection()` only works within a single `.task-list` container. Tasks in `#section-sched` now use new `TaskMutations.moveFromScheduledToDomain()` for proper cross-section moves (applies to both RMB unschedule and drag-to-trash).

---

## v0.45.21 — 2026-02-12

### Added
- **In-place task mutations** — Task edits, creates, completions, deletions, and skips now update the DOM surgically instead of reloading the page. New `TaskMutations` JS module handles patching, section moves, re-sorting, scroll-to, and highlight animation. New `GET /api/v1/task-item/{id}` endpoint returns server-rendered HTML for single task insertion.

### Changed
- Task dialog save no longer triggers `window.location.reload()` — uses `TaskMutations.updateTaskInPlace()` for edits and `TaskMutations.insertNewTask()` for creates.
- Task completion/reopening, deletion, and drag-drop unschedule all use in-place DOM updates instead of full page refreshes.
- Added `DragDrop.initSingleTask()` export for binding drag handlers on dynamically inserted tasks.
- Added `data-domain-id` attribute to task items for client-side domain change detection.

---

## v0.45.20 — 2026-02-12

### Added
- **Sentry auto-fix workflow** — GitHub Actions workflow that auto-assigns Sentry-created issues to GitHub Copilot coding agent, which investigates and opens draft fix PRs.

---

## v0.45.14–v0.45.19 — 2026-02-12

### Fixed
- **Thoughts send button** — Replaced ghost outline with solid purple fill + white arrow icon for visibility in both themes.
- **Deleted tasks reappear** — Dashboard and HTMX task-list queries now exclude archived tasks.
- **Google Calendar 403 on re-login** — OAuth write scope flag derived from actual token response scopes instead of stale cookie state.
- **Desktop toast notifications** — Long messages wrap (up to 3 lines); toast aligns with content area on ultrawide monitors.
- **Send button contrast** — Visible border on both desktop and mobile.

---

## v0.45.0–v0.45.12 — 2026-02-12

### Changed
- **Thoughts page chat-style redesign** — Replaced top-input panel with bottom-input chat layout. Bubbles with left-aligned content and right-pinned actions, date separators, scroll-area with gravity pushing bubbles to bottom, slide-up animation for new thoughts, glass morphism bottom bar on mobile.

### Fixed (12 follow-up patches)
- Header height, font matching, button contrast, oval button radius, horizontal rhythm, date grouping (`external_created_at`), bottom blank space, date separators, glass header blur, bottom fade gradient, mobile action button alignment, Jinja2 `items` key collision.

---

## v0.44.0–v0.44.11 — 2026-02-11

### Added
- **Mobile-first redesign for Thoughts, Analytics & Settings** — All three pages now match the Tasks page: full-viewport scrolling, glass-morphism sticky headers with backdrop blur, edge-to-edge flat layout, bottom fade gradients, hairline separators, 44px touch targets, scroll spacers for tab bar clearance. Dark mode counterparts.
- **Submit button for thought capture** — Desktop: keyboard-hint badge. Mobile: iMessage-style round accent button.

### Fixed (10 follow-up patches)
- Warm-tinted energy glass, toast undo duration (5s), toast message wrapping, toast dismiss button on iPhone SE, toast full-width snackbar, bottom empty space reduction, thoughts row visual balance, thoughts text space, capture bar sticky scroll, thoughts mobile polish.

---

## v0.43.0–v0.43.3 — 2026-02-11

### Changed
- **Glass UI consistency** — Unified backdrop-filter recipe across all floating glass elements (energy selector, tab bar). More transparent mobile glass. Much more transparent everywhere.
- **Mobile font sizes** — Bumped all mobile font sizes closer to iOS system defaults for iPhone readability. Two rounds of increases.

### Removed
- **Playwright CI workflow** — Removed (was running boilerplate tests against playwright.dev, not Whendoist). Removed `fsevents` from direct dependencies.

---

## v0.42.84–v0.42.99 — 2026-02-10/11

Mobile UX overhaul: seamless glass headers & polish (16 patches).

### Changed
- **Seamless glass header** — Task-list-header extends upward behind transparent site-header using negative margin + padding. One continuous glass element.
- **Calendar fade gradient** — Replaced overlay-based approaches with CSS `mask-image` on carousel (compositing layer fix for iOS Safari).
- **Mobile touch targets** — `::before` pseudo-element touch expanders (44px) for day-nav, domain-add, and calendar quick-action buttons.
- **Font sizes round 2** — All mobile font sizes increased further for iPhone readability (task titles 13→15px, metadata 9.75→11px, etc.).
- **Playwright mobile UX audit infrastructure** — Audit scripts, static HTML reproductions, Playwright config.

---

## v0.42.62–v0.42.83 — 2026-02-10

Mobile UX overhaul: glass UI & Telegram-inspired design (22 patches).

### Changed
- **Floating glass energy selector** — Energy mode selector moved from header to floating iOS-style glass segmented control above bottom tab bar with text labels.
- **Glass everywhere** — Site header, task-list header, domain headers, and tab bar all use frosted glass (progressive iterations from 85% → 45% → ~0% opacity). Telegram-matched levels (~88% light, ~82% dark).
- **Nunito font** — Switched body/UI text from system font to Nunito. Relaxed task padding, transparent impact backgrounds, thinner impact rail, hairline separators, bolder domain headers.
- **Glass tab bar** — Bottom tab bar uses frosted glass. Active tab: Telegram-style color-only (no background pill). Floating individual pill design.
- **CSS custom property `--header-h`** — Header height token used for sticky offset and scroll padding throughout.
- **SVG tab icons** — Replaced emoji tab icons with SVG sprite references. Font-weight fixes for Nunito range.

### Fixed
- Service worker caching old CSS (bumped `CACHE_VERSION` to force invalidation).
- Energy selector `position: fixed` broken inside `-webkit-overflow-scrolling: touch` container — moved in DOM.
- Nav underline position — invisible `::before` pseudo for 44px touch target while keeping visual at 24px.

---

## v0.42.52–v0.42.61 — 2026-02-10

Mobile UX overhaul: filter bar, swipe fixes, tab layout (10 patches).

### Changed
- **Mobile filter bar** — Full sort labels (Clarity/Duration/Impact), compact at 580px (DUR/IMP/CLR), gradient spectrum bar, invisible 44px tap targets on sort buttons.
- **Two-line task names** — `-webkit-line-clamp: 2` instead of single-line truncation on mobile.
- **Progressive domain label** — Label in sticky header reveals proportionally to scroll, smooth crossfade between domains.
- **Bottom fade gradient** — Content fades out before energy selector and tab bar (120px gradient).

### Fixed
- Swipe gestures broken by `\!` syntax error and `const`/`var` scope conflict — both fixed.
- Sticky task-list header broken by `translateZ(0)` and `will-change: transform` — overridden in mobile.css.
- Desktop header token conflict — removed duplicate `--col-duration` declaration from `app.css`.
- Long press triggering iOS text selection — reduced from 400ms to 300ms.
- Mobile tab bar layout — vertical icon+label, 56px height, fixed scroll overlap.

---

## v0.42.42–v0.42.51 — 2026-02-10

### Added
- **Gesture discovery** — Three-layer progressive disclosure: animated swipe hint on first visit, permanent purple edge on task rows (touch devices), one-time long-press tooltip after first dialog.
- **BRAND.md v1.8: Mobile & Touch section** — Documents gesture model, touch targets, mobile layout principles, breakpoints, bottom sheet spec.

### Changed
- **Swipe-left schedules instead of deletes** — Swiping left now opens calendar for manual scheduling (was auto-tomorrow). Delete moved exclusively to long-press context menu.
- **Flatten domain cards on mobile** — Groups lose card borders, become flat sections with sticky headers (recovers ~24px horizontal space).

### Fixed
- Swipe-right completion — correct parameters passed (`taskEl, taskId, instanceId, shouldComplete, isRecurring`).
- Mobile CSS polish — compact filter bar padding, two-liner truncation, domain card spacing, SVG FAB icon, removed tab badge.

---

## v0.42.29–v0.42.41 — 2026-02-09/10

### Added
- **Calendar zoom** — +/- buttons and Ctrl+scroll (pinch on macOS) adjust hour height 30–100px, persisted. New `calendar_hour_height` preference with migration.
- **Calendar card actions menu** — Right-click context menu with Skip (recurring), Unschedule (non-recurring), Edit, Delete.
- **Unschedule from task list** — Kebab menu option for scheduled non-recurring tasks.
- **Actions menu for all tasks** — Kebab (⋮) on every task, contextual items. Undo-based delete.
- **Universal departing animation** — Completing, scheduling, and deleting all use consistent slide-down + fade-out + collapse.

### Changed
- Smooth calendar zoom with `requestAnimationFrame`. Date-aware completion toasts ("Done for Mon, Feb 10").
- SVG icons for calendar quick-actions and kebab button. Kebab clickability z-index fix.

### Fixed
- Mobile kebab/touch visibility — `@media (hover: none)` overrides. Short calendar cards show compact buttons.

---

## v0.42.22–v0.42.28 — 2026-02-09

v1.0 security gate audit: final hardening round.

### Fixed
- **domain_id IDOR** — Added ownership validation in `create_task()` and `update_task()`.
- **Batch update dirty session** — Added rollback and sanitized error messages.
- **/ready info leakage** — Sanitized database error messages, removed user count.
- **Backup validation** — Pydantic validators for status, clarity, impact fields.
- **Circular parent_id protection** — Cycle detection in import, recursion guards in archive/restore.
- **TaskUpdate.clarity validation** — Added enum validator matching TaskCreate.
- **Todoist import error leakage** — Generic message to client, full exception logged server-side.
- **Head-loaded JS crash** — `error-handler.js` and `shortcuts.js` used `document.body` in `<head>` where it's null.
- **Parent tasks excluded from Plan My Day** — Only subtasks are plannable.
- **Backup import 500** — Validation errors return 400; `BackupValidationError` handler. Legacy clarity mapping. Missing fields in round-trip.
- **Instance schedule crash** — `MissingGreenlet` from missing `selectinload`.

---

## v0.42.7–v0.42.21 — 2026-02-09

v1.0 security gate audit: hardening sprint.

### Security
- **CSP hardening** — Self-hosted all vendor scripts (htmx, air-datepicker, ApexCharts, Pico CSS). Removed `cdn.jsdelivr.net` from CSP.
- **Sanitized error responses** — Exception details no longer exposed to clients.
- **Rate limits on destructive endpoints** — 5/min for import wipe, Todoist, GCal enable/disable/sync, passkey deletion.
- **Offline mutation guards** — Task completion, deletion, creation, scheduling check network status before optimistic UI updates.
- **HTMX CSRF injection** — Global `htmx:configRequest` listener injects CSRF token on all state-changing requests.
- **Session fixation defense** — OAuth and demo login clear session before setting user_id.
- **Backup import size limit** — Files > 10 MB rejected with 413 before parsing.
- **Input validation** — Range validation on impact, duration_minutes, completed_limit; max_length on string fields; batch size limits.

### Fixed
- **Offline flickering** — Network checks added to plan-tasks, dialog complete/delete, mobile skip (secondary paths).
- **Token revocation zombie state** — GCal sync auto-disables when Google revokes access.
- **Instance creation race condition** — `IntegrityError` from unique constraint handled gracefully.
- **Orphaned instances on recurrence disable** — Turning off recurrence deletes future pending instances.
- **Backup subtask hierarchy** — `parent_id` included in exports, two-pass ID mapping on import.

### Added
- **Mobile bottom tab bar** — Fixed to bottom of viewport, safe-area support.
- **Accessibility** — aria-live announcer, swipe role description, `.sr-only` utility.
- **Service worker cache TTL** — API responses expire after 5 minutes. `CLEAR_API_CACHE` on reconnect.

### Changed
- **Recurring task UTC notice** — Added timezone notice near scheduled time input.
- Scaling documentation for rate limiting and caching with Redis.
- README terminology updated (Executable→Autopilot, P1-P4→High/Mid/Low/Min).
- GCal events orphan cleanup on data wipe.

---

## v0.42.0–v0.42.6 — 2026-02-08/09

### Changed
- **Complete safeFetch migration** — All remaining 18 fetch() calls across 5 files now use safeFetch() with automatic CSRF injection and typed errors. Zero plain `fetch()` in application code.
- **V1-ROADMAP.md rewritten** — Reflects v0.42.1 state. 7 stale docs archived.

### Added
- **Keyboard shortcuts: task navigation & actions** — `j`/`k` move selection, `c` complete, `e`/Enter edit, `x` delete. Visual selection state, smart selection management. Help modal shows 11 shortcuts.

---

## v0.41.0–v0.41.1 — 2026-02-08

### Changed
- **Toast system rewrite** — Queue system prevents stomping, type variants (success/error/warning/info) with icons, action buttons, deduplication. Typed API: `Toast.success()`, `.error()`, `.warning()`, `.info()`. FIFO queue with priority, type-based durations, in-place updates. Full backward compatibility.

### Added
- **Shortcuts discoverability** — Footer hint bar ("? Keyboard shortcuts"), one-time toast, tooltip enhancement, Settings panel entry.

---

## v0.40.0–v0.40.1 — 2026-02-08

### Changed
- **Production hardening** — Database pool 5+10 → 2+3. Pool recycle 5min → 30min. Healthcheck `/health` → `/ready`. Per-user materialization sessions.

### Added
- **Statement timeout** — 30s for all PostgreSQL queries.
- **Materialization timeout** — 5 minutes with automatic retry.
- **Graceful shutdown** — Database engine pool disposal on shutdown.
- **Error recovery foundation** — `safeFetch()` with pre-flight network check, typed error classes (NetworkError, ValidationError, CSRFError, RateLimitError), `handleError()` with recovery actions, Sentry integration. 17 fetch() calls migrated.

---

## v0.39.0–v0.39.8 — 2026-02-07/08

### Changed
- **Rename clarity to Mode** — `clear`/`defined`/`open` → `autopilot`/`normal`/`brainstorm`. Two optional toggle chips replace 3 mandatory pills. Migration included.
- **Impact labels** — Unified to High/Mid/Low/Min everywhere.
- **Column order** — Clarity | Dur | Impact (was Dur | Impact | Clarity).
- **Full mode names** — `Autopilot`/`Brainstorm` instead of `Auto`/`Brain`.
- **Inbox → Thoughts** — Renamed throughout all views. Removed from domain picker.
- **Demo account overhaul** — Floating pill banner, realistic PM persona with ~50 tasks, ~28 completed tasks for analytics, 14-day recurring backfill. Tighter rate limits (3/min).
- **Subview headers** — Centered title, arrow-only back button, proper grid layout in subviews. Multiple alignment and specificity fixes.

---

## v0.38.0 — 2026-02-07

### Changed
- **Task list UI refinements** — Past-tasks amber badge on SCHEDULED header with Complete/Skip popover. PMD banner contextual copy (morning/evening). Domain count left-aligned. Scheduled separator column labels. Temporal date coloring (overdue=red, today=purple).

---

## v0.37.0–v0.37.3 — 2026-02-07

### Changed
- **Design audit** — Meta column resting opacity 0.65→0.85. Ghost checkbox always visible (30%). Clarity text labels. Dashed add-task placeholder. Domain task counts. Single-row header (energy pills merged into sort row). Plan My Day contextual banner. Calendar auto-advance after 8pm.

### Fixed
- Ghost checkbox centering, task completion movement, section separator overflow, back-to-tasks button stretch.

---

## v0.36.0 — 2026-02-06

### Changed
- **Task list visual refinements** — Neutral subtask badges. Impact labels "High/Mid/Low/Min" (replaces P1-P4). Single-dot clarity column (32px). Collapsible Scheduled/Completed sections. Left-aligned section separators. Trash moved to settings panel.

---

## v0.35.0 — 2026-02-06

### Changed
- **Brand-aligned header refresh** — Spectrum gradient border (blue→purple→magenta). Clarity-tinted energy pills with indicator dots. Segmented view toggle. Dot-only clarity column (42px).

---

## v0.34.0 — 2026-02-06

### Changed
- **Task list header redesign** — Two-row layout: Row 1 (title + sort + gear), Row 2 (energy + view chips). Always-visible `Sched`/`Done` chip toggles. Minimal settings panel (replaces 12-control dropdown). Hardcoded sort preferences.

---

## v0.33.0–v0.33.1 — 2026-02-06

### Changed
- **Flatten scheduled/completed sections** — Flat chronological lists (no per-domain nesting). New return structure with `domain_groups`, `scheduled_tasks`, `completed_tasks`. Reusable task macro.
- **Rename clarity levels** — `executable`→`clear`, `exploratory`→`open`. Migration included.

---

## v0.32.4–v0.32.19 — 2026-02-02

### Added
- **Recurring tasks** — Skip instances (right-click + mobile), batch completion for past instances, recurrence bounds UI (start/end dates), instance drag-and-drop rescheduling, weekly preset auto-selects day of week.
- **Pending past dashboard banner** — With Complete all / Skip all / Dismiss actions.

### Fixed
- Recurrence bounds date inputs too narrow. Past instances never materialized. Completion visual mismatch. Recurrence rule data loss on edit. Desktop dialog missing yearly/monthly fields. `aria-pressed` wrong for instances.
- Recurrence time unified to `task.scheduled_time` (migration strips `rule.time`).
- Migration cast `::jsonb` for PostgreSQL `json` column.

---

## v0.32.0–v0.32.3 — 2026-02-02

### Changed
- **GCal sync hardening (2 rounds)** — Per-user sync lock, adaptive throttle (1→5+ QPS), calendar reuse with stale event cleanup, cancellation signal, progress tracking, circuit breaker. Recurring tasks without time don't sync (keeps calendar clean). Consolidated 3 GCal docs into [GCAL-SYNC.md](docs/GCAL-SYNC.md).

---

## v0.31.0–v0.31.9 — 2026-02-02

### Added
- **Google Calendar task sync** — One-way sync to dedicated "Whendoist" calendar. Impact-based colors, completed prefix, recurring instances synced individually. Settings UI, OAuth scope upgrade, dashboard dedup. Fire-and-forget background sync.
- **Settings redesign** — Google Calendar consolidated into Integrations. Calendar toggles use fetch. GCal events inherit calendar color (removed per-event `colorId`).

### Fixed
- Drag-and-drop overwrites task duration to 30min. Completed Todoist imports sync. GCal sync circuit breaker for 403/404. Fully async sync operations with status polling.
- Non-blocking bulk sync, adaptive throttle, per-user lock, rate limit vs permission 403 detection.

---

## v0.30.0–v0.30.1 — 2026-02-01

### Added
- Subtask hierarchy in Todoist import (two-pass with parent-child relationships)
- Parent breadcrumb display and subtask count badges
- Cascade delete confirmation for parent tasks

### Changed
- CI pipeline: 3 jobs run in parallel. Railway auto-deploys on merge.
- Quieter production logs with version and boot timing.

---

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
