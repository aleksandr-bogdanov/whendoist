# V2 Ship Readiness Review — Phase 1: Independent Investigation

**Date:** 2026-02-23
**Version under review:** v0.54.72
**Reviewer:** Claude Opus 4.6 (automated)
**Scope:** React SPA frontend + backend changes since v0.42.22

## CI Baseline

- **Backend:** 454 tests pass, ruff format/check clean, pyright clean (sentry_sdk warnings pre-existing)
- **Frontend:** `npx tsc --noEmit` passes, `npx biome check .` clean, `npm run build` succeeds
- **Build warning:** Single 1.5MB JS chunk (no code splitting)

---

## CRITICAL FINDINGS

### C-1: TypeScript CI check is not type-checking source code

- **Severity:** CRITICAL
- **Evidence:** `npx tsc --noEmit` uses root `tsconfig.json` which has `"files": []` with project references. This command type-checks zero files. Running the correct `npx tsc -p tsconfig.app.json --noEmit` reveals **50+ type errors**.
- **Root cause:** `frontend/tsconfig.json:2` — `"files": []` with no `include` means the root config contains no files to check. The CI command should be `npx tsc -p tsconfig.app.json --noEmit` or `npx tsc --build --noEmit`.
- **Cascade:** The most widespread error is `AppRoutersTasksTaskResponse` — a type imported in 25+ files from `@/api/model`, but this type **does not exist**. The orval-generated type is `TaskResponse` (exported from `frontend/src/api/model/taskResponse.ts`). Every file using this phantom type has all task-typed variables silently resolved to `any`, disabling all type safety.
- **Impact:** Zero type safety on task-related code throughout the entire frontend. Type errors that would catch real bugs (like C-2 below) are invisible.

### C-2: Encryption decryption produces tuples, not task/domain objects

- **Severity:** CRITICAL (encryption users only)
- **Files:**
  - `frontend/src/components/dashboard/task-panel.tsx:71-72` (tasks)
  - `frontend/src/components/dashboard/task-panel.tsx:89-90` (domains)
  - `frontend/src/hooks/use-crypto.ts:40,78` (return types)
- **Evidence:** `decryptTask()` returns `Promise<[TaskResponse, number]>` (tuple). `task-panel.tsx:71` does:
  ```typescript
  Promise.all(tasks.map((t) => decryptTask(t, derivedKey))).then((result) => {
    if (!cancelled) setDecryptedTasks(result);
  });
  ```
  `result` is `[TaskResponse, number][]` but `setDecryptedTasks` expects `TaskResponse[]`. TypeScript doesn't catch this because (a) the broken CI check and (b) `AppRoutersTasksTaskResponse` resolves to `any`.
  Running `npx tsc -p tsconfig.app.json --noEmit` confirms: `error TS2345: Argument of type '[DomainResponse, number][]' is not assignable to parameter of type 'SetStateAction<DomainResponse[]>'`.
- **Impact:** When encryption is enabled, `decryptedTasks` state contains `[TaskObj, number]` tuples. `decryptedTasks.filter((t) => t.domain_id !== null)` always passes (tuples don't have `domain_id`, so it's `undefined !== null` → true). Components receiving these "tasks" would get `undefined` for `task.title`, `task.id`, etc. **The entire dashboard would be broken for encryption users.**
- **Fix:** `setDecryptedTasks(result.map(([task]) => task))` and same for domains.

### C-3: Misleading "Changes will sync" offline toast — no sync exists

- **Severity:** CRITICAL
- **File:** `frontend/src/hooks/use-network-status.ts:17`
- **Evidence:** Toast says `"Changes will sync when you're back online."` but:
  - No IndexedDB offline mutation queue exists (grep for `indexedDB`, `localforage`, `idb` = zero results in SPA)
  - No `networkMode: 'offlineFirst'` in TanStack Query config (`frontend/src/lib/query-client.ts`)
  - No BackgroundSync registration anywhere in the SPA
  - Legacy `static/sw.js:373` `syncTasks()` is a stub: `console.log('[SW] Syncing tasks...')`
- **Impact:** Users who go offline and attempt any action believe changes are queued. They are not. All offline mutations fail silently (after optimistic update flash + rollback). Users return to find no changes saved.

### C-4: GCal sync pushes ciphertext to Google Calendar

- **Severity:** CRITICAL (encryption + GCal users)
- **Files:**
  - `app/services/gcal_sync.py:197-198,219-220,303-304,325-326,539-540,558-559,600-601,657-658,675-676,716-717`
  - `app/services/gcal.py:475-521` (`build_event_data`)
- **Evidence:** `build_event_data()` at `gcal.py:498` creates `summary = f"✓ {title}" if is_completed else title` directly from `task.title` in the database. When encryption is enabled, `task.title` is base64 ciphertext. The server has no concept of client-side encryption.
- **Impact:** All scheduled tasks with encryption enabled appear on Google Calendar as base64 strings like `a8fD3kL+/92jfn...`. Ciphertext is exposed to Google. Terrible UX.

### C-5: Encryption toggle only processes pending top-level tasks

- **Severity:** CRITICAL (encryption users)
- **Files:**
  - `frontend/src/routes/_authenticated/settings.tsx:545` — `useListTasksApiV1TasksGet()` with no params
  - `app/routers/tasks.py:346` — default `status: str = Query("pending")`
  - `app/routers/tasks.py:404` — `/all-content` endpoint exists but is NOT used
- **Evidence:** Enable encryption uses `tasksQuery.data` which fetches only `status=pending` tasks (the API default). Completed, archived, and scheduled-completed tasks are NOT encrypted. Subtask titles nested in parent responses are also not encrypted (the code at settings.tsx:595-599 only maps top-level `t.id, t.title, t.description`).
- **Impact on enable:** Mixed encryption state — some tasks encrypted, some plaintext, while server says `encryption_enabled=true`.
- **Impact on disable (WORSE):** `handleDisable` at line 631-678 uses the same query. Encrypted completed/archived tasks remain as ciphertext. Then `disableMutation.mutateAsync()` at line 662 clears the salt and test_value from the server. **Those encrypted tasks become permanently unreadable** — the passphrase verification data is gone.

---

## HIGH FINDINGS

### H-1: Backup export includes ciphertext without encryption metadata

- **Severity:** HIGH
- **Files:**
  - `app/services/backup_service.py:189-215,423-446,456-468`
- **Evidence:** Backup export serializes `task.title` and `task.description` as-is (ciphertext when encrypted). The preferences serialization at line 456-468 does NOT include `encryption_enabled`, `encryption_salt`, or `encryption_test_value`.
- **Impact:** Backup of an encrypted account exports unreadable ciphertext with no metadata to know it's encrypted or derive the key. Importing to a new account populates the DB with permanent gibberish.

### H-2: Encrypted ciphertext shown in keyboard shortcuts and calendar panel

- **Severity:** HIGH (encryption users)
- **Files:**
  - `frontend/src/routes/_authenticated/dashboard.tsx:89-91,188-192,207-209,247,261,394`
- **Evidence:** Dashboard passes raw `tasks` (not decrypted) to `stateRef` and `CalendarPanel`. Keyboard shortcuts "c" (complete), "e" (edit), "Enter" (edit), "x" (delete) display `task.title` from the unencrypted cache. Calendar panel renders unencrypted task titles.
- **Impact:** Even if C-2 were fixed, the dashboard passes raw API data (ciphertext) to keyboard handlers and calendar. Users with encryption see garbled titles in toasts and calendar.

### H-3: Settings domain list shows ciphertext; editing corrupts domain names

- **Severity:** HIGH (encryption users)
- **Files:**
  - `frontend/src/routes/_authenticated/settings.tsx:1007` — `{d.name}` rendered directly
  - `frontend/src/routes/_authenticated/settings.tsx:942-947` — `startEditing` pre-fills with ciphertext
- **Evidence:** Domain list in settings is NOT decrypted. Editing a domain pre-fills the form with ciphertext as the name, so saving would overwrite the encrypted name with the ciphertext string literally.
- **Impact:** Domain names appear garbled; editing overwrites encrypted name with the literal ciphertext string.

---

## MEDIUM FINDINGS

### M-1: No double-tap protection on task/instance completion

- **Severity:** MEDIUM
- **Files:**
  - `frontend/src/components/task/task-item.tsx:172-223` — `handleToggleComplete` does not check `isPending`
  - `frontend/src/components/calendar/anytime-instance-pill.tsx:45-105` — no `isPending` guard
- **Evidence:** Rapid double-tap fires two concurrent mutations for the same task. Second mutation captures wrong `previousTasks` snapshot. Two success toasts appear.
- **Impact:** Confusing UX; potential inconsistent state during the race window (self-heals on refetch).

### M-2: AnytimeInstancePill lacks optimistic update

- **Severity:** MEDIUM
- **File:** `frontend/src/components/calendar/anytime-instance-pill.tsx:45-105`
- **Evidence:** Unlike `InstanceCard` in `day-column.tsx` (which does optimistic updates), `AnytimeInstancePill` calls `completeInstance.mutate()` directly with no cache update. No visual feedback until server responds.
- **Impact:** On slow connections, no immediate response to clicking complete/skip on anytime instances.

### M-3: CSP allows `unsafe-inline` for scripts

- **Severity:** MEDIUM
- **File:** `app/middleware/security.py:27` — `script-src 'self' 'unsafe-inline'`
- **Evidence:** Two inline `<script>` blocks in `frontend/index.html` (pinch-zoom prevention, iOS viewport fix) require `unsafe-inline`. Comment at line 23-24 acknowledges this.
- **Impact:** If XSS is found in the future, `unsafe-inline` prevents CSP from blocking it.

### M-4: `recurrence_rule` accepts arbitrary unvalidated dict

- **Severity:** MEDIUM
- **Files:** `app/routers/tasks.py:145,197`
- **Evidence:** `recurrence_rule: dict | None` with no schema validation. Client can store any JSON object.
- **Impact:** Storage abuse (arbitrary JSON persisted), potential unexpected frontend behavior from unknown keys.

### M-5: CSRF 403 clears token but doesn't retry the failed request

- **Severity:** MEDIUM
- **File:** `frontend/src/lib/api-client.ts:106-109`
- **Evidence:** On 403, `csrfToken = null` and `Promise.reject(new CSRFError(...))`. The current mutation is lost; user must retry manually.
- **Impact:** First mutation after CSRF token expiry silently fails.

### M-6: No retry logic for any mutation

- **Severity:** MEDIUM
- **File:** `frontend/src/lib/query-client.ts` — no `retry` configured for mutations
- **Evidence:** Default TanStack Query mutation retry is 0. No `persistQueryClient`, no `networkMode: "offlineFirst"`.
- **Impact:** Every mutation failure is one-shot. Transient network errors require manual retry.

### M-7: `refetchOnWindowFocus` can overwrite optimistic updates

- **Severity:** MEDIUM
- **File:** `frontend/src/lib/query-client.ts:8`
- **Evidence:** `refetchOnWindowFocus: true` with `staleTime: 30000`. Alt-tab during an in-flight mutation overwrites optimistic state with stale server state. Self-heals on mutation success.
- **Impact:** Brief visual jump-back of tasks during tab switches.

### M-8: Domain-group inline add doesn't invalidate cache after optimistic append

- **Severity:** MEDIUM
- **File:** `frontend/src/components/task/domain-group.tsx:94-99`
- **Evidence:** Uses `setQueryData` to append task, but never calls `invalidateQueries`. Server sort order is not applied until next background refetch.
- **Impact:** Temporary incorrect task sort order after inline creation.

### M-9: Non-atomic encryption enable/disable

- **Severity:** MEDIUM
- **File:** `frontend/src/routes/_authenticated/settings.tsx:576-628`
- **Evidence:** Enable flow: (1) setup on server, (2) batch encrypt tasks, (3) batch encrypt domains. Failure between steps leaves partial encryption. The `looksEncrypted()` check makes retry idempotent, mitigating this.
- **Impact:** Partial encryption state possible on failure, but retryable.

### M-10: Decryption pending guard doesn't catch partial failures

- **Severity:** MEDIUM
- **File:** `frontend/src/components/dashboard/task-panel.tsx:126`
- **Evidence:** `const decryptionPending = canDecrypt && (tasks?.length ?? 0) > 0 && decryptedTasks.length === 0`. If decryption partially fails (wrong key), `decryptedTasks.length > 0` (containing original encrypted strings) and the guard won't trigger.
- **Impact:** Ciphertext displayed without loading guard on wrong passphrase.

---

## LOW FINDINGS

### L-1: Legacy service worker caches API responses without user-scoping
- **File:** `static/sw.js:120-126` — Network-first cache for `/api/` responses, not cleared on logout
- **Impact:** On shared devices, previous user's cached data may briefly appear

### L-2: Session cookie 30-day max_age with no server-side revocation
- **File:** `app/main.py:168-175` — `max_age=60*60*24*30`, Starlette signed cookies
- **Impact:** Stolen cookies valid for 30 days; no server-side session store to revoke

### L-3: `import_data.py` uses `get_current_user` instead of `require_user`
- **File:** `app/routers/import_data.py:27,84,157,222` — manual None check instead of dependency
- **Impact:** Inconsistent pattern, risk of future omission

### L-4: CSS injection via unvalidated `domain.color`
- **Files:** Multiple components use `style={{ backgroundColor: d.color }}`, backend `String(7)` with no format validation
- **Impact:** Minimal — React DOM API prevents attribute breakout, 7-char DB limit

### L-5: Expandable subtasks localStorage grows unbounded
- **File:** `frontend/src/stores/ui-store.ts:155-166`
- **Impact:** Deleted task IDs remain in `expandedSubtasks` Set forever

### L-6: Double toast on 404/400 errors
- **File:** `frontend/src/lib/api-client.ts:112-120` — global interceptor + mutation onError both show toasts
- **Impact:** User sees two error messages for one error

### L-7: Editor stays open for deleted tasks
- **File:** `frontend/src/components/task/task-editor.tsx`
- **Impact:** Saving shows 404 error; no data corruption

### L-8: No code splitting — 1.5MB single JS chunk
- **File:** `frontend/vite.config.ts` — no `manualChunks` or dynamic imports
- **Impact:** Slow initial load, especially on mobile networks

### L-9: vite-plugin-pwa `autoUpdate` with no reload prompt
- **File:** `frontend/vite.config.ts:18` — `registerType: "autoUpdate"`, no `onNeedRefresh` handler
- **Impact:** Users may run stale frontend code after deploys

### L-10: Dead code in DnD `getOverType`
- **File:** `frontend/src/components/task/task-dnd-context.tsx:213`
- **Impact:** None — unreachable but harmless

### L-11: Thoughts page domain promote pills show ciphertext
- **File:** `frontend/src/routes/_authenticated/thoughts.tsx:404-405`
- **Impact:** Minor garbled domain names in promote buttons (encryption users only)

---

## AREAS INVESTIGATED AND FOUND CLEAN

### Authentication & Authorization
- Auth guard (`_authenticated.tsx`) correctly checks `/api/v1/me` and redirects on 401
- Global 401 interceptor with deduplication (`isRedirecting` guard)
- All API calls use `withCredentials: true` authenticated Axios instance
- OAuth state signed with `itsdangerous.URLSafeTimedSerializer`, 600s TTL, verified on callback
- Session cookie: HttpOnly, SameSite=Lax, Secure in prod
- CSRF: Synchronizer Token Pattern, `secrets.compare_digest` timing-safe comparison
- Rate limiting on all sensitive endpoints

### Multitenancy
- Every service query filters by `user_id`
- Subtask operations validate parent ownership via `get_task(parent_id)`
- Batch operations skip unowned IDs silently
- Instance queries JOIN through Task for user_id filtering

### XSS & Injection
- Zero uses of `dangerouslySetInnerHTML` in the SPA
- Zero uses of `eval()`, `Function()`, `document.write()`
- No markdown renderers or rich text editors accepting raw HTML
- All `href`/`window.open()` targets are hardcoded strings, not user data
- All URL parameters/route params are not rendered directly
- CSP with `frame-ancestors 'none'`, `X-Frame-Options: DENY`, HSTS

### Backend Data Integrity
- Pydantic schemas validate clarity, status, impact, string lengths
- Backup import validates entire backup before mutations, uses savepoints
- Task delete is soft-delete (archive) with recursive subtask archival
- Recurring task instance cascade on task deletion via SQLAlchemy ORM
- GCal sync has per-user locking, cancellation support

### Optimistic Update Patterns
- Consistent capture → optimistic update → mutate → onError rollback → onSuccess invalidate
- React keys properly managed across all lists (entity IDs, not indices)
- DnD operations (drag-to-reschedule, reparent, promote, unschedule) all follow the pattern

### Crypto Primitives
- AES-256-GCM with random 12-byte IV, PBKDF2 600k iterations SHA-256
- Key stored in sessionStorage (cleared on tab close), extractable: true for persistence
- Passphrase verification via test value encryption/decryption
- Unlock dialog blocks all interaction until correct passphrase

---

# Phase 2: Adversarial Scenarios

## Attacker Scenarios

### A-1: Cross-user data access via API endpoints
**Verdict: NOT VULNERABLE**

Every data-access endpoint uses `Depends(require_user)` which extracts `user_id` from the session. Every service query filters by `user_id`. Subtask creation validates parent ownership. Batch operations skip unowned IDs. The new subtask endpoints are properly guarded.

Specific checks:
- `TaskService.__init__` takes `user_id`, all queries use `Task.user_id == self.user_id`
- `RecurrenceService` instance queries JOIN through Task for user_id
- `PasskeyService` filters all queries by `user_id`
- Domain operations filter by `user_id`

### A-2: Session cookie exploitation
**Verdict: PARTIALLY VULNERABLE (L-2)**

With a valid session cookie, an attacker can access all of the user's data through the SPA. There is no re-authentication for destructive operations (delete all, disable encryption, wipe data). The cookie is valid for 30 days with no server-side revocation.

However, encryption provides defense-in-depth: encrypted task content is unreadable without the passphrase (key is in sessionStorage, not the cookie). But the attacker could disable encryption via the settings page if the encryption key is also in the same browser's sessionStorage.

### A-3: XSS via malicious task title/description/URL
**Verdict: NOT VULNERABLE**

React's JSX auto-escaping prevents XSS from stored payloads. No `dangerouslySetInnerHTML`, no raw HTML rendering. Domain `color` field goes through React's DOM API (not innerHTML). All URLs are hardcoded. CSP adds defense-in-depth (though `unsafe-inline` weakens it).

### A-4: TanStack Query cache manipulation via devtools
**Verdict: LOW RISK**

An attacker could modify the local cache via devtools to display fabricated data. However, mutations still go through the authenticated API with proper CSRF tokens. The cache is local to the browser — there's no way to trick the server into accepting another user's data. On next refetch (staleTime: 30s, or window focus), the cache is overwritten with server data.

### A-5: API request replay
**Verdict: MOSTLY SAFE**

- **Task create:** Replay creates a duplicate task. No idempotency key. LOW risk — user just deletes the duplicate.
- **Task delete:** Replay on already-archived task returns 404. SAFE.
- **Task complete:** Toggle endpoint — replay toggles back to incomplete. MEDIUM risk on recurring instances (could skip/unskip).
- **Task update:** Replay applies the same update again. SAFE (idempotent).
- **Encryption toggle:** Re-enabling encryption when already enabled just re-encrypts (idempotent due to `looksEncrypted` check).

## Frustrated User Scenarios

### F-1: Dismiss passphrase prompt with encryption enabled
**Verdict: SAFE**

The encryption unlock dialog at `frontend/src/components/encryption-unlock.tsx:80-81` prevents dismissal: `onInteractOutside={(e) => e.preventDefault()}` and `onEscapeKeyDown={(e) => e.preventDefault()}`. The user is blocked until they enter the correct passphrase. They cannot see garbled data or accidentally overwrite encrypted data with plaintext.

### F-2: Double-tap complete + undo on slow connection
**Verdict: INCONSISTENT STATE POSSIBLE (M-1)**

1. First tap: optimistic update marks task complete, API call fires
2. Second tap: same handler fires again with same `isCompleted` value (from same render), so same API call fires
3. First toast appears with undo button
4. User taps undo → calls `uncompleteTask.mutate()`
5. Meanwhile, second API call completes → second toast appears
6. Final state depends on race: if undo reaches server before second complete, task ends up completed (second complete wins). If undo reaches server after both completes, task is uncompleted.
7. Eventually, `invalidateQueries` resolves to the true server state.

No data loss, but confusing UX with multiple toasts and a flickering checkbox.

### F-3: 200 recurring tasks + calendar view performance
**Verdict: POTENTIAL PERFORMANCE ISSUE**

The instance listing endpoint at `app/services/recurrence_service.py:245` fetches instances for a date range with a single query. With 200 recurring tasks, materialization runs per-task. The `materialize_instances` method at line 132-209 does one DB round-trip per task (checking existing instances, creating missing ones). With 200 tasks × 7 days = up to 1400 instances to check/create.

On the frontend, `CalendarPanel` receives all tasks + instances and renders them. No virtualization is used for the calendar day columns. With 200 tasks showing instances across 7 days, render performance could degrade.

### F-4: Accidental drag-drop reschedule — undo availability
**Verdict: SAFE**

All drag-drop operations show a toast with an undo button. The undo fires an API call to reverse the change. If the user closes the app before undoing, the reschedule is persisted — no undo possible after that. This is the expected behavior (same as any other save).

### F-5: Backup export/import with encryption
**Verdict: DATA LOSS RISK (H-1)**

- Export: Backup contains ciphertext for encrypted fields, but no encryption metadata (salt, test_value, encryption_enabled flag).
- Import to new device: Ciphertext data imported as-is. No way to re-derive the key. Data is permanently garbled.
- Passkeys: WebAuthn credentials are device-bound and not included in backup. They would need to be re-registered.
- GCal sync: Not preserved in backup (OAuth tokens not exported, correctly).

### F-6: iOS PWA app-switch and return
**Verdict: SAFE**

- Viewport: `--app-height` is set from `screen.height` via inline script in `<head>`, with `orientationchange` listener. The three iOS viewport bug triggers are properly avoided (no `overflow:hidden` on html/body, no `position:fixed` on containers, no `100dvh`).
- Session: Cookie-based with 30-day max_age. Survives app backgrounding. The SPA re-renders from cached TanStack Query data, then background-refetches.
- Only risk: if backgrounded for >30 minutes, `staleTime: 30000` means data is stale and refetch fires. This is correct behavior.
