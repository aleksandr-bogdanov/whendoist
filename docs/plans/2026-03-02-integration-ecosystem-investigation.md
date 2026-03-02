---
version: null
pr: null
created: 2026-03-02
---

# Integration Ecosystem Investigation

Research-only document. No implementation — just findings, options, and open questions
for adding a public API / integration foundation to Whendoist.

---

## 1. Findings

### 1.1 Current Auth System

**Mechanism:** Signed session cookies via Starlette `SessionMiddleware`.

| Property | Value |
|----------|-------|
| Cookie name | `whendoist_session` |
| Cookie lifetime | 30 days |
| Signing | `SECRET_KEY` via Starlette (HMAC) |
| SameSite | `lax` |
| HTTPS-only | Production only |
| Session payload | `{ "user_id": "<int>" }` |

**Dependency chain** (in `app/routers/auth.py`):

```
get_user_id(request)          → extracts user_id from session, returns int | None
  └─ get_current_user(request, db)  → loads User from DB, returns User | None
       └─ require_user(request, db)      → raises 401 if None, returns User
```

All v1 routes use `Depends(require_user)`. There are ~93 usages across routers.
**No API key, bearer token, or JWT support exists today.** Auth is purely session-based.

**Key files:** `app/routers/auth.py`, `app/main.py:167-175`

---

### 1.2 External OAuth & Token Storage

Two OAuth integrations exist, establishing a clear credential storage pattern:

| | Google OAuth | Todoist OAuth |
|--|-------------|---------------|
| **Model** | `GoogleToken` | `TodoistToken` |
| **Stored fields** | `access_token_encrypted`, `refresh_token_encrypted`, `expires_at`, `gcal_write_scope` | `access_token_encrypted` |
| **Encryption** | Fernet (AES-128-CBC + HMAC), key = SHA-256(SECRET_KEY) | Same |
| **Refresh** | Yes — proactive (5-min buffer), DB-locked, 3-retry exponential backoff | None (tokens don't expire) |
| **Property access** | `token.access_token` transparently decrypts | Same |

**Reusable pattern for API keys:** The `encrypt_token()`/`decrypt_token()` helpers and the
property-based transparent encryption model could be reused for storing user-generated API keys.
A new `ApiKey` model would follow the same shape as `TodoistToken`.

**Key files:** `app/models.py:37-58` (encryption), `app/models.py:111-179` (token models),
`app/auth/google.py`, `app/auth/todoist.py`

---

### 1.3 Rate Limiting

**Library:** slowapi 0.1.9+ (wraps Starlette middleware)
**Storage:** In-memory (no Redis). Per-process, resets on restart.
**Key function:** `get_user_or_ip()` — limits by `user:{id}` when authenticated, IP otherwise.

| Tier | Limit | Endpoints |
|------|-------|-----------|
| `AUTH_LIMIT` | 10/min | OAuth callbacks |
| `DEMO_LIMIT` | 3/min | Demo login/reset |
| `ENCRYPTION_LIMIT` | 5/min | Passkey, encryption setup/disable |
| `BACKUP_LIMIT` | 5/min | Export/import, GCal sync, Todoist import, data wipe |
| `TASK_CREATE_LIMIT` | 30/min | Task creation |
| `API_LIMIT` | 60/min | General API (global default) |
| Default | 100/min | Fallback per-IP |

Applied via `@limiter.limit()` decorators on individual route handlers (25+ endpoints).

**For a public API:** The existing per-user rate limiting works well. A dedicated
`API_KEY_LIMIT` tier could be added (e.g., 120/min for API keys vs 60/min for browser).
The in-memory backend is a limitation for multi-instance deploys but fine for current
single-dyno Railway setup.

**Key files:** `app/middleware/rate_limit.py`, `app/main.py:151-153`

---

### 1.4 CSRF Protection

**Pattern:** Synchronizer Token Pattern (session-stored).

- Token generated via `secrets.token_urlsafe(32)` (256-bit)
- Stored in session under `_csrf_token` key
- Validated on POST/PUT/DELETE/PATCH via `X-CSRF-Token` header
- Constant-time comparison (`secrets.compare_digest`)
- Frontend fetches token via `GET /api/v1/csrf`, caches it, auto-retries on 403

**Exempt paths:** OAuth callbacks (have state-param protection), `/health`, `/ready`, `/metrics`

**Unauthenticated bypass:** If `user_id` not in session, CSRF validation is skipped entirely.

**API key interaction:** API-key-authenticated requests would NOT have a session, so the
existing middleware would skip CSRF validation automatically (the `"user_id" not in
request.session` check). This is correct — API keys are not vulnerable to CSRF because
they're sent explicitly, not automatically by the browser. **No special handling needed.**

**Key files:** `app/middleware/csrf.py`, `app/routers/csrf.py`, `frontend/src/lib/api-client.ts`

---

### 1.5 Encryption Complication

**Architecture:** True client-side E2E encryption. The server **cannot decrypt**.

| Property | Detail |
|----------|--------|
| Algorithm | AES-256-GCM |
| Key derivation | PBKDF2 (SHA-256, 600,000 iterations) from user passphrase |
| Encrypted fields | `Task.title`, `Task.description`, `Domain.name` — only 3 fields |
| Plaintext fields | All dates, status, priority, impact, clarity, duration, positions |
| Key storage | Browser `sessionStorage` only (ephemeral, lost on tab close) |
| Server role | Stores ciphertext. Zero decryption capability. |
| Unlock methods | Passphrase (PBKDF2) or Passkey (WebAuthn PRF) |

**The hard problem:** A Zapier integration or external API client cannot decrypt
`Task.title` or `Task.description`. The server doesn't have the keys either.

**How GCal sync handles it today:** When `encryption_enabled=true`, the server substitutes
a placeholder (`[Encrypted]`) instead of the ciphertext for GCal events. This masks the
data rather than exposing meaningless ciphertext.

**Key files:** `frontend/src/lib/crypto.ts`, `frontend/src/hooks/use-crypto.ts`,
`frontend/src/stores/crypto-store.ts`, `app/services/gcal_sync.py:189-190`

---

### 1.6 OpenAPI Spec

**Generation:** FastAPI auto-generates at `/openapi.json` from route signatures and
Pydantic models. No custom schema modifications.

**Orval consumption:** `frontend/orval.config.ts` fetches from `http://localhost:8000/openapi.json`.

**Auth in spec:** Session-based auth is **not documented** in the OpenAPI schema. The API
appears unauthenticated to external consumers. This is fine for internal SPA use but would
need to change for a public API — new endpoints would need proper security scheme annotations
(e.g., `APIKeyHeader` security dependency).

**Docs exposure:** `/docs` and `/redoc` are development-only (not served in production).

**Key files:** `frontend/orval.config.ts`, `app/main.py:147-148`

---

### 1.7 Webhook Feasibility

**Background job infrastructure:**

| Type | Implementation | Details |
|------|---------------|---------|
| Recurring loops | `asyncio.create_task()` in app lifespan | Materialization (1h), Snapshots (30min) |
| Fire-and-forget | `asyncio.create_task()` in request handlers | GCal sync after task mutations |
| External queue | **None** | No Celery, arq, APScheduler, Redis |

**Limitations:** Tasks are in-process only. Lost on server restart. No retry persistence.
No dead-letter queue. Single-process (Railway single dyno).

**Webhook delivery is feasible** using the existing fire-and-forget pattern:
`asyncio.create_task(deliver_webhook(...))` after mutations. But there's no retry
persistence — if delivery fails and the process restarts, the webhook is lost.

**For MVP:** In-process asyncio delivery with in-memory retry (3 attempts, exponential
backoff) would work. For production-grade delivery, would need Redis or a persistent queue.

**Key files:** `app/tasks/recurring.py`, `app/tasks/snapshots.py`,
`app/routers/tasks.py:42-120` (fire-and-forget pattern)

---

### 1.8 Integration Use Cases

**Core entities for a public API:**

- **Task**: title, description, domain, impact (P1-P4), clarity, duration, scheduled_date/time, status, recurrence
- **Domain**: name, color, icon
- **TaskInstance**: task_id, instance_date, status (pending/completed/skipped)

**High-value Zapier triggers** (events flowing out):

| Trigger | Payload |
|---------|---------|
| Task Created | title, domain, impact, clarity, duration, scheduled_date |
| Task Completed | title, domain, impact, completed_at, time_to_completion |
| Task Scheduled | title, domain, scheduled_date, scheduled_time |
| Recurring Instance Completed | task_title, instance_date, domain |
| Daily Summary | completed_count, overdue_count, current_streak |

**High-value Zapier actions** (operations flowing in):

| Action | Fields |
|--------|--------|
| Create Task | title, description, domain, impact, clarity, duration, scheduled_date |
| Complete Task | task_id |
| Update Task | task_id + any mutable field |
| Create Domain | name, color, icon |

**Real-world use cases:**
- Slack notification on P1 task completion
- Weekly email digest of completions and streaks
- Auto-create tasks from form submissions (Typeform, Google Forms)
- Sync tasks to Notion database
- Morning standup automation (pending tasks by domain)

---

## 2. Options

### Option A: API Keys Only (Simplest)

Add `ApiKey` model, new auth dependency that checks `X-API-Key` header, and expose
existing CRUD endpoints to API-key-authenticated requests.

| Pros | Cons |
|------|------|
| Minimal new code (~200 lines) | No event-driven integrations (polling only) |
| Reuses existing endpoints and rate limiting | Zapier triggers would need polling |
| CSRF middleware already skips non-session requests | No real-time notifications |
| Follows existing token storage pattern | |

**Effort:** Small. New model, new auth dependency, key management endpoints, OpenAPI
security scheme annotation.

### Option B: API Keys + Webhooks

Everything in Option A, plus a `Webhook` model and async delivery system.

| Pros | Cons |
|------|------|
| Event-driven triggers (no polling) | Requires instrumenting all mutation handlers |
| Better Zapier/Make.com experience | In-process delivery = lost on restart |
| Real-time notifications possible | Webhook secret management, HMAC signing |
| | More surface area to maintain |

**Effort:** Medium. Webhook model, delivery system, event publisher hooks in task/domain
routers, webhook management UI.

### Option C: Full OAuth2 Provider

Become an OAuth2 provider so third-party apps can request scoped access on behalf of users.

| Pros | Cons |
|------|------|
| Industry-standard for integrations | Significant complexity (authorization server) |
| Scoped permissions per app | Needs consent UI, token management, revocation |
| Better for marketplace integrations | Overkill for current user base |

**Effort:** Large. Would need an authorization server (authlib or similar), consent flow,
scope system, token endpoint, refresh tokens.

### Option D: Zapier-Specific Integration (No Public API)

Build a private Zapier app using Zapier's platform, with dedicated trigger/action endpoints
that only Zapier calls.

| Pros | Cons |
|------|------|
| Focused on one platform | Vendor lock-in |
| Zapier handles auth UX | Doesn't serve other integrations |
| Can use session-based auth via Zapier's session auth | Still needs API key or similar for Zapier |

**Effort:** Medium, but narrower value.

---

## 3. Open Questions

### Q1: Encryption — What happens for encrypted users?

This is the hardest design question. Options:

- **a) Block API access entirely** when `encryption_enabled=true`. Simple, safe, but
  limits power users who want both encryption and integrations.
- **b) Return ciphertext** and let the client deal with it. Technically honest but
  useless for Zapier/Make.com — they can't decrypt.
- **c) Return plaintext for unencrypted fields only** (dates, status, priority, impact).
  Useful for triggers ("task completed") but actions like "create task" would write
  plaintext titles that the user then sees as unencrypted in an otherwise encrypted account.
- **d) Require a "server-side decryption key"** — user provides their passphrase to the
  server, which derives the key and decrypts on the fly. Breaks E2E promise entirely.
- **e) Separate "integration mode"** — user explicitly opts in, acknowledging that API
  access means titles/descriptions are stored and transmitted in plaintext for API-created
  tasks, while existing encrypted tasks remain encrypted.

**Recommendation:** Option (c) for read triggers + option (a) for write actions, with
clear messaging: "API access for encrypted accounts is limited to metadata-only triggers.
To use full API access, disable encryption."

### Q2: API Key Scoping

Should API keys have scopes (read-only, write, admin)? Or start with full access?

- Full access is simpler to implement but riskier if a key leaks.
- Scoped keys are more work but standard practice.
- Minimum viable: `read` and `write` scopes. `read` for triggers, `write` for actions.

### Q3: Rate Limits for API Keys

Should API-key requests have different rate limits than browser sessions?

- Higher limits enable automation (bulk imports, frequent polling).
- Lower limits protect against abuse.
- Current general limit is 60/min — probably too low for active integrations.
- Suggestion: 120/min for API keys, with option to request higher limits.

### Q4: Webhook Delivery Guarantees

What SLA for webhook delivery?

- In-process asyncio: best-effort, lost on restart. Fine for MVP.
- Redis-backed queue: at-least-once delivery. Needs new infrastructure.
- Current Railway setup is single-dyno — in-process is probably fine for now.

### Q5: Multi-Instance Rate Limiting

If Whendoist scales to multiple instances, in-memory rate limiting breaks (each instance
tracks independently). When is this a real concern?

- Current: single Railway dyno. Not a problem.
- Future: would need Redis-backed slowapi storage.
- Could defer until multi-instance is actually needed.

### Q6: OpenAPI Versioning

Should the public API be a separate version (`/api/v2/` or `/api/public/v1/`)? Or reuse
existing `/api/v1/` endpoints with API key auth as an additional auth method?

- Reusing v1 is simplest but couples internal SPA endpoints with public API surface.
- Separate namespace allows different response shapes, pagination, field filtering.
- Recommendation: reuse v1 initially, split later if needed.

### Q7: Idempotency Keys

Should the public API support idempotency keys for safe retries? Standard practice for
write APIs (Stripe, etc.) but adds complexity.

---

## 4. Recommendation

### Start with Option A (API Keys Only)

**Why:** It provides 80% of the integration value with 20% of the effort. The existing
endpoint surface is already comprehensive (full CRUD for tasks, domains, instances). Adding
API key auth is a thin layer on top.

### Phased Approach

**Phase 1 — API Keys (small effort)**
1. Add `ApiKey` model (id, user_id, key_hash, name, scopes, created_at, last_used_at)
2. Add `get_api_key_user()` auth dependency that checks `X-API-Key` header
3. Modify `require_user` to try session auth first, then API key auth
4. Add key management endpoints: create, list, revoke
5. Add OpenAPI security scheme annotation (`APIKeyHeader`)
6. Add `API_KEY_LIMIT` rate limit tier (120/min)
7. Block API key access for encrypted users (return 403 with explanation)

**Phase 2 — Webhooks (medium effort)**
1. Add `Webhook` model (id, user_id, url, secret, events[], enabled, created_at)
2. Add webhook management endpoints (CRUD)
3. Instrument task/domain mutation handlers to publish events
4. Implement async delivery with HMAC-SHA256 signing
5. Add retry logic (3 attempts, exponential backoff)
6. Add webhook delivery log for debugging

**Phase 3 — Zapier App (medium effort, after Phase 1+2)**
1. Build Zapier integration using the public API
2. Register triggers (task created/completed/scheduled)
3. Register actions (create task, complete task, update task)
4. Submit to Zapier marketplace

**Phase 4 — Encryption Compatibility (deferred, needs design)**
1. Design "integration mode" for encrypted users
2. Allow metadata-only triggers (dates, status, impact)
3. Document limitations clearly

### What NOT to Build Yet

- OAuth2 provider (overkill for current scale)
- Redis-backed rate limiting (single dyno is fine)
- Persistent webhook queue (in-process delivery sufficient for MVP)
- Real-time WebSocket API (polling via API keys is adequate)
