# Final Ship Readiness Review — v2 Prompt (React SPA)

> Paste this into a fresh conversation with full codebase context.
> Works best with Opus. Expects Claude Code with access to tools (Read, Grep, Glob, Task).
>
> **Stack context:** React 19 SPA (TanStack Router/Query, Zustand, Tailwind v4, shadcn/ui)
> + FastAPI backend (SQLAlchemy, PostgreSQL). Previous audits (v1 gate, Jan–Feb 2026)
> covered the legacy Jinja2/vanilla JS frontend. This audit focuses on the React SPA
> and any backend changes since v0.42.22.

---

## Prompt

You are conducting a ship-readiness review for this application. The backend was audited
thoroughly in February 2026 (v1 gate audits — see `docs/archive/`). Since then, the
entire frontend was rewritten as a React SPA and ~30 versions of backend changes shipped
(v0.42 → v0.54). Your job is to find anything that should block shipping — bugs, security
holes, data loss scenarios, state consistency issues, or UX correctness problems.

**This is a multi-phase review. Complete each phase fully and write its output before
starting the next. Do NOT read any files in `docs/archive/` until Phase 3.**

### Phase 1: Independent Investigation (blind)

**Do NOT read any prior audit docs, changelogs, or backlog items.** Form your own
threat model from the code alone.

Run the full CI suite first:
```bash
# Backend
uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test

# Frontend
cd frontend && npx tsc --noEmit && npx biome check . && npm run build
```

Confirm the baseline is green, then investigate these areas by reading actual source code.
For each area, trace data through the full stack. Use parallel subagents where possible.

**Traces to follow (launch as parallel investigations):**

1. **React ↔ API contract** — Pick 3 mutation flows (task create, task update, task delete).
   For each, trace: React component → form state → orval-generated hook → Axios request →
   FastAPI router → Pydantic validation → service → DB → response → TanStack Query cache
   update → UI re-render. Verify:
   - Does the client send exactly what the server expects?
   - Are optimistic updates correct? Do they roll back on error?
   - Does the cache invalidation cover all affected queries (tasks, instances, calendar)?
   - What happens on network error? On 4xx? On 5xx?

2. **Encryption data flow** — Trace the full encryption lifecycle:
   - `frontend/src/lib/crypto.ts` — key derivation, encrypt/decrypt primitives
   - `frontend/src/lib/use-crypto.ts` or `frontend/src/hooks/use-crypto.ts` — TanStack Query integration
   - `frontend/src/stores/crypto-store.ts` — key storage in Zustand
   - Which query hooks decrypt on fetch? Which mutation hooks encrypt before send?
   - What happens if the crypto store has no key but encrypted data arrives?
   - What happens during the encryption toggle (batch update of all tasks)?
   - Can plaintext ever leak into the TanStack Query cache?

3. **Routing and auth guard** — Trace the authentication boundary:
   - `frontend/src/routes/_authenticated.tsx` — what does it check? What happens on failure?
   - Can any authenticated route be accessed without a session?
   - What happens when a session expires mid-use? (API returns 401 during a mutation)
   - Are there any routes or API calls that bypass the auth wrapper?
   - How does the login flow work? (OAuth redirect → callback → session → React router)

4. **State consistency across components** — Pick 3 complex UI interactions:
   - Drag-and-drop task rescheduling (calendar panel)
   - Completing a recurring task instance
   - Subtask CRUD (create via ghost row, edit, delete)
   For each: What local state is involved? What TanStack Query cache mutations happen?
   Can the UI get stuck in an inconsistent state? What if two actions fire rapidly?

5. **Offline and PWA behavior** — Trace what happens when the network drops:
   - `frontend/src/hooks/use-network-status.ts` — how is offline detected?
   - Which mutations check online status before firing?
   - What does the service worker (`static/sw.js`) cache? What does it serve offline?
   - Can stale cached API responses cause data loss when the user comes back online?
   - Does the PWA manifest + service worker registration work correctly in the SPA?

6. **XSS and injection in React** — Even though React auto-escapes JSX, check:
   - Any use of `dangerouslySetInnerHTML`
   - Any `href` or `src` attributes built from user data (task titles, descriptions, domain names)
   - Any use of `window.open()`, `eval()`, `Function()`, or template literals in HTML context
   - URL parameters or route params rendered without sanitization
   - Third-party components that accept raw HTML (markdown renderers, rich text, etc.)

7. **Backend changes since v0.42** — The last audit covered up to v0.42.22. Check for
   regressions or new issues in:
   - Any new endpoints added since (check `app/routers/v1/__init__.py` and each router file)
   - Subtask endpoints (new feature) — do they filter by user_id? Handle cascade correctly?
   - Recurring task/instance endpoints — any changes to materialization or instance queries?
   - Any new Pydantic schemas — do they validate as strictly as existing ones?

After all investigations complete, write your findings to:
`docs/archive/v2-final-review-phase1.md`

Format: for each finding, include the file:line evidence, a severity
(CRITICAL/HIGH/MEDIUM/LOW), and a one-line description. Also list areas you
investigated and found clean.

**Do NOT proceed to Phase 2 until this file is written.**

---

### Phase 2: Adversarial Scenarios (blind)

Still without reading any prior audit docs, think like an attacker and a frustrated user.

**Attacker scenarios** — For each, determine if the application is vulnerable and provide evidence:

1. I'm a registered user. Can I read, modify, or delete another user's data through any
   API endpoint? (Check especially the new subtask endpoints and any batch operations.)

2. I found a valid session cookie. What can I do in the React SPA? Can I access encrypted
   content? Can I trigger a data wipe? Is there any re-authentication for destructive ops?

3. I can inject a malicious URL into a task title or description. When other code renders
   it (calendar event, notification, export), does it become an XSS vector?

4. I can manipulate the TanStack Query cache via browser devtools. Can I trick the SPA
   into sending mutations with another user's data? Can I poison the cache to show
   fabricated tasks?

5. I can intercept and replay API requests. Which mutations are idempotent? Which ones
   can cause damage if replayed (double-delete, double-complete, double-create)?

**Frustrated user scenarios** — For each, determine the outcome:

1. I have encryption enabled, I close the tab, reopen, and the passphrase prompt appears.
   I dismiss it. What state is the app in? Can I see my tasks (garbled)? Can I accidentally
   overwrite encrypted data with plaintext?

2. I'm on a slow 3G connection. I tap "complete" on a task, nothing happens for 3 seconds,
   I tap again. Then I tap "undo" on the first toast. What's the final state?

3. I have 200 recurring tasks. I open the calendar view for a week. How many API calls
   fire? How many instances are fetched? Does the UI stay responsive?

4. I drag a task to reschedule it, but my finger slips and drops it on the wrong day.
   Can I undo? What if I close the app before undoing?

5. I export a backup, switch to a new phone, import the backup. Does encryption still
   work? Are my passkeys valid? Is GCal sync preserved?

6. I'm using the app as a PWA on iOS Safari. I switch to another app, come back 5 minutes
   later. Is my session still valid? Does the UI render correctly (viewport bug)?

Append your findings to the same file:
`docs/archive/v2-final-review-phase1.md`

**Do NOT proceed to Phase 3 until these scenarios are written.**

---

### Phase 3: Cross-Reference and Gap Analysis

**NOW read all files in `docs/archive/` that start with `2026-` — these are previous
audit reports.** Also read `v1-final-review.md` and `v1-final-review-phase1.md`. Also
read the top of `CHANGELOG.md` for recent changes.

Do three things:

1. **Classify your Phase 1+2 findings:**
   - Already fixed in code → mark as VERIFIED
   - Already known from prior audits → mark as KNOWN, note which audit
   - **NEW** — not fixed and not previously identified → these are your key findings

2. **Re-verify prior findings:** The v1 final review identified these issues. Check if
   each has been fixed in the current code:
   - NF-1: `TaskUpdate.clarity` missing enum validation
   - NF-2: `BackupTaskSchema.status` accepts any string
   - NF-3: Archived task instances appear in calendar views
   - NF-4: Backup import doesn't clean GCal events
   - NF-5: Todoist import leaks `str(e)` to client
   - NF-6: Backup validation error returns 500 not 400
   - NF-7: `executeDeleteNow` undefined (legacy JS — still relevant?)
   - NF-8: No double-click protection on completion
   - Concurrent tab / materialization rollback scope
   - WebAuthn challenge non-atomic consume
   - Bulk sync vs concurrent task creation

3. **Frontend coverage gap:** The v1 audits thoroughly covered the backend but only
   examined the legacy vanilla JS frontend. The React SPA is entirely new code. Identify
   any frontend patterns or components that your Phase 1 investigation did NOT cover,
   and investigate them now. Pay special attention to:
   - Mobile-specific components (bottom sheet, swipe actions, action sheet)
   - Zustand store interactions with TanStack Query cache
   - Error boundaries and React error handling
   - Accessibility (live announcer, keyboard shortcuts)
   - Bundle size and code splitting

Write the final report to:
`docs/archive/v2-final-review.md`

Format:

```
# V2 Final Ship Readiness Review (React SPA)

## Executive Summary
[2-3 sentences on overall state]

## New Findings (not fixed, not previously identified)
[your findings with file:line evidence, severity, description]

## Prior Findings Re-verified
[status of each v1 finding — FIXED / STILL OPEN / N/A]

## Frontend Coverage Gaps Investigated
[what the v1 audits missed, now examined]

## Challenged Assumptions
[any "safe" claims from prior audits that you disagree with]

## Ship Verdict
[SHIP / SHIP WITH CAVEATS / DO NOT SHIP]
[One paragraph justifying the verdict with specific evidence]
```

---

### Ground Rules

- **Evidence over opinion.** Every claim needs a file:line reference.
- **Trace, don't grep.** Following data through the system catches more bugs than keyword searching.
- **Depth over breadth.** Five traces done thoroughly beat twenty surface-level checks.
- **Full stack traces.** For React, trace from component → hook → API → server → DB → response → cache → render. Half-traces miss the most dangerous bugs.
- **Think about timing.** React's concurrent rendering, TanStack Query's background refetching, and optimistic updates create timing windows that don't exist in server-rendered apps.
- **Think about what you're NOT seeing.** The most dangerous bugs are in code paths nobody tests.
- **Be direct.** If you think it should not ship, say so and say why.
