# v1.0 Launch Plan

> Final push to v1.0. Eight sessions, two phases.
>
> Created: February 9, 2026

---

## Session Table

| # | One-liner | Model | Thinking | Parallel? |
|---|-----------|-------|----------|-----------|
| **Phase 1 — Fixes** | | | | |
| 1 | Fix README: Executable→Autopilot, P1→High, update all stale terminology | Sonnet | none | Yes |
| 2 | Add 5-min TTL to SW API cache + invalidate on online event | Sonnet | standard | Yes |
| 3 | Add `aria-live` announcer for offline/online status and swipe hints on task items | Sonnet | none | Yes |
| 4 | Document rate-limit in-memory limitation + write Redis migration guide in DEPLOYMENT.md | Sonnet | none | Yes |
| 5 | Replace mobile top tabs with fixed bottom tab bar (safe-area, badge, haptic) | Sonnet | extended | Yes |
| **Phase 2 — Investigations** | | | | |
| 6 | Audit recurring task system: trace full lifecycle, find edge cases in 15 versions of fixes | Opus | extended | Yes |
| 7 | Audit GCal sync: trace failure modes, token refresh races, bulk sync limits across 8 hardening rounds | Opus | extended | Yes |
| 8 | PWA offline writes: design IndexedDB queue, estimate effort, recommend implement/defer/warn | Opus | extended | Yes |

Phase 1 sessions (1-5) run in parallel — zero dependencies between them.
Phase 2 sessions (6-8) run in parallel — all read-only investigations.
Both phases can run concurrently.

---

## Phase 1: Parallel Fixes

### Session 1 — README Terminology Fix

**Prompt:**
> Read README.md. The Energy-Based Filtering table and Task Properties section use stale terminology from before v0.39.0. Update to match the current app:
> - Clarity levels: `Executable`→`Autopilot`, `Defined`→`Normal`, `Exploratory`→`Brainstorm`
> - Energy labels stay: Zombie/Normal/Focus (those didn't change)
> - Impact: `P1 (high) → P4 (minimal)` → `High / Mid / Low / Min`
> - Column name: "Clarity" → "Mode" (the sort header says Mode)
> - The "Use When" descriptions should match the current energy tooltips: "Zombie — no-brainers" / "Normal — clear tasks" / "Focus — deep work too"
> - Scan the entire README for any other stale references (Executable, Exploratory, P1-P4, "clarity")
> - Do NOT change CLAUDE.md, CHANGELOG.md, or docs/ — only README.md

**Files:** `README.md`
**Acceptance:** Zero references to old terminology. README matches what users see in the app.

---

### Session 2 — Service Worker Cache TTL

**Prompt:**
> Read `static/sw.js`. The API cache strategy (network-first with cache fallback) stores responses indefinitely. After offline→online, stale data may be served. Fix this:
> 1. When caching API responses, store a timestamp header (e.g., `X-SW-Cached-At`)
> 2. On cache hit (when network fails), check if the cached response is older than 5 minutes — if so, treat as cache miss
> 3. Listen for the `online` event (or `message` from main thread) and delete all entries in the API cache
> 4. Do NOT change the static asset cache strategy (cache-first with background update is correct)
> 5. Do NOT change the offline fallback page behavior
> Keep the existing CACHE_VERSION / naming scheme. Test by reading the existing code carefully.

**Files:** `static/sw.js`
**Acceptance:** API cache entries expire after 5 min. Online event clears API cache. Static assets unaffected.

---

### Session 3 — Accessibility: aria-live Announcements

**Prompt:**
> Add screen reader announcements for two things that are currently invisible to assistive tech:
> 1. **Network status** — When the app goes offline/online, announce it via an `aria-live="assertive"` region. Read `static/js/mobile-core.js` lines 357-385 where online/offline events are handled — add announcements there.
> 2. **Swipe affordance** — Task items should hint that swipe gestures are available. Add `aria-roledescription="swipeable task"` to `.task-item` elements in the task list template. This is a light touch — don't over-engineer.
> 3. Add a visually-hidden announcer div `<div id="a11y-announcer" aria-live="polite" class="sr-only"></div>` to `app/templates/base.html`. Add the `.sr-only` utility class to `static/css/app.css` if it doesn't exist (position: absolute, clip, etc.).
> Read existing code first. Keep changes minimal.

**Files:** `app/templates/base.html`, `static/js/mobile-core.js`, `static/css/app.css`, task list template (find it)
**Acceptance:** Screen readers announce offline/online. Task items have swipe role description. No visual changes.

---

### Session 4 — Rate Limiting Scaling Documentation

**Prompt:**
> The rate limiter uses slowapi with in-memory storage. This works for one Railway dyno but breaks with horizontal scaling (each replica has independent counters). Document this:
> 1. Read `app/middleware/rate_limit.py` to understand the current implementation
> 2. Add a "Scaling" section to `docs/DEPLOYMENT.md` that:
>    - Explains the current in-memory limitation
>    - Shows the exact code change needed for Redis backend (slowapi supports `storage_uri="redis://..."`)
>    - Notes that this is needed before enabling `replicas > 1` on Railway
> 3. Add a bullet to the "Technical Debt" section in `docs/V1-ROADMAP.md`:
>    - "Rate limiting uses in-memory store — requires Redis before horizontal scaling"
> Do NOT change production code. Documentation only.

**Files:** `docs/DEPLOYMENT.md`, `docs/V1-ROADMAP.md`
**Acceptance:** Clear docs explaining when Redis is needed and how to migrate. No production code changes.

---

### Session 5 — Mobile Bottom Navigation

**Prompt:**
> Replace the mobile top tabs with a fixed bottom tab bar. This is a standard mobile pattern — tabs at the bottom are reachable by thumb on large phones.
> 1. Read the current implementation: `static/js/mobile-tabs.js`, `static/css/mobile.css` (search for `.mobile-tabs`), `app/templates/dashboard.html` (find the tab markup)
> 2. Move the tab bar to the bottom of the viewport:
>    - `position: fixed; bottom: 0; left: 0; right: 0`
>    - Respect safe area: `padding-bottom: env(safe-area-inset-bottom)`
>    - Keep the same tabs: Tasks / Schedule (with badge counter)
>    - Add a subtle top border or shadow for visual separation
> 3. Adjust the task list scroll container (`static/css/dashboard.css`) to add bottom padding equal to the tab bar height so content isn't hidden behind it
> 4. Hide top tabs on mobile, show bottom tabs. Keep desktop layout unchanged.
> 5. Match existing design language (use CSS custom properties from tokens.css)
> 6. Dark mode support (check `[data-theme="dark"]` section in dashboard.css)
> Read `static/css/dashboard.css` in sections — it's 3000+ lines. Use the @media queries section at the bottom.

**Files:** `static/css/mobile.css`, `static/css/dashboard.css`, `static/js/mobile-tabs.js`, `app/templates/dashboard.html`
**Acceptance:** Bottom tabs on mobile. Top tabs on desktop. Badge works. Dark mode works. Safe area respected. No scroll content hidden.

---

## Phase 2: Deep Investigations

### Session 6 — Recurring Task Edge Case Audit

**Prompt:**
> You are auditing the recurring task system for edge cases before v1.0 launch. This system went through 15+ versions of fixes (v0.32.5–v0.32.19). Your job is to find what's still broken or risky.
>
> Read these files thoroughly:
> - `app/services/recurrence_service.py` — materialization logic
> - `app/tasks/recurring.py` — background materialization loop
> - `app/routers/v1/instances.py` — instance API endpoints
> - `app/routers/v1/tasks.py` — task CRUD (recurring task paths)
> - `app/models.py` — Task and TaskInstance models
> - All test files related to recurring tasks (grep for "recur", "instance", "materialize")
>
> Trace the full lifecycle: task creation → rule parsing → instance materialization → display → completion → skip → reopening → deletion.
>
> Check these specific edge cases:
> 1. Concurrent materialization (two background runs overlap)
> 2. Recurrence rule change while instances exist (are old instances orphaned?)
> 3. Task deletion during active materialization
> 4. Timezone edge cases: DST transitions, user timezone changes mid-recurrence
> 5. Month-end: monthly task on Jan 31 → what happens in Feb?
> 6. recurrence_end in the past when materialization runs
> 7. Instance completion racing with background materialization
> 8. Very high instance counts (daily task with 5-year recurrence → 1800+ instances)
> 9. Bulk completion of past instances — race with individual completion
> 10. Skip → re-open → re-skip sequences
>
> Write a report with: confirmed risks (with severity), areas needing tests, and recommended fixes or monitoring.
> Do NOT change any code. Investigation only.

**Deliverable:** Report in the conversation (not a file). We'll triage findings before acting.

---

### Session 7 — GCal Sync Stability Audit

**Prompt:**
> You are auditing the Google Calendar sync system for remaining failure modes before v1.0. This system went through 8+ rounds of hardening (v0.31.0–v0.32.8). Your job is to find what could still break in production.
>
> Read these files thoroughly:
> - `app/services/gcal_sync.py` — bulk sync, enable/disable, background sync
> - `app/services/gcal.py` — Google Calendar API wrapper, token management
> - `app/routers/v1/gcal_sync.py` — sync API endpoints
> - `app/models.py` — GoogleToken, GoogleCalendarEventSync models
> - `tests/test_gcal.py` — existing test coverage
>
> Check these specific scenarios:
> 1. Token refresh race: two concurrent requests both find expired token
> 2. Google revokes OAuth access mid-bulk-sync (not just 403 — full revocation)
> 3. User rapidly toggles sync on/off/on (cancellation signal reliability)
> 4. Sync calendar deleted externally by user in Google Calendar UI
> 5. 1000+ tasks: does bulk sync complete within materialization timeout (5 min)?
> 6. Memory usage during large syncs (event objects accumulating)
> 7. Partial failure recovery: 500 events synced, event 501 fails — what state?
> 8. Adaptive throttle: does it actually recover (backoff → resume normal rate)?
> 9. Orphan events: are they reliably cleaned up in all scenarios?
> 10. What happens if Google API returns unexpected response shapes?
>
> Write a report with: failure modes (likelihood × severity matrix), operational runbook items, recommended monitoring/alerting.
> Do NOT change any code. Investigation only.

**Deliverable:** Report in the conversation. We'll triage findings before acting.

---

### Session 8 — PWA Offline Writes Investigation

**Prompt:**
> Investigate whether Whendoist should implement an IndexedDB-based offline write queue for v1.0, or defer it.
>
> Read these files:
> - `static/sw.js` — current service worker (note the stubbed `syncTasks()` at lines 334-344)
> - `static/js/error-handler.js` — safeFetch() behavior when offline
> - `static/js/mobile-core.js` — network status handling
> - `static/js/task-complete.js` — task completion flow
> - `static/js/task-swipe.js` — swipe-to-complete/delete flow
>
> Answer these questions:
> 1. **Current behavior**: What exactly happens when a user completes/deletes a task while offline? Trace the code path.
> 2. **Queue design**: If we implemented an offline queue, which operations need queuing? (complete, delete, create, edit, skip instance, reschedule). What's the IndexedDB schema?
> 3. **Conflict resolution**: User completes task offline, but on the server that task was already deleted by another session. How to resolve?
> 4. **UI feedback**: How should the app indicate "3 changes pending sync"? Where does this UI go?
> 5. **Effort estimate**: Roughly how many files change, how many lines of code, how many days?
> 6. **Risk**: What breaks if the offline queue has a bug? (data loss, duplicate operations, stale UI)
> 7. **Alternative**: Instead of a full queue, could we just show "You're offline — changes won't be saved" and block mutations? What's the UX cost?
>
> **Recommendation**: Should we implement the queue for v1.0, defer to v1.1, or go with the warn-only approach?
> Do NOT change any code. Investigation only.

**Deliverable:** Design doc in the conversation with architecture, effort estimate, and recommendation.

---

## Post-v1.0 Backlog

Items intentionally deferred from v1.0:

### Product Features (Deferred)
| Item | Was | Rationale |
|------|-----|-----------|
| Mobile UX Overhaul | Roadmap "Important #1" | Vision features (gap surfacing, decision interface) are v2.0. Current mobile is functional. |
| Undo/Redo | Roadmap "Important #3" | Delete has toast notification. Full undo is a v1.1 feature. |
| Bulk Operations | Roadmap "Important #4" | One-at-a-time editing works. Efficiency improvement, not a blocker. |
| Honeycomb Profiling | Roadmap "Post-v1.0" | Already correctly positioned. |

### Infrastructure (Deferred)
| Item | Trigger |
|------|---------|
| Redis rate limiting | Before enabling `replicas > 1` |
| Redis cache (CalendarCache) | Before multi-worker deployment |
| Offline write queue | Pending Session 8 investigation |
| Security scanning in CI (pip-audit) | Nice-to-have |
| Performance regression testing | Nice-to-have |

---

## Launch Checklist

After all 8 sessions complete:

- [ ] Phase 1 fixes merged (Sessions 1-5)
- [ ] No critical findings in recurring task audit (Session 6)
- [ ] No critical findings in GCal sync audit (Session 7)
- [ ] PWA decision made: implement queue, defer, or warn-only (Session 8)
- [ ] If PWA queue decided for v1.0 — implement and merge
- [ ] Manual mobile testing pass (real phone, 1 hour)
- [ ] Update V1-ROADMAP.md with post-v1.0 backlog changes
- [ ] Update CHANGELOG.md
- [ ] CI green on master
- [ ] Bump version to 1.0.0
- [ ] Create release PR: `v1.0.0/feat: Production-ready release`
