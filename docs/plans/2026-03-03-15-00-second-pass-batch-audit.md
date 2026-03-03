---
version: v0.56.13
pr: 621
created: 2026-03-03
---

# Second-Pass Multi-Select & Batch Operations Audit

After the first audit (22 findings, all fixed in v0.56.8–v0.56.12), this second pass found 6 new issues — mostly interaction bugs between the first-audit fixes and edge cases in the composite helper infrastructure.

## Findings & Fixes

### Finding 1 (Major): Partial-failure toast replaces undo action
**Root cause:** Sonner replaces the *entire* toast config when `toast.warning({ id })` is called. The `action` property wasn't re-included.
**Fix:** Extract the undo action into a shared `undoAction` variable and include it in both `toast.success()` and `toast.warning()` calls. Applied to all 4 locations: `executeBatch`, `executeInstanceBatch`, `batchToggleCompleteAll`, `batchUnscheduleAll`.

### Finding 2 (Major): Cmd+Enter uses separate calls instead of composite
**Root cause:** `dashboard.tsx` and `palette-batch-actions.tsx` still called `batchToggleComplete` + `batchToggleCompleteInstances` separately, producing two toasts with two Undo buttons.
**Fix:** Replaced with `batchToggleCompleteAll`. Also fixed palette's `handleReschedule` and `handleUnschedule` to use composite helpers.

### Finding 3 (Major): orderedIds includes tasks from collapsed domain groups
**Root cause:** `task-list.tsx`'s `orderedIds` memo iterates ALL groups, but collapsed groups hide tasks visually via Radix Collapsible. Shift+Click range selection could select invisible tasks.
**Fix:** Read `collapsedDomains` from `useUIStore` and skip groups where `collapsedDomains.has(domainKey)`.

### Finding 4 (Major): Lasso cached card positions go stale during auto-scroll
**Root cause:** Audit #20 cached card positions at lasso start for performance. Audit #15 added auto-scroll. The two optimizations conflict: auto-scroll moves the viewport but cached positions remain fixed.
**Fix:** Added `scrollDirtyRef` flag set when `autoScrollTick` actually changes `scrollTop`. In the rAF hit-test, re-cache positions when the flag is set. This preserves the optimization (no reflow per frame unless scrolling) while keeping positions accurate.

### Finding 5 (Major): Batch reschedule uses two separate calls
**Root cause:** FAB and context menu called `batchReschedule` + `batchRescheduleInstances` separately, producing two toasts.
**Fix:** Created `batchRescheduleAll` composite helper (following the pattern of `batchToggleCompleteAll` and `batchUnscheduleAll`). Updated all 3 call sites: FAB, context menu, and command palette.

### Finding 6 (Minor): Batch edit Apply enabled for no-op changes
**Root cause:** `hasChanges` was `touched.size > 0`, but a user could touch a field and set it to "—" (UNSET), enabling Apply while `handleApply` would produce zero mutations.
**Fix:** Compute `hasChanges` via `useMemo` checking that at least one touched field has a non-UNSET/non-empty value.

## Files Changed

- `frontend/src/lib/batch-mutations.ts` — Fixes 1 + 5: undo preservation in partial-failure toasts, new `batchRescheduleAll` composite
- `frontend/src/routes/_authenticated/dashboard.tsx` — Fix 2: use `batchToggleCompleteAll`
- `frontend/src/components/search/palette-batch-actions.tsx` — Fix 2 + 5: use composite helpers
- `frontend/src/components/task/task-list.tsx` — Fix 3: skip collapsed groups in `orderedIds`
- `frontend/src/components/calendar/lasso-selection.tsx` — Fix 4: re-cache on scroll
- `frontend/src/components/batch/floating-action-bar.tsx` — Fix 5: use `batchRescheduleAll`
- `frontend/src/components/batch/batch-context-menu.tsx` — Fix 5: use `batchRescheduleAll`
- `frontend/src/components/batch/batch-edit-popover.tsx` — Fix 6: disable Apply for no-ops
