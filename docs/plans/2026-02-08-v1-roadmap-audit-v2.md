okay# V1.0 Roadmap Audit v2: Post-Implementation Reality Check

> **Created:** February 8, 2026
> **Purpose:** Honest assessment of roadmap items #2, #3, #4, #6 after v0.40.0–v0.41.1 shipped
> **Supersedes:** [V1-ROADMAP-AUDIT.md](V1-ROADMAP-AUDIT.md) (written before v0.40.1–v0.41.1)

---

## Executive Summary

**Three documents exist with conflicting claims.** Here's the truth:

| Feature | V1-ROADMAP.md | V1-ROADMAP-AUDIT.md | Actual State (v0.41.1) | Verdict |
|---------|---------------|---------------------|------------------------|---------|
| **#2: Onboarding** | "No guided setup" | IMPLEMENTED | Full 7-step wizard | **DONE** — remove from blockers |
| **#3: Error Recovery** | "Generic errors" | PARTIAL | Foundation solid, ~40% migrated | **IN PROGRESS** — needs migration completion |
| **#4: Data Export** | "Manual endpoint" | IMPLEMENTED | Full UI + API + tests | **DONE** — remove from blockers |
| **#6: Keyboard Shortcuts** | "Limited (Ctrl+K)" | MINIMAL | Full system + discoverability | **MOSTLY DONE** — needs more shortcuts |

**Bottom line:** 2 of 4 "critical blockers" are fully done. The other 2 have solid foundations but need completion work.

---

## Why the Documents Disagree

**Timeline:**
1. V1-ROADMAP.md written ~ early Feb 2026 (reflects pre-v0.40.0 state)
2. V1-ROADMAP-AUDIT.md written after roadmap (correctly identified onboarding + export as done)
3. V1-BLOCKERS-IMPLEMENTATION-PLAN.md written as action plan for remaining work
4. v0.40.1 shipped — Error recovery foundation (safeFetch, typed errors, network detection)
5. v0.41.0 shipped — Toast system redesign (queue, typed notifications, deduplication)
6. v0.41.1 shipped — Keyboard shortcuts discoverability (footer, toast, tooltips, help modal)

**The audit and implementation plan were never updated after the implementation work landed.** Both documents describe work that has since been completed.

---

## Detailed Assessment

### #2: User Onboarding — DONE

**All three documents are wrong in different ways.**

The roadmap says "No guided setup." This was never true — the wizard was built before the roadmap was written. The audit correctly identified this.

**What exists:**
- 7-step wizard: Welcome → Energy → Calendar → Calendar Selection → Todoist Import → Domains → Ready
- `app/routers/wizard.py` — API endpoints (status, complete, reset)
- `static/js/wizard.js` — 1,400+ lines, full mobile support
- `static/css/wizard.css` — 2,600+ lines with glassmorphism design
- Custom SVG illustrations for each step
- OAuth integration (Google Calendar, Todoist)
- State persistence via localStorage (survives OAuth redirects)
- Mobile: swipe navigation, haptic feedback, virtual keyboard handling
- Accessibility: reduced motion, ARIA labels, keyboard support
- Tests: `tests/test_hotfix_wizard_bugs.py`

**What could be improved (post-v1.0):**
- Sample/demo tasks to play with during onboarding
- Feature discovery tooltips after wizard completes
- A/B testing different wizard flows

**Action:** Remove from all blocker lists. No work needed.

---

### #3: Error Recovery UX — IN PROGRESS (~60% done)

**The audit was accurate when written. v0.40.1 and v0.41.0 addressed most of what it flagged, but migration is incomplete.**

**What was built (v0.40.1):**
- `static/js/error-handler.js` (420 lines):
  - Typed error classes: `NetworkError`, `ValidationError`, `AuthError`, `CSRFError`, `NotFoundError`, `RateLimitError`, `ServerError`, `HTTPError`
  - `safeFetch()` — pre-flight network check, auto CSRF injection, typed error throwing
  - `handleError()` — recovery actions (retry, refresh), Sentry tags, user-friendly messages
  - Network status detection (online/offline events, custom events for module retry)
  - Global error boundary (unhandled rejections + uncaught exceptions)
- 17 fetch() calls migrated across 4 modules:
  - `task-dialog.js` (7 calls)
  - `drag-drop.js` (5 calls)
  - `task-complete.js` (3 calls)
  - `plan-tasks.js` (2 calls)
- `docs/ERROR-HANDLING.md` — developer guide

**What was built (v0.41.0):**
- `static/js/toast.js` complete rewrite:
  - Queue system (max 5, FIFO, error priority)
  - Typed API: `Toast.success()`, `.error()`, `.warning()`, `.info()`
  - Type-based durations (success: 3s, error: 6s, persistent with actions)
  - Deduplication by ID
  - In-place updates (same ID updates without exit animation)
  - Backward compatibility with all 30+ existing call sites
- `docs/TOAST-SYSTEM.md` — API reference

**What's still missing:**
- **~21 fetch() calls unmigrated** in:
  - `wizard.js` — Todoist import, form submissions
  - `mobile-sheet.js` — Task operations on mobile
  - `passkey.js` — WebAuthn registration/authentication
  - `crypto.js` — Encryption operations
  - `task-list-options.js` — Settings panel actions
  - `task-swipe.js` — Swipe actions
  - `analytics.js` — Chart data loading
  - `mobile-core.js` — Mobile-specific operations
  - Other modules with 1-2 calls each
- **No HTML error pages** for direct navigation to 404/500

**Honest assessment:** The hard architecture work is done. What remains is mechanical migration — wrapping existing fetch() calls in safeFetch()+handleError(). This is low-risk, repetitive work. The 4 highest-traffic modules are already migrated.

**Remaining effort:** ~4-6 hours of migration work + testing.

**Action:** Complete fetch() migration. This is the only true remaining v1.0 blocker of the four items.

---

### #4: Data Export — DONE

**The roadmap says "Manual backup endpoint exists." This undersells reality significantly.**

**What exists:**
- `app/routers/backup.py`:
  - `GET /api/v1/backup/export` — Downloads timestamped JSON file
  - `POST /api/v1/backup/import` — Restores from uploaded JSON
  - Rate limited: 5 requests/minute
- `app/services/backup_service.py` (375 lines):
  - Full schema validation via Pydantic before any mutations
  - Exports: domains, tasks with instances, preferences
  - Imports: validates → clears → restores (savepoint-protected)
  - Domain ID remapping (old→new)
  - Multitenancy-safe
- UI in `app/templates/settings.html`:
  - "Download Backup" button — one-click, auto-named file
  - "Restore Backup" button — file picker + "RESTORE" confirmation prompt
  - Success/error status messages
- Tests: `tests/test_backup_validation.py` (10 tests covering validation, import safety, domain mapping)

**What's missing (explicitly post-v1.0):**
- Scheduled/automated exports (cron → email/cloud storage)
- Backup history/retention
- Incremental backups

**Action:** Remove from all blocker lists. Users can export and import their data. Scheduled exports are a nice-to-have.

---

### #6: Keyboard Shortcuts — MOSTLY DONE (~80%)

**The audit said "MINIMAL" and the roadmap said "Limited (Ctrl+K)." Both are now outdated after v0.41.0 + v0.41.1.**

**What was built (v0.41.0):**
- `static/js/shortcuts.js` (346 lines):
  - Centralized, declarative shortcut registry
  - Context-aware (global vs page-specific)
  - Modifier key support (Ctrl, Alt, Shift, Meta)
  - Input field exclusion
  - Help modal with category grouping
  - Tooltip integration via `data-shortcut` attribute
  - Public API: `register()`, `setContext()`, `openHelp()`, `closeHelp()`, `addTooltip()`
- 4 implemented shortcuts:
  - `?` — Open help modal
  - `q` — Quick add task
  - `n` — New task (editor)
  - `Escape` — Close dialog/panel

**What was built (v0.41.1):**
- Footer hint bar: "? Keyboard shortcuts" with dismiss, localStorage persistence, hidden on mobile
- One-time toast: "Press ? to view keyboard shortcuts" with "Show" action, desktop only
- Tooltip enhancement: `data-shortcut="q"` on quick-add FAB
- Settings panel: "Keyboard Shortcuts" section with "View Shortcuts" button

**What's missing:**
- More shortcuts (only 4 exist). Candidates from future roadmap:
  - Task navigation: `j`/`k` for next/prev
  - Task actions: `c` complete, `d` delete, `e` edit
  - Go-to: `g t` tasks, `g a` analytics, `g s` settings (chord shortcuts)
  - View: `1`/`2`/`3` for energy modes, `/` for search
- Customizable keybindings (explicitly post-v1.0 per roadmap)
- Command palette (post-v1.0, when 15+ actions exist)

**Honest assessment:** The infrastructure is complete and well-designed. Discoverability is excellent (triple-layered: footer + toast + tooltips). The gap is that only 4 shortcuts exist — power users want more. But the system is ready to absorb more shortcuts trivially; each new shortcut is ~10 lines of config.

**Question:** Is 4 shortcuts enough for v1.0? The discoverability and help modal are done. Adding j/k/c/d/e would take ~2 hours max with the existing system. Not adding them means the help modal is underwhelming ("you opened this to see 4 shortcuts?").

**Action:** Add 5-8 more shortcuts for task navigation and actions. Small effort, big perceived value.

---

## Revised v1.0 Blocker List

### True Blockers (must do):

1. **Complete safeFetch migration** (~4-6 hours)
   - Migrate remaining ~21 fetch() calls
   - Focus on: mobile-sheet.js, task-swipe.js, task-list-options.js
   - Skip: wizard.js (one-time flow, already has error handling), passkey.js (niche)

2. **Add more keyboard shortcuts** (~2-3 hours)
   - Task navigation: `j`/`k` next/prev task
   - Task actions: `c` complete, `e` edit, `d` delete (with confirmation)
   - Search: `/` focus search input
   - Requires: task selection state (visual highlight on focused task)

### Not Blockers (remove from lists):

3. **User Onboarding (#2)** — Done. Full wizard exists.
4. **Data Export (#4)** — Done. One-click download + restore exists.

### Documents to Update:

- **V1-ROADMAP.md** — Items #2 and #4 should be moved to "Already Done"
- **V1-ROADMAP-AUDIT.md** — Superseded by this document
- **V1-BLOCKERS-IMPLEMENTATION-PLAN.md** — Part 2 (Shortcuts) is done; Part 1 (Error Recovery) Phase 2-4 are done, only Phase 3 migration remains

---

## Lessons Learned

1. **Documentation rots fast when you ship fast.** Three docs were outdated within days of being written because implementation moved faster than doc updates.

2. **The roadmap should track what's done, not just what's planned.** A "Current State" section that gets updated with each release would have prevented the confusion.

3. **"Critical blocker" is overused.** Of 4 items marked critical, 2 were already done when the roadmap was written. Be honest about what's actually blocking.

4. **Implementation plans become outdated the moment you start coding.** The blockers plan prescribed specific PRs and timelines. Reality was: all the work landed in 3 quick releases (v0.40.1, v0.41.0, v0.41.1).

---

*Last updated: February 8, 2026 (post v0.41.1)*
