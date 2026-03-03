---
version: v0.56.15
pr: 623
created: 2026-03-03
---

# Fourth-Pass Batch Operations Audit Fixes

## Context

Fourth-pass UX audit of multi-select & batch operations found 3 new issues across 4 surfaces (FAB, context menu, palette, keyboard shortcuts). Prior 3 audits fixed 32 issues. These are the remaining gaps: a missing confirmation dialog, a React lifecycle timing bug, and a palette-only feature inconsistency.

## Fixes

### Fix 1: Keyboard Delete/Backspace missing subtask cascade warning (Major)

**File:** `frontend/src/routes/_authenticated/dashboard.tsx` — Delete handler (~line 420) and Backspace handler (~line 435)

**Problem:** Both handlers check only `targets.length > 3` for confirmation. FAB, context menu, and palette all check subtask count first and show "Delete N tasks and M subtasks?" when parents with subtasks are being deleted.

**Change:** Add subtask count computation before the confirmation check in both handlers:
```js
const subtaskCount = targets.reduce((sum, t) => sum + (t.subtasks?.length ?? 0), 0);
if (subtaskCount > 0) {
  if (!window.confirm(`Delete ${targets.length} tasks and ${subtaskCount} subtasks?`)) return;
} else if (targets.length > 3) {
  if (!window.confirm(`Delete ${targets.length} tasks?`)) return;
}
```

### Fix 2: Palette "Edit…" dispatch races FAB mount (Major)

**File:** `frontend/src/components/search/palette-batch-actions.tsx` — `handleEdit` (~line 141)

**Problem:** `handleEdit` calls `selectAll()` then synchronously dispatches `"open-batch-edit"`. If the FAB isn't already mounted, the event fires before the FAB's `useEffect` registers its listener. The event is lost.

**Change:** Wrap the event dispatch in `setTimeout(fn, 0)`. This defers dispatch to the macrotask queue, which runs after React's effects (which register the FAB's listener). The `onDone()` call stays synchronous so the palette closes immediately.

```js
const handleEdit = useCallback(() => {
  useSelectionStore.getState().selectAll(Array.from(taskIds, (id) => taskSelectionId(id)));
  // Defer: FAB mounts and registers its listener in useEffect (runs before setTimeout)
  setTimeout(() => window.dispatchEvent(new Event("open-batch-edit")), 0);
  onDone();
}, [taskIds, onDone]);
```

### Fix 3: Palette "Complete" silently no-ops on all-completed selection (Minor)

**File:** `frontend/src/components/search/palette-batch-actions.tsx` — `handleComplete` (~line 101)

**Problem:** Palette's Complete handler always filters to incomplete tasks and always passes `completing = true`. If all selected tasks are completed, the filter produces an empty array and `batchToggleCompleteAll` early-returns. The palette closes with no feedback.

**Change:** Add toggle logic mirroring the FAB and context menu. Compute `allCompleted`, derive `completing`, filter targets accordingly, add deduplication. Also update the button label to show "Reopen" when applicable.

This requires:
1. A new `allCompleted` memo (same logic as FAB)
2. Updated `handleComplete` with toggle direction
3. Dynamic label on the Complete `BatchButton`

## Verification

```bash
cd frontend && npx tsc -p tsconfig.app.json --noEmit && npx biome check . && npm run build
```
