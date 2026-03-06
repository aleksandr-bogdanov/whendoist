---
version:
pr:
created: 2026-03-06
---

# Audit 5 — Cross-Examination: Verified Findings (v0.57.0 → v0.64.1)

**Method:** Every finding from Audits 1–4 was verified by reading the actual source
code at the referenced file and line. False positives discarded, duplicates merged,
severities re-assessed based on real exploitability and impact.

---

## Verified Findings

---

### [SEV: High] Failed offline mutations silently discarded — data loss

- **Original audit:** Audit 2 (H1)
- **File(s):** `frontend/src/hooks/use-offline-sync.ts:167-174`
- **Verified description:** When the write queue drains on reconnect, any mutation
  that fails (409, 400, transient 500) is permanently removed via `removePendingWrite()`.
  The user sees a generic toast ("X offline changes couldn't sync") but the mutation
  data is gone forever. No retry, no recovery. Transient failures that would succeed
  on retry cause permanent data loss.
- **Recommended fix:** Add retry with exponential backoff for transient errors (5xx).
  Only discard on permanent failures (4xx). Optionally persist failed mutations for
  manual review.
- **Effort:** M

---

### [SEV: High] Biometric IPC commands have no timeout protection

- **Original audit:** Audit 3 (1.1)
- **File(s):** `frontend/src/lib/tauri-biometric.ts` (all 5 functions)
- **Verified description:** All biometric IPC calls (`checkBiometricAvailability`,
  `storeEncryptionKey`, `retrieveEncryptionKey`, `hasStoredKey`, `clearEncryptionKey`)
  use raw `invoke()` without `Promise.race()` timeout. Every other IPC wrapper in the
  codebase uses a 1.5s timeout. `retrieveEncryptionKey` is worst — it triggers a
  blocking native biometric prompt that can hang indefinitely on certain iOS versions.
  App UI freezes with no recovery path.
- **Recommended fix:** Wrap all biometric IPC calls in the same `withTimeout()` pattern
  used by `tauri-cache.ts` and `tauri-token-store.ts`. Use a longer timeout (e.g., 30s)
  to accommodate the biometric prompt.
- **Effort:** S

---

### [SEV: High] Stateless device tokens cannot be revoked server-side

- **Original audit:** Audit 1 (1)
- **File(s):** `app/routers/device_auth.py:166-182`
- **Verified description:** `DELETE /api/v1/device/token` logs the event but performs
  no server-side invalidation. Tokens are signed with `itsdangerous` and validated by
  signature + expiry alone. No denylist or database-backed sessions exist. A stolen
  refresh token (30d TTL) remains valid for its entire lifetime — logout and password
  changes have no effect.
- **Recommended fix:** Add a `revoked_tokens` table or Redis denylist. On logout/revoke,
  store the token's JTI (or hash) with expiry. Check denylist on every refresh.
- **Effort:** M

---

### [SEV: Medium] Cache not cleared on 401/session expiry — cross-user data leak (Tauri)

- **Original audit:** Audit 2 (M2)
- **File(s):** `frontend/src/lib/api-client.ts:166-172`
- **Verified description:** The 401 interceptor calls `clearDeviceToken()` but NOT
  `clearAllCache()`. The SQLite cache containing tasks and domains persists. If user A's
  session expires and user B logs in on the same Tauri device, user B briefly sees
  user A's cached data on cold start. The logout button correctly calls `clearAllCache()`,
  but involuntary session expiry does not.
- **Recommended fix:** Add `clearAllCache()` call to the 401 handler alongside
  `clearDeviceToken()`.
- **Effort:** S

---

### [SEV: Medium] Push `reminder_sent_at` set even when ALL pushes fail

- **Original audit:** Audit 2 (M3)
- **File(s):** `app/tasks/push_notifications.py:129-131`
- **Verified description:** After sending to all devices, `reminder_sent_at = now` is
  set unconditionally regardless of delivery success. If all pushes fail (network error,
  FCM outage), the reminder is permanently consumed and will never be retried.
- **Recommended fix:** Only set `reminder_sent_at` if at least one push succeeded.
  Track `any_success` boolean during the push loop.
- **Effort:** S

---

### [SEV: Medium] Recurring task instances do not get push reminders

- **Original audit:** Audit 2 (M4)
- **File(s):** `app/tasks/push_notifications.py:53-71`, `app/models.py` (TaskInstance)
- **Verified description:** The push notification query only queries the `tasks` table.
  `TaskInstance` has no `reminder_minutes_before` or `reminder_sent_at` fields at all.
  Users with recurring tasks + reminders only get notified for the parent task's first
  occurrence, never for subsequent instances.
- **Recommended fix:** Add reminder columns to `TaskInstance` (migration required), and
  extend the push query to include instances. Alternatively, compute instance reminders
  dynamically from the parent task's `reminder_minutes_before`.
- **Effort:** L

---

### [SEV: Medium] Encryption key stored in JSON file, not hardware-backed keychain

- **Original audit:** Audit 1 (3) + Audit 3 (5.1) — **merged duplicate**
- **File(s):** `frontend/src-tauri/src/commands/biometric.rs:9-20, 105-112`
- **Verified description:** The AES-256-GCM key is stored via `tauri-plugin-store`
  (JSON file in app sandbox), not iOS Keychain or Secure Enclave. On jailbroken/rooted
  devices, the key is extractable without biometric auth. The code itself documents this
  limitation and references `tauri-plugin-keystore` as the fix.
- **Recommended fix:** Migrate to `tauri-plugin-keystore` when its JS API stabilizes.
- **Effort:** M

---

### [SEV: Medium] CSP completely disabled on iOS

- **Original audit:** Audit 3 (7.1)
- **File(s):** `frontend/src-tauri/tauri.ios.conf.json`
- **Verified description:** `"security": { "csp": null }` removes all Content Security
  Policy from the iOS WKWebView. Any XSS vulnerability would execute with no CSP
  mitigation. Mitigated by: Tauri's same-origin policy, React's built-in escaping, and
  encrypted task content. The comment cites WKWebView's inconsistent CSP enforcement on
  iOS 16+.
- **Recommended fix:** Re-evaluate CSP enforcement on current iOS versions (18+). If
  still broken, document the trade-off more prominently.
- **Effort:** S

---

### [SEV: Medium] Push token stored only in memory — lost on app restart

- **Original audit:** Audit 3 (6.1)
- **File(s):** `frontend/src-tauri/src/lib.rs:84-86`
- **Verified description:** Push token is stored in `PushTokenState(Mutex<Option<String>>)`
  — pure in-process memory. On app kill/restart, the token is lost. iOS re-registers
  periodically but there is a window where push is broken. Not persisted to
  `tauri-plugin-store` or any file.
- **Recommended fix:** Persist token to `tauri-plugin-store` on receipt. Read on startup
  and skip re-registration if unchanged.
- **Effort:** S

---

### [SEV: Medium] No `pendingComponent` — zero loading feedback during navigation

- **Original audit:** Audit 4 (1)
- **File(s):** `frontend/src/main.tsx:19`, all route files
- **Verified description:** `createRouter({ routeTree })` has no `defaultPendingComponent`.
  No route file defines `pendingComponent`. During lazy-route code-splitting on slow
  networks, TanStack Router shows the old route with zero navigation feedback. User
  clicks nav and nothing visibly happens.
- **Recommended fix:** Add `defaultPendingComponent` to `createRouter()` — a simple
  centered spinner or progress bar.
- **Effort:** S

---

### [SEV: Medium] Five mutations missing `onError` toast

- **Original audit:** Audit 4 (3)
- **File(s):** `frontend/src/routes/_authenticated/settings.lazy.tsx:322-330, 1354-1364,
  1468-1475, 1483-1490`
- **Verified description:** Four mutations in settings (calendar save, domain archive,
  toggle snapshots, create snapshot) have no `onError` handler. 5xx errors get a generic
  toast from the API interceptor, but 4xx errors (validation, not-found) produce no
  user feedback. The thoughts undo path is a minor gap (secondary action).
- **Recommended fix:** Add `onError: () => toast.error(...)` to each, or add a global
  `MutationCache.onError` fallback in `query-client.ts`.
- **Effort:** S

---

### [SEV: Medium] `smartCallbacks` not memoized in `TaskFieldsBody`

- **Original audit:** Audit 4 (4)
- **File(s):** `frontend/src/components/task/task-fields-body.tsx:110-139`
- **Verified description:** `smartCallbacks` is created inline on every render without
  `useMemo`. Both `task-editor.tsx` and `task-edit-drawer.tsx` correctly wrap theirs in
  `useMemo`. This causes `useSmartInputConsumer` to receive a new reference every render,
  triggering unnecessary re-creation of its `processTitle` callback.
- **Recommended fix:** Wrap `smartCallbacks` in `useMemo` like the other two consumers.
- **Effort:** S

---

### [SEV: Medium] `formatDayHeader` is not timezone-aware

- **Original audit:** Audit 4 (6)
- **File(s):** `frontend/src/lib/calendar-utils.ts:52-69`
- **Verified description:** Uses `new Date()` (browser local time) to determine
  "Today"/"Tomorrow"/"Yesterday" labels. The user's configured timezone is not consulted.
  Near midnight, labels can be wrong for users whose configured timezone differs from
  their browser's timezone. All other calendar functions accept a `tz` parameter.
- **Recommended fix:** Accept a `tz` parameter and use timezone-aware date comparison
  (consistent with `todayString(timezone)`).
- **Effort:** S

---

### [SEV: Medium] No `version` or `migrate` in `useUIStore` persist config

- **Original audit:** Audit 4 (5)
- **File(s):** `frontend/src/stores/ui-store.ts:206-244`
- **Verified description:** Zustand persist config has no `version` field or `migrate`
  function. If the persisted state shape changes (fields renamed/retyped), existing
  users' localStorage silently fails to rehydrate. Not currently causing bugs, but the
  store has already grown to include `hideCompletedSubtasks`, `planStrategy`,
  `showSecondaryTimezone`.
- **Recommended fix:** Add `version: 1` and a `migrate` function that handles schema
  changes gracefully.
- **Effort:** S

---

### [SEV: Medium] All task queries clobber same cache key

- **Original audit:** Audit 2 (M6)
- **File(s):** `frontend/src/hooks/use-offline-sync.ts:248-269`
- **Verified description:** `persistToCache` matches by `String(queryKey[0])` only,
  ignoring params. All task queries (regardless of filters) are cached under `"tasks"`.
  If the user's last view was a filtered/search query, cold-start hydrates with
  partial data.
- **Recommended fix:** Include query params in the cache key (e.g., serialize the full
  `queryKey` as JSON).
- **Effort:** S

---

### [SEV: Low] Dev CORS origins always allowed in production

- **Original audit:** Audit 1 (4)
- **File(s):** `app/main.py:196-204`
- **Verified description:** `http://localhost:5173` and `http://localhost:1420` are in
  `allow_origins` unconditionally. No `is_production` check. Impact limited by
  `allow_credentials=False` — no cookie-based attacks possible. Would require a
  malicious process on the production host binding to those ports.
- **Recommended fix:** Guard dev origins behind `if not is_production`.
- **Effort:** S

---

### [SEV: Low] Push notification payload includes plaintext task title (non-encrypted users)

- **Original audit:** Audit 1 (5)
- **File(s):** `app/tasks/push_notifications.py:96-97`, `app/services/push_service.py:125-127`
- **Verified description:** For non-encrypted users, plaintext task titles transit
  FCM/APNs infrastructure. Encrypted users are correctly protected (title is `None`).
  This is intentional design — a privacy trade-off, not a bug.
- **Recommended fix:** Consider defaulting to generic titles for all users, with an
  opt-in for rich notifications. Low priority.
- **Effort:** S

---

### [SEV: Low] `clear_encryption_key` IPC command doesn't require biometric on mobile

- **Original audit:** Audit 1 (8)
- **File(s):** `frontend/src-tauri/src/commands/biometric.rs:176-188`
- **Verified description:** `store_encryption_key` and `retrieve_encryption_key` both
  gate on biometric auth via `#[cfg(mobile)]`. `clear_encryption_key` does not — it
  directly deletes from the store. Could be used as DoS (force re-enrollment) by
  injected JS, but requires a prior XSS vulnerability.
- **Recommended fix:** Add the same `#[cfg(mobile)]` biometric gate.
- **Effort:** S

---

### [SEV: Low] Push token field has no `max_length` validation

- **Original audit:** Audit 1 (7)
- **File(s):** `app/routers/push_notifications.py:29-31`
- **Verified description:** `RegisterTokenRequest.token` is a bare `str` with no
  length constraint. DB column is `String(255)`. Overly long tokens cause a DB error
  instead of a clean 422 response. Real tokens are 64–163 chars.
- **Recommended fix:** Add `Field(max_length=500)` to the Pydantic model.
- **Effort:** S

---

### [SEV: Low] No conflict detection in offline sync — last-write-wins

- **Original audit:** Audit 2 (M1)
- **File(s):** `frontend/src/hooks/use-offline-sync.ts`, `frontend/src/lib/tauri-cache.ts`
- **Verified description:** Write queue stores raw HTTP requests replayed verbatim. No
  `If-Match`, `ETag`, or `updated_at` checks. Stale offline edits silently overwrite
  concurrent changes from other devices.
- **Severity re-assessment:** Downgraded from Medium to Low. This is standard for
  offline-first apps at this maturity level. Full conflict resolution is a major feature,
  not a bug fix.
- **Recommended fix:** Add `updated_at` to write queue entries and `If-Match` headers
  on replay. Requires backend support for conditional updates.
- **Effort:** L

---

### [SEV: Low] `fire_and_forget_unsync_task` does not trip circuit breaker

- **Original audit:** Audit 2 (L1)
- **File(s):** `app/routers/_gcal_helpers.py:103-119`
- **Verified description:** Unlike `fire_and_forget_sync_task`, the unsync path catches
  all exceptions with a generic `logger.warning` and does NOT check for
  `CalendarGoneError` or add the user to `_sync_disabled_users`. Unsyncs keep hitting
  Google after a 403.
- **Recommended fix:** Add the same `CalendarGoneError`/`TokenRefreshError` check and
  circuit breaker trip as the sync path.
- **Effort:** S

---

### [SEV: Low] `reminder_sent_at` not reset on uncomplete

- **Original audit:** Audit 2 (L3)
- **File(s):** `app/services/task_service.py:554-565`
- **Verified description:** `uncomplete_task` sets `status = "pending"` and
  `completed_at = None` but does not clear `reminder_sent_at`. The reminder will not
  re-fire unless the user also changes the schedule.
- **Recommended fix:** Clear `reminder_sent_at` in `uncomplete_task`.
- **Effort:** S

---

### [SEV: Low] No-token users get reminder permanently marked as sent

- **Original audit:** Audit 2 (L4)
- **File(s):** `app/tasks/push_notifications.py:99-105`
- **Verified description:** Users with no registered device tokens still get
  `reminder_sent_at` set — intentionally, to prevent churning the query every 60s. But
  if they register a device later, past reminders are already consumed.
- **Recommended fix:** Consider a separate "no devices" flag or skip marking for
  tasks with future reminders.
- **Effort:** S

---

### [SEV: Low] Missing indexes on reminder columns

- **Original audit:** Audit 2 (L5)
- **File(s):** `app/models.py` (Task.__table_args__), alembic migrations
- **Verified description:** `reminder_minutes_before` and `reminder_sent_at` have no
  indexes. The push query filters on both. Existing composite index
  `(user_id, scheduled_date)` may partially cover, but a dedicated index is missing.
- **Recommended fix:** Add composite index on
  `(reminder_sent_at, reminder_minutes_before, status)` for the push query.
- **Effort:** S

---

### [SEV: Low] No cache TTL / expiry

- **Original audit:** Audit 2 (L7)
- **File(s):** `frontend/src/lib/tauri-cache.ts`
- **Verified description:** `cache_entries.updated_at` exists but is never checked for
  expiry on reads. Users who don't open the app for weeks see stale data on cold start
  before network fetch.
- **Recommended fix:** Add TTL check in `getCachedData` (e.g., discard entries older
  than 7 days).
- **Effort:** S

---

### [SEV: Low] No proactive cleanup of stale device tokens

- **Original audit:** Audit 2 (M7)
- **File(s):** `app/routers/push_notifications.py`, `app/tasks/push_notifications.py`
- **Verified description:** Only reactive cleanup exists (on push failure). No
  scheduled job prunes tokens by age. Tokens for uninstalled apps accumulate until
  a push is attempted.
- **Severity re-assessment:** Downgraded from Medium to Low. Stale tokens are cleaned
  on first push attempt. The accumulation is a minor efficiency issue, not data
  corruption.
- **Recommended fix:** Add a periodic job (e.g., weekly) to prune tokens with
  `updated_at` older than 90 days.
- **Effort:** S

---

### [SEV: Low] Orval-generated types are stale (v0.57.1)

- **Original audit:** Audit 2 (M5)
- **File(s):** `frontend/src/api/model/meResponse.ts`
- **Verified description:** Generated types show OpenAPI spec version `0.57.1`; backend
  is at v0.64.1. Missing fields include `data_version`, `reminder_minutes_before`, etc.
  Workarounds exist (inline type extensions). No runtime bugs — JS ignores extra fields.
- **Severity re-assessment:** Downgraded from Medium to Low. This is a one-command fix
  (`npx orval`) with no runtime impact.
- **Recommended fix:** Run `cd frontend && npx orval` and commit the regenerated types.
- **Effort:** S

---

### [SEV: Low] Circuit breaker never resets — requires app restart

- **Original audit:** Audit 3 (1.2)
- **File(s):** `frontend/src/lib/tauri-cache.ts`, `frontend/src/lib/tauri-token-store.ts`
- **Verified description:** `sqlAvailable` and `storeAvailable` transition from `true`
  to `false` on first error and never reset. A transient cold-start timeout permanently
  disables caching/token persistence for the session. No half-open state or retry.
- **Recommended fix:** Add a cooldown timer (e.g., 30s) before retrying. Implement
  half-open circuit breaker pattern.
- **Effort:** S

---

### [SEV: Low] 1.5s timeout constant duplicated across 5 files

- **Original audit:** Audit 3 (1.3)
- **File(s):** `tauri-cache.ts`, `tauri-token-store.ts`, `tauri-notifications.ts`,
  `tauri-widgets.ts`, `tauri-native-tabbar.ts`
- **Verified description:** Five files each define 1500ms timeout (three as named
  constants with different names, two inline). No shared constant.
- **Recommended fix:** Extract to `frontend/src/lib/tauri-constants.ts` as
  `TAURI_IPC_TIMEOUT_MS`.
- **Effort:** S

---

### [SEV: Low] `evaluateJavaScript` calls have no error handling

- **Original audit:** Audit 3 (3.1)
- **File(s):** `frontend/src-tauri/ios/Sources/NativeTabBarPlugin.swift`
- **Verified description:** All three `evaluateJavaScript` calls pass
  `completionHandler: nil`. If the JS bridge function is undefined (page still loading),
  errors are silently lost. Tab bar indicator may desync from actual page.
- **Recommended fix:** Add completion handlers that log errors to `os_log`.
- **Effort:** S

---

### [SEV: Low] Tab bar route detection uses prefix matching

- **Original audit:** Audit 3 (3.2)
- **File(s):** `NativeTabBarPlugin.swift` (`authenticatedPrefixes`)
- **Verified description:** `path.hasPrefix($0)` means `/thoughtsarchive` would match
  `/thoughts`. No such routes exist today, but it's fragile.
- **Recommended fix:** Use exact match or add path separator check
  (`path == prefix || path.hasPrefix(prefix + "/")`).
- **Effort:** S

---

### [SEV: Low] Notifications fire immediately — no native scheduling

- **Original audit:** Audit 3 (6.2)
- **File(s):** `frontend/src-tauri/src/commands/notifications.rs`
- **Verified description:** `schedule_reminder` stores metadata but fires `.show()`
  immediately. No native `UNCalendarNotificationTrigger`. If the app is backgrounded,
  scheduled reminders won't fire. The code itself documents this as a known limitation.
- **Recommended fix:** Use native iOS notification scheduling via
  `UNTimeIntervalNotificationTrigger`. Requires Swift plugin work.
- **Effort:** M

---

### [SEV: Low] CSP uses `unsafe-inline` for scripts and styles (desktop)

- **Original audit:** Audit 3 (7.2)
- **File(s):** `frontend/src-tauri/tauri.conf.json`
- **Verified description:** Desktop CSP includes `script-src 'self' 'unsafe-inline'`.
  Required by Tailwind v4 JIT and Tauri's IPC bridge. Mitigated by React escaping and
  Tauri's IPC boundary.
- **Recommended fix:** Evaluate CSP nonces if Tauri adds support.
- **Effort:** M

---

### [SEV: Low] `connect-src` uses wildcard subdomain

- **Original audit:** Audit 3 (7.3)
- **File(s):** `frontend/src-tauri/tauri.conf.json`
- **Verified description:** `https://*.whendoist.com` allows any subdomain. Only
  `whendoist.com` is currently used.
- **Recommended fix:** Restrict to specific subdomains if no wildcard is needed.
- **Effort:** S

---

### [SEV: Low] Biometric auth disables device credential fallback

- **Original audit:** Audit 3 (5.2)
- **File(s):** `frontend/src-tauri/src/commands/biometric.rs`
- **Verified description:** `allow_device_credential: false` prevents PIN/password
  fallback when Face ID fails. Deliberate security decision but may frustrate users.
- **Recommended fix:** Consider enabling device credential fallback as an option, or
  document the trade-off for users.
- **Effort:** S

---

### [SEV: Low] No route-level `errorComponent` for chunk load failures

- **Original audit:** Audit 4 (7)
- **File(s):** all route files, `frontend/src/routes/__root.tsx`
- **Verified description:** No per-route `errorComponent`. `RootErrorBoundary` catches
  all errors at the root level, showing a generic "Something went wrong" with reload.
  Works but no chunk-specific messaging (e.g., "new version available").
- **Recommended fix:** Add `defaultErrorComponent` to `createRouter()` with
  chunk-load-failure detection.
- **Effort:** S

---

### [SEV: Low] No global mutation error handler

- **Original audit:** Audit 4 (8)
- **File(s):** `frontend/src/lib/query-client.ts:1-11`
- **Verified description:** No `MutationCache` with `onError` callback. Every mutation
  must define its own `onError`. 4xx errors without explicit handlers are silent.
- **Recommended fix:** Add `new MutationCache({ onError: () => toast.error(...) })`
  as a safety net.
- **Effort:** S

---

### [SEV: Low] Undo mutations sometimes lack `onError`

- **Original audit:** Audit 4 (9)
- **File(s):** `frontend/src/components/calendar/scheduled-task-card.tsx:101-109`
- **Verified description:** The undo action inside the toast callback has no `onError`.
  If the undo API call fails, the optimistic restore remains in the cache but the server
  state diverges silently.
- **Recommended fix:** Add `onError` with rollback to undo mutations.
- **Effort:** S

---

### [SEV: Low] Hardcoded `duration: 2000` in dashboard toast

- **Original audit:** Audit 4 (10)
- **File(s):** `frontend/src/routes/_authenticated/dashboard.lazy.tsx:411`
- **Verified description:** `toast(..., { duration: 2000 })` violates Rule 11.
- **Recommended fix:** Remove the `duration` override or use `TOAST_DURATION_SHORT`.
- **Effort:** S

---

### [SEV: Low] Duplicated keyboard nav logic across two hooks

- **Original audit:** Audit 4 (11)
- **File(s):** `frontend/src/hooks/use-smart-input.ts:152-179`,
  `frontend/src/hooks/use-smart-input-consumer.ts:174-201`
- **Verified description:** ArrowDown/Up/Enter/Tab/Escape handling is ~90% identical
  in both hooks. Not byte-for-byte identical (different `handleAcSelect` callers), but
  the navigation logic could be extracted.
- **Recommended fix:** Extract shared keyboard nav utility.
- **Effort:** S

---

### [SEV: Low] Double-parse in `useTriageForm.handleTitleEdit`

- **Original audit:** Audit 4 (12)
- **File(s):** `frontend/src/hooks/use-triage-form.ts:152-156`
- **Verified description:** Calls `setInput(rebuilt)` (which internally calls
  `parseTaskInput`) then immediately calls `parseTaskInput(rebuilt)` again. Same string
  parsed twice per keystroke. Pragmatic workaround for async React state, but wasteful.
- **Recommended fix:** Use the return value from `setInput` or restructure to avoid
  double parsing.
- **Effort:** S

---

### [SEV: Low] Some touch targets below 44px iOS minimum

- **Original audit:** Audit 4 (13)
- **File(s):** `frontend/src/components/task/field-pickers.tsx:279`,
  `frontend/src/components/batch/floating-action-bar.tsx:270`
- **Verified description:** Duration input uses `h-8` (32px). FAB buttons compute to
  ~32px. Both below Apple HIG 44px minimum for touch targets.
- **Recommended fix:** Increase to `h-11` (44px) on mobile, or add touch-target padding.
- **Effort:** S

---

### [SEV: Low] `data_version` bump silently skipped under lock contention

- **Original audit:** Audit 2 (L8)
- **File(s):** `app/services/data_version.py:36-42`
- **Verified description:** PostgreSQL savepoint with 2s timeout silently skips the bump
  on lock contention (logged at `debug` only). Client sees stale `data_version` for up
  to 2 minutes. Documented as intentional.
- **Recommended fix:** Raise log level to `warning` for observability. Otherwise by design.
- **Effort:** S

---

## Discarded Findings

### CSRF gap on device token exchange endpoint (Audit 1, M2)
**Why discarded:** The CSRF exemption is intentionally correct. `allow_credentials=False`
prevents cross-origin cookie attachment. The `SameSite=Lax` session cookie provides
additional CSRF mitigation. The endpoint is designed for Tauri's post-OAuth flow where
the session cookie is briefly valid. No realistic attack vector in production.

### DeviceToken deletion lacks defense-in-depth `user_id` filter (Audit 1, L2)
**Why discarded:** `invalid_token_ids` is populated exclusively from tokens already
fetched with a `user_id` filter (line 85). The deletion by ID is safe because the IDs
are already user-scoped by the query chain. Not a vulnerability; adding `user_id` would
be redundant defense-in-depth.

### Timezone optimistic update has no error rollback (Audit 4, F2)
**Why discarded:** Both timezone pickers use `onSettled: () => invalidateQueries()`,
which fires on both success and error. This revalidates the cache from the server after
every mutation — the invalidation IS the rollback. Additionally, both have `onError`
with `toast.error()`. The pattern is correct.

### `showSecondaryTimezone` toggle is client-side only (Audit 4, F14)
**Why discarded:** `showSecondaryTimezone` IS persisted via Zustand's localStorage
persist middleware (confirmed in `partialize`). It is intentionally a client-side
display preference — not a server-side setting. It survives page reloads correctly.

### X-Tauri-Body header limited to ~6KB payload (Audit 3, 2.1)
**Why discarded:** The workaround is correctly gated behind `isTauri && import.meta.env.DEV`
— it applies only in dev mode. In production, Tauri connects directly to the backend
with no header encoding. The 6KB claim is theoretical (standard HTTP header limits are
8KB+). Current task payloads are <2KB. No observed failures.

### STT wrapper exists but implementation is minimal (Audit 3, 4.1)
**Why discarded:** The audit itself concluded "No issues found." Not a finding.

### No special handling for iPad floating keyboard (Audit 3, 8.1)
**Why discarded:** Minor visual issue on iPad only — content remains accessible. Not a
bug; a design limitation with no user impact on the primary iPhone target platform.

### Tauri framework intentional memory leak (Audit 3, 9.1)
**Why discarded:** Upstream Tauri framework code, not app code. Not actionable at the
application level. Requires Tauri fix.

### Framework Swift code has force unwraps (Audit 3, 9.2)
**Why discarded:** Tauri framework code, not app code. IPC data is guaranteed valid by
the Rust serialization layer. Not actionable.

### `privacy.tsx` and `terms.tsx` are not code-split (Audit 4, L3)
**Why discarded:** Small static pages. The audit itself notes "minimal user impact."
Not worth the complexity of lazy loading.

### `TOAST_DURATION_SHORT` not documented in Rule 11 (Audit 4, L5)
**Why discarded:** Documentation gap, not a code issue. The constant is centralized and
used correctly.

### Workaround logic duplicated between dev and preview proxy (Audit 3, 2.2)
**Why discarded:** Dev-only infrastructure code. Copy-paste between two config objects
in the same file is acceptable for build tooling.

### No "slow connection" intermediate feedback (Audit 4, L1)
**Why discarded:** Standard behavior for web apps. User sees a loading spinner. Adding
"slow connection" feedback would be a new feature, not a bug fix.

### `selectedTaskId`/`selectedDomainId` can reference deleted entities (Audit 4, Zustand L2)
**Why discarded:** Not persisted (excluded from `partialize`). Consumer components guard
against missing data. Transient session-only state with no user impact.

### Circuit breaker is process-local across workers (Audit 2, L2)
**Why discarded:** The persistence fix (`_persist_sync_disable`) mitigates this. Once
`gcal_sync_enabled = False` is committed, all workers see it. The window is small and
documented.

### GCal sync duplicate cleanup migration not fully reversible (Audit 2, L6)
**Why discarded:** Duplicates were data corruption. Not restoring them on downgrade is
the correct behavior.

### `_persist_sync_disable` failure logged at debug only (Audit 2, L9)
**Why discarded:** Circuit breaker still works in-process. The persistence is a
nice-to-have supplement. `debug` vs `warning` is a style choice.

---

## Summary Statistics

- **Total findings across all audits:** 54
- **Verified:** 37
  - Critical: 0
  - High: 3
  - Medium: 12
  - Low: 22
- **Discarded as false positive:** 17
- **Duplicates merged:** 1 (Audit 1 biometric key + Audit 3 biometric key → single finding)

### Severity adjustments from original audits:
- M1 (offline conflict detection): Medium → Low (architectural feature gap, not a bug)
- M7 (stale device token cleanup): Medium → Low (cleaned reactively on first push)
- M5 (stale orval types): Medium → Low (one-command fix, no runtime impact)

### Effort breakdown:
- S (Small — hours): 30
- M (Medium — days): 5
- L (Large — weeks): 2
