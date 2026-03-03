---
version: v0.56.14
pr: 622
created: 2026-03-03
---

# Third-Pass Batch Operations Audit

Third UX audit of multi-select & batch operations, following two prior audits that found 28 issues total (22 + 6).

## Finding 1 (Major): Duplicate instances in complete handler

**Where:** FAB, context menu, keyboard shortcut (⌘+Enter)

When user selects both a recurring task parent AND its pending calendar instance, `findPendingInstancesForTasks()` resolves the same instance that's already in the explicit selection. The merged array contains the instance twice, causing `toggleInstanceComplete` to fire twice — the second toggle undoes the first, leaving the instance in its original state.

**Fix:** Added `deduplicateInstances()` helper in `batch-mutations.ts`. Applied in all three complete handlers (FAB, context menu, dashboard ⌘+Enter).

## Finding 2 (Major): SubtaskItem context menu never shows batch menu

**Where:** `task-item.tsx` SubtaskItem (~line 1395)

`SubtaskItem` already computes `isMultiSelected` and imports `BatchContextMenuItems`, but the `<ContextMenuContent>` always renders single-item `contextMenuItems` regardless of multi-selection state. `TaskItem` (line 968) correctly branches on `isMultiSelected`.

**Fix:** Mirrored the `TaskItem` pattern: `{isMultiSelected ? <BatchContextMenuItems /> : contextMenuItems}`.

## Finding 3 (Minor): Palette batch delete has no confirmation dialog

**Where:** `palette-batch-actions.tsx` handleDelete

Both the FAB and context menu show `window.confirm()` for bulk deletes (>3 tasks, or any tasks with subtasks). The palette's `handleDelete` skips this confirmation entirely.

**Fix:** Added the same confirmation logic from FAB/context menu.

## Finding 4 (Minor): Collapsing domain group doesn't clear selection

**Where:** `dashboard.tsx` filter-change useEffect

The selection-clear effect fires on `energyLevel` and `selectedDomainId` changes but not when `collapsedDomains` changes. Collapsing a group hides its tasks visually while they remain in the selection, letting users blindly batch-act on invisible tasks.

**Fix:** Added `collapsedDomains` from `useUIStore` to the effect's dependency array.
