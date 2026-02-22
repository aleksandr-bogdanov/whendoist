---
version: v0.53.5
pr: 380
created: 2026-02-20
---

# Deep Security & Architecture Audit (Round 2)

> **Date:** 2026-02-20
> **Method:** Systematic code tracing of 7 state-changing flows not covered in Round 1, plus targeted investigation of rate limiting, auth boundaries, DnD patterns, TanStack Query consistency, and dependency supply chain.
> **Files examined:** ~50 source files across `app/`, `frontend/src/`, `alembic/versions/`
> **Scope:** Excludes legacy Jinja2/vanilla-JS site (`app/templates/`, `static/`)
> **Prior audit:** `docs/plans/2026-02-20-post-revamp-audit.md` — all 11 findings verified (9 fixed, 2 were acceptable/N/A)

## Executive Summary

The codebase continues to be in **good health**. All 9 actionable findings from Round 1 have been fixed. This round uncovered a **rate limit key function that never resolves to a user ID** (always falling back to IP), which combined with `ProxyHeadersMiddleware(trusted_hosts=["*"])` means rate limits on backup/import/sync endpoints can potentially be bypassed via `X-Forwarded-For` spoofing. A hardcoded `secret_key = "changeme"` default in config creates a deployment risk if the environment variable is missing. Missing HSTS header allows SSL stripping on first visit. On the frontend, DnD undo mutations in toast actions silently fail if the server rejects the undo — no error feedback or cache correction.

## Flows Traced (7)

1. **GCal Sync Enable** — `POST /api/v1/gcal/sync` → background bulk sync with per-user lock, cancellation, and progress tracking
2. **Backup Import** — `POST /api/v1/backup/import` (file upload → JSON parse → task/domain creation in transaction)
3. **Instance Skip + Batch** — `POST /api/v1/instances/{id}/skip`, `POST /api/v1/instances/batch`
4. **Calendar DnD Reschedule** — frontend DnD → `PUT /api/v1/tasks/{id}` (optimistic update + undo in toast)
5. **Todoist Import** — `GET /api/v1/import/todoist/preview` + `POST /api/v1/import/todoist/import`
6. **Task Reparent via DnD** — frontend DnD → `PUT /api/v1/tasks/{id}` with `parent_id` (circular-ref guard)
7. **Encryption Toggle** — `POST /api/v1/preferences/encryption/setup` → batch `PUT /api/v1/tasks/batch-update` + `PUT /api/v1/domains/batch-update`

## Round 1 Fix Verification

| Finding | Status | Evidence |
|---------|--------|----------|
| H1. Missing HTTP timeouts (OAuth) | **Fixed** | `app/auth/google.py:56,129`, `app/auth/todoist.py:30` — all have `timeout=httpx.Timeout(10.0)` |
| H2. Missing HTTP timeout (Todoist API) | **Fixed** | `app/services/todoist.py:79` — `timeout=httpx.Timeout(30.0)` |
| H3. Passphrase not cleared after unlock | **Fixed** | `frontend/src/components/encryption-unlock.tsx:39,43,47` — `setPassphrase("")` in all branches |
| M1. Encryption key in sessionStorage | **N/A** | Documented design tradeoff |
| M2. N+1 in batch-update | **Fixed** | `app/routers/tasks.py:829-831`, `app/routers/domains.py:212-214` — pre-fetch with `WHERE id IN` |
| M3. Silent decryption failure | **Fixed** | `frontend/src/hooks/use-crypto.ts:21-31,97-104` — returns `[value, didFail]` tuples, hook tracks failures + shows warning toast |
| M4. Missing composite indexes | **Fixed** | Migration added `ix_task_user_parent` |
| L1. Non-atomic batch updates | N/A | Documented as intentional |
| L2. Session not invalidated cross-client | N/A | Acceptable for scale |
| L3. Diagnostic console.log | **Fixed** | `frontend/src/lib/passkey.ts:420-421` — now gated behind `import.meta.env.DEV` |
| L4. Error boundary stack traces | **Fixed** | `frontend/src/routes/_authenticated.tsx:97-101` — gates full stack behind `import.meta.env.DEV` |
| L5. Store setTimeout leak | **Fixed** | `frontend/src/stores/ui-store.ts:45-46,123-124` — module-scoped timers with `clearTimeout` |

## Findings

### Critical (must fix before next deploy)

*None.*

### High

**H1. Rate Limit Key Function Never Resolves to User ID**
- **Location:** `app/middleware/rate_limit.py:24-26`
- **Evidence:**
  ```python
  def get_user_or_ip(request: Request) -> str:
      # Try to get user_id from request state (set by auth middleware)
      user = getattr(request.state, "user", None)
      if user and hasattr(user, "id"):
          return f"user:{user.id}"
      return get_remote_address(request)
  ```
  The function checks `request.state.user` (expecting an object with `.id`), but no middleware ever sets `request.state.user`. The `require_user` dependency returns a User model to the route handler, and `request_id.py` only conditionally reads `request.state.user_id` (never writes it). Grep for `request.state.user =` across all of `app/` returns zero results.
- **Impact:** All 14 endpoints using `key_func=get_user_or_ip` (backup, import, gcal_sync routers) always fall back to IP-based rate limiting. Users behind corporate NAT/VPN share a single rate limit bucket. Combined with H2, per-user rate limiting is entirely non-functional.
- **Recommendation:** Fix to check session user_id:
  ```python
  user_id = request.session.get("user_id")
  if user_id:
      return f"user:{user_id}"
  ```

**H2. ProxyHeadersMiddleware Trusts All Hosts**
- **Location:** `app/main.py:183`
- **Evidence:**
  ```python
  if is_production:
      app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=["*"])
  ```
  With `trusted_hosts=["*"]`, uvicorn's ProxyHeadersMiddleware accepts `X-Forwarded-For` from any source. Since rate limiting falls back to IP (H1), an attacker can rotate through spoofed IPs to bypass rate limits on all 14 backup/import/sync endpoints.
- **Impact:** Rate limits on computationally expensive endpoints (backup export, Todoist import, GCal full sync) can be bypassed by adding `X-Forwarded-For: <random-ip>` headers. Railway's proxy adds the real IP to X-Forwarded-For, but with `trusted_hosts=["*"]` the middleware uses the outermost (client-supplied) value.
- **Recommendation:** Restrict `trusted_hosts` to Railway's proxy CIDR range, or use Railway's `X-Forwarded-For` handling correctly. Alternatively, fixing H1 to use session-based user_id eliminates the IP-spoofing concern for authenticated endpoints.

### Medium

**M1. Hardcoded Default `secret_key = "changeme"`**
- **Location:** `app/config.py:12`
- **Evidence:**
  ```python
  class Settings(BaseSettings):
      database_url: str = "postgresql+asyncpg://whendoist:whendoist@localhost:5432/whendoist"
      secret_key: str = "changeme"
  ```
  The `secret_key` is used for:
  1. Session cookie signing (`app/main.py:170` — `SessionMiddleware(secret_key=...)`)
  2. Fernet encryption of OAuth tokens (`app/models.py:44` — `SHA-256(secret_key)` → Fernet key)
  3. OAuth state signing (`app/routers/auth.py:22` — `URLSafeTimedSerializer(secret_key)`)
- **Impact:** If `SECRET_KEY` env var is ever missing from the deployment (misconfiguration, Railway variable deletion, staging environment), all sessions become forgeable, OAuth tokens become decryptable, and CSRF tokens become predictable. Currently the env var is set in Railway, but there is no fail-safe.
- **Recommendation:** Raise on startup if `secret_key` equals the default in production:
  ```python
  @model_validator(mode="after")
  def validate_secret_key(self) -> "Settings":
      if self.base_url.startswith("https://") and self.secret_key == "changeme":
          raise ValueError("SECRET_KEY must be set in production")
      return self
  ```

**M2. Missing HSTS Header**
- **Location:** `app/middleware/security.py:37-41`
- **Evidence:** SecurityHeadersMiddleware sets CSP, X-Content-Type-Options, X-Frame-Options, and Referrer-Policy, but not `Strict-Transport-Security`:
  ```python
  response.headers["Content-Security-Policy"] = csp
  response.headers["X-Content-Type-Options"] = "nosniff"
  response.headers["X-Frame-Options"] = "DENY"
  response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
  # Missing: Strict-Transport-Security
  ```
- **Impact:** Without HSTS, the first visit to the site (or any visit from a fresh browser) can be intercepted via SSL stripping (MITM downgrades HTTPS to HTTP). Subsequent visits go through HTTPS because Railway forces it, but the initial redirect is unprotected. Also, the site won't be eligible for HSTS preload lists.
- **Recommendation:** Add in production only (to avoid issues in local dev):
  ```python
  if request.url.scheme == "https":
      response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
  ```

**M3. Undo Mutations Silently Fail Across Multiple Components**
- **Location:** 7 undo mutations across 3 files:
  - `frontend/src/components/task/task-dnd-context.tsx` — 5 undo mutations (lines 226-237, 283-304, 408-419, 434-445, 497-508)
  - `frontend/src/components/task/task-item.tsx` — undo-delete `restoreTask.mutate` (lines 326-334)
  - `frontend/src/components/calendar/scheduled-task-card.tsx` — undo-delete `restoreTask.mutate` (lines 176-184)
- **Evidence:** All undo mutations in toast actions have `onSuccess` but no `onError`:
  ```typescript
  // Undo for anytime drop (task-dnd-context.tsx:226-237):
  onClick: () => {
    updateTask.mutate(
      { taskId: activeId, data: { scheduled_date: prevDate, scheduled_time: prevTime } },
      {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ... }),
        // Missing: onError — user thinks undo worked, but task stays at new position
      },
    );
  },

  // Undo for delete (task-item.tsx:326-334):
  onClick: () => {
    restoreTask.mutate(
      { taskId: task.id },
      {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ... }),
        // Missing: onError — deleted task stays deleted, user thinks it's restored
      },
    );
  },
  ```
  The date-group undo (line 284-292) additionally sets optimistic cache before the mutation, so on failure the cache shows the reverted state while the server has the new state — a silent data inconsistency until the next `invalidateQueries`.
- **Impact:** If the undo server call fails (network glitch, server error), the user sees the toast "Undo" action complete but the change isn't reverted. The delete-undo variant is worst: the task stays deleted with no feedback. The primary mutations all have proper `onError` handlers.
- **Recommendation:** Add `onError` callbacks to all 7 undo mutations:
  ```typescript
  onError: () => {
    queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
    toast.error("Undo failed");
  },
  ```

### Low

**L1. Fire-and-Forget Instance Sync Missing user_id Filter**
- **Location:** `app/routers/tasks.py:90`
- **Evidence:**
  ```python
  async def _fire_and_forget_sync_instance(instance_id: int, task_id: int, user_id: int) -> None:
      async with async_session_factory() as db:
          sync_service = GCalSyncService(db, user_id)  # ✓ user_id scoped
          task_service = TaskService(db, user_id)       # ✓ user_id scoped
          task = await task_service.get_task(task_id)    # ✓ filtered by user_id

          result = await db.execute(
              sa_select(TaskInstance).where(TaskInstance.id == instance_id)  # ✗ no user_id join
          )
          instance = result.scalar_one_or_none()
  ```
  The TaskInstance query uses only `TaskInstance.id == instance_id` without joining to Task to verify ownership. The `instance_id` comes from trusted code (the route handler that already validated ownership), and the result is only used if `task` (which IS user-filtered) is also found. So exploitation requires an attacker to guess another user's instance_id AND task_id — which doesn't help since the task lookup would fail.
- **Impact:** Defense-in-depth gap only. No practical exploit path — the function is only called with validated IDs from authenticated endpoints.
- **Recommendation:** Add a user_id join for defense-in-depth:
  ```python
  sa_select(TaskInstance).join(Task).where(
      TaskInstance.id == instance_id,
      Task.user_id == user_id,
  )
  ```

**L2. Axios 1.13.5 Has Known CVEs**
- **Location:** `frontend/package.json:23`
- **Evidence:** `"axios": "^1.13.5"` — multiple CVEs fixed in 1.13.6+, 1.14.x, and 1.15.x (SSRF, prototype pollution).
- **Impact:** Low in browser context (SSRF not exploitable from client-side). No direct user risk, but should be patched for defense-in-depth and supply chain hygiene.
- **Recommendation:** `cd frontend && npm update axios` to pull latest 1.x.

**L3. Console.error in Passkey/Crypto Leaks Error Details**
- **Location:** `frontend/src/lib/passkey.ts:346,446,460`, `frontend/src/lib/crypto.ts:303,361,375`
- **Evidence:** Six `console.error` calls log full error objects (including stack traces) in production:
  ```typescript
  // passkey.ts:346
  console.error("Passkey registration failed:", error);
  // passkey.ts:460
  console.error("Passkey authentication failed:", error);
  // crypto.ts:361
  console.error(`Failed to decrypt task ${task.id}:`, e);
  ```
- **Impact:** Exposes implementation details (component paths, crypto error messages, numeric task/domain IDs) to anyone with DevTools open. No secrets or user data leaked. The passkey.ts:421 `console.log` was already fixed to gate behind `import.meta.env.DEV`, but these `console.error` calls were not.
- **Recommendation:** Gate behind `import.meta.env.DEV` or reduce to `console.error("Passkey registration failed")` without the error object.

## Verified Clean

### Multitenancy (Expanded Verification)
All 7 traced flows properly enforce user_id filtering:
- **GCal Sync** — `GCalSyncService(db, user_id)` constructor scopes all queries; per-user `asyncio.Lock` prevents concurrent syncs
- **Backup Import** — `TaskService(db, user.id)` creates tasks scoped to user; imported task IDs are remapped (no ID injection)
- **Instance Skip/Batch** — `RecurrenceService(db, user.id)` joins `Task.user_id == self.user_id` on all instance operations (lines 241-247, 270-276)
- **Todoist Import** — `TodoistClient` fetches from user's Todoist account; tasks created via `TaskService(db, user.id)`
- **Task Reparent** — `task_service.update_task()` validates parent ownership via `get_task(parent_id)` which filters by user_id
- **Encryption Toggle** — Batch update pre-fetches with `WHERE id IN (...) AND user_id = ...`, silently skips unowned IDs

Batch operations across all traced flows skip unowned IDs silently (per CLAUDE.md Rule 3).

### CSRF Protection (Comprehensive)
Verified end-to-end across all 7 flows:
- Token generated per session via `secrets.token_urlsafe(32)` (`csrf.py:46`)
- Validated with `secrets.compare_digest` on all POST/PUT/DELETE/PATCH (`csrf.py:109`)
- Frontend axios interceptor auto-injects `X-CSRF-Token` (`api-client.ts:54-62`)
- Unauthenticated requests skip validation (line 84) — prevents blocking OAuth callbacks
- Token refreshed on 403 response (api-client.ts:106-109)

### Auth Boundary Completeness
Every API v1 router was checked for auth dependencies:
- **13 routers** in `app/routers/v1/__init__.py` — all use `require_user` or `get_current_user` dependency
- `import_data.py` uses `get_current_user` + manual null check (functionally equivalent to `require_user`)
- No route is accidentally unprotected — the router-level dependency injection pattern prevents this
- Health/ready/metrics endpoints correctly bypass auth (not in v1 prefix)

### TanStack Query Cache Consistency
All DnD operations follow a consistent optimistic update pattern:
1. Snapshot `previousTasks = queryClient.getQueryData(...)`
2. Optimistic `setQueryData(...)` — only touches scheduling metadata, never encrypted fields
3. `onSuccess`: `invalidateQueries(...)` for fresh server data
4. `onError`: `setQueryData(previousTasks)` restores snapshot + error toast

Encrypted fields (title, description) are never modified in optimistic updates. The `use-crypto.ts` hook decrypts at the TanStack Query boundary, so components always work with plaintext.

### XSS Prevention
- Zero uses of `dangerouslySetInnerHTML` in entire frontend
- No `eval()`, no `innerHTML` manipulation
- All HTML rendered via React JSX (auto-escaped)
- CSP includes `frame-ancestors 'none'` (clickjacking protection)

### DnD Implementation (v0.53+ Patterns)
- Custom collision detection (`task-dnd-context.tsx:57-84`): priority-based strategy (pointerWithin → rectIntersection → closestCenter)
- Five distinct drop zone types handled: anytime, date-group, calendar, task-list, task (reparent)
- Circular reference prevention for reparent: checks if target is a subtask of source (`line 531-536`)
- Swipe/DnD conflict resolution: 250ms TouchSensor delay for DnD vs immediate swipe (clean separation)
- Calendar drop time calculation uses live `getBoundingClientRect()` (not stale dnd-kit rects)

### Background Task Error Recovery
- GCal sync: `CalendarGoneError` auto-disables sync on 403/404/410 (`gcal_sync.py:243-280`)
- Token refresh: 3 retries + exponential backoff (`google.py:108-121`)
- Adaptive throttle: increases delay on 429 rate limits (`gcal_sync.py:120-138`)
- Instance materialization: per-user sessions, timeout-protected, error recovery (`recurring.py:136-184`)
- All fire-and-forget tasks catch exceptions and log without propagating to request handlers

### Transaction Safety (New Flows)
- Backup import: task + domain creation in single transaction, rolled back on any error
- Instance skip: updates instance + materializes next in single commit
- GCal full sync: per-user lock prevents concurrent bulk syncs; cancellation signal for in-progress syncs

## Architecture Strengths

**1. Consistent Rate Limiting Architecture**
Despite the H1 key function bug, the rate limit constants are well-designed: `AUTH_LIMIT` (10/min), `DEMO_LIMIT` (3/min), `ENCRYPTION_LIMIT` (5/min), `BACKUP_LIMIT` (5/min), `TASK_CREATE_LIMIT` (30/min). Every sensitive endpoint has an appropriate limit — the fix is a 3-line change to the key function.

**2. GCal Sync Resilience Model**
The sync architecture handles all common Google Calendar failure modes gracefully: token revocation (auto-disable), API rate limits (adaptive throttle), calendar deletion (CalendarGoneError), and network errors (timeout + retry). The per-user asyncio.Lock and cancellation signal prevent resource exhaustion.

**3. Backup Import Safety**
`backup.py` validates file size (`BACKUP_MAX_SIZE_BYTES`), parses JSON safely, remaps imported IDs (no ID injection), creates tasks via the standard service layer (multitenancy enforced), and runs in a single transaction with rollback on error.

**4. Encryption at the Query Boundary (Improved)**
Since Round 1, `use-crypto.ts` was enhanced with failure tracking: `decryptFieldIfNeeded` now returns `[value, didFail]` tuples, and the `useCrypto` hook aggregates failures and shows a warning toast on first failure batch. This eliminates the M3 finding from Round 1.

**5. DnD Architecture Maturity**
The `task-dnd-context.tsx` component (596 lines) handles 5 drop zone types with consistent patterns: optimistic updates, server mutation, rollback on error, toast with undo action, and accessible `announce()` calls for screen readers. The custom collision detection solves the common dnd-kit issue of inaccurate drops in scrolling containers.

## Recommended Priority

| # | Finding | Severity | Effort | Action |
|---|---------|----------|--------|--------|
| H1 | Rate limit key never uses user_id | High | 10 min | Check `request.session.get("user_id")` instead of `request.state.user` |
| H2 | ProxyHeadersMiddleware trusts all hosts | High | 15 min | Fix H1 (eliminates IP concern for authed endpoints) or restrict trusted_hosts |
| M1 | Hardcoded `secret_key = "changeme"` | Medium | 10 min | Add model_validator that raises in production if default |
| M2 | Missing HSTS header | Medium | 5 min | Add `Strict-Transport-Security` for HTTPS responses |
| M3 | Undo mutations silently fail (7 locations) | Medium | 30 min | Add `onError` callbacks to 7 undo mutations across 3 files |
| L1 | Instance sync missing user_id join | Low | 5 min | Add `Task.user_id` join for defense-in-depth |
| L2 | Axios 1.13.5 has known CVEs | Low | 5 min | `npm update axios` to latest 1.x |
| L3 | Console.error leaks error details | Low | 15 min | Gate behind `import.meta.env.DEV` |
