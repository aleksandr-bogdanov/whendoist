щлфн# V4 Final Ship Readiness Review

**Date:** 2026-02-24
**Version under review:** v0.54.83 (commit 1558eef)
**Reviewer:** Claude Opus 4.6 (automated, multi-phase)
**Scope:** Full re-audit of all v2/v3 findings + 10 fresh adversarial investigation traces
**Prior audits:** v2-final-review.md (v0.54.72), v2-final-review-phase1.md, v3-final-review.md (v0.54.82)
**Fix PRs reviewed:** #463 through #471 (9 PRs total)

---

## Executive Summary

All pre-flight checks pass (454 tests, ruff, pyright, tsc, biome, build). The two remaining
issues from v3 (CI TypeScript command, analytics ciphertext) are now **fully resolved**. All 31
findings from v2/v3 have been re-verified with zero regressions.

Ten adversarial investigation traces found **no new critical or high-severity issues**. The
codebase demonstrates strong discipline in multitenancy (100% user_id filtering), encryption
completeness (all UI surfaces decrypt), GCal sync integrity (hash-based idempotency, adaptive
throttling, auto-disable on error), and PWA compliance (no viewport-shrinking patterns).

New findings are limited to **medium/low** severity items:
- Batch update schemas (encryption toggle) lack field-level validators (mitigated by DB constraints)
- Backup/restore doesn't preserve OAuth tokens or passkeys (documented limitation)
- Rate limit countdown interval isn't cleared on navigation (cosmetic)

**Verdict: SHIP.** No blocking issues remain.

---

## Pre-Flight Results

```
Backend:  454 tests passed, ruff format/check clean, pyright clean (0 errors)
Frontend: npx tsc -p tsconfig.app.json --noEmit — CLEAN (0 errors)
          npx biome check . — CLEAN (0 issues)
          npm run build — SUCCESS (26 precache entries)
```

Build output:
```
index-CdxQMkWa.js        350.30 KB │ gzip: 102.91 KB
recharts-DSt7kAzn.js     374.78 KB │ gzip: 110.02 KB
react-dom-DigteULN.js    207.32 KB │ gzip:  66.21 KB
motion-CO5Oi_GC.js       122.48 KB │ gzip:  40.31 KB
radix-CUa7Je1b.js        117.18 KB │ gzip:  32.85 KB
+ 21 smaller chunks
```

---

## Phase 1: Verify the 2 Fixes from V3

| # | Issue | Status | Evidence |
|---|-------|--------|----------|
| 1 | CI TypeScript command must use `npx tsc -p tsconfig.app.json --noEmit` | **FIXED** | `.github/workflows/ci.yml:153` — exact command confirmed |
| 2 | Analytics page must decrypt task titles and domain names for encryption users | **FIXED** | `analytics.lazy.tsx:19-20` imports `decrypt`, `looksEncrypted` from crypto lib. Lines 39-67: recurring titles decrypted via useEffect. Lines 69-98: domain names decrypted. Lines 254-299: `RecentCompletions` component decrypts both `title` and `domain_name`. All three analytics surfaces (recurring list, domain breakdown, recent completions) pass decrypted data to child components at lines 163, 173, 311-323. |

---

## Phase 2: V2/V3 Finding Re-Verification (0 Regressions)

### Critical Findings (5)

| ID | Finding | Status | Evidence |
|----|---------|--------|----------|
| C-1 | CI TypeScript command | **FIXED** | `.github/workflows/ci.yml:153` — `npx tsc -p tsconfig.app.json --noEmit` |
| C-2 | Encryption decryption returns tuples | **STILL FIXED** | `task-panel.tsx:77` — `result.map(([t]) => t)` correctly unpacks |
| C-3 | Offline toast lies about sync | **STILL FIXED** | `use-network-status.ts:14-18` — honest "No internet" message |
| C-4 | GCal sync pushes ciphertext | **STILL FIXED** | `gcal_sync.py:189-190,299-300,548,668` — `GCAL_SYNC_ENCRYPTED_PLACEHOLDER` |
| C-5 | Encryption toggle only processes pending | **STILL FIXED** | `tasks.py:445` — `status=None, top_level_only=False` |

### High Findings (3)

| ID | Finding | Status | Evidence |
|----|---------|--------|----------|
| H-1 | Backup missing encryption metadata | **STILL FIXED** | `backup_service.py:162-165,501-503` — salt, test_value, enabled exported |
| H-2 | Dashboard passes ciphertext to shortcuts/calendar | **STILL FIXED** | `task-panel.tsx:75-77` — decrypts before passing |
| H-3 | Settings domain list shows ciphertext | **STILL FIXED** | `settings.lazy.tsx:889-907` — `decryptedNameMap` used |

### Medium Findings (10)

| ID | Finding | Status | Evidence |
|----|---------|--------|----------|
| M-1 | No double-tap guard on completion | **STILL FIXED** | `task-item.tsx:177` — `isCompletePending` guard |
| M-2 | AnytimeInstancePill no optimistic update | **STILL FIXED** | `anytime-instance-pill.tsx:49-53` — `setQueryData` optimistic |
| M-3 | CSP allows `unsafe-inline` for scripts | **STILL FIXED** | `security.py:22-31` — nonce-based CSP |
| M-4 | `recurrence_rule` accepts arbitrary dict | **STILL FIXED** | `tasks.py:136-156` — `RecurrenceRuleSchema` with `extra="forbid"` |
| M-5 | CSRF 403 doesn't retry | **STILL FIXED** | `api-client.ts:106-113` — retry with `_csrfRetried` flag |
| M-6 | No retry logic for mutations | **STILL FIXED** | `query-client.ts:7` — `retry: 1` |
| M-7 | `refetchOnWindowFocus` overwrites optimistic | **STILL FIXED** | `query-client.ts:8` — `refetchOnWindowFocus: false` |
| M-8 | Domain-group inline add no cache invalidation | **STILL FIXED** | `domain-group.tsx:96-98` — `setQueryData` on success |
| M-9 | Non-atomic encryption enable/disable | **ACCEPTED** | Intentional design; reverse order would leave data unreadable |
| M-10 | Decryption guard misses partial failures | **STILL FIXED** | `task-panel.tsx:133` — `decryptionComplete` flag |

### Low Findings (10)

| ID | Finding | Status | Evidence |
|----|---------|--------|----------|
| L-1 | Legacy SW caches without user scoping | **ACCEPTED** | Legacy frontend disabled in prod |
| L-2 | 30-day session, no server revocation | **ACCEPTED** | Starlette limitation |
| L-3 | `import_data.py` uses wrong auth dep | **STILL FIXED** | `import_data.py:27,84,155,218` — all `require_user` |
| L-4 | CSS injection via domain color | **STILL FIXED** | `domains.py:58-63` — hex regex validation |
| L-5 | `expandedSubtasks` grows unbounded | **STILL FIXED** | `ui-store.ts:111-112` — cap at 100 |
| L-6 | Double toast on 400/404 | **STILL FIXED** | `api-client.ts:119-126` — typed errors, no interceptor toast |
| L-7 | Editor stays open for deleted tasks | **STILL FIXED** | `task-editor.tsx:127-134` — monitors task existence |
| L-8 | No code splitting, 1.5MB chunk | **STILL FIXED** | `vite.config.ts:83-101` — 12+ manual chunks, largest 350KB |
| L-9 | PWA autoUpdate, no reload prompt | **STILL FIXED** | `vite.config.ts:18` — `registerType: "prompt"` |
| L-10 | Thoughts page domain pills ciphertext | **STILL FIXED** | `thoughts.lazy.tsx:86-92` — `decryptDomains()` |

### Extra Items

| ID | Finding | Status | Evidence |
|----|---------|--------|----------|
| NF-4 | Backup import doesn't clean GCal | **STILL FIXED** | `backup_service.py:416-434` — deletes calendar + sync records |
| — | No React error boundary | **STILL FIXED** | `__root.tsx:29-67`, `_authenticated.tsx:83-127` |
| — | No code splitting | **STILL FIXED** | See L-8 |
| NEW-1 | Analytics ciphertext | **NOW FIXED** | See Phase 1 item 2 |

### Phase 2 Summary

| Severity | Total | Fixed | Accepted | Still Open | Regressed |
|----------|-------|-------|----------|------------|-----------|
| Critical | 5 | 5 | 0 | 0 | 0 |
| High | 3 | 3 | 0 | 0 | 0 |
| Medium | 10 | 9 | 1 | 0 | 0 |
| Low | 10 | 8 | 2 | 0 | 0 |
| Extra | 4 | 4 | 0 | 0 | 0 |
| **Total** | **32** | **29** | **3** | **0** | **0** |

---

## Phase 3: Fresh Adversarial Investigation Traces

### Trace 1: Encryption Completeness

**Scope:** Map every code path that reads `task.title`, `task.description`, or `domain.name`.

**Result: CLEAN — No encryption leaks found.**

Every access path verified:
- **API layer:** Returns ciphertext to client as-is (correct — server has no key)
- **GCal sync:** 3 sync paths (task, instance, bulk) all mask with `GCAL_SYNC_ENCRYPTED_PLACEHOLDER` when `encryption_enabled=true` (`gcal_sync.py:189-190,299-300,548-549,668-669`)
- **Backup export:** Returns ciphertext from DB (`backup_service.py:456-462`)
- **Analytics:** All 3 surfaces (recurring, domains, recent) decrypt client-side (`analytics.lazy.tsx:39-98,254-299`)
- **Dashboard:** Decrypts before passing to children (`task-panel.tsx:75-77,93-97`)
- **Thoughts:** Decrypts domain names (`thoughts.lazy.tsx:86-92`)
- **Settings:** Domain list decrypts via `decryptedNameMap` (`settings.lazy.tsx:889-907`)
- **Task editor:** Receives decrypted data from parent (`task-editor.tsx:94-95`)
- **Toast messages:** All use plaintext from decrypted state
- **Drag-drop overlay:** Receives decrypted tasks
- **Logging:** No task content in Python log statements
- **Storage:** Only encryption key in `sessionStorage` (not task data)
- **Error boundaries:** Log error type, not task content

---

### Trace 2: Multitenancy Exhaustive

**Scope:** Read every service method and router endpoint, verify user_id filtering.

**Result: CLEAN — 100% user_id filtering confirmed.**

40+ endpoints audited across all routers (tasks, domains, instances, preferences, passkeys,
backup, import, analytics, GCal sync). Every database query includes `user_id` in the WHERE
clause. Key patterns verified:
- Subtask operations verify parent ownership via `get_task(parent_id)` (`task_service.py:254`)
- Batch operations pre-fetch owned records, skip unowned silently (`tasks.py:871`)
- Instance operations use denormalized `user_id` or JOIN to Task (`recurrence_service.py:264-269`)
- Snapshot downloads verify `ExportSnapshot.user_id == self.user_id` (`snapshot_service.py:99-102`)
- No endpoints inappropriately use `get_current_user` (optional auth) instead of `require_user`

---

### Trace 3: Race Conditions & Concurrency

**Scope:** Map all optimistic update flows, check for double-tap, concurrency, stale closures.

**Result: Minor issues found, all LOW severity in practice.**

| Issue | Severity | Detail |
|-------|----------|--------|
| `isRedirecting` never resets | NOT A BUG | `window.location.href` causes full page reload, resetting all module state. Intentional. |
| Rate limit countdown: multiple intervals possible | LOW | If multiple 429s arrive, intervals can stack. Toast uses `id: "rate-limit"` which deduplicates the visual, so UX impact is minimal. |
| Double-tap on completion | MITIGATED | `isCompletePending` guard exists. React's batched state updates make the window very small. Server-side toggle is idempotent. |
| Optimistic rollback stale closure | LOW | If two mutations race, rollback captures state after first mutation's optimistic update. `invalidateQueries` on success always reconciles to server truth. |
| Drag-drop concurrent operations | LOW | No serialization queue, but `invalidateQueries` on success always reconciles. Data loss limited to visual jank during rollback. |
| Undo callbacks missing `onError` | LOW | Toggle-complete undo (`task-item.tsx:264-273`) and instance reschedule undo (`task-dnd-context.tsx:432-435`) silently fail. Next query invalidation fixes state. |
| Pending-past-banner double-tap | LOW | `disabled={isPending}` prevents most double-taps. Two clicks in same event loop tick could both fire. Server operation is idempotent. |
| Crypto store setKey/clearKey race | LOW | If `clearKey()` fires while `setKey()` is awaiting `storeKey()`, derivedKey could be set after clear. Requires user to toggle encryption on/off rapidly. |
| Zustand expandedSubtasks two-tab race | NOT A BUG | `localStorage` changes don't cross tabs in Zustand `persist` middleware unless explicitly subscribed. |

**No critical or high-severity race conditions found.** Primary mutation flows have `onError` rollback and `onSuccess` invalidation that reconciles to server truth. However, some nested undo callbacks lack `onError` handlers (see V4-8).

---

### Trace 4: Input Validation Boundary Testing

**Scope:** Trace every user-facing input from frontend → API → service → DB.

**Result: Mostly clean. 3 medium, 2 low findings.**

| ID | Severity | Finding | Evidence | Mitigation |
|----|----------|---------|----------|------------|
| V4-1 | MEDIUM | `TaskContentData` (batch update) lacks title/description validators | `tasks.py:408-414` — no `@field_validator` | Used only for encryption toggle (client-generated ciphertext). DB `Text` column has no length limit. Encrypted values are base64 (~1.4x larger) but bounded by original 500-char limit. |
| V4-2 | MEDIUM | `DomainContentData` (batch update) lacks name validator | `domains.py:196-202` — no `@field_validator` | Same — encryption toggle only. DB `Text` column. |
| V4-3 | MEDIUM | Domain `icon` field has no API validation | `domains.py:46` — `icon: str \| None = None` with zero constraints | DB `String(50)` column enforces at DB level. Frontend sends emoji only. |
| V4-4 | LOW | `completed_retention_days` accepts 2,4,5,6 | `preferences.py:29` — `Field(ge=1, le=7)` vs valid values 1,3,7 | Frontend only offers 1/3/7 in dropdown. Non-standard values have no security impact. |
| V4-5 | LOW | GCal `calendar_id` has no format validation | `models.py:178` — `String(255)` only | IDs come from Google API response, not user input. |

**Strong patterns found:**
- Control character stripping on task title, description, domain name
- `RecurrenceRuleSchema` with `extra="forbid"` prevents injection
- Backup file validated via Pydantic schema before clearing existing data
- Array size limits on batch endpoints (5000 tasks, 500 domains)
- PBKDF2 with 600k iterations (OWASP compliant)

---

### Trace 5: Authentication & Session Edge Cases

**Scope:** Trace expired sessions, CSRF rotation, OAuth replay, demo user escalation.

**Result: CLEAN — No security vulnerabilities found.**

- **Session:** 30-day `max_age`, `same_site="lax"`, `https_only` in production (`main.py:168-175`). No server-side session revocation (accepted limitation of Starlette SessionMiddleware).
- **CSRF:** `secrets.token_urlsafe(32)`, `secrets.compare_digest()` for timing-safe comparison (`csrf.py:44-46,109`). Auto-retry on 403 with `_csrfRetried` flag (`api-client.ts:106-114`).
- **OAuth:** State parameter signed with 10-minute cookie expiry (`auth.py:68-73,153-158`). Exact match verification. Callback replay possible within 10-min window but only overwrites token via upsert (no privilege escalation, no duplicate user creation since email is authoritative).
- **Demo user:** Email-suffix based detection (`demo_service.py:48-50`). Users cannot change email. Isolated by `user_id` multitenancy. Reset endpoint verifies demo status (`auth.py:347-350`).
- **Passkeys:** Rate limited 5/minute (`rate_limit.py:38`). One-time challenges consumed on use (`challenge_service.py:44-63`).
- **401 interceptor:** `isRedirecting` flag with full page reload — safe pattern confirmed.

---

### Trace 6: GCal Sync Integrity

**Scope:** Full sync lifecycle trace including error recovery.

**Result: CLEAN — Production-ready sync system.**

- **Idempotency:** SHA-256 hash of all syncable fields (`gcal_sync.py:524-546`). If hash matches existing sync record, no API call made (`gcal_sync.py:220-221`).
- **Orphan cleanup:** Bulk sync deletes events for deleted/unscheduled tasks (`gcal_sync.py:763-779`). Only runs if sync wasn't cancelled.
- **Duplicate prevention:** Per-user `asyncio.Lock` prevents concurrent bulk syncs (`gcal_sync.py:109`). Manual sync rejected if already running (`gcal_sync.py:356-357`).
- **Token refresh:** 3 retries with exponential backoff (`auth/google.py:77-124`). Auto-disables sync on permanent failure.
- **Rate limiting:** Adaptive throttle starts at 5 QPS, backs off on 403 (`gcal_sync.py:110-139`). Google rate limits distinguished from access errors.
- **Error recovery:** Periodic DB flush every 50 items (`gcal_sync.py:591-592,710-711`). Partial progress preserved on failure. Calendar errors auto-disable sync with user-visible error message.
- **Encryption + sync:** Cannot enable sync when encryption is on. If encryption enabled later, titles masked with placeholder.

---

### Trace 7: Backup/Restore Completeness

**Scope:** Compare serialized fields against full DB schema.

**Result: Core data complete. OAuth/passkeys intentionally excluded.**

**What IS preserved:**
- All Domain fields (name, color, icon, position, archive status) — `backup_service.py:444-454`
- All Task fields (title, description, dates, recurrence, status, impact, clarity) — `backup_service.py:456-479`
- All TaskInstance fields (date, status, completed_at) — `backup_service.py:481-487`
- Encryption metadata (enabled, salt, test_value) — `backup_service.py:162-165,501-503`
- Subtask hierarchy (2-pass import with circular reference detection) — `backup_service.py:291-375`
- Domain ID remapping — `backup_service.py:274-289`
- GCal cleanup before import — `backup_service.py:416-434`
- Transaction safety (savepoint pattern) — `backup_service.py:265`

**What is NOT preserved (by design):**
| Item | Reason |
|------|--------|
| OAuth tokens (Google, Todoist) | Security — tokens encrypted with server SECRET_KEY, not portable |
| Passkeys (WebAuthn credentials) | Security — bound to device/authenticator, cannot be exported |
| GCal sync state & event IDs | Stale after restore — user re-enables sync, bulk sync recreates |
| Calendar display selections | Non-critical preference — user re-selects after restore |
| `encryption_unlock_method` | LOW — not exported. Defaults to "passphrase" on import |
| `calendar_hour_height`, `snapshots_enabled` | LOW — minor preferences not in schema |
| `created_at` / `updated_at` timestamps | LOW — server-generated, not user data |

**Encryption + backup edge case:**
- Encrypted backup exports ciphertext — user must know their passphrase to decrypt on import
- If `encryption_unlock_method` was "passkey" (no passphrase), data cannot be decrypted after restore (passkeys not exported)
- This is an architectural limitation, not a bug — passphrase-based unlock is the default and recommended path

---

### Trace 8: PWA & Mobile Edge Cases

**Scope:** Check all pages for safe area handling, touch events, keyboard, app resume, SW updates.

**Result: CLEAN — No viewport-shrinking patterns found.**

- **Safe area:** `env(safe-area-inset-*)` utilities in `globals.css:177-198`. `--app-height` from `screen.height` in standalone mode (`index.html:34-43`). `overflow: visible !important` on html/body in standalone (`globals.css:235-243`).
- **No violations:** No `overflow:hidden` on html/body, no `position:fixed` on page containers, no `100dvh`. Mobile nav uses `position:fixed` but it's a bottom pill (not a page container) with safe-area calculation.
- **Touch DnD:** `@dnd-kit/core` with `TouchSensor` (250ms delay, 5px tolerance) and `@use-gesture/react` for swipe (horizontal-only, `filterTaps: true`). No gesture conflicts.
- **Keyboard handling:** `use-viewport.ts` detects keyboard via `innerHeight` delta (150px threshold), applies `keyboard-open` class.
- **App resume:** Auth via HTTP-only cookies (survives kill). Encryption key in `sessionStorage` (survives in PWA standalone mode). UI state persisted to `localStorage` via Zustand `persist`. TanStack Query refetches stale data on mount.
- **SW updates:** `registerType: "prompt"` with persistent toast (`Number.POSITIVE_INFINITY`). No auto-update; user must accept.

---

### Trace 9: Memory Leaks & Performance

**Scope:** Check intervals, event listeners, growing state, N+1 queries.

**Result: Excellent code quality. One minor leak identified.**

| Finding | Severity | Detail |
|---------|----------|--------|
| Rate limit countdown interval | LOW | `api-client.ts:75-86` — `setInterval` not cleared if navigation occurs before countdown completes. Mitigated: only fires on 429 (rare), toast has `id` dedup. |
| Task editor focus timeout | TRIVIAL | `task-editor.tsx:137` — 100ms `setTimeout` without cleanup. Fires once, completes instantly. |

**Clean patterns verified:**
- All `useEffect` hooks with intervals/timeouts have proper cleanup returns
- All `addEventListener` calls have matching `removeEventListener` in cleanup
- Zustand uses selector pattern (component subscribes to specific slices)
- No React Context for frequently-changing state
- TanStack Query with proper `staleTime` (2min global, 60s events, 5min calendars)
- Backend uses `UNION ALL` for task+instance queries (`analytics_service.py:122-175`)
- Eager loading via `selectinload` throughout (`task_service.py:193-209`)
- Batch queries with `GROUP BY` instead of N+1 loops (`analytics_service.py:503-556`)

---

### Trace 10: Error Handling Exhaustive

**Scope:** Trace every API error type through interceptor → TanStack Query → component → UI.

**Result: Well-structured error handling. No gaps that would cause data loss.**

**Error handling matrix:**

| Error | Interceptor | Retry | Component | UX | Rollback |
|-------|-------------|-------|-----------|-----|---------|
| Network timeout | `NetworkError` | 1x by TQ | Varies | Persistent offline toast | N/A |
| 400 Bad Request | `ValidationError` | 1x by TQ | `onError` toast | Generic message | N/A |
| 401 Unauthorized | Redirect to /login | N/A | N/A | Silent redirect | N/A |
| 403 CSRF | Auto-retry once | Once | Generic if retry fails | Transparent | N/A |
| 404 Not Found | `NotFoundError` | 1x by TQ | `onError` toast | Generic message | N/A |
| 429 Rate Limit | Countdown toast | 1x by TQ | RateLimitError | Persistent countdown | N/A |
| 500+ Server | Toast + `ServerError` | 1x by TQ | `onError` toast | Generic message | N/A |
| Render crash | N/A | N/A | Error boundary | Reload button | N/A |

**Optimistic update rollback verified:**
- Task completion toggle: captures `previousTasks`, rolls back on error (`task-item.tsx:279`)
- Drag-drop scheduling: captures previous state, rolls back on error (`task-dnd-context.tsx:540`)
- Instance completion: captures `previousInstances`, rolls back on error

**Gaps in mutation error handling:**
- Some nested undo callbacks lack `onError` handlers — if undo fails, user sees no feedback (`task-item.tsx:264-273` toggle complete undo, `task-dnd-context.tsx:432-435` instance reschedule undo)
- Batch operations (pending-past-banner) have no optimistic update and generic error toast with no partial failure detail
- Typed error classes (`errors.ts`) define `userMessage` and `recoverable` properties but components hardcode toast strings instead of using them

**Error boundaries:**
- Root level (`__root.tsx:29-67`) — catches render crashes, shows reload button
- App level (`_authenticated.tsx:83-127`) — catches authenticated route errors
- Both only catch **render-phase errors** (React limitation — async/event handler errors not caught)

**Encryption toggle error handling:**
- `try/catch` with generic error message (`settings.lazy.tsx:566-634`)
- M-9 (accepted): Non-atomic; if batch update fails midway, server thinks encryption is on but data is partially encrypted. Error message suggests retry. Reverse order (encrypt first, then set flag) would leave data unreadable if flag-set fails.

---

## Phase 4: Ship Verdict

### SHIP

**The application is production-ready.** All 32 findings from prior audits are resolved (29 fixed, 3 accepted). Ten adversarial investigation traces found no new critical or high-severity issues. The codebase demonstrates:

- **Strong security posture:** 100% user_id filtering, nonce-based CSP, CSRF protection with auto-retry, input validation with control character stripping, rate limiting on all sensitive endpoints
- **Correct encryption:** Client-side AES-256-GCM with PBKDF2 (600k iterations). All 7 UI surfaces decrypt. GCal masks content when encryption enabled. Logging never includes task content.
- **Solid frontend architecture:** Error boundaries at 2 levels, code splitting (350KB largest chunk down from 1.5MB), optimistic updates with rollback, PWA prompt-based updates, proper iOS safe area handling
- **Reliable sync:** Hash-based idempotency, per-user locking, adaptive rate limiting, auto-disable on error with user-visible messages

### Accepted Risks

| Risk | Severity | Reasoning |
|------|----------|-----------|
| Non-atomic encryption toggle | MEDIUM | Intentional design — reverse order leaves data unreadable. Error message allows retry. |
| 30-day session without server-side revocation | LOW | Starlette SessionMiddleware limitation. Cookies are signed, same-site, HTTPS-only. |
| Legacy SW unscoped cache | LOW | Legacy frontend disabled in production (`SERVE_LEGACY_FRONTEND=true` required). |
| Backup doesn't preserve OAuth/passkeys | LOW | Security feature — tokens bound to server, passkeys bound to device. Documented. |
| Batch update schemas lack field validators | MEDIUM | Only used for encryption toggle (client-generated ciphertext). DB constraints provide backstop. |

### New Findings Summary (Phase 3)

| ID | Severity | Finding | Impact |
|----|----------|---------|--------|
| V4-1 | MEDIUM | Batch task update `TaskContentData` lacks validators | Theoretical; only used by encryption toggle |
| V4-2 | MEDIUM | Batch domain update `DomainContentData` lacks validators | Same as above |
| V4-3 | MEDIUM | Domain `icon` field has no API validation | DB `String(50)` enforces; frontend sends emoji |
| V4-4 | LOW | `completed_retention_days` accepts values 2,4,5,6 | Frontend only offers 1/3/7; no security impact |
| V4-5 | LOW | GCal `calendar_id` has no format validation | IDs come from Google API, not user input |
| V4-6 | LOW | Rate limit countdown interval not cleared on navigation | Cosmetic; toast deduplicates via `id` |
| V4-7 | LOW | `encryption_unlock_method` not in backup export | Defaults to "passphrase"; minor preference loss |
| V4-8 | LOW | Some undo mutation callbacks lack `onError` handlers | If undo fails, user sees no feedback; `invalidateQueries` on next navigation reconciles |

### Comparison Across Audits

| | V2 | V3 | V4 |
|---|---|---|---|
| Critical open | 5 | 1 (CI regression) | **0** |
| High open | 3 | 1 (analytics) | **0** |
| Medium open | 10 | 0 | **0** |
| Regressions | — | 1 | **0** |
| New findings | — | 3 (1 HIGH, 2 LOW) | 8 (3 MED, 5 LOW) |
| Ship verdict | NO SHIP | SHIP (2 items) | **SHIP** |
| Error boundary | Missing | Added | Verified |
| Code splitting | None | Added (22 chunks) | Verified (26 entries) |
| CSP | `unsafe-inline` | Nonce-based | Verified |
| Analytics decrypt | Missing | Missing | **Fixed** |

---

*Generated by Claude Opus 4.6 — v4 final ship readiness review*
