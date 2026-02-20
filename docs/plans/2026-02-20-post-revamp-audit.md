---
version: v0.53.4
pr:
created: 2026-02-20
---

# Post-Revamp Architecture Audit

> **Date:** 2026-02-20
> **Method:** Systematic code tracing across backend (Python) and frontend (React SPA), 7 parallel investigation workstreams
> **Files examined:** ~60 source files across `app/`, `frontend/src/`, `alembic/versions/`
> **Scope:** Excludes legacy Jinja2/vanilla-JS site (`app/templates/`, `static/`)

## Executive Summary

The post-revamp codebase is in **good health overall**. Multitenancy is consistently enforced across all traced endpoints, CSRF protection is comprehensive, and the frontend's optimistic update pattern is well-implemented with proper rollback. The most actionable findings are **missing HTTP timeouts on external service calls** (could hang request workers indefinitely), a **passphrase retained in React state after unlock**, and **N+1 queries in batch-update endpoints** used during encryption toggle.

## Findings

### Critical (must fix before next deploy)

*None.*

### High

**H1. Missing HTTP Timeouts on OAuth Token Exchange**
- **Location:** `app/auth/google.py:56`, `app/auth/todoist.py:30`
- **Evidence:** Both `exchange_code()` functions create `httpx.AsyncClient()` with no `timeout` parameter. Default httpx timeout is 5s for connect but no total timeout enforced by the app.
  ```python
  # app/auth/todoist.py:30
  async with httpx.AsyncClient() as client:  # no timeout=
      response = await client.post(TODOIST_TOKEN_URL, ...)
  ```
  Same pattern at `app/auth/google.py:56` and `app/auth/google.py:128` (`get_user_email`).
- **Impact:** If Google/Todoist token endpoints hang (DNS issues, upstream outage), the OAuth callback handler blocks a worker indefinitely. With enough concurrent logins during an outage, this starves the worker pool.
- **Recommendation:** Add explicit `timeout=httpx.Timeout(10.0)` to all three `httpx.AsyncClient()` calls.

**H2. Missing HTTP Timeout on Todoist API Client**
- **Location:** `app/services/todoist.py:76-79`
- **Evidence:**
  ```python
  self._client = httpx.AsyncClient(
      base_url=TODOIST_API_URL,
      headers={"Authorization": f"Bearer {self.access_token}"},
  )  # no timeout=
  ```
- **Impact:** Todoist import preview and bulk import can hang indefinitely if the API is unresponsive. This runs during a user request (not background), blocking the worker.
- **Recommendation:** Add `timeout=httpx.Timeout(30.0)` (same as the Google Calendar client at `app/services/gcal.py:96`).

**H3. Passphrase Not Cleared from React State After Unlock**
- **Location:** `frontend/src/components/encryption-unlock.tsx:25-48`
- **Evidence:** After successful unlock (line 38-40), `setPassphrase("")` is never called:
  ```typescript
  const success = await unlockEncryption(passphrase, salt, testValue);
  if (success) {
    await restoreKey();
    toast.success("Encryption unlocked");
    // passphrase still in state!
  }
  ```
  The component remains mounted (Dialog stays in DOM with `open={false}` semantics via the parent conditional), keeping the plaintext passphrase in React's fiber tree, accessible via React DevTools.
- **Impact:** An attacker with access to the browser (physical or XSS) could extract the passphrase from React DevTools or a heap dump.
- **Recommendation:** Add `setPassphrase("")` in the success branch (after line 40) and in the passkey branch. Also clear on dialog close.

### Medium

**M1. Encryption Key Exported to sessionStorage as Base64**
- **Location:** `frontend/src/lib/crypto.ts:176-179`
- **Evidence:**
  ```typescript
  export async function storeKey(key: CryptoKey): Promise<void> {
    cachedKey = key;
    const keyData = await exportKey(key);  // raw bytes → base64
    sessionStorage.setItem(KEY_STORAGE_KEY, keyData);
  }
  ```
  The key is derived with `extractable: true` (line ~97), enabling `exportKey("raw")`. The 256-bit AES-GCM key is stored as plaintext base64 in sessionStorage.
- **Impact:** Any XSS vulnerability (currently none found) or malicious browser extension could read `sessionStorage.getItem("whendoist_encryption_key")` and decrypt all task titles/descriptions. The key survives across page refreshes within the same tab.
- **Recommendation:** This is a **design tradeoff** — the alternative (non-extractable key, memory only) forces re-entering the passphrase on every page refresh. Document this tradeoff. Consider at minimum using a non-extractable CryptoKey for the in-memory cache and only persisting via the passkey/wrapped-key flow.

**M2. N+1 Queries in Batch-Update Endpoints**
- **Location:** `app/routers/tasks.py:827-843`, `app/routers/domains.py:211-219`
- **Evidence:**
  ```python
  for i, item in enumerate(data.tasks):  # up to 5000 items
      task = await service.get_task(item.id)  # 1 query per item (with selectinload)
      await service.update_task(task_id=item.id, ...)  # 1 query per item
  ```
  For 1000 tasks, this executes ~2000 queries.
- **Impact:** Encryption toggle (the primary use case) takes longer than necessary. With batch commits every 25 items, the total is mitigated but still excessive.
- **Recommendation:** Pre-fetch all tasks in a single `WHERE id IN (...)` query, then loop over the results. Or use a bulk `UPDATE` statement.

**M3. Silent Decryption Failure Shows Ciphertext**
- **Location:** `frontend/src/hooks/use-crypto.ts:24-28`
- **Evidence:**
  ```typescript
  async function decryptFieldIfNeeded(value, key) {
    if (!value || !looksEncrypted(value)) return value;
    try { return await decrypt(key, value); }
    catch { return value; }  // returns ciphertext silently
  }
  ```
- **Impact:** If the user's key is wrong (corrupted sessionStorage, or key rotated on another device), all encrypted fields show as base64 gibberish with no warning. The user has no indication that decryption failed.
- **Recommendation:** Track decryption failures. If >0 fields fail, show a warning banner: "Some data couldn't be decrypted. Please re-enter your passphrase."

**M4. Missing Composite Database Indexes**
- **Location:** `app/models.py` (Task model, lines 341-347)
- **Evidence:** Queries filter on `user_id + parent_id` (task_service.py:431,489), `user_id + is_recurring` (task_service.py:182), and `user_id + clarity` (task_service.py:186), but no composite indexes exist for these combinations. Current indexes:
  - `ix_task_user_status` (user_id, status) ✓
  - `ix_task_user_scheduled` (user_id, scheduled_date) ✓
  - `ix_task_user_domain` (user_id, domain_id) ✓
  - `ix_task_parent` (parent_id only) — missing user_id
- **Impact:** Subtask queries and filtered list queries do sequential scans on the parent_id/is_recurring/clarity columns. With hundreds of tasks per user this is fine; at thousands it becomes noticeable.
- **Recommendation:** Add in a future migration:
  ```sql
  CREATE INDEX ix_task_user_parent ON tasks(user_id, parent_id);
  ```
  The `is_recurring` and `clarity` indexes are lower priority given boolean/enum cardinality.

### Low

**L1. Non-Atomic Batch Updates During Encryption Toggle**
- **Location:** `app/routers/tasks.py:800-856`
- **Evidence:** Commits every 25 items to prevent connection timeouts. If an error occurs at item 50, items 1-25 are already committed, 26-50 are rolled back.
- **Impact:** Encryption toggle could leave some tasks encrypted and others decrypted. Documented as intentional ("retry to complete remaining tasks"), but the user has no visibility into which tasks succeeded.
- **Recommendation:** Return the list of failed task IDs in the response so the frontend can retry specifically those.

**L2. OAuth Session Not Invalidated Across Clients**
- **Location:** `app/routers/auth.py:281-284`
- **Evidence:** Logout calls `request.session.clear()` which clears the current cookie, but other browser sessions remain valid for up to 30 days.
- **Impact:** If a user logs out on one device, sessions on other devices persist. This is standard for cookie-based auth without server-side session storage.
- **Recommendation:** Acceptable for current scale. If needed later, add a `session_version` column to User and increment on logout-all.

**L3. Diagnostic console.log in Passkey Flow**
- **Location:** `frontend/src/lib/passkey.ts:420`
- **Evidence:** `console.log("Initial unwrap failed, looking up credential-specific data...")` — informational message in production.
- **Impact:** Leaks implementation details to anyone with browser DevTools open. No secrets exposed.
- **Recommendation:** Remove or gate behind `import.meta.env.DEV`.

**L4. Error Boundary Logs Full Stack Traces**
- **Location:** `frontend/src/routes/_authenticated.tsx:97`
- **Evidence:** `console.error("App error boundary caught:", error, errorInfo)` logs full React component stack to console.
- **Impact:** Could expose internal component names and file paths. No user data leaked.
- **Recommendation:** In production, log only `error.message`. Send full details to Sentry instead.

**L5. Two Duplicate `setTimeout` Calls in UI Store Without Cleanup**
- **Location:** `frontend/src/stores/ui-store.ts:119-127`
- **Evidence:** `flashUpdatedTask` sets two timeouts (100ms for scrollIntoView, 1500ms to clear state) without cleanup handles.
- **Impact:** If called rapidly, old timeouts fire on stale task IDs. No functional issue since the store persists for page lifetime, but technically a leak.
- **Recommendation:** Store timeout IDs and clear previous ones when called again.

## Verified Clean

### Multitenancy (Thoroughly Verified)
All 5 traced state-changing endpoints properly filter by `user_id`:
- **POST /tasks** — `task_service.py:283` sets `user_id=self.user_id` on creation; domain/parent validated via `get_domain()`/`get_task()` which filter by user_id
- **PUT /domains/{id}** — `task_service.py:39` queries `Domain.user_id == self.user_id`
- **POST /instances/{id}/complete** — `recurrence_service.py:241-247` joins `Task.user_id == self.user_id`
- **PUT /preferences** — service constructor receives `user_id`, all queries scoped
- **DELETE /tasks/{id}** — `task_service.py:222` queries `Task.user_id == self.user_id`; recursive subtask deletion also filters by user_id (line 488)

Batch endpoints silently skip unowned IDs (by design, per CLAUDE.md Rule 3).

### CSRF Protection (Comprehensive)
- Token generated per session via `secrets.token_urlsafe(32)` (`app/middleware/csrf.py:44`)
- Validated on all POST/PUT/DELETE/PATCH to authenticated endpoints
- Frontend axios interceptor auto-injects `X-CSRF-Token` header (`frontend/src/lib/api-client.ts:54-62`)
- Token refreshed on 403 response (line 106-109)
- OAuth callbacks exempt (as expected)

### Error Response Safety
- Global exception handler returns `{"detail": "Internal server error"}` — no stack traces, SQL, or internal IDs (`app/main.py:186-197`)
- DB session errors caught and rolled back (`app/database.py:38-47`)
- All 13 bare `except Exception:` blocks are in cleanup/best-effort contexts (GCal event deletion, calendar cleanup, metrics) — none risk data corruption

### Transaction Safety
- Task create + instance materialization in single commit (`app/routers/tasks.py:503`)
- Task update + instance regeneration in single commit (`app/routers/tasks.py:581`)
- GCal sync runs as fire-and-forget in separate DB session (eventual consistency, not blocking)
- Background materialization loop: per-user sessions, timeout-protected, error recovery (`app/tasks/recurring.py:136-184`)

### Optimistic Updates with Rollback (Frontend)
Consistent pattern across task-item.tsx, domain-group.tsx, scheduled-task-card.tsx, task-dnd-context.tsx:
1. Snapshot `previousTasks = queryClient.getQueryData(...)`
2. Optimistic `setQueryData` (only touches metadata: status, completed_at, scheduled_date)
3. On success: `invalidateQueries` for fresh server data
4. On error: `setQueryData(previousTasks)` restores snapshot + error toast

Encrypted fields (title, description) are never modified in optimistic updates.

### XSS Prevention
- Zero uses of `dangerouslySetInnerHTML` in the entire frontend
- No `eval()`, no direct `innerHTML` manipulation
- All HTML rendered via React JSX (auto-escaped)

### Calendar Sync Resilience
- Token refresh with 3 retries + exponential backoff (`app/auth/google.py:108-121`)
- `CalendarGoneError` auto-disables sync on 403/404/410 (`app/services/gcal_sync.py:243-280`)
- Adaptive throttle increases delay on 429 rate limits (`app/services/gcal_sync.py:120-138`)
- Per-user `asyncio.Lock` prevents concurrent bulk syncs (`app/routers/gcal_sync.py:103-106`)
- Google Calendar client has explicit 30s timeout (`app/services/gcal.py:96`)

### Migration Quality
- 4 of 5 most recent migrations have working `downgrade()` methods
- 1 data migration (`20260217_000001` — flatten subtask depth) is intentionally non-reversible (documented)
- All new NOT NULL columns have `server_default` values

## Architecture Strengths

**1. Service Constructor Pattern**
Every service takes `(db: AsyncSession, user_id: int)` in `__init__`, making it structurally impossible to forget user_id filtering. The pattern is applied uniformly across TaskService, RecurrenceService, AnalyticsService, PreferencesService, PasskeyService, and GCalSyncService.

**2. Encryption at the Query Layer**
Encryption/decryption happens in `use-crypto.ts` at the TanStack Query boundary, so components always work with plaintext. This prevents the common bug of forgetting to decrypt in a new component. The `looksEncrypted()` heuristic (38+ base64 chars) provides graceful handling of mixed encrypted/plaintext data during migration.

**3. Fire-and-Forget with Proper Isolation**
Background GCal sync tasks create their own DB sessions (`async with async_session_factory() as db`), preventing contamination of the request's session. Errors are caught and logged without affecting the user response.

**4. Custom Collision Detection for Calendar DnD**
`task-dnd-context.tsx:57-84` implements a priority-based collision strategy that tries `pointerWithin` first (for precise calendar drops), then falls back to `rectIntersection` and `closestCenter`. Combined with live `getBoundingClientRect()` tracking (instead of stale dnd-kit rects), this ensures accurate drops even in scrolling containers.

**5. Swipe/DnD Gesture Conflict Resolution**
The 250ms TouchSensor delay for DnD vs immediate swipe response (task-swipe-row.tsx) is a clean separation: quick horizontal gestures are swipes, held touches initiate drag. The long-press timer (300ms) fires after DnD activation (250ms), but the swipe handler checks `!isSwiping` before firing, preventing double-activation.

**6. UNION ALL for Task + Instance Queries**
Analytics service (`app/services/analytics_service.py:129-158`) uses `union_all` to combine Task and TaskInstance completions in a single query, avoiding N+1 patterns in the analytics dashboard.

## Recommended Priority

| # | Finding | Severity | Effort | Action |
|---|---------|----------|--------|--------|
| H1 | Missing timeouts on OAuth token exchange | High | 15 min | Add `timeout=httpx.Timeout(10.0)` to 3 calls |
| H2 | Missing timeout on Todoist API client | High | 5 min | Add `timeout=httpx.Timeout(30.0)` |
| H3 | Passphrase not cleared after unlock | High | 5 min | Add `setPassphrase("")` on success |
| M3 | Silent decryption failure | Medium | 1 hr | Add failure counter + warning banner |
| M1 | Encryption key in sessionStorage | Medium | N/A | Document tradeoff; consider for v2 |
| M2 | N+1 in batch-update | Medium | 2 hr | Pre-fetch with `WHERE id IN (...)` |
| M4 | Missing composite indexes | Medium | 30 min | Add migration for `(user_id, parent_id)` |
| L1 | Non-atomic batch updates | Low | 1 hr | Return failed IDs in response |
| L3 | Diagnostic console.log | Low | 5 min | Remove or gate behind DEV |
| L4 | Error boundary stack logging | Low | 15 min | Log only message in prod |
| L5 | Store setTimeout leak | Low | 15 min | Track and clear timeout IDs |
| L2 | Session not invalidated cross-client | Low | N/A | Acceptable for current scale |
