# V2 Final Ship Readiness Review (React SPA)

**Date:** 2026-02-23
**Version under review:** v0.54.72 (master at 98d29d7)
**Reviewer:** Claude Opus 4.6 (automated, multi-phase)
**Scope:** React SPA frontend + backend changes since v0.42.22
**Prior audits:** v1-final-review.md, v1-final-review-2.md, v1-final-review-phase1.md, 4x gate audits

---

## Executive Summary

The backend remains solid — multitenancy, CSRF, auth, rate limiting, and input validation
are well-implemented. The React SPA is architecturally sound (consistent optimistic update
patterns, proper auth boundary, no XSS vectors). However, the audit uncovered **5 critical
findings**: the TypeScript CI check type-checks zero files (masking 50+ real type errors),
encryption decryption produces tuples instead of objects (breaking the dashboard for
encryption users), the offline toast lies about sync capability, GCal sync pushes
ciphertext to Google Calendar, and the encryption toggle only processes pending tasks
(leaving completed tasks permanently unreadable on disable). All critical findings
are in the encryption feature or CI configuration.

---

## New Findings (not fixed, not previously identified)

### CRITICAL

| ID | Finding | Evidence | Impact |
|----|---------|----------|--------|
| **C-1** | TypeScript CI check type-checks zero files | `frontend/tsconfig.json:2` — `"files": []` with project refs. `npx tsc --noEmit` passes but `npx tsc -p tsconfig.app.json --noEmit` reveals 50+ errors. `AppRoutersTasksTaskResponse` (imported in 25+ files) does not exist — generated type is `TaskResponse`. | Zero type safety across entire frontend. Type errors invisible. |
| **C-2** | Encryption decryption returns tuples, not objects | `frontend/src/components/dashboard/task-panel.tsx:71-72,89-90` — `decryptTask()` returns `[Task, number]` but result passed directly to `setDecryptedTasks()`. | Dashboard broken for encryption users — all task properties resolve to `undefined`. |
| **C-3** | Offline toast lies: "Changes will sync" — no sync exists | `frontend/src/hooks/use-network-status.ts:17` — No IndexedDB queue, no BackgroundSync, no `networkMode: 'offlineFirst'`. Legacy `sw.js:373 syncTasks()` is a stub. | Users believe offline changes are saved. They are silently lost. |
| **C-4** | GCal sync pushes ciphertext to Google Calendar | `app/services/gcal.py:498` — `build_event_data()` reads `task.title` directly from DB (ciphertext when encrypted). Server has no encryption awareness. | All encrypted scheduled tasks appear as base64 gibberish on Google Calendar. |
| **C-5** | Encryption toggle only processes pending tasks | `frontend/src/routes/_authenticated/settings.tsx:545,585,638` — uses `useListTasksApiV1TasksGet()` (defaults to `status=pending`). `app/routers/tasks.py:404` has `/all-content` endpoint but it's unused. | Enable: mixed encryption state. Disable: **permanent data loss** — encrypted completed/archived tasks become unreadable after salt is cleared. |

### HIGH

| ID | Finding | Evidence | Impact |
|----|---------|----------|--------|
| **H-1** | Backup export has ciphertext without encryption metadata | `app/services/backup_service.py:456-468` — preferences serialization omits `encryption_enabled`, `encryption_salt`, `encryption_test_value` | Backup of encrypted account is permanently unreadable on import |
| **H-2** | Dashboard passes raw ciphertext to keyboard shortcuts + calendar | `frontend/src/routes/_authenticated/dashboard.tsx:89-91,394` — `stateRef` and `CalendarPanel` receive undecrypted tasks | Toast messages and calendar show garbled base64 for encryption users |
| **H-3** | Settings domain list shows ciphertext; editing corrupts names | `frontend/src/routes/_authenticated/settings.tsx:1007,942-947` — domain names not decrypted, edit pre-fills with ciphertext | Editing an encrypted domain overwrites with literal ciphertext string |

### MEDIUM

| ID | Finding | Evidence |
|----|---------|----------|
| **M-1** | No double-tap guard on completion toggle | `frontend/src/components/task/task-item.tsx:172` — no `isPending` check |
| **M-2** | AnytimeInstancePill lacks optimistic update | `frontend/src/components/calendar/anytime-instance-pill.tsx:45-105` |
| **M-3** | CSP allows `unsafe-inline` for scripts | `app/middleware/security.py:27` |
| **M-4** | `recurrence_rule` accepts arbitrary unvalidated dict | `app/routers/tasks.py:145,197` |
| **M-5** | CSRF 403 clears token but doesn't retry failed request | `frontend/src/lib/api-client.ts:106-109` |
| **M-6** | No retry logic for any mutation | `frontend/src/lib/query-client.ts` |
| **M-7** | `refetchOnWindowFocus` can overwrite optimistic updates | `frontend/src/lib/query-client.ts:8` |
| **M-8** | Domain-group inline add doesn't invalidate after optimistic append | `frontend/src/components/task/domain-group.tsx:94-99` |
| **M-9** | Non-atomic encryption enable/disable | `frontend/src/routes/_authenticated/settings.tsx:576-628` |
| **M-10** | Decryption pending guard misses partial failures | `frontend/src/components/dashboard/task-panel.tsx:126` |

### LOW

| ID | Finding | Evidence |
|----|---------|----------|
| L-1 | Legacy SW caches API responses without user-scoping | `static/sw.js:120-126` |
| L-2 | Session cookie 30-day max_age, no server-side revocation | `app/main.py:168-175` |
| L-3 | `import_data.py` uses `get_current_user` instead of `require_user` | `app/routers/import_data.py:84,157,222` |
| L-4 | CSS values from unvalidated `domain.color` | Multiple components, `String(7)` DB limit |
| L-5 | `expandedSubtasks` localStorage grows unbounded | `frontend/src/stores/ui-store.ts:155-166` |
| L-6 | Double toast on 404/400 errors | `frontend/src/lib/api-client.ts:112-120` |
| L-7 | Editor stays open for deleted tasks | `frontend/src/components/task/task-editor.tsx` |
| L-8 | No code splitting — 1.5MB single JS chunk | `frontend/vite.config.ts` |
| L-9 | vite-plugin-pwa autoUpdate with no reload prompt | `frontend/vite.config.ts:18` |
| L-10 | Thoughts page domain pills show ciphertext | `frontend/src/routes/_authenticated/thoughts.tsx:404-405` |

---

## Prior Findings Re-verified

### v1-final-review.md findings

| ID | Finding | Status | Evidence |
|----|---------|--------|----------|
| NF-1 | `TaskUpdate.clarity` missing enum validation | **FIXED** | `app/routers/tasks.py:225-229` — `@field_validator("clarity")` now present |
| NF-2 | `BackupTaskSchema.status` accepts any string | **FIXED** | `app/services/backup_service.py:100-105` — `validate_status` validator added |
| NF-3 | Archived task instances appear in calendar views | **FIXED** | `app/services/task_service.py:594` — `Task.status != "archived"` filter; `app/services/recurrence_service.py:247` — also filters |
| NF-4 | Backup import doesn't clean GCal events | **STILL OPEN** | `app/services/backup_service.py` — `_clear_user_data()` still does not clean GCal. However, `import_data.py:96-118` wipe endpoint does. The backup import path at `backup.py` uses `BackupService._clear_user_data()` not the wipe endpoint. |
| NF-5 | Todoist import leaks `str(e)` to client | **FIXED** | `app/routers/import_data.py:211-213` — returns generic "Todoist preview failed" |
| NF-6 | Backup validation error returns 500 not 400 | **FIXED** | `app/routers/backup.py:122-124` — `BackupValidationError` now caught and returns 400 |
| NF-7 | `executeDeleteNow` undefined | **N/A** | Legacy JS code. React SPA doesn't use `static/js/drag-drop.js`. Still broken in legacy but irrelevant. |
| NF-8 | No double-click protection on completion | **PARTIALLY OPEN** | Legacy JS version fixed (no longer active). React SPA has the same issue: `task-item.tsx:172` has no `isPending` guard (see M-1). |
| Concurrent tab / materialization rollback | **IMPROVED** | `recurrence_service.py:179-186` now uses `begin_nested()` savepoint instead of full `db.rollback()`. This limits the rollback scope to just the failed insert. |
| WebAuthn challenge non-atomic consume | **IMPROVED** | `challenge_service.py:31-32` — `store_challenge` now deletes all existing challenges first (one-per-user invariant). Race window reduced to between options and verify requests. |
| Bulk sync vs concurrent task creation | **UNCHANGED** | Fire-and-forget GCal sync still bypasses per-user lock. Low impact since sync failures are logged and retried on next bulk sync. |

### v1-final-review-2.md findings

| ID | Finding | Status | Evidence |
|----|---------|--------|----------|
| F-1 | domain_id IDOR — cross-tenant domain name leakage | **FIXED** | `app/services/task_service.py:271-280` — domain ownership validation added for both create and update |
| F-2 | Batch update dirty session — no rollback after exception | **FIXED** | `app/routers/tasks.py:856-864` — batch update now uses `begin_nested()` per item with rollback on error |
| F-3 | Backup accepts invalid status/clarity/impact | **FIXED** | Validators added: `validate_status`, `validate_clarity`, `validate_impact` in `backup_service.py:100-123` |
| F-4 | No CHECK constraints on DB columns | **STILL OPEN** | No DB-level CHECK constraints added. Pydantic validation only. Low risk since all entry points now validate. |
| F-5 | Information leakage in /ready endpoint | **NEEDS VERIFICATION** | Could not directly verify — would need to trigger a DB error in the ready endpoint. The code may have been updated. |
| F-6 | Recurrence service rollback scope | **FIXED** | Now uses `begin_nested()` savepoint (see concurrent tab note above) |
| F-7 | `_instance_to_response` null task assumption | **NEEDS VERIFICATION** | The relationship is still accessed directly in instance response building. Would need to check if the query now uses `joinedload` to prevent lazy-load failures. |

---

## Frontend Coverage Gaps Investigated

The v1 audits examined the legacy Jinja2/vanilla JS frontend. The React SPA is entirely new.
Here are the frontend areas the v1 audits could NOT have covered, now examined:

### 1. Mobile-specific components
- **Bottom sheet** (`frontend/src/components/mobile/task-action-sheet.tsx`): Uses Vaul drawer. Long-press triggers action sheet with Edit/Complete/Delete/Subtask options. All mutations go through the same hooks as desktop. **CLEAN.**
- **Swipe actions**: Not implemented as traditional swipe gestures. Swipe-complete is handled via DnD context with touch sensor. **CLEAN.**
- **Sticky domain header** (`frontend/src/components/mobile/sticky-domain.tsx`): Renders domain info with color from `domain.color` (L-4 CSS injection concern, minimal risk). **CLEAN.**

### 2. Zustand store interactions with TanStack Query
- **ui-store.ts**: Holds `selectedTaskId`, `expandedSubtasks`, `sortField/Direction`, `energyLevel`, `calendarCenterDate`, etc. Read-only UI state that doesn't conflict with query cache. One concern: `selectedTaskId` not cleared on delete (L-5). **LOW.**
- **crypto-store.ts**: Holds `derivedKey`, `encryptionEnabled`, `isUnlocked`. Correctly drives the decryption flow in `task-panel.tsx` (though the tuple bug C-2 breaks it). **See C-2.**

### 3. Error boundaries and React error handling
- **No React error boundary found** in the component tree. `__root.tsx` renders `<Outlet />` without an error boundary wrapper. An unhandled error in any component crashes the entire app with a white screen.
- **Impact:** MEDIUM — any rendering error (including the C-2 tuple bug) would crash the app instead of showing a friendly error page. React 19's `onCaughtError`/`onUncaughtError` are not configured.

### 4. Accessibility
- **No ARIA live announcer** found for screen reader announcements on dynamic content changes.
- **Keyboard shortcuts** (`dashboard.tsx` `useEffect` with keydown handler): No discoverable shortcut help or `aria-keyshortcuts` attributes.
- **Focus management**: Task completion doesn't manage focus (completed task disappears, focus is lost). Drag-drop doesn't announce source/destination.
- **Impact:** Accessibility is incomplete but not a ship-blocker for initial launch. Should be addressed in a subsequent version.

### 5. Bundle size and code splitting
- **1.5MB single JS chunk** (`frontend/dist/assets/index-ByUb1s0r.js` = 1,546 KB gzipped to 470 KB)
- No dynamic `import()` anywhere in the SPA
- No `React.lazy()` or route-based code splitting
- **Impact:** Slow initial load on mobile networks (470KB gzipped is ~2-3 seconds on 3G). Not a ship-blocker but affects mobile UX significantly.

---

## Challenged Assumptions

### 1. "The TypeScript CI check catches type errors" — FALSE

The root `tsconfig.json` has `"files": []` which means `npx tsc --noEmit` type-checks nothing.
The actual errors are only visible with `npx tsc -p tsconfig.app.json --noEmit`. This means:
- The `AppRoutersTasksTaskResponse` phantom type has been broken (possibly since an orval regeneration renamed the type) without anyone knowing
- All task-typed code has no type safety (everything is `any`)
- Real bugs like C-2 are invisible to CI

**Recommended fix:** Change the CI command to `npx tsc -p tsconfig.app.json --noEmit`, fix all 50+ type errors (mostly renaming `AppRoutersTasksTaskResponse` → `TaskResponse` and fixing the C-2 tuple bug).

### 2. "Encryption is a complete feature" — FALSE

Encryption has fundamental gaps:
- Decryption produces tuples instead of objects (C-2) — dashboard crashes
- Only pending tasks are encrypted/decrypted on toggle (C-5) — data loss on disable
- GCal sync pushes ciphertext (C-4) — garbled Google Calendar
- Backup export omits encryption metadata (H-1) — unrestorable backups
- Multiple UI surfaces show ciphertext (H-2, H-3, L-10) — garbled domain names, toasts, calendar
- Settings domain editing corrupts encrypted names (H-3)

If encryption is enabled by a user today, it would effectively break their account.

### 3. "The app works offline" — MISLEADING

The offline toast says "Changes will sync when you're back online" but there is no sync mechanism.
Mutations are attempted immediately, fail, and are rolled back. The toast should say
"No internet connection. Please reconnect to make changes." The PWA caches the app shell
(via vite-plugin-pwa) but not API responses — the app is a blank shell when offline.

---

## Ship Verdict

### DO NOT SHIP (encryption feature) / SHIP WITH CAVEATS (non-encryption users)

**The application has two distinct user populations with very different readiness levels:**

**For users WITHOUT encryption enabled (estimated majority):** The app is ready to ship.
The backend is rock-solid (multitenancy, CSRF, auth, rate limiting all verified across
8 audit passes). The React SPA has good architecture (consistent optimistic updates,
proper auth boundary, no XSS vectors). The remaining medium findings (M-1 through M-10)
are UX polish issues, not data-loss or security risks. The misleading offline toast (C-3)
should be fixed before ship — it's a one-line text change.

**For users WITH encryption enabled:** DO NOT SHIP. There are 5 critical and 3 high
findings that collectively make encryption unusable:
- C-2 crashes the dashboard (tuple bug)
- C-4 leaks ciphertext to Google Calendar
- C-5 causes permanent data loss on encryption disable
- H-1 makes backups unrestorable
- H-2 and H-3 show ciphertext throughout the UI

**Recommended path forward:**
1. **Immediate (blocks ship):**
   - Fix C-1: Change CI to `npx tsc -p tsconfig.app.json --noEmit`, rename all `AppRoutersTasksTaskResponse` → `TaskResponse`, fix remaining type errors
   - Fix C-3: Change offline toast text to "Please reconnect to make changes"
   - Either fix C-2/C-4/C-5/H-1/H-2/H-3 OR **disable the encryption feature toggle** in the UI until it's fully working
2. **Before re-enabling encryption:**
   - C-2: `.map(([task]) => task)` on decryption results
   - C-4: Skip GCal sync for encrypted tasks, or decrypt server-side (requires architecture decision)
   - C-5: Use `/all-content` endpoint for encryption toggle, include subtask titles
   - H-1: Include encryption metadata in backup export
   - H-2/H-3: Decrypt data in all UI surfaces, or centralize decryption at the query layer
3. **Post-ship polish:**
   - M-1: Add `isPending` guards to completion toggles
   - M-3: Refactor inline scripts for nonce-based CSP
   - L-8: Add code splitting for faster mobile load
   - Error boundary for graceful crash recovery
