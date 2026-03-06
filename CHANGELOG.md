# Changelog

Development history of Whendoist. Per-patch details in git history.

---

## v0.64.1 — 2026-03-06

### Fix: CI — Rust build & flaky timezone test

- Move `stt:default` permission from `default.json` to `mobile.json` (STT plugin is mobile-only, broke `cargo check` on Linux CI)
- Pin `test_materialize_uses_timezone` to a fixed date in February to avoid DST boundary flakiness

---

## v0.64.0 — 2026-03-06

### Feat: Tauri iOS — native UITabBar, STT, IPC hardening, lazy routes

**Native UITabBar:**
- Swift `NativeTabBarPlugin` replaces CSS bottom nav with real UITabBar (iOS 26+ Liquid Glass ready)
- Tab bar auto-hides on login routes via URL observation (KVO), hides on keyboard show
- JS ↔ Swift bridge via `evaluateJavaScript` + `WKScriptMessageHandler` (avoids unreliable Tauri IPC)
- `tauri-native-tabbar.ts` manages tab bar visibility and CSS vars (`--native-tabbar-height`, `--native-safe-area-bottom`)
- `mobile-nav.tsx` returns `null` when native tab bar is active, renders glass-morphism fallback otherwise

**Native Speech-to-Text:**
- `tauri-plugin-stt` (Rust) + `tauri-plugin-stt-api` (JS) for on-device STT on iOS
- `tauri-stt.ts` wrapper with permission handling and session lifecycle
- `use-voice-input.ts` refactored: detects native vs Web Speech API, async session with cleanup and timeout guards

**IPC Hardening (all Tauri plugin wrappers):**
- 1.5s timeout on all IPC calls (`tauri-cache.ts`, `tauri-token-store.ts`, `tauri-notifications.ts`, `tauri-widgets.ts`)
- Circuit breaker in token store: marks store unavailable after repeated timeouts, falls back to in-memory cache
- Concurrent call deduplication for `getDb()` and store initialization
- All wrappers return safe defaults on failure — app never hangs

**Build & Dev:**
- Self-hosted fonts (Nunito + Quicksand WOFF2) — eliminated Google Fonts CDN dependency
- Dashboard route lazy-loaded (`dashboard.lazy.tsx`) for code splitting
- Vite config: HMR WebSocket via `TAURI_DEV_HOST`, POST body restoration for WKWebView, pre-bundled heavy deps
- Justfile: `tauri-ios` (fast preview build) and `tauri-ios-hmr` (HMR for frontend iteration)
- StrictMode disabled in Tauri dev to avoid double-render lag over WiFi
- `tauri-plugin-edge-to-edge` for safe-area CSS vars on mobile
- Login/auth redirects use TanStack Router `navigate()` instead of `window.location.href`

---

## v0.63.3 — 2026-03-06

### Fix: iOS keyboard avoidance for Tauri WKWebView

- **Keyboard height bridge**: Swift `NativeTabBarPlugin` now sends keyboard height and animation duration to JS via `evaluateJavaScript`, mirroring the existing tab bar height bridge pattern
- **`tauri-keyboard.ts`**: New JS bridge sets `--keyboard-height`, `--keyboard-anim-duration` CSS vars and `body.keyboard-visible` class — components reposition via pure CSS
- **Thoughts sticky input**: Moves above keyboard with smooth animation matching iOS keyboard timing
- **Task edit drawer**: Entire drawer lifts above keyboard (`bottom: var(--keyboard-height)`), footer safe-area padding removed when keyboard is up (eliminates gap above iOS keyboard toolbar), extra scroll clearance ensures notes textarea is fully accessible
- **Toasts**: Fixed notch overlap — offset now uses `var(--safe-area-inset-top)` (Tauri edge-to-edge CSS var) instead of `env()` which returns 0 in WKWebView

---

## v0.63.2 — 2026-03-05

### Fix: GCal sync auto-disable never persisted + circuit breaker

- **Bug fix**: `_disable_sync_on_error()` changes were rolled back because `CalendarGoneError` propagated past `db.commit()` in fire-and-forget functions — sync was "disabled" on every mutation but never actually persisted, causing 16+ redundant 403 calls per session
- **Circuit breaker**: In-memory `_sync_disabled_users` set prevents fire-and-forget from even attempting Google API calls after sync is disabled for a user; cleared on re-enable/full-sync
- **`_persist_sync_disable()`**: Dedicated fresh-session helper commits the disable reliably, independent of the caller's rolled-back session

---

## v0.63.1 — 2026-03-05

### Fix: Context menu actions, missing toast, and data_version lock contention

- **Context menus**: Switch all `ContextMenuItem`/`DropdownMenuItem` from `onClick` to `onSelect` (Radix UI's semantic handler) across 5 files — fixes calendar RMB buttons not firing
- **Task view RMB toast**: Add missing `toast.success()` with undo action + `announce()` to `handleMenuComplete` for non-recurring tasks — previously completed silently with no feedback
- **data_version contention**: Wrap `bump_data_version` in a savepoint with 2s `SET LOCAL statement_timeout` on PostgreSQL — if the row lock is contended, the savepoint rolls back gracefully instead of blocking the entire mutation for 30s (which caused Sentry `QueryCanceledError` 500s and slow task creation)

---

## v0.63.0 — 2026-03-05

### Feat: Home Screen Widgets (iOS + Android) — Phase 6

Native home screen widgets showing today's tasks and overdue count on both iOS and Android.

- **Rust**: `commands/widgets.rs` — bridge to push task summary data to native widgets; iOS writes to App Group `NSUserDefaults` via `objc2` + reloads WidgetKit timelines; Android writes `widget-data.json` to app data dir
- **iOS**: SwiftUI WidgetKit extension — small (count display) and medium (task list) sizes, reads from shared `NSUserDefaults`; App Group entitlement on both main app and extension; XcodeGen target in `project.yml`
- **Android**: `TodayTasksWidgetProvider` (Kotlin) — `AppWidgetProvider` with `RemoteViews`, reads JSON file; 5 inlined task rows, 30-min system refresh
- **Frontend**: `tauri-widgets.ts` — filters today's tasks + overdue, computes summary, calls Rust via `invoke`; triggered on task cache persistence, app backgrounding, and cleared on logout
- **Encryption**: When enabled, widgets show task counts only (no titles) — decryption keys aren't available outside the WebView

---

## v0.62.0 — 2026-03-05

### Feat: Tauri v2 Mobile — Phase 3 Offline SQLite Cache

Local SQLite cache so the Tauri app works offline. Tasks and domains are cached on fetch, hydrated from cache on cold start, and mutations queue locally for replay on reconnect.

- **Backend**: Add `data_version` to `/api/v1/me` response — enables change detection for sync
- **Rust**: Register `tauri-plugin-sql` with SQLite feature for local database
- **Frontend**: `tauri-cache.ts` — SQLite wrapper with `cache_entries` (JSON blob per entity type) and `write_queue` tables
- **Frontend**: `use-offline-sync.ts` — sync orchestrator: cold start hydration from SQLite, cache persistence via TanStack Query subscription, periodic `data_version` check (2min), write queue drain on reconnect
- **Frontend**: `api-client.ts` — offline mutations queue to SQLite instead of failing (Tauri only), shows "Saved offline" toast
- **Frontend**: `use-network-status.ts` — Tauri-aware offline/online toasts ("Viewing cached data" / "Back online — syncing...")
- **Capabilities**: Add `sql:default` permission to Tauri default capabilities

---

## v0.61.2 — 2026-03-05

### Fix: Tauri demo login — device token endpoint for native app

- **Backend**: Add `POST /api/v1/device/demo-token` — returns device tokens directly for demo login in Tauri, bypassing session-based flow that doesn't work in native WebViews
- **Frontend**: In Tauri mode, demo button calls the new API endpoint, stores tokens via `tauri-plugin-store`, and navigates via SPA router (instead of broken `<a href="/auth/demo">` navigation)

---

## v0.61.1 — 2026-03-05

### Fix: Tauri iOS launch crash + CORS for native app API calls

- **Fix**: Remove `"store": {}` from `tauri.conf.json` — `tauri-plugin-store` v2 expects no config (unit type), empty object caused deserialization panic on iOS launch
- **Fix**: Add CORS middleware for Tauri origins (`tauri://localhost`, `https://tauri.localhost`, dev ports) — native app API calls to production were silently blocked by same-origin policy, breaking build-info fetch (demo button hidden) and all authenticated requests
- **Rust**: Fix `schedule_reminder` — make async + add `.await` on `.show()` (required by `tauri-plugin-notifications` v0.4)
- **Rust**: Fix push registration — move `.notifications()` call inside spawned task to avoid borrow issues
- **Tauri**: Split `shell:allow-open` into `desktop.json` capability (not available on mobile)
- **Vite**: Bind to `0.0.0.0` when running under Tauri so physical devices can reach the dev server
- **Justfile**: Add `tauri-ios-sim` target for simulator development

---

## v0.61.0 — 2026-03-05

### Feat: Tauri v2 Mobile — Phase 2 Push Notifications / Remote Reminders

Server-side push delivery so task reminders fire even when the app is closed/backgrounded.
Architecture: backend cron finds due reminders → sends silent push via FCM/APNs → device wakes → Rust creates local notification.

- **Backend**: `DeviceToken` model + `reminder_sent_at` field on `Task` for push delivery tracking
- **Backend**: `PushService` — FCM v1 HTTP API (OAuth2 JWT) + APNs HTTP/2 (ES256 JWT) delivery via raw `httpx[http2]`
- **Backend**: `POST/DELETE /api/v1/push/token` — register/unregister device push tokens with per-user cap (10 devices)
- **Backend**: Background reminder loop (60s) — PostgreSQL interval query finds due reminders, sends silent push, marks `reminder_sent_at`
- **Backend**: `reminder_sent_at` auto-resets when scheduling fields change (scheduled_date, scheduled_time, reminder_minutes_before)
- **Rust**: Replaced `tauri-plugin-notification` with `tauri-plugin-notifications` v0.4 (community plugin with push support)
- **Rust**: Push token registration on mobile startup via `register_for_push_notifications()`, emits `push-token-received` event
- **Rust**: `get_push_token` command + `PushTokenState` managed state for frontend access
- **Frontend**: `tauri-push.ts` — push token registration/unregistration with backend + local persistence via `LazyStore`
- **Frontend**: `usePushNotifications()` hook — listens for push token events, registers with backend, unregisters on logout
- **Config**: FCM/APNs credentials via env vars (backend starts fine without them — push loop simply doesn't start)
- **Tests**: 23 new tests — DeviceToken CRUD, multitenancy, reminder_sent_at reset, PushService FCM/APNs payloads + error handling

---

## v0.60.1 — 2026-03-04

### Fix: Biometric auth — persistence, type labels, security docs

- **BUG 1 (Critical)**: `biometricEnabled` was not persisted across app restarts — biometric button never appeared after relaunch. Added `has_stored_key` Rust command that probes the store without triggering biometric. `checkBiometric()` now calls it on startup to derive `biometricEnabled` from actual stored state.
- **BUG 2**: `biometryType` string mismatch — Rust `Debug` format produced "FaceId"/"TouchId" but TypeScript expected "FaceID"/"TouchID". Replaced fragile `format!("{:?}")` with explicit `match` mapping to exact strings.
- **Security doc**: Added module-level documentation in `biometric.rs` explaining the `tauri-plugin-store` vs `tauri-plugin-keystore` tradeoff (JSON file vs hardware-backed keychain) and why the current approach was chosen.

---

## v0.60.0 — 2026-03-04

### Feat: Tauri v2 Mobile — Phase 4 Biometric Auth

- **Rust**: `biometric.rs` — 4 commands: `check_biometric_availability`, `store_encryption_key`, `retrieve_encryption_key`, `clear_encryption_key`
- **Rust**: `tauri-plugin-biometric` v2 (official, mobile-only) for Face ID / Touch ID / fingerprint authentication
- **Rust**: Biometric gates access to encryption key stored in `tauri-plugin-store`; Rust never performs encryption — only stores/retrieves the key blob
- **Capabilities**: Separate `mobile.json` with `biometric:default` permission (desktop builds skip it)
- **iOS**: `Info.ios.plist` with `NSFaceIDUsageDescription` for Face ID permission dialog
- **Frontend**: `tauri-biometric.ts` TypeScript wrappers for all 4 Rust commands + `biometryLabel()` helper
- **Frontend**: `crypto-store.ts` — added `biometricEnabled`, `biometricAvailable`, `biometryType`, `checkBiometric()`, `enrollBiometric()`, `unlockWithBiometric()`, `disableBiometric()`
- **Frontend**: `encryption-unlock.tsx` — biometric unlock button (primary when available, adapts icon for Face ID vs Touch ID)
- **Frontend**: Settings encryption section — biometric toggle visible when Tauri + encryption enabled + device supports biometric
- **Frontend**: `biome.json` — excluded `src-tauri/` from Biome scanning (Rust build artifacts)

---

## v0.59.1 — 2026-03-04

### Fix: Wire up useReminders() hook at authenticated root

- `useReminders()` was defined but never called — reminders were never scheduled in Tauri
- Call added to `_authenticated.tsx` alongside `useNetworkStatus()` (same background-hook pattern)

---

## v0.59.0 — 2026-03-04

### Feat: Tauri v2 Mobile — Phase 1 Local Notifications / Reminders

- **Backend**: `reminder_minutes_before` nullable integer column on Task model (0 = at time, 5/15/30/60/1440 = minutes before)
- **Alembic migration** for the new column
- **Schemas**: `TaskCreate`, `TaskUpdate`, `TaskResponse` updated with `reminder_minutes_before` field + validation
- **New endpoint**: `GET /api/v1/tasks/reminders` — returns tasks with active reminders (scheduled, pending, has reminder set), filtered by user_id
- **Rust**: `tauri-plugin-notification` v2 added; `notifications.rs` commands: `schedule_reminder`, `cancel_reminder`, `cancel_all_reminders` with managed `ReminderStore` state
- **Frontend**: `tauri-notifications.ts` TypeScript wrapper for Rust notification commands
- **Frontend**: `use-reminders.ts` hook — syncs reminders on launch, reschedules on task changes, cancels on unmount
- **Frontend**: `ReminderPickerRow` component in `field-pickers.tsx` — "None", "At time", "5 min", "15 min", "30 min", "1 hour", "1 day" selector
- **Frontend**: Wired into `TaskFieldsBody`, `useTaskForm`, `useTaskCreate` — reminder selector appears when Tauri + scheduled date set
- Activity log tracks `reminder_minutes_before` field changes

---

## v0.58.1 — 2026-03-04

### Feat: Voice Input for Task Creation (Phase 5)

- **`use-voice-input.ts`** hook wrapping the Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) — runtime availability check, interim results for real-time feedback, prefix-append pattern for mixing typed + spoken text
- **Mic button** in Quick Add dialog and Search Palette — shown only when `isSupported`, red pulse animation while listening, auto-stops when dialog closes
- Transcribed text feeds directly into `useSmartInput.setInput()` so spoken phrases like "Buy groceries #personal !high tomorrow 30m" are parsed identically to typed input
- User-facing error toasts for permission denied, no microphone, and network failures
- Full TypeScript type declarations for the Web Speech API (not yet in TS DOM lib)
- Graceful fallback: mic button hidden when API unavailable (Firefox, some WebViews)

---

## v0.58.0 — 2026-03-04

### Feat: Tauri v2 Mobile — Phase 0 Scaffold

- **Tauri v2 project** scaffolded at `frontend/src-tauri/` — Rust entry points (`lib.rs`, `main.rs`), app config (`tauri.conf.json`), capabilities, and smoke-test IPC command
- **Conditional VitePWA**: PWA plugin excluded when building for Tauri (`TAURI_ENV_PLATFORM` detection in `vite.config.ts`)
- **Device token auth**: New `POST /api/v1/device/token` (session → signed token exchange), `POST /api/v1/device/refresh`, `DELETE /api/v1/device/token` for cross-origin WebView authentication
- **Bearer auth middleware**: `get_user_id()` now accepts `Authorization: Bearer` tokens alongside session cookies; CSRF validation skipped for bearer-authenticated requests (CSRF is cookie-only)
- **Frontend Tauri detection**: `isTauri` flag in `use-device.ts` via `__TAURI_INTERNALS__` check; `api-client.ts` switches to absolute baseURL + bearer auth when running in Tauri
- **Token store**: `tauri-token-store.ts` manages JWT persistence via `tauri-plugin-store` with auto-refresh on expiry
- **Justfile**: Added `tauri-android`, `tauri-ios`, `tauri-build-android`, `tauri-build-ios`, and init commands
- Added `@tauri-apps/api`, `@tauri-apps/plugin-store`, `@tauri-apps/cli` to frontend dependencies

---

## v0.57.5 — 2026-03-04

### Fix: Fire-and-forget bulk sync acquires per-user lock

- `_fire_and_forget_bulk_sync` in `tasks.py` and `instances.py` now acquires the same per-user `asyncio.Lock` used by `gcal_sync.py`, preventing concurrent bulk syncs from creating duplicate/orphaned Google Calendar events
- Extracted all fire-and-forget GCal helpers into shared `app/routers/_gcal_helpers.py` (DRY — was copy-pasted in two files)
- Lock dict is now single source of truth in `_gcal_helpers.py`, imported by all three routers

---

## v0.57.4 — 2026-03-04

### Fix: Move secondary timezone toggle to Settings

- Removed Globe toggle from calendar header — too prominent for a set-and-forget option
- Added "Show on calendar" switch in Settings > Timezone (visible when secondary tz is configured)

---

## v0.57.3 — 2026-03-04

### Fix: Timezone picker UX — optimistic updates & brand-aligned toggle

- Timezone pickers in Settings now update instantly via optimistic cache writes (eliminates ~10s perceived delay)
- Globe toggle icon redesigned: 24×24 brand icon button with purple tint active state (was oversized filled button)

---

## v0.57.2 — 2026-03-04

### Feat: Secondary timezone display (Phase 2)

**Backend:**
- `secondary_timezone` nullable column on UserPreferences with Alembic migration
- Validation reuses ZoneInfo pattern from primary timezone (empty string clears)
- Exposed in preferences API request/response schemas

**Frontend:**
- Secondary timezone picker in Settings (reuses TimezonePicker with allowClear)
- Dual hour labels on calendar time ruler — secondary label shown smaller/muted below primary
- Globe icon toggle in calendar header (only visible when secondary tz is configured)
- Toggle state persisted in Zustand store (survives navigation)
- Half-hour offset support (e.g., Asia/Kolkata +5:30 shows "1:30PM")
- Labels hidden at compact zoom levels (< 50px hour height)

---

## v0.57.1 — 2026-03-04

### Feat: Multi-timezone support (Phase 1)

Full timezone awareness across frontend and backend — all time rendering, calculations, and storage now respect the user's configured timezone.

**Frontend:**
- `timezone.ts` — core timezone utility module with cached `Intl.DateTimeFormat` instances, zero new dependencies
- `useTimezone()` hook — single source of truth for effective timezone (reads from TanStack Query prefs cache)
- `TimezonePicker` — searchable timezone picker with Fuse.js fuzzy search, replaces raw `<Select>` in Settings
- Calendar panel, day column, scheduled section, and drag-and-drop all use timezone-aware time extraction
- `calendar-utils.ts` — all time calculations (`datetimeToOffset`, `calculateOverlaps`, `planTasks`, etc.) accept optional `tz` parameter

**Backend:**
- Fixed `date.today()` → `get_user_today(timezone)` in analytics service, analytics router, and task restore
- `_ensure_utc()` in RecurrenceService — converts naive user-local datetimes to UTC before DB storage
- Invalid timezone preference now returns 422 error (was silently ignored)

**Audit fixes:**
- Instance schedule endpoint fetches user timezone before storing (naive datetime bug)
- Current-time indicator updates immediately on timezone change (was stale for up to 60s)

---

## v0.57.0 — 2026-03-04

### Feat: Task activity log

Full activity log system with hybrid encrypted/plaintext field diffs.

**Backend:**
- `ActivityLog` model with composite indexes, Alembic migration
- `log_activity()` / `log_field_changes()` helpers with encrypted-field and skip-field awareness
- Instrumented 11 TaskService methods, 7 RecurrenceService methods, batch ops, import/wipe
- Two API endpoints: per-task (`GET /activity/task/{id}`) and per-user (`GET /activity`) with pagination
- Deterministic ordering (created_at + id tiebreaker), multitenancy isolation
- 18 unit tests covering events, field diffs, encryption, cascades, batches, and isolation

**Frontend:**
- Desktop: Tabs (Details / Activity) in TaskDetailPanel for edit mode
- Mobile: "View activity" row → nested vaul drawer in TaskEditDrawer (lazy-loaded)
- Settings: Activity Log section with Sheet side panel, "Load more" pagination
- Shared components: `ActivityList`, `TaskActivityPanel`, `describeActivity()`, `formatTimeAgo()`
- Error state handling, event icons for 21 event types

**Audit fixes (2 rounds):**
- Batch schedule/move capture old_value for proper "A → B" display
- Batch move validates domain ownership (multitenancy)
- `datetime.utcnow()` → `datetime.now(UTC)` (deprecated fix)
- "Load more" button hides at limit cap
- `domain_updated` shows old→new values for non-encrypted fields

---

## v0.56.17 — 2026-03-04

### Fix: Security backlog — aging stats date bound, instance cleanup audit trail

- `_get_aging_stats()` now bounded by both date (`AGING_STATS_HISTORY_DAYS=730`) and count (`AGING_STATS_LIMIT=5000`) for defense-in-depth
- `cleanup_old_instances()` logs per-user/per-status audit trail before bulk delete, and confirms job execution even on zero deletions
- Offline mutation guards confirmed already resolved by global axios interceptor
- Backlog updated: all three Security items moved to Shipped

---

## v0.56.16 — 2026-03-03

### Fix: Fifth-pass batch operations audit (1 finding)

- Context menu Complete/Reopen label now uses resolved count instead of raw `selectedIds.size`, matching the FAB fix from audit #1

---

## v0.56.15 — 2026-03-03

### Fix: Fourth-pass batch operations audit (3 findings)

- Keyboard Delete/Backspace now warn about subtask cascade before deleting parent tasks (was silently deleting without confirmation)
- Command palette "Edit..." now reliably opens the batch edit popover even when no prior multi-selection existed (was a race condition with FAB mount timing)
- Command palette Complete button now toggles to "Reopen" when all selected tasks are completed (was silently no-oping)

---

## v0.56.14 — 2026-03-03

### Fix: Third-pass batch operations audit (4 findings)

- Deduplicate instances when completing a mix of recurring parents and their calendar instances — prevents double-toggle that cancels out the action
- SubtaskItem context menu now shows batch actions when the subtask is part of a multi-selection (was always showing single-item menu)
- Command palette batch delete now shows the same confirmation dialog as FAB and context menu for large deletions
- Collapsing a domain group clears the multi-selection so hidden tasks can't be acted on blindly

---

## v0.56.13 — 2026-03-03

### Fix: Second-pass batch operations audit (6 findings)

- Partial-failure toast now preserves the Undo button instead of silently dropping it when Sonner replaces the toast
- Dashboard Cmd+Enter and command palette batch actions use composite helpers for single-toast behavior
- Shift+Click range selection excludes tasks from collapsed domain groups (no invisible selections)
- Lasso selection re-caches card positions after auto-scroll moves the container (no stale hit-testing)
- Batch reschedule uses new `batchRescheduleAll` composite helper — single toast with single undo for mixed selections
- Batch edit Apply button stays disabled when all touched fields resolve to "—" (no-op prevention)

---

## v0.56.12 — 2026-03-03

### Fix: Visual consistency, performance, and accessibility polish (audit #9, #13, #15, #16, #17, #19, #20)

- Shift+Click range selection now crosses parent/subtask boundaries — unified flat orderedIds includes expanded subtasks in display order
- Batch drag overlay says "items" instead of "tasks" when selection contains both tasks and instances
- Lasso selection auto-scrolls when pointer approaches top/bottom edge of the scroll container
- Batch stack-drop warns and skips items that would overflow past 23:00 instead of silently clamping to midnight
- Multi-select ring takes priority over the just-updated pulse animation
- Action bar buttons have `aria-label` and `title` for screen reader accessibility on mobile
- Lasso hit-testing caches card positions at start, throttles to rAF, and skips redundant store updates

---

## v0.56.11 — 2026-03-03

### Fix: Batch operation correctness (audit #2, #4, #7, #10, #12, #22)

- Mixed task+instance batch operations (complete, unschedule) now produce a single toast with a single Undo button that reverses everything
- Batch edit no longer fires no-op mutations on pre-filled fields — only explicitly touched fields are included
- Batch delete warns about subtask cascade: shows total subtask count in confirmation dialog
- Backward time wrap during batch drag correctly wraps to the previous day instead of clamping to 00:00
- Undo fires per-task reverse mutations instead of restoring a stale full cache snapshot
- Subtask resolution uses actual `completed_at` from cache instead of synthesizing `new Date().toISOString()`

---

## v0.56.10 — 2026-03-03

### Fix: Multi-select state consistency (audit #5, #6, #8, #11, #14)

- Keyboard shortcuts (Delete/Backspace/⌘+Enter) now resolve instances via `resolveSelection()` — previously only tasks were handled
- Selection clears when energy filter or domain filter changes, preventing batch operations on invisible tasks
- Right-click on an unselected task shows single-item context menu (was incorrectly showing batch menu when any selection existed)
- Floating action bar count uses resolved count instead of raw `selectedIds.size`, staying accurate when tasks disappear from cache
- Selection clears on route navigation via `useLocation()` in the authenticated layout

---

## v0.56.9 — 2026-03-03

### Fix: Command palette batch actions use shared mutation helpers

- Refactored palette batch actions to use `batch-mutations.ts` helpers instead of raw `fetch()` to `/api/v1/tasks/batch-action`
- All palette actions now get optimistic updates, undo toasts, and proper cache invalidation for free
- Recurring tasks are handled correctly: Complete/Reschedule/Unschedule operate on pending instances
- "Edit…" syncs palette selection to global selection store before opening the FAB edit popover
- Removed `isPending` loading state (batch helpers are fire-and-forget, palette closes immediately)

---

## v0.56.8 — 2026-03-03

### Fix: Escape collision with Radix overlays clears multi-selection

- Global Escape handler now checks `e.defaultPrevented` and open Radix overlays before clearing selection — pressing Escape to close a popover, dialog, or context menu no longer wipes the selection
- `dismissContextMenu()` targets the Radix content element directly instead of dispatching a synthetic Escape on `document`, preventing fragile double-clear

---

## v0.56.7 — 2026-03-03

### Fix: Increase database connection pool size to prevent cascading timeouts

- Increased default `db_pool_size` from 2 to 5 and `db_max_overflow` from 3 to 10 — the previous limits allowed only 5 simultaneous connections, causing pool exhaustion under load
- Added `db_pool_timeout` setting (default 10s) so requests fail fast on pool exhaustion instead of hanging for 30s and cascading into statement timeouts and PendingRollbackErrors
- Added missing `icalendar` dependency to `pyproject.toml` (was imported but not declared, breaking CI)
- Closes #594, #595, #596, #597, #599, #600, #601, #602, #603, #604, #608, #609, #610, #611, #612

---

## v0.56.6 — 2026-03-03

### Fix: Multi-select — Shift+Click in Scheduled/Completed sections, subtask selection, batch improvements

- Shift+Click range selection now works in Scheduled and Completed task sections (was silently falling back to toggle due to missing `orderedIds` prop)
- Subtasks can now be multi-selected with Cmd+Click (toggle) and Shift+Click (range within parent)
- Batch operations (complete, delete, edit) apply optimistically to nested subtasks
- `resolveSelection` finds subtasks in nested cache arrays for correct batch resolution
- Batch context menu and floating action bar correctly handle recurring tasks (complete instances, skip reparent-level reschedule/unschedule)
- Added Reschedule date picker to floating action bar
- Context menu shows batch actions when any selection exists (not just when clicked item is selected)
- Instance batch operations now apply optimistic updates across all cache entries with snapshot-based undo

---

## v0.56.5 — 2026-03-03

### Feat: Batch drag shows phantom shadows for all selected tasks

- When batch-dragging multiple tasks on the calendar, phantom preview cards now appear for **every** selected task — not just the anchor
- Each phantom is positioned according to its relative spacing from the anchor, so you can see exactly where all tasks will land before dropping
- Anchor phantom keeps the existing strong styling; secondary phantoms use a subtler opacity for visual hierarchy
- Extracted shared `applyDelta` / time math to `frontend/src/lib/batch-drag-utils.ts` — used by both the phantom preview and the drop handler (single source of truth)
- Batch items are resolved once on drag start and cached in a ref — no re-resolution on every pointer move frame

---

## v0.56.4 — 2026-03-03

### Fix: ⌘+A now selects recurring instances & click-to-deselect on empty space

- ⌘+A now selects both pending tasks AND visible recurring instances from the calendar cache — instances highlight in the calendar with the same ring + badge as tasks
- Toast shows breakdown: "Selected 12 tasks and 3 instances"
- Clicking on empty space in the task panel (between groups, below last section, padding areas) now clears the multi-selection — consistent with clicking on the calendar background
- Interactive elements (buttons, links, inputs) within the task panel are excluded from the clear-on-click behavior

---

## v0.56.3 — 2026-03-03

### Fix: Remove misleading confirm dialog from batch delete

- Removed `window.confirm()` from batch delete in both FloatingActionBar and BatchContextMenu
- Delete is a soft-delete (archive) with working undo via the toast — the confirm dialog was contradictory ("This can be undone" in a scary modal)
- Now consistent with every other batch action: instant delete + undo toast

---

## v0.56.2 — 2026-03-03

### Fix: All batch actions — instant toast + undo for every mass operation

- **Root cause:** `executeBatch` and `executeInstanceBatch` were `async` — they `await`ed `Promise.allSettled()` across all N mutations before showing any toast. With many tasks, the browser queues requests (max ~6 concurrent per domain), so the floating action bar stayed stuck and no feedback appeared.
- **Fix:** Restructured both functions to fire-and-forget: optimistic cache update + toast with undo shown immediately, mutations fire in the background. If any fail, the toast is updated in-place (warning for partial, error + rollback for total failure).
- All callers (FloatingActionBar, BatchContextMenu, BatchEditForm) are now synchronous — `clear()` runs instantly, bar disappears, toast appears.
- Covers: Complete, Reopen, Delete, Unschedule, Edit, Reschedule, Skip — every batch action.

---

## v0.56.1 — 2026-03-03

### Fix: Batch drag-to-calendar — mutations never completed, no undo toast

- **Root cause:** `handleBatchDrop` called `updateTask.mutate()` N times on the same `useMutation` hook instance. In TanStack Query v5, each `.mutate()` detaches the observer from the previous mutation, so only the last call's callbacks fire — the other N-1 Promises never settle, `Promise.allSettled` hangs forever, and no toast is shown.
- **Fix:** Replaced `useMutation` hook calls with direct raw API functions (`updateTaskApiV1TasksTaskIdPut`, `scheduleInstanceApiV1InstancesInstanceIdSchedulePut`) which return proper Promises. Same fix applied to the undo handler.
- Batch optimistic updates + undo + toast now work correctly for any number of selected tasks.

---

## v0.56.0 — 2026-03-03

### Fix: Unified multi-select visuals across calendar and task list

- Task list rows now show `ring-inset ring-2 ring-primary` when selected (matching calendar cards)
- Selection checkbox uses filled circle (matching calendar badge and brand circle language)
- Removed left-border-color override on selected task rows — impact color preserved in all states
- Consistent visual signature everywhere: ring + filled circle checkbox + background tint

---

## v0.55.99 — 2026-03-03

### Fix: Multi-select visual polish

- Selection ring uses `ring-inset` on calendar cards — no more clipped edges at column boundaries
- Selection checkmark badge vertically centered on calendar task cards and instance cards
- Task list selection now shows a filled rounded-square checkbox (distinct from the completion circle)
- ⌘+A selects all pending tasks (previously missed scheduled tasks due to j/k navigation filter)
- Fixed "Edit\u2026" literal text in floating action bar (JSX attribute strings don't process Unicode escapes)

---

## v0.55.98 — 2026-03-03

### Feat: Multi-select — Shift+Click range selection & calendar lasso

- Shift+Click range selection: click item A, then Shift+Click item B to select everything between them (standard desktop convention)
- ⌘+Shift+Click adds range to existing selection without clearing
- Cross-view range blocked (calendar vs task list) — falls back to single toggle
- Calendar lasso: click+drag on empty calendar space to draw a selection rectangle; all intersecting task cards get selected
- ⌘+lasso adds to existing selection; lasso disabled during Plan My Day and active dnd-kit drags
- InstanceCard in time grid now supports multi-selection (⌘+Click, Shift+Click, batch context menu)
- `data-selection-id` attributes on all selectable cards for lasso hit-testing

---

## v0.55.97 — 2026-03-02

### Feat: Multi-select — Instance support, polish & command palette

- Instance-aware batch operations: Complete, Unschedule, Skip, and Reschedule now work on recurring instances alongside tasks
- New `resolveSelection()` helper splits selection IDs into tasks and instances from their respective TanStack Query caches
- "Skip" button in floating action bar and context menu when instances are selected (instances can't be deleted)
- Batch edit popover pre-fills fields when all selected tasks share the same value, shows "Mixed" placeholder when they differ
- Instance-only edit shows informational message ("edit the series instead"); mixed selection notes skipped instances
- `avoidCollisions` on batch edit popover — auto-flips to bottom when insufficient space above
- ⌘+A shows brief "Selected N tasks" toast (2s duration)
- Command palette expanded: Unschedule, Reschedule (date picker), and Edit actions added to batch footer

---

## v0.55.96 — 2026-03-02

### Feat: Multi-select — Phase 6 (task view integration)

- ⌘+Click on task row checkbox toggles selection instead of completion when modifier held
- Selected rows show left-border accent (2px primary) + `bg-primary/5` tint instead of ring treatment
- Batch drag from task list to calendar stacks tasks with 5-min gaps (like plan-my-day placement)
- Batch reparenting blocked with informative toast — only single-task reparent allowed
- ⌘+A selects all visible tasks in the current view
- Delete/Backspace deletes selected tasks (with confirmation if > 3)
- ⌘+Enter completes selected tasks (or reopens if all already completed)

---

## v0.55.95 — 2026-03-02

### Feat: Multi-select — Phase 5 (batch edit popover)

- "Edit..." button in floating action bar now opens a popover with Impact, Clarity, Duration, and Domain fields
- "Edit..." item in batch context menu opens the same popover (via custom event dispatch)
- All fields start in unset "—" state; only explicitly-changed fields are applied on "Apply"
- Duration input accepts flexible formats: "30", "30m", "1h", "1.5h"
- New `batchEdit()` batch mutation helper applies partial field updates with single undo toast
- Uses existing `executeBatch()` infrastructure: optimistic update, parallel mutations, undo via snapshot restore

---

## v0.55.94 — 2026-03-02

### Feat: Multi-select — Phase 4 (batch context menu & reschedule)

- Right-clicking a selected item shows batch context menu instead of single-item menu
- Right-clicking an unselected item keeps the existing single-item menu (unchanged)
- Batch menu items: Complete N items, Reopen (conditional), Reschedule..., Unschedule, Edit... (placeholder), Delete N items
- Reschedule opens inline shadcn Calendar date picker via ContextMenuSub submenu
- All selected items move to the picked date with times preserved (no relative offsets)
- Item counts in labels ("Complete 3 items", "Delete 3 items")
- All actions use `executeBatch()` with single undo toast and clear selection on completion
- Extended shadcn context-menu UI with `ContextMenuSub`, `ContextMenuSubTrigger`, `ContextMenuSubContent` exports
- New `batchReschedule()` batch mutation helper in `batch-mutations.ts`
- Applied to all 4 selectable components: TaskItem, ScheduledTaskCard, AnytimeTaskPill, AnytimeInstancePill

---

## v0.55.93 — 2026-03-02

### Feat: Multi-select — Phase 3 (batch drag on calendar)

- Dragging a selected task initiates a batch drag for all selected items
- Time+day delta computed from anchor task's position to drop position, applied to all items
- Stacked drag overlay: shows anchor task name + "+ N more tasks" label with offset shadow cards
- Calendar time slot drop: preserves cross-day relative offsets between all batch items
- Anytime section drop: all items become anytime, relative day offsets preserved
- Date group header drop: all items move to target date, times preserved
- Edge cases: anytime tasks get day-only delta, wrap-past-midnight, clamp-negative-time
- Instance support: uses `scheduleInstance` API for recurring instances in the batch
- Single undo toast restores all items to their original positions
- Partial failure handling: success/warning/error toasts based on mutation results
- Selection cleared after successful batch drop

---

## v0.55.92 — 2026-03-02

### Feat: Multi-select — Phase 2 (floating action bar)

- New `FloatingActionBar` component renders globally in `AppShell` — appears when any tasks are selected
- Slide-up/fade animation on enter, slide-down/fade on exit (200ms CSS transition)
- Buttons: close (clear selection), count label, Complete/Reopen, Unschedule, Edit… (Phase 5 placeholder), Delete
- Contextual visibility per plan §2: "Reopen" when all completed, hide Unschedule when all completed or none scheduled
- Delete confirmation dialog when > 3 items selected
- New `executeBatch()` helper (`lib/batch-mutations.ts`) — snapshots TanStack Query cache, fires parallel mutations via `Promise.allSettled`, shows single undo toast with partial-failure handling
- Pre-built `batchToggleComplete()`, `batchDelete()`, `batchUnschedule()` wrappers using raw orval API functions
- Mobile positioning above nav pill using `--nav-pill-*` CSS variables; desktop at `bottom-6`
- New files: `components/batch/floating-action-bar.tsx`, `lib/batch-mutations.ts`

---

## v0.55.91 — 2026-03-02

### Feat: Multi-select — Phase 1 (selection infrastructure)

- New `useSelectionStore` Zustand store with `selectedIds` Set, `toggle`, `clear`, `selectAll` actions
- Cmd/Ctrl+Click toggles task/instance selection on calendar cards, anytime pills, and task list rows
- Plain click clears selection before existing behavior fires
- Visual treatment: `ring-2 ring-primary` highlight + `bg-primary/10` tint on selected items; checkmark badge on scheduled cards, inline check icon on pills
- Global Escape key listener clears selection
- Entering Plan My Day mode clears any active selection (mutually exclusive modes)
- Google Calendar events remain non-selectable (read-only)
- Selection identity keys: `task-{id}` for tasks, `instance-{id}` for recurring instances
- New file: `selection-store.ts`; plan doc: `2026-03-02-multi-select-batch-operations.md`

---

## v0.55.90 — 2026-03-02

### Feat: Command palette — Phase 5 (5 enhancements + discoverability)

- **Subtask search**: Subtasks are now indexed alongside parents in Fuse.js; results show as "Parent > Subtask" and navigate to the parent with subtask expanded
- **Smart filters**: Type `@today`, `@tomorrow`, `@overdue`, `@unscheduled`, `@week`, `@completed` or `#DomainName` to filter search results; active filters show as pills
- **Description snippet**: When Fuse matches on a task's description, a truncated snippet with the matched portion highlighted shows below the title
- **Merge quick-add into palette**: Replaced the plain input with `useSmartInput()` — full smart parsing (autocomplete, pills, token dismissal) works directly in the palette; standalone QuickAdd dialog deprecated
- **Multi-select + batch actions**: Cmd/Ctrl+Click to select multiple tasks; batch bar supports Complete, Schedule Today/Tomorrow, Move to domain, Delete
- **Backend**: New `POST /api/v1/tasks/batch-action` endpoint for bulk task operations
- **Discoverability**: Desktop header now shows a visible search bar with `⌘K` badge (Linear/Notion pattern); first-visit desktop toast hints about Cmd+K; onboarding wizard completion step mentions the shortcut
- New files: `palette-filters.ts`, `palette-batch-actions.tsx`

---

## v0.55.89 — 2026-03-02

### Feat: Command palette — Phase 4 (task action drilldown)

- When a task is selected in search results, pressing `→` or `Tab` opens an action sub-menu replacing the results list
- Task title shows as a breadcrumb header with `←` back navigation; Escape or `←` returns to search
- Actions: Complete/Uncomplete (`C`), Schedule for today, Schedule for tomorrow, Move to domain... (inline fuzzy domain picker), Edit (`E`), Delete (`X`) with undo toast
- "Move to domain..." opens a sub-flow: replaces action list with a fuzzy-searchable domain list; selecting a domain executes the move, `←` goes back to actions
- All mutations use optimistic updates with undo toasts following existing codebase patterns
- Footer hints update contextually to show available keyboard shortcuts for each view
- New file: `palette-task-actions.tsx` — keeps search-palette.tsx as a thin shell

---

## v0.55.88 — 2026-03-02

### Feat: Command palette — Phase 3 (empty state: recents + "Right Now")

- When the palette opens with an empty query, it now shows two sections instead of a blank screen
- **Recent**: last 8 tasks the user interacted with (selected on dashboard, tapped on thoughts, or opened via palette) — session-only ring buffer, not persisted
- **Right Now**: computed counts from in-memory tasks — "N tasks today", "N overdue", "N thoughts" — each clickable to navigate to the relevant page
- As soon as the user types, recents disappear and search results take over
- Added `paletteRecents` + `pushPaletteRecent()` to ui-store (session-only, not in `partialize`)

---

## v0.55.87 — 2026-03-02

### Feat: Command palette — Phase 2 (creation fallthrough)

- Search palette now doubles as a task creation interface: type anything and "Create task" / "Capture thought" options appear below search results
- When search returns zero results, the create section is the primary content — no more dead-end "No results found"
- The smart input parser (`parseTaskInput`) runs on the query in real-time, extracting domain, priority, duration, date, and description tokens shown as metadata pills
- Enter = create task (with all parsed metadata), Cmd+Enter = capture thought (no domain/schedule, just the idea)
- Made `MetadataPill.onDismiss` optional so the component can be reused in read-only contexts (palette pills have no dismiss button)

---

## v0.55.86 — 2026-03-02

### Feat: Command palette — Phase 1

- Added command mode to the search palette: type `>` to browse/search ~23 commands across Navigation, Tasks, Appearance, Filters, Data, and Help categories
- Commands show keyboard shortcuts on the right side (Superhuman training pattern) to teach users standalone hotkeys
- In regular search mode, matching commands appear in an "Actions" section below task results
- Created `palette-commands.ts` command registry with `usePaletteCommands()` hook
- Added search button to the mobile bottom nav (since mobile users can't Cmd+K)
- Moved ShortcutsHelp to global mount in app-shell so it can be opened from any page via command palette

---

## v0.55.85 — 2026-03-02

### Refactor: Pluggable Plan My Day strategies

- Extracted the Plan My Day scheduling algorithm into a `PlanStrategy` interface with two variability points: `TaskSorter` (ordering) and `SlotSelector` (slot picking)
- Current behavior preserved as `COMPACT_STRATEGY` (duration ASC + first-fit) — the default and only option
- Added `PLAN_STRATEGIES` registry for future strategy additions
- Added `planStrategy` to UI store (persisted to localStorage) and wired through `calendar-panel.tsx`

---

## v0.55.84 — 2026-03-02

### Fix: Plan My Day — thoughts excluded, GCal undo race condition, range clamping

- **Thoughts excluded**: Tasks with `domain_id=null` (thoughts) are now skipped by Plan My Day — they're brainstorm items, not schedulable work.
- **GCal undo race condition**: `_fire_and_forget_sync_task` now re-checks the task state after committing the sync. If the task was unscheduled during the Google API call (e.g. rapid undo), the stale event is cleaned up immediately instead of being orphaned.
- **Range clamping**: `findFreeSlots()` now hard-clamps all output slots to the requested `[start, end]` window as a safety net, preventing any remaining edge cases from leaking tasks outside the selection.

---

## v0.55.83 — 2026-03-02

### Docs: Calendar integration section in README

- Added "Calendar Integration" section to README explaining both GCal Sync (real-time push) and Calendar Feed (iCal subscription), when to use which, and the overlap caveat
- Created `docs/CALENDAR-FEED.md` — full reference: what's included, recurring task RRULE handling, caching, security, refresh intervals, endpoints
- Added Calendar Feed to the documentation index

---

## v0.55.82 — 2026-03-02

### Feat: iCal calendar subscription feed

- **New feature**: Subscribe to Whendoist tasks from Apple Calendar, Google Calendar, Outlook, or any iCal-compatible app via a `.ics` subscription URL
- **Recurring tasks**: Emitted as VEVENT+RRULE (not materialized instances) so calendar apps show occurrences beyond the 60-day window. EXDATE for skipped instances, override VEVENTs for completed instances
- **All-day events**: Use `VALUE=DATE` format to avoid timezone-offset wrong-day bugs
- **Security**: Token-in-URL authentication (256-bit `secrets.token_urlsafe`), `Referrer-Policy: no-referrer`, IP rate limiting
- **Caching**: In-memory cache keyed on `(user_id, data_version)` — zero queries when data hasn't changed
- **Settings UI**: Enable/disable toggle, copy-to-clipboard feed URL, regenerate with confirmation dialog, GCal sync overlap warning, blocked state when encryption is enabled
- **Files**: `app/services/calendar_feed.py` (feed generation), `app/routers/calendar_feed.py` (endpoints), `feed_token` column on `UserPreferences`

---

## v0.55.81 — 2026-03-02

### Fix: Plan My Day — time range leaking past selection boundary

- **Root cause**: `findFreeSlots()` iterated over ALL occupied ranges (events, tasks, instances) from the entire day, creating free slots between them even outside the user's selected time window. A 2-hour morning selection with tasks later in the day would produce slots extending to noon and beyond.
- **Fix**: Filter occupied ranges to only those overlapping `[rangeStart, rangeEnd]` before computing free slots.
- **Pointer handlers**: Use ref for dragging flag (avoids stale React closure), capture on column element (not arbitrary child), prevent default to avoid scroll interference.

---

## v0.55.80 — 2026-03-02

### Fix: Plan My Day — time range, parent tasks, undo

- **Time range**: Used `calendarCenterDate` (center panel) instead of `displayDate` (visible panel) — wrong date meant no occupied slots found, entire day appeared free.
- **Parent tasks**: Parents with subtasks are now skipped; their individual subtasks are scheduled as standalone items.
- **Undo**: Invalidates both dashboard and allStatus task queries so the calendar refreshes. Removed fragile optimistic cache update.

---

## v0.55.79 — 2026-03-02

### Refactor: Unified shortcut system with modifier key support

- Extended `useShortcuts` to support `meta` modifier (Cmd/Ctrl), eliminating the need for manual `addEventListener` workarounds.
- Removed `STATIC_SHORTCUTS` hack from shortcuts-help — all shortcuts now flow through one registry.
- Added `displayKey` field to `ShortcutDef` for custom help modal labels (e.g. `⌘K`).
- Updated CLAUDE.md: no-corners-cut philosophy, maintenance burden over implementation complexity.

---

## v0.55.78 — 2026-03-02

### Feat: Cmd+K task search palette

- Global fuzzy search palette (Cmd+K / Ctrl+K / `/`) available from any authenticated page.
- Client-side fuzzy matching via fuse.js over decrypted tasks — works with E2EE enabled.
- Results grouped by Tasks, Thoughts, and Completed with match highlighting.
- Keyboard navigation (arrow keys, Enter to open, Escape to close).
- Selecting a task navigates to dashboard; selecting a thought navigates to thoughts page.
- Search icon added to header for discoverability.

---

## v0.55.77 — 2026-03-02

### Feat: Plan My Day — drag-to-select time range (replaces dialog)

- Replaced the dialog-based "Plan My Day" with interactive calendar selection mode: click the button, drag on the calendar to select a time range, click "Plan Tasks" to auto-schedule into that range only.
- Algorithm now also considers already-scheduled tasks and recurring instances as occupied slots (previously only Google Calendar events).
- Supports undo via toast, Escape to cancel, and snaps selections to 15-minute intervals.

---
## v0.55.76 — 2026-03-02

### Fix: Desktop layout polish — border alignment, subtask editing, separator

- Removed `md:gap-1` between task panel and right pane so the header border-bottom spans flush to the calendar separator (no 4px void).
- Moved `border-l` from CalendarPanel to the right pane wrapper so both CalendarPanel and TaskDetailPanel share the same left border (fixes missing separator when editing).
- Fixed subtask editing on desktop: `selectedTask` lookup now searches within parent tasks' subtask arrays, preventing the "clear stale selection" effect from immediately discarding the subtask ID.

---

## v0.55.75 — 2026-03-02

### Fix: Replace field flash background with ring animation

- Replaced `bg-primary/20` background flash with a `box-shadow` ring pulse (`@keyframes field-flash`). The old background rendered behind child buttons creating ugly "bleeding through gaps" artifacts.
- Removed `transition-all` (which transitioned every CSS property) in favor of a scoped CSS animation on `box-shadow` only.
- Applied consistently across all 6 flash surfaces: mobile edit drawer, desktop editor, task fields body, task inspector, thought triage drawer, and smart input consumer hook.

---

## v0.55.74 — 2026-03-02

### Feat: Sort parent task picker by domain

- Replaced the 4-tier semantic grouping ("Parents · same domain" → "Parents" → "Same domain" → "Other") with domain-based grouping: tasks are grouped under their domain name with icon, current domain shown first, rest in position order.
- Within each domain group, parents (tasks with existing subtasks) sort first, then non-parents, both alphabetically by title.
- Applied consistently across all 5 parent picker surfaces (mobile drawer, desktop picker, task inspector, field pickers, thought triage drawer).

---

## v0.55.73 — 2026-03-02

### Fix: Polish desktop layout — remove domain gap and calendar border stacking

- Removed top padding from task list content so the first domain block sits flush below the sticky column headers (no extra gap at initial scroll position).
- Fixed calendar border triple-stacking: removed duplicate left border from the right pane wrapper, stripped top border and top rounded corners from the calendar panel so it flows flush from the header gradient, keeping only the bottom-right rounding and shadow.

---

## v0.55.72 — 2026-03-02

### Feat: Mobile task edit drawer (bottom sheet)

- Replaced the full-screen Radix Sheet (`TaskEditor`) with a vaul bottom drawer (`TaskEditDrawer`) for mobile task create/edit. The drawer slides up from the bottom with swipe-to-dismiss, matching the triage drawer's native feel.
- Compact inline-label layout: all fields (domain, impact, when, duration, time, repeat, clarity, notes) use `w-14` label + flex-1 content rows instead of stacked labels, keeping more fields above the fold.
- Recurrence uses `RecurrencePresetRow` (preset buttons) instead of full `RecurrencePicker`, mapping existing rules to the closest preset on open.
- Nested drawers for calendar date picker and parent task picker (edit mode), with immediate server mutation + undo toast for parent changes.
- Sticky footer with Delete, Complete/Reopen, and Save/Create buttons, using `env(safe-area-inset-bottom)` for iOS safe area.
- Smart input (Approach A) with autocomplete, URL paste handling in notes, and domain chip horizontal scroll with `data-vaul-no-drag`.

---

## v0.55.71 — 2026-03-02

### Fix: Add close button to TaskInspector on thoughts page

- Added an X close button to the TaskInspector desktop right-pane header, matching the TaskDetailPanel pattern on the dashboard. Previously the only way to dismiss the inspector was pressing Escape — non-keyboard users had no discoverable dismiss mechanism.

---

## v0.55.70 — 2026-03-02

### Feat: Smart input for inline-add surfaces + baseline seeding bugfix

- **Inline-add smart input**: Domain group and subtask inline-add inputs now support smart input tokens (`#domain`, `!high`, `?auto`, `30m`, `tomorrow`, `// notes`). Tokens are shown as dismissible pills below the input; autocomplete triggers on `#`, `!`, `?` prefixes. Previously these surfaces only accepted a plain title.
- **Baseline seeding fix**: `useSmartInputConsumer` now parses the initial title on mount and seeds `prevParseRef`, preventing false-positive token consumption when editing tasks that contain token-like text (e.g. "Fix 30m timeout bug" — the `30m` is no longer silently consumed on first edit keystroke).
- Added `docs/SMART-INPUT.md` — evergreen architecture doc covering the two-hook design, token types, edit-mode safety, and file map.

---

## v0.55.69 — 2026-03-01

### Feat: Auto-convert pasted URLs to markdown links

- **Backend**: New `POST /api/v1/url/title` endpoint — fetches page `<title>` (or `og:title`) via httpx, falls back to hostname
- **Frontend**: `usePasteUrl` hook — detects bare URL pastes in description textareas, immediately inserts `[…](url)` placeholder, then replaces `…` with the fetched page title
- Wired into all 3 description surfaces: TaskFieldsBody, TaskInspector, ThoughtTriageDrawer
- Makes the markdown link format discoverable: when editing, users see `[Title](url)` and learn they can change the link text
- Orval types regenerated for the new endpoint

---

## v0.55.68 — 2026-03-01

### Fix: Triage recurrence bug + audit cleanup

- **Bug fix**: Recurrence fields (`is_recurring`, `recurrence_rule`, `recurrence_start`) were silently dropped when converting thoughts to tasks — users could set recurrence in triage but it never reached the API
- **Consistency**: Exported `TIME_TOKEN_PATTERN` from `task-parser.ts` alongside other token constants; replaced inline regex in `use-triage-form.ts`
- **Import cleanup**: `ConvertData` type now imported from canonical source (`use-triage-form`) instead of re-export chain
- **Audit doc**: Added `docs/plans/2026-03-01-task-creation-editing-duplication-audit.md`

---

## v0.55.67 — 2026-03-01

### Refactor: Consolidate task creation — phase 2, useTaskForm + rich text

- **`useTaskForm` hook**: Extracted all form state, save/delete/complete logic from TaskEditor and TaskDetailPanel into `frontend/src/hooks/use-task-form.ts` — both components are now thin rendering shells
- **`RichText` component**: New `frontend/src/components/ui/rich-text.tsx` renders clickable links (markdown `[text](url)` and bare URLs) in task descriptions
- **`rich-text-parser`**: Zero-dependency parser in `frontend/src/lib/rich-text-parser.ts` for link extraction
- **Net -444 lines** across TaskEditor, TaskDetailPanel, field-pickers, task-fields-body, and more

---

## v0.55.66 — 2026-03-01

### Refactor: Consolidate task creation — phase 1, useTriageForm + useTaskCreate

- **`useTriageForm` hook**: Extracted ~400 lines of shared state + handlers from ThoughtTriageDrawer and TaskInspector into `frontend/src/hooks/use-triage-form.ts` — both components are now thin layout shells
- **`useTaskCreate` hook**: Centralized encrypt → create → toast/undo → invalidate pattern in `frontend/src/hooks/use-task-create.ts` — used by TaskQuickAdd, DomainGroup, SubtaskGhostRow
- **`groupParentTasks` utility**: Moved parent task grouping logic to `frontend/src/lib/task-utils.ts` — used by 3 parent picker components
- **Triage constants**: Exported `IMPACT_TOKEN_PATTERN`, `IMPACT_KEYWORDS`, `SCHEDULE_DATE_PATTERN` from `task-parser.ts` instead of duplicating regexes

---

## v0.55.65 — 2026-03-01

### Fix: Close edit panel on save

- Desktop inline edit panel now closes automatically after saving a task (was already closing on create and delete)

---

## v0.55.64 — 2026-03-01

### Fix: GCal sync reliability — 8 bugs fixed end-to-end

- **clear_all_events throttling**: Added 0.2s delay between deletes to avoid Google API rate limits; failures now logged at warning level instead of silently swallowed
- **Mid-session token refresh**: `GoogleCalendarClient.refresh_token_if_needed()` updates httpx headers during long-running bulk syncs, preventing silent failure when tokens expire
- **Instance router sync triggers**: All 8 instance mutation endpoints (complete, uncomplete, toggle, skip, unskip, schedule, batch-complete, batch-past) now fire GCal sync
- **Unique constraints on sync records**: Added `(user_id, task_id)` and `(user_id, task_instance_id)` unique constraints with dedup migration to prevent duplicate events from race conditions
- **Recurring all-day events**: Recurring task instances without `scheduled_time` now create all-day events instead of being silently excluded
- **Skipped instances excluded**: Skipped instances no longer appear as active events in GCal; `sync_task_instance` unsyncs them
- **Hash cleanup**: Removed `impact` from `compute_sync_hash` (it doesn't affect event payload) to avoid wasted API calls
- **Batch update triggers sync**: `POST /tasks/batch-update` (encryption toggle) now triggers bulk GCal sync

---

## v0.55.63 — 2026-03-01

### Fix: Toast position — bottom-center like every real app

- Toasts moved to `bottom-center` on all viewports (from top-right desktop / top-center mobile)
- Mobile offset dynamically clears the nav pill using `calc(env(safe-area-inset-bottom) + nav pill height + margin)`
- Desktop uses Sonner's default bottom offset

---

## v0.55.62 — 2026-03-01

### Fix: GCal full re-sync actually re-syncs + visible error logging

- Full re-sync (`POST /full-sync`) now deletes all sync records and clears the calendar before rebuilding, matching the enable flow — previously it skipped unchanged tasks by hash, never verifying they existed in GCal
- Fire-and-forget sync errors promoted from `debug` to `warning` so failures are visible in production logs

---

## v0.55.61 — 2026-03-01

### Fix: Move toasts out of button/nav-pill collision zone

- Toasts now render `top-right` on desktop, `top-center` on mobile — no longer block save/delete buttons or the mobile nav pill
- Add `TOAST_DURATION_SHORT` (4s) for simple confirmations (save, create, update); errors and undo toasts keep the full 10s
- Toaster moved from `main.tsx` to `__root.tsx` for reactive viewport-aware positioning via `useDevice()`

---

## v0.55.60 — 2026-02-28

### Fix: Desktop inline panel — close button + unified create/edit

- Add X close button to the inline task detail panel header (returns to calendar view)
- "New Task" (`n`) on desktop now opens the inline panel in create mode instead of the Sheet overlay — same form, same controls, consistent experience
- Escape key closes the panel (both edit and create modes)
- Dirty-check confirmation when closing with unsaved changes

---

## v0.55.59 — 2026-02-28

### Feat: Unified task editor — smart input + shared fields convergence

Converges three task editing surfaces (Task Editor, Thought Triage Inspector, Thought Triage Drawer) to share the same field set, controls, and interaction patterns.

**Phase 1 — Smart Input + Missing Fields:**
- Extract shared field components into `field-pickers.tsx`: `ClarityChipRow`, `DurationPickerRow`, `TimePickerField`
- Add missing fields to triage (inspector + drawer): description textarea, custom duration, time picker
- Create `useSmartInputConsumer` hook (Approach A: tokens consumed from title, field state independent)
- Refactor task editor: replace Select/Input with chip-based pickers (DomainChipRow, ImpactButtonRow, ClarityChipRow, ScheduleButtonRow, DurationPickerRow), add smart input, add toggle-off for all fields

**Phase 2 — Interaction Polish:**
- Domain auto-sync: changing parent task auto-switches domain with flash animation
- Toggle-off audit: all field pickers support click-to-deselect in both surfaces

**Phase 3 — Recurrence in Triage:**
- Create `RecurrencePresetRow` shared component (None/Daily/Weekdays/Weekly/Monthly chips)
- Add recurrence presets to triage inspector and drawer with `ConvertData` extension

**Phase 4 — Dashboard Split Layout:**
- Create `TaskFieldsBody` shared component for Approach A surfaces
- Create `TaskDetailPanel` for inline task editing in dashboard right pane
- Dashboard split layout: clicking a task on desktop shows inline editor in right pane (replaces calendar), mobile keeps Sheet editor
- Keyboard shortcuts `e`/`Enter` use inline panel on desktop, Sheet on mobile

---

## v0.55.58 — 2026-02-28

### Fix: Thought list trash icon layout flash on hover-out

Trash icon and timestamp now cross-fade using opacity in a shared container instead of toggling display:none on the timestamp. Eliminates the brief layout shift (trash jumping left) when the mouse leaves a thought row.

---

## v0.55.57 — 2026-02-28

### Fix: Desktop inspector compact field pickers

De-touchify the desktop inspector's field pickers: all buttons shrink from `py-2` to `md:py-1`, `rounded-lg` to `md:rounded-md`, and `active:scale-95` neutralized on desktop via `md:active:scale-100`. Domain chips now wrap instead of horizontal scrolling. Impact and Clarity buttons gain `md:hover:brightness-110` for mouse-friendly feedback. Mobile drawer unchanged.

---

## v0.55.56 — 2026-02-28

### Feat: Desktop split-pane layout for Thoughts page

Thoughts page now uses a master-detail split pane on desktop (md: breakpoint): left pane (flex-[3]) shows the thought list with capture input, right pane (flex-[2]) shows a new TaskInspector for triaging thoughts. Clicking a thought populates the inspector with the same triage fields (domain, parent, impact, schedule, duration, clarity). Desktop pickers use Radix Popovers instead of nested Vaul drawers. Hover-reveal delete button on list rows replaces the old chevron affordance. Keyboard navigation: j/k to move selection, d/Backspace to delete, Escape to deselect. Auto-advance to next thought after triage. Glassmorphic sub-header replaced with simple heading on desktop. Mobile UX completely unchanged.

---

## v0.55.55 — 2026-02-28

### Fix: Thoughts page mobile visual hierarchy and touch targets

Thought card title bumped from 14px to 16px (`text-base`), row padding from `py-3` to `py-3.5` (~52px rows). Dot indicator and chevron hidden on mobile (`hidden md:block/flex`) to reclaim horizontal space. Page title upgraded to `text-xl font-bold`. Triage drawer labels unified to `text-xs` (12px) with `w-14` columns and textarea gets a bottom border for editability signal. Empty state illustration enlarged to 112px. Bottom fade gradient reduced from 384px to 192px.

---

## v0.55.54 — 2026-02-28

### Fix: Mobile touch targets too small in header, triage drawer, and calendar

Header action buttons (theme toggle, logout) enlarged from ~26px to 44px touch targets on mobile using responsive classes (`p-3 md:p-1.5`, `h-5 w-5 md:h-3.5 md:w-3.5`). Triage drawer chips and buttons (domain, impact, schedule, duration, clarity, parent task) bumped from `py-1.5` (~32px) to `py-2` (~36px). Calendar nav arrows increased from `h-9 w-9` to `h-10 w-10`. Parent picker search bar and clear button also enlarged. Desktop sizes unchanged.

---

## v0.55.53 — 2026-02-27

### Fix: Domain flash animation uses React state instead of imperactive DOM

The domain row flash (triggered when a parent task auto-switches the domain) was barely visible — hex `#color15` produced only 8% opacity. Replaced imperative `el.style` manipulation with React state-driven class toggling (`bg-primary/20`), leveraging the existing `transition-all duration-300` for a smooth fade in/out. Removed unused `domainRowRef`.

---

## v0.55.52 — 2026-02-27

### Fix: Remove domain-switch toast that covered triage drawer buttons

The toast fired when a parent task auto-switched the domain was rendered at the global `bottom-right` position, covering the drawer's footer buttons. The domain row flash animation already provides sufficient in-context feedback. Removed the toast; the flash stays.

---

## v0.55.51 — 2026-02-27

### Fix: Triage drawer — Convert button uses primary color, domain chips redesigned

"Convert to Task" button now uses the app's primary color instead of the domain color (which could be gray). Domain chips switched from domain-colored backgrounds to neutral `bg-secondary` with `primary` selected state. Domain row left padding aligned with other field rows (54px → 58px).

---

## v0.55.50 — 2026-02-27

### Fix: Fast scrolling causes entire page to rubber-band on iOS

Added `overscroll-behavior: contain` to the scroll container. Prevents scroll chaining to the body when hitting scroll bounds.

---

## v0.55.49 — 2026-02-27

### Fix: Input bar hijacks scroll on mobile — structural fix

Root cause: `fixed` positioning placed the input outside the scroll container's DOM tree. Touch events on it propagated to the body instead of the thoughts scroll container, causing the header to shift while the list froze. Fix: moved input inside the scroll container using `sticky bottom-[X]`. Scroll container is now `flex flex-col` with `flex-1` on the list wrapper to push input to the bottom when the list is short. Added a clearance spacer for scroll past the input.

---

## v0.55.48 — 2026-02-27

### Fix: Floating input scrolls with content on mobile touch

Changed input container from `absolute` to `fixed` positioning so it's locked to the viewport like the bottom nav, preventing it from getting dragged during scroll momentum on mobile Safari.

---

## v0.55.47 — 2026-02-27

### Feat: Glossier bottom nav + glassy input container

Bottom nav: 80px blur, saturate 2.2, specular top border for glossy depth. Input bar container is now glassy (backdrop-blur + translucent white tint) matching the nav, while Input and Button stay opaque.

---

## v0.55.46 — 2026-02-27

### Fix: Thoughts fade extends to screen edge + much glassier header and nav

Fade gradient now extends 384px with only 50% opacity at the bottom — items are visible all the way to the safe area instead of vanishing at the nav midpoint. Header glass dropped from 80% to 25% opacity with `backdrop-blur-3xl`. Nav tint lowered to 20% opacity for true see-through glass.

---

## v0.55.45 — 2026-02-27

### Feat: Apple Glass treatment for thoughts page + bottom nav

Thoughts header is now a glassy sticky bar — content scrolls behind it with backdrop-blur. Floating input bar has a solid opaque background with ring + shadow. Bottom nav is significantly glassier (lower tint opacity, stronger blur).

---

## v0.55.44 — 2026-02-27

### Feat: Floating input + infinite fade on thoughts page (mobile)

Thoughts list now extends to the bottom with a gradient fade-out mimicking Apple's glass infinite canvas. The "What's on your mind?" input floats above the bottom nav on mobile. Desktop layout unchanged.

---

## v0.55.43 — 2026-02-27

### Feat: Toast + flash animation when parent task auto-switches domain

When selecting a parent task from a different domain, the domain now visually flashes with the new domain's color and a toast confirms the switch (e.g. "Domain switched to 🎨 Design to match parent task").

---

## v0.55.42 — 2026-02-27

### Fix: Triage drawer footer has no bottom padding in mobile web

`pb-safe` resolves to `env(safe-area-inset-bottom, 0px)` which is `0` in mobile web (no home indicator). Changed to `pb-[max(0.625rem,env(safe-area-inset-bottom))]` so the footer always has at least `0.625rem` bottom padding.

---

## v0.55.41 — 2026-02-27

### Fix: Replace parent dropdown with nested drawer (tested on-device)

After testing 4 approaches on-device (A: nested drawer, B: onOpenChange guard, C: onPointerDownOutside, D: inline list), only the **nested drawer** worked on iOS PWA. Portaled dropdowns inside vaul drawers fundamentally can't work because Radix's DismissableLayer uses React synthetic capture events for inside/outside detection, and the timing breaks on iOS touch devices.

- Replaced `ParentTaskSelect` (portaled dropdown) with `ParentPickerDrawer` (nested bottom sheet via `Drawer.NestedRoot`)
- Preserved smart grouping logic (parents with subtasks first, same-domain priority)
- Added search bar in the nested picker
- Removed all `onPointerDownOutside`/`onInteractOutside` hacks from Drawer.Content
- Removed portal container state (`portalEl`)
- Removed test page (`/test-dropdown`) and temporary link

---

## v0.55.40 — 2026-02-27

### Test: Parent dropdown approach comparison page

Added `/test-dropdown` route with 4 different approaches for parent task selection inside a vaul drawer, testable on-device:
- **A: Nested Drawer** — parent picker as a nested bottom sheet (like calendar)
- **B: onOpenChange guard** — portal to body, suppress drawer close via ref flag
- **C: onPointerDownOutside** — portal inside Content + event interception (current approach)
- **D: Inline list** — no dropdown, scrollable list directly in drawer body

---

## v0.55.39 — 2026-02-27

### Fix: Remove capture-phase listener that blocked parent dropdown on iOS

v0.55.38's capture-phase `pointerdown` listener on `document` prevented the parent dropdown from opening on iOS. Replaced with a simpler approach: check `e.detail.originalEvent.target` directly inside `onPointerDownOutside` and `onInteractOutside` callbacks. No global listeners, no refs — the dismiss suppression is now entirely self-contained in the event callbacks.

---

## v0.55.38 — 2026-02-27

### Fix: Parent task dropdown — prevent vaul dismiss on option tap

The portal-inside-Drawer.Content approach (v0.55.37) placed the dropdown in the correct DOM subtree, but Radix's DismissableLayer still treated taps on dropdown options as "outside" clicks. Root cause: Radix uses its own layer stack rather than pure `Node.contains()`, so portaled elements aren't recognized as "inside" even when they're in the DOM tree.

Fix: Intercept vaul's `onPointerDownOutside` on `Drawer.Content`. A capture-phase `pointerdown` listener on `document` sets a ref flag when the tap target has `[data-vaul-no-drag]`. The `onPointerDownOutside` callback checks this flag and calls `e.preventDefault()`, which vaul propagates to Radix, suppressing the dismiss.

---

## v0.55.37 — 2026-02-27

### Fix: Parent dropdown actually works now + remove all keyboard hacking

Two root causes found and fixed:
1. **Portal was always null**: `useRef` for portal container was evaluated during render (when `.current` is still `null`). Since `ParentTaskSelect` manages its own `open` state, clicking the trigger re-renders ParentTaskSelect but NOT DrawerBody — so `portalRef.current` was never re-evaluated. The dropdown was ALWAYS portaling to `document.body`, making the v0.55.35 portal fix a complete no-op. Fixed by using `useState` as a callback ref (`ref={setPortalEl}`), which triggers a re-render when the element mounts.
2. **Removed all keyboard hacking**: Every approach (inline styles, spacer div) either fought vaul's transform animations or created stale state. Removed entirely. Set `repositionInputs={false}` to prevent vaul from interfering. The drawer is content-sized, clean open/close animation.

---

## v0.55.36 — 2026-02-26

### Fix: Replace inline style hacking with React-state keyboard spacer

**Root cause of jerkiness + stale gap**: Previous approach mutated `el.style.bottom` and `el.style.maxHeight` directly on vaul's `Drawer.Content` element, which fought with vaul's transform-based open/close animations (causing jerky appearance) and left stale inline styles between thoughts (causing the gap on second open). Replaced with a React state-controlled spacer `<div>` inside the flex column that pushes content above the keyboard — zero inline style mutation on vaul's element. `setKeyboardH(0)` in cleanup ensures clean slate between thoughts. Added `min-h-0` on scrollable body (enables flex-shrink when spacer is active) and `shrink-0` on footer (prevents it from collapsing).

---

## v0.55.35 — 2026-02-26

### Fix: Root-cause fixes for iOS triage drawer — portal, keyboard shift, cleanup

Three root-cause fixes:
1. **Dropdown portaled inside Drawer.Content**: The parent dropdown was portaled to `document.body`, causing vaul (via Radix Dialog) to treat every tap on a dropdown option as an "outside click" and dismiss the entire drawer. Now portals to a container inside `Drawer.Content` so containment checks pass. Added `data-vaul-no-drag` to prevent drag interference.
2. **Keyboard shifts drawer up**: Instead of only constraining `maxHeight` (which left the footer behind the keyboard), now sets `bottom: keyboardHeight` to physically move the drawer above the keyboard. The footer (Delete/Convert) is always visible.
3. **Stale style cleanup**: The viewport effect now clears `bottom` and `maxHeight` inline styles on cleanup, preventing the "second thought" bug where stale keyboard-era styles persisted to the next drawer open. Also runs `update()` immediately on mount.

---

## v0.55.34 — 2026-02-26

### Fix: Three remaining iOS triage drawer issues

1. **Keyboard gap in PWA mode**: Removed `flex-1` from scrollable body (was expanding to fill drawer height beyond content), removed separate `h-safe` spacer div, moved safe-area padding into footer with `pb-safe`. Added `window.resize` listener alongside `visualViewport.resize` since PWA standalone mode fires the former.
2. **Parent dropdown not scrollable**: Added `touch-action: pan-y`, `overscroll-behavior-y: contain`, and `-webkit-overflow-scrolling: touch` to the options list. Added `onTouchMove` stop-propagation on the portaled dropdown to prevent vaul's drag gesture from capturing scroll events.
3. **Parent dropdown oversized**: Removed `maxHeight` from inline dropdown positioning styles — the inner `max-h-48` constrains the scrollable list, and the outer container now uses `overflow-hidden` to clip to content.

---

## v0.55.33 — 2026-02-26

### Fix: iOS keyboard breaks triage drawer layout and parent dropdown

Triage drawer now tracks `visualViewport.height` and dynamically constrains its max-height when the iOS keyboard is open — `vh` units refer to the layout viewport which doesn't shrink for the keyboard, causing the drawer to overflow behind it and push content off-screen. Parent task dropdown no longer auto-focuses the search input (which triggered the keyboard inside the drawer), and uses `visualViewport`-aware positioning with automatic above/below placement.

---

## v0.55.32 — 2026-02-26

### Fix: iOS auto-zoom on triage drawer inputs

Bumped triage drawer textarea and parent task search input from `text-sm` (14px) to `text-base` (16px). iOS Safari auto-zooms any input with font-size below 16px, causing the page layout to break.

---

## v0.55.31 — 2026-02-26

### Fix: Extended duration and date abbreviation parsing

Duration parser now supports spaced compound formats (`2h 30m`), and longer suffixes (`30min`, `1hr`, `2hrs`). Added date abbreviations: `tod` (today), `tom` (tomorrow), `yes`/`yest` (yesterday).

---

## v0.55.30 — 2026-02-26

### Fix: Domain symbol @ → #, triage drawer bug fixes

Changed domain token prefix from `@` to `#` (like Todoist) across parser, autocomplete, smart input hook, quick-add, and triage drawer. Fixed three triage drawer bugs: date replacement now uses dynamic token matching instead of static regex (handles chrono-node dates like "next friday"), duration replacement handles compound formats like `2h30m`, and changing domain via chip row now clears parent task if it's in a different domain.

---

## v0.55.29 — 2026-02-26

### Refactor: Bottom sheet triage drawer for thoughts

Replaced inline `ThoughtTriageCard` expansion (which consumed ~60% of iPhone viewport) with a vaul-based bottom sheet drawer that slides up as an overlay. Extracted reusable `DomainChipRow`, `ImpactButtonRow`, and `ScheduleButtonRow` picker components into `field-pickers.tsx`. Added collapsible "More options" section with duration and clarity pickers. Convert button now shows domain color. Thoughts page dropped from ~640 to ~340 lines — card list is now a simple flat list of tappable rows with swipe always enabled.

---

## v0.55.28 — 2026-02-26

### Fix: Thoughts triage panel clipping on iPhone SE

Removed two `overflow-hidden` declarations from the triage panel card wrapper and panel container that clipped domain chips, priority labels, and the Convert button at 375px width. Added `shrink-0` to domain chip buttons so flex wraps instead of shrinking text. Tightened mobile selector spacing to match panel rhythm.

---

## v0.55.27 — 2026-02-25

### Feat: Thoughts page redesign — inbox cards, smart input triage, mobile selectors

Replaced chat-bubble layout with full-width inbox card list. Triage panel uses shared `useSmartInput()` hook for inline metadata parsing (`#domain`, `!priority`, `?clarity`, `30m`, `tomorrow`, `//notes`). Mobile gets tappable domain pills, priority buttons, and schedule quick-picks below the smart input. Extracted `useSmartInput` hook from duplicated code in Quick Add and Thoughts, added CLAUDE.md rule 10 to prevent future duplication.

---

## v0.55.26 — 2026-02-25

### Fix: Analytics query production readiness

Bounded three unbounded queries that degrade with scale: `_get_aging_stats` (LIMIT 5000), `_calculate_streaks` (2-year lookback), `get_recent_completions` (365-day cutoff). Added composite indexes `(user_id, status, completed_at)` on both Task and TaskInstance tables. Fixed median calculation bug, eliminated multiple `date.today()` calls, removed redundant DISTINCT in streaks query.

---

## v0.55.25 — 2026-02-25

### Fix: Sticky header height jump when scrolling between sections

Fixed the task list sticky header (domain label + sort columns) changing height in real time when scrolling from domains to scheduled section. Added fixed height so the header size stays constant regardless of whether the domain label is visible.

---

## v0.55.24 — 2026-02-25

### Feat: Analytics page redesign

Complete visual overhaul of the analytics dashboard. Hero gradient card with animated count-up and sparkline. Section grouping (Overview/Patterns/Details) with divider lines. Asymmetric grids for visual hierarchy. Two new charts: Active Hours (area chart with gradient) and Resolution Time (donut chart replacing stacked bar). All chart cards have subtitles explaining the data, hover lift effects, and proper tooltip styling (solid background, box shadow). Domain donut no longer clips. Sticky header with Apple glass effect keeps range selector accessible while scrolling. Range switching uses `keepPreviousData` for seamless transitions. Impact colors updated to match brand spec (P4 Min = grey). Recurring tasks show progress bars. Velocity chart has a visible legend.

---

## v0.55.23 — 2026-02-25

### Fix: Wizard swipe animation and polish

Replaced simple fade transition with directional slide animation (translateX + opacity). Added smooth height animation between steps of different sizes — locks current height before content swap, measures new content, animates between them. Fixed Radix Dialog Portal timing: replaced `useRef` + `useEffect` (ref was null on mount) with callback ref pattern. Swipe at boundaries: back on first step is a no-op, forward on last step triggers finish. Button glow no longer clipped — `overflow-hidden` only applied during active transitions.

---

## v0.55.22 — 2026-02-25

### Fix: Wizard swipe — use native event listeners

Replaced React synthetic `onPointerDown`/`onPointerUp` with native `addEventListener` for both touch and pointer events, following the same pattern as the calendar carousel. Touch events (`touchstart`/`touchend`) handle mobile swipe; `pointerdown` on the wrapper + `pointerup` on `document` handles desktop mouse drag (skips buttons/inputs). Wheel/trackpad handler unchanged.

---

## v0.55.21 — 2026-02-25

### Fix: Restore original wizard layout with swipe support

Reverted wizard back to original one-step-at-a-time conditional rendering (pre-swipe changes). The simultaneous panel rendering (both scroll-snap and transform approaches) broke layout and scrolling. Swipe/wheel navigation is now layered on top of the original structure: wheel events with 800ms cooldown for desktop trackpad, pointer swipe detection for touch. Both trigger the same `goForward`/`goBack` that buttons use.

---

## v0.55.20 — 2026-02-25

### Fix: Wizard swipe — replace native scroll with transform

Replaced `overflow-x: auto` + CSS `scroll-snap` with `overflow: hidden` + CSS `transform: translateX()`. Native scroll-snap couldn't handle macOS trackpad momentum — hard swipes flew to the last panel. Transform approach gives full control: one panel per gesture, no momentum overshoot. Dots now driven directly by React state instead of scroll position events.

---

## v0.55.19 — 2026-02-25

### Fix: Wizard swipe infinite scroll and layout centering

Fixed two wizard issues: (1) Trackpad/mousewheel caused infinite scrolling because raw pixel deltas were piped to `scrollBy` — now snaps one panel at a time with a 600ms cooldown. (2) Content was top-aligned with empty space below — panels now use `flex flex-col justify-center` to vertically center content.

---

## v0.55.18 — 2026-02-25

### Chore: `just dev` runs both backend and frontend

`just dev` now starts both the backend (port 8000) and frontend dev server (port 5173) in parallel. Ctrl+C stops both. The old backend-only command is available as `just dev-backend`.

---

## v0.55.17 — 2026-02-25

### Fix: Wizard swipe on macOS trackpad

Wheel handler now picks whichever axis has the larger delta (`deltaX` vs `deltaY`), so macOS trackpad horizontal two-finger swipe works alongside vertical mousewheel.

---

## v0.55.16 — 2026-02-25

### Fix: User preferences race condition and cascade delete

Fixed two user_preferences bugs: (1) Race condition where concurrent requests for the same user both tried to INSERT preferences, causing UniqueViolationError — now uses savepoint with IntegrityError retry. (2) Demo user cleanup setting user_id to NULL instead of cascading delete — added `cascade="all, delete-orphan"` to User relationships missing it (preferences, todoist_token, google_token, calendar_selections). Fixes #480, #481, #486, #487, #493, #494.

---

## v0.55.15 — 2026-02-25

### Fix: Analytics page colors and scroll

Fixed charts rendering as black instead of brand purple — all chart fills/strokes now use `--color-brand` (#6D5EF6). Fixed page not scrolling by replacing Radix ScrollArea with native overflow. Updated recurring rate colors to use brand purple for success states.

---

## v0.55.14 — 2026-02-25

### Fix: Restore wizard nav buttons alongside swipe

Restored Back/Next/Skip/Get Started buttons that were removed in v0.55.13. Buttons now coexist with horizontal scroll-snap — users can swipe or use buttons.

---

## v0.55.13 — 2026-02-25

### Feat: Swipeable setup wizard

Replaced button-based wizard navigation (Back/Next/Skip) with horizontal scroll-snap. Swipe on mobile, scroll on desktop. Progress dots track position. Action buttons (Connect Calendar, Connect Todoist, Open Tasks) remain.

---

## v0.55.12 — 2026-02-25

### Fix: Demo seed data — add unscheduled domain tasks

Moved 8 tasks from scheduled to unscheduled and added 3 new backlog tasks so demo users see content in domain areas, not just in the calendar.

---

## v0.55.11 — 2026-02-25

### Feat: Smart Quick Add V2

Redesigned Quick Add as an intelligent single-field input with inline metadata parsing. Type naturally and metadata is extracted automatically.

- **Syntax**: `#Domain` `!high` `?auto` `30m` `tomorrow` `// description`
- **Autocomplete**: Dropdown for `@` domains, `?` clarity, `!` impact
- **Metadata pills**: Colored dismissable pills below input showing parsed tokens
- **chrono-node date guard**: Rejects ambiguous bare month names ("Jan", "May") that could be person names — only accepts dates with a certain day, weekday, or hour
- **Sticky dismissals**: Pill dismissals persist while their trigger text remains in the input (Map-based tracking instead of clearing on every keystroke)
- **Double-submit guard**: `isPending` check on both Enter key and `handleSave` prevents duplicate task creation
- **Keep-open mode**: Checkbox to stay open for batch creation (persisted to localStorage)
- **Syntax hints**: Dismissable reference row below pills

New files: `task-parser.ts` (pure parsing logic), `smart-input-autocomplete.tsx` (dropdown component)
New dependency: `chrono-node` (natural language date parsing)

## v0.55.10 — 2026-02-25

### Fix: Vertically center subtask count badge
- Badge button was a block element — changed to `inline-flex items-center` so the flex parent's `items-center` can properly center it

## v0.55.9 — 2026-02-25

### Fix: Remove duplicate subtask count from clarity column
- Parent task rows had active/total count in both the title-area badge and the clarity column — removed the clarity column duplicate
- Subtask count badge now always shows `active/total` format (was only showing total when not hiding completed)
- Added `self-center` to the subtask count badge button for proper vertical centering

## v0.55.8 — 2026-02-25

### Fix: Center clarity/duration/impact pills in column cells
- Autopilot and Brainstorm clarity pills were left-aligned because `text-center` on the wrapper doesn't properly center `inline-flex` elements that overflow the fixed column width
- Switched all metadata column wrappers from `text-center` to `flex justify-center` for proper centering regardless of pill width

## v0.55.7 — 2026-02-25

### Fix: Align sticky domain label with actual domain names
- Added `pl-9` (36px) to sticky domain label to match the left offset of domain names in cards (content padding + card border + trigger padding + chevron + gap)

## v0.55.6 — 2026-02-25

### Fix: Task rows painting above sticky header
- Framer-motion `layout` prop on task rows creates promoted compositing layers (`will-change: transform`) that escaped the sticky header's backdrop-filter
- Added `isolate` on the task content container to trap compositing layers in their own stacking context
- Bumped sticky header to `z-20` so it paints above all task content

## v0.55.5 — 2026-02-25

### Fix: Sticky header glass effect + clarity column alignment
- Sticky sort header now has proper glass surface (`backdrop-blur-lg` 16px + 90% opacity) so domain headers don't show through
- Fixed clarity column alignment: `calc()` padding values had no spaces around `+` operator, generating invalid CSS that the browser ignored — switched to explicit pixel values (`pr-[9px] sm:pr-[17px]`)

## v0.55.4 — 2026-02-25

### Feat: Sticky domain label in column headers + alignment fix
- Domain name, emoji, and task count now fade into the sticky sort header as you scroll past each domain section (desktop, matching legacy behavior)
- Fixed column header alignment: Clarity/Duration/Impact labels now align precisely with task row metadata pills (was shifted ~15px left at large breakpoints)

## v0.55.3 — 2026-02-25

### Chore: Overhaul demo seed data
- Expanded domains from 4 to 5 (Work, Health & Fitness, Personal, Side Project, Learning)
- Doubled recurring tasks from 4 to 8 with realistic schedules (standup, gym, 1:1, sprint review, meal prep, water plants, coding sessions, reading)
- Dense calendar coverage: 8 tasks today, 6 tomorrow, decreasing density through day+5
- Added 3 overdue tasks, 6 archived tasks, 5 subtasks under 2 parent tasks, 6 thoughts
- Made seeding deterministic via `random.seed(user_id)` — same demo data on every reset
- Coherent persona: Alex Chen, senior PM at a tech startup

## v0.55.1 — 2026-02-24

### Chore: Task panel UX cleanup
- Moved sort controls (Clarity/Duration/Impact) from toolbar into a sticky column header row aligned with task metadata
- Removed gradient separator under task panel header (border-b is sufficient)
- Removed colored clarity dots from energy selector (duplicated toggle icons)
- Removed "+ Quick" button from toolbar (Thoughts page handles quick add)
- Increased section separator spacing for Scheduled/Completed/Deleted sections

## v0.55.0 — 2026-02-24

### Fix: Completed section disappears when retention filter matches zero tasks
- Changed early-return guard from `filtered.length === 0` to `tasks.length === 0` so the header and retention buttons stay visible even when the current filter window has no matches

## v0.54.99 — 2026-02-24

### Fix: Illustration SVGs not served in production
- Mounted `/illustrations` static directory from SPA dist so SVGs are served directly instead of falling through to SPA fallback (which returned HTML)
- Added `illustrations/`, `assets/`, `icons/` to SPA fallback exclusion list

## v0.54.98 — 2026-02-24

### Fix: Demo login 500 error + landing page readability + animation tweaks
- **Demo login crash**: Added `passive_deletes=True` to all User relationships — SQLAlchemy was trying to null-out FKs before DB CASCADE could fire during demo user cleanup
- **Landing task cards**: Changed from white to muted background with subtle shadow for contrast against hero illustration
- **Rocket animation**: Slowed from 0.6s to 1.2s with gentler float-up-and-settle curve
- **Thoughts glow**: Sped up from 5s to 3s cycle
- **Empty tasks entrance**: More noticeable — added translateY + larger scale change, 0.6s duration

## v0.54.97 — 2026-02-24

### Feat: Subtle animations for empty states and illustrations
- Empty tasks: fade-in + scale entrance animation (0.4s, one-shot)
- Empty thoughts: entrance + glacial brightness glow pulse (5s cycle)
- Onboarding rocket: slide-up entrance with ease-out overshoot (0.6s, one-shot)
- Onboarding logo float slowed from 3s to 5s for calmer feel
- All new animations respect `prefers-reduced-motion`

## v0.54.96 — 2026-02-24

### Fix: PWA update toast keeps reappearing after reload
- Switched service worker from `registerType: "prompt"` to `autoUpdate` — updates apply silently in background
- Removed `PwaReloadPrompt` component and persistent "New version available" toast

## v0.54.95 — 2026-02-24

### Feat: Task panel header cleanup and UX improvements
- Removed FilterBar (SCHEDULED/COMPLETED toggle buttons) and SettingsPanel (gear menu) — redundant with section-level controls
- Restructured task panel header to single row: Energy selector + Sort controls + action buttons
- Moved completed retention days (1d/3d/7d) to CompletedSection header — contextually discoverable
- Dashboard now fetches `status=all` so completed tasks persist across page refresh
- Created shared `dashboardTasksKey()` for consistent query invalidation across all task components
- DeletedSection: limited to 15 items by default with "Show all" link; reads `X-Total-Count` header
- Backend: added `limit`/`offset` query params and `X-Total-Count` header to `GET /api/v1/tasks`
- Extracted `_build_task_filters()` and added `count_tasks()` to TaskService
- Added per-parent "hide completed subtasks" toggle on the subtask count badge
- Removed "Hide recurring after done" setting (meaningless in current architecture)

---

## v0.54.94 — 2026-02-24

### Feat: Add illustrations to empty states and error boundaries
- Created reusable `EmptyState` component (`frontend/src/components/ui/empty-state.tsx`)
- Added illustrations to: empty task list, empty thoughts, analytics load failure, root and app error boundaries
- Copied 4 brand SVGs from legacy `static/img/illustrations/` to `frontend/public/illustrations/`

---

## v0.54.93 — 2026-02-24

### Fix: Demo cleanup uses index-friendly query and CASCADE deletes
- Cleanup query uses `startswith("demo-")` instead of `endswith("@whendoist.local")` — B-tree index compatible
- Cleanup relies on `ondelete=CASCADE` instead of manual 10-table deletes — future-proof when new tables are added
- Added missing `ExportSnapshot` delete to `_clear_user_data` (used by demo reset)

---

## v0.54.92 — 2026-02-24

### Feat: Multi-tenant demo users (unique per session)
- Each demo login creates a fresh user with unique email `demo-{profile}-{uuid}@whendoist.local` — no more shared state between concurrent sessions
- Added `cleanup_stale_users()` that lazily deletes demo users older than 24h (configurable via `DEMO_CLEANUP_MAX_AGE_HOURS`)
- Added `extract_profile()` to parse profile from both new and legacy email formats
- 21 tests covering creation, reset, cleanup, and isolation

---

## v0.54.91 — 2026-02-24

### Feat: Demo users always start with onboarding wizard
- Demo login now sets `wizard_completed=False` so the onboarding wizard shows on every demo session
- Returning demo users get wizard reset on login; demo reset also resets wizard state

---

## v0.54.90 — 2026-02-24

### Feat: Landing page redesign + demo login fix
- Ported legacy landing page design to React SPA: hero animation (task→calendar transfer), brand wordmark (Quicksand), value proposition, gradient CTA, trust/features meta block
- Added `demo_login_enabled` to build-info API so "Try Demo Account" button actually appears when enabled
- New `frontend/src/styles/login.css` with all animation keyframes, dark mode, and `prefers-reduced-motion` support

---

## v0.54.89 — 2026-02-24

### Fix: Child task editor opens on click
- Task editor's "close if deleted" guard only checked top-level tasks, causing it to immediately close when opening a child task
- Now also checks `subtasks` arrays so child tasks are recognized as existing

---

## v0.54.88 — 2026-02-24

### Feat: Allow editing completed tasks via metadata pills
- Removed `disabled={isCompleted}` from Impact, Clarity, and Duration pills for both tasks and subtasks
- Completed tasks now have interactive metadata pills — users can change values without reopening

---

## v0.54.87 — 2026-02-24

### Feat: Redesign onboarding wizard to match legacy design
- Ported polished legacy wizard design: Whendoist logo with float animation, branded SVGs (rocket, Google Calendar, Todoist), glassmorphic cards, purple gradient CTA buttons
- Welcome step: logo wordmark + personalized greeting + value proposition card
- Energy step: 3 horizontal selectable mode cards with live task preview (color-coded accent bars)
- Calendar step: branded connection card with Google icon, status indicator, privacy notice
- Todoist step: centered branded card with Todoist logo
- Domains step: 3-column suggestion chip grid with emoji picker for custom domains
- Completion step: rocket illustration + pulsing "Open Tasks" button
- Added `logoFloat` and `finalPulse` CSS keyframe animations with reduced-motion support
- Renamed FOCUS energy label to BRAINSTORM

---

## v0.54.86 — 2026-02-24

### Fix: Legacy frontend CSP inline script blocking
- Legacy Jinja2 templates use inline event handlers (`onclick`, `onchange`, etc.) incompatible with nonce-based CSP
- `render_template` now flags legacy pages via `request.state.legacy_template`
- CSP middleware uses `'unsafe-inline'` for legacy pages, nonce-based for React SPA

---

## v0.54.85 — 2026-02-24

### Fix: V4 audit findings (7 of 8)
- **Input validation**: Added field validators to `TaskContentData` and `DomainContentData` batch models (control char stripping + length limits)
- **Domain icon validation**: Added `@field_validator("icon")` to `DomainCreate` and `DomainUpdate` (50 char limit, control char stripping)
- **Retention days**: Changed `completed_retention_days` from `Field(ge=1, le=7)` to `Literal[1, 3, 7]`
- **Rate limit interval leak**: Store interval ID at module level, clear before creating new countdown
- **Backup completeness**: Added `encryption_unlock_method` to backup export/import
- **Undo error handling**: Added `onError` toast to toggle-complete and instance reschedule undo callbacks

---

## v0.54.84 — 2026-02-24

### Docs: Pre-1.0 cleanup
- Merged `docs/archive/` into `docs/plans/` (single location for all historical docs)
- Created `docs/scratchpad/` for HTML mockups (consolidated from archive + frontend/mockups)
- Compacted CHANGELOG from 1078 to ~490 lines (v0.54.x: 83 entries → 6 grouped sections)
- Removed root `openapi.json` from git (orval fetches from running server)
- Removed `e2e/` directory (no E2E tests per project philosophy)
- Fixed README: removed stale "Due" property, corrected tsc command, "Thought Cabinet" → "Thoughts"
- Updated POST-1.0-BACKLOG: removed completed items (nonce CSP, recurrence_rule validation)
- Renamed misnamed plan files to follow `yyyy-mm-dd-name.md` convention

---

## v0.54.79–v0.54.83 — 2026-02-24

### Production Hardening

- **Error boundary** with friendly "Something went wrong" page
- **Code splitting**: Route-based lazy loading + vendor chunk separation (1,546 KB → 350 KB initial)
- **PWA reload prompt**: User-controlled update instead of silent auto-update
- **Nonce-based CSP**: Replaced `'unsafe-inline'` in `script-src` with per-request nonces
- **Input validation**: Recurrence rule schema, domain color format, expanded subtask set cap
- **UX guards**: Double-tap completion guard, CSRF auto-retry, stale data prevention, editor auto-close
- **Encryption**: Decrypt all UI surfaces (dashboard, calendar, settings, thoughts, analytics), mask content in GCal sync
- **CI**: Fixed TypeScript check to use `tsconfig.app.json`

---

## v0.54.56–v0.54.78 — 2026-02-23

### Subtasks, Recurring, & Encryption

**Subtask features:**
- Quick add subtask: ghost row, hover '+' icon, context menu/action sheet entry
- Full subtask context menus, kebab dropdown, delete with undo
- Subtask drag-to-calendar scheduling with correct phantom card duration
- Instance cache invalidation on task edit/delete

**Recurring tasks overhaul (6 fixes):**
- Timezone-aware instance scheduling (user-local → UTC conversion)
- Recurring tasks visible in Scheduled section
- Completed/skipped instances stay on calendar
- Time-less instances in Anytime section (not at 9 AM)
- Stale instance cleanup on regeneration
- `status=all` for instances API

**Other features:**
- Searchable parent task picker with smart ordering (parents first, same-domain second)
- Apple Glass floating pill navigation with frosted glass effect
- Interactive attribute mini-pills for inline metadata editing
- Calendar DnD: cross-day drag + overlay grab offset stability
- Snapshot scalability: `data_version` change tracking (O(1) skip unchanged users)
- GCal card redesign: recessive left-accent style (removed 4 experimental styles)
- Unified 10-second toast duration via `TOAST_DURATION` constant

**Encryption hardening:**
- Toggle processes ALL tasks (subtasks, completed, archived)
- Backup export/import includes encryption metadata
- Decryption pending guard prevents ciphertext flash
- GCal sync masks encrypted content

**TypeScript CI fix:**
- `tsc -p tsconfig.app.json` (was checking zero files), replaced phantom types across 25 files

---

## v0.54.33–v0.54.55 — 2026-02-22/23

### DnD Reparenting & Calendar Polish

**Drag-and-drop reparenting:**
- Drag task onto task → make subtask; drag subtask to different parent → reparent; drag to gap → promote
- Ghost placeholder, gap zone hitboxes (8px → 28px), overlay fade on hover
- Badge text adapts: "Make subtask" / "Change parent" / "Drop to make standalone"
- All operations with undo toast and optimistic updates

**Subtask enhancements:**
- Subtask-aware sorting (parent ranks by best pending subtask value)
- Energy filter applies to subtasks (not just parents)
- Drag-drop reschedule in scheduled section (between date groups)

**Calendar:**
- Completed tasks/instances stay visible (opacity + strikethrough)
- Undo on all completion/skip toasts with instance dates
- Anytime section: vertical wrap, grid→flexbox, label alignment
- GCal event click fix (use `htmlLink` from API)
- Card style A/B test (4 approaches), settled on impact-colored tints
- Consistent 3px left borders, border clipping fixes

**Task creation:**
- Optimistic add-task (stable key from API response, no flicker)
- Undo on task creation toast

**Recurring:**
- Regenerate instances on start/end date change
- Sync `recurrence_start` when `scheduled_date` changes
- Recurring parent tasks hidden from calendar (instances only)

**Backend:**
- Savepoints for IntegrityError handlers (no silent transaction loss)
- Instance unskip endpoint

---

## v0.54.6–v0.54.32 — 2026-02-21/22

### Data Model Cleanup & iOS PWA

**Data model:**
- Removed `due_date`/`due_time` — `scheduled_date` is single source of truth
- DB migration drops columns, Todoist import simplified

**Recurring tasks:**
- Overdue based on pending instances (not recurrence start date)
- Instance-aware grouping in scheduled sections
- Skip/complete available for all recurring tasks (not just overdue)
- "Unschedule" hidden for recurring tasks
- Instance drag & unschedule in calendar view

**iOS PWA (6 patches):**
- Notch coverage: safe-area-inset-top inside header
- Mobile header slim-down (desktop tabs hidden)
- Bottom safe area: nav sits flush, `pb-nav-safe` precise
- Debug overlay for layout zone inspection

**Dark mode & brand:**
- Blue-slate OKLch chroma fix (was neutral gray)
- Primary button color fix
- Impact color rail (settled on 3px), row wash tints
- Active nav purple state, time indicator → blue
- Calendar panel border separation

**Calendar completion:**
- Completed/skipped tasks/instances stay visible
- Undo on completion toasts
- Thicker 3px left border rail
- Anytime context menu (Edit, Unschedule, Complete, Delete)

---

## v0.54.0–v0.54.5 — 2026-02-20

### Design Parity

Complete brand alignment of the React frontend:

- **Phase 1**: Brand warm canvas (#F8FAFC), purple focus rings, calendar events restyled to outlined cards with colored left rail
- **Phase 2**: CTA gradient buttons, glass blur headers, 3-tier shadow system
- **Phase 3**: Desktop spacing, completion animation, hour grid banding
- **Post-audit**: Button font-weight, purple-tinted hovers, subtask connector lines, 12px card radius, domain left accent, graduated day dimming
- Subtask layout: proper margin-based indentation, connector line positioning
- Recurring instance drag & unschedule in calendar

---

## v0.53.9 — 2026-02-20

- Docs cleanup: archived legacy frontend docs, compacted CHANGELOG

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
- Full header labels (Clarity/Duration/Impact) replacing abbreviations
- Stable event ordering on carousel swipe
- Event flicker eliminated with `placeholderData: keepPreviousData`

---

## v0.51.0–v0.51.9 — 2026-02-19

### Calendar Redesign

- **Extended day view**: Single 44-hour view (prev 9PM through next 5PM) with day separators
- **Anytime section**: Horizontal pill banner above time grid for date-only tasks
- **Continuous zoom**: Ctrl+wheel zooms smoothly, snaps to nearest step on save
- **5-panel carousel**: CSS scroll-snap with desktop pointer-drag swipe (4 iterations)
- Live scroll updates for header date and anytime tasks
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
- **Calendar features**: Drag-to-reschedule, instance cards, swipe navigation, auto-scroll, phantom card, cross-day drag
- **Task interactions**: Context menus, kebab menus, inline add-task, date shortcuts
- **Undo toasts** on all operations with task names
- **Accessibility**: aria-live announcer, reduced motion support, 44px touch targets
- **Glass morphism**: Header, nav, energy selector with frosted glass effect
- **Demo pill widget**, pending past instances banner, network status monitoring

### Fixed (~40 patches)

- Sort/filter persistence, swipe cascade to subtasks, plan mode parallel scheduling, calendar time indicator, wizard domain deletion, encrypted text flash, CSRF token flow, subtask editing, domain group expand/collapse, and more

---

## v0.48.0–v0.48.12 — 2026-02-17/18

### React SPA Launch

- **v0.48.0**: Removed all legacy frontend (18 templates, 25 JS modules, 22 CSS files). Added keyboard shortcuts and motion animations.
- **Analytics page**: Interactive charts (completions, domain breakdown, heatmap, velocity)
- **Frontend CI**: TypeScript, Biome lint, production build in GitHub Actions
- **Railway deployment**: Resolved railpack Node.js detection (v0.48.3–v0.48.8)
- **Encryption hardening**: Fixed ciphertext flash, enable corruption race, child route rendering
- **CSRF flow**: Token endpoint + axios interceptor for SPA
- 27 hardcoded query keys → generated helpers, 11 endpoints got response models

---

## v0.47.0–v0.47.9 — 2026-02-17

### React SPA Migration

Built the entire React frontend from scratch:

- **v0.47.0**: Scaffold — Vite 6, React 19, TypeScript, TanStack Router/Query, Zustand, Tailwind v4, shadcn/ui, dnd-kit, orval
- **v0.47.1**: API codegen (82 types), encryption/passkey ports, Zustand stores
- **v0.47.2**: App shell, auth guard, login, theme provider, encryption unlock modal
- **v0.47.3**: Settings, Thoughts, Privacy/Terms pages, onboarding wizard
- **v0.47.4**: SPA serving, static assets, service worker, PWA meta tags
- **v0.47.5**: Dashboard task panel with domain grouping, subtrees, encryption
- **v0.47.6**: Task editor, quick add, recurrence picker, sort/filter/energy controls
- **v0.47.7**: Calendar panel — 3-day carousel, time grid, overlap detection, zoom
- **v0.47.8**: Drag-and-drop — task-to-calendar, calendar-to-list, reparenting
- **v0.47.9**: Mobile — swipe gestures, haptic feedback, long-press, gesture discovery

---

## v0.46.0–v0.46.7 — 2026-02-17

### Subtask System

- Depth-1 constraint, completion cascade, expand/collapse containers
- Create, reparent, promote subtasks from UI
- Todoist import flattens deep nesting to depth-1

---

## v0.45.67–v0.45.99 — 2026-02-15/17

### Drag-and-Drop & Calendar Overhaul

- **Custom drag overlay**: Fixed-position clone follows cursor, morphs to event pill over calendar
- **Phantom card**: Drop indicator with title, time, impact rail, 15-minute snap
- **Auto-scroll**: Vertical scroll near edges during drag
- **Cross-day drag**: Hover near edge for 500ms → navigate adjacent day
- **Adjacent-day sync**: Bidirectional mirroring of evening/morning tasks
- **Snapshots**: Automated daily backups with content-hash dedup (6 new endpoints)

### Fixed (30+ patches)

- Drag ghost offset (5 iterations), adjacent-day mirroring edge cases
- Calendar completion/reopen visual state, undo toast and scroll-to-task fixes

---

## v0.45.30–v0.45.66 — 2026-02-13/15

### PWA & Mobile Polish

- **PWA viewport fix**: 3 independent iOS triggers identified and fixed. See [docs/PWA-VIEWPORT-FIX.md](docs/PWA-VIEWPORT-FIX.md)
- **In-place mutations**: Surgical DOM updates replacing page reloads
- **Calendar**: Fixed header, scroll-to-now, glass backdrop, swipe navigation
- **Recurring tasks**: Auto-populate scheduled_date, undo instance reschedule
- **Privacy policy**: Standalone page for Google OAuth verification

---

## v0.45.0–v0.45.29 — 2026-02-12/13

### Thoughts Redesign & Misc

- **Chat-style Thoughts page**: Bottom-input layout, date separators, slide-up animations
- **Mobile polish**: Pull-to-refresh, parent task name wrapping, PWA safe areas
- **Sentry auto-fix workflow**: Auto-assigns issues to Copilot agent

---

## v0.44.0–v0.44.11 — 2026-02-11

### Mobile Redesign (Thoughts, Analytics, Settings)

Full-viewport scrolling, glass-morphism sticky headers, edge-to-edge layout, 44px touch targets. iMessage-style thought capture button. Toast improvements.

---

## v0.42.42–v0.43.3 — 2026-02-10/11

### Glass UI & Mobile UX Overhaul

- Floating glass energy selector, glass headers/domain headers/tab bar
- Nunito font, gesture discovery (swipe hint, edge hint, long-press tooltip)
- Swipe-left schedules (was delete), mobile filter bar, calendar fade gradient

---

## v0.42.7–v0.42.41 — 2026-02-09/10

### v1.0 Security Audit & Calendar Features

**Security (15 patches):**
- CSP hardening, rate limits, session fixation defense, backup size limit
- Input validation, offline mutation guards, HTMX CSRF injection
- domain_id IDOR fix, batch update rollback, /ready info leak fix

**Features:**
- Calendar zoom (+/- and Ctrl+scroll), card context menus
- Actions menu (kebab) on all tasks, universal departing animation

---

## v0.42.0–v0.42.6 — 2026-02-08/09

- Complete `safeFetch()` migration
- Keyboard shortcuts: j/k navigation, c/e/x task actions, help modal

---

## v0.40.0–v0.41.1 — 2026-02-08

### Production Hardening & Toast Rewrite

- Database pool tuning, statement timeout, graceful shutdown
- `safeFetch()` error recovery with typed error classes
- Toast system rewrite: queue, type variants, action buttons, deduplication

---

## v0.39.0–v0.39.8 — 2026-02-07/08

- **Rename clarity to Mode**: clear/defined/open → autopilot/normal/brainstorm
- **Impact labels**: Unified to High/Mid/Low/Min
- **Demo account overhaul**: Realistic PM persona with ~50 tasks

---

## v0.37.0–v0.38.0 — 2026-02-07

### Task List Refinements

- Meta column opacity, ghost checkbox, clarity text labels, domain task counts
- Plan My Day banner, calendar auto-advance after 8pm, past-tasks badge

---

## v0.34.0–v0.36.0 — 2026-02-06

### Header & Task List Redesign

- Two-row header layout with energy + view chips
- Flat scheduled/completed sections, brand-aligned spectrum gradient
- Collapsible sections, neutral subtask badges, impact labels

---

## v0.32.0–v0.33.1 — 2026-02-02/06

### Recurring Tasks & GCal Sync Hardening

- Skip instances, batch completion, recurrence bounds, drag reschedule
- Per-user sync lock, adaptive throttle, circuit breaker, calendar reuse

---

## v0.31.0–v0.31.9 — 2026-02-02

### Google Calendar Task Sync

One-way sync to dedicated "Whendoist" calendar with impact-based colors. Settings UI, OAuth scope upgrade, fire-and-forget background sync.

---

## v0.30.0–v0.30.1 — 2026-02-01

- Subtask hierarchy in Todoist import, parent breadcrumb, subtask count badges
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
