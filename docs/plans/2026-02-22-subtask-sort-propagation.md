---
version:
pr:
created: 2026-02-22
---

# Subtask Sort Propagation

## Context

The dashboard sort controls (clarity, duration, impact) have zero effect on subtasks today:
1. Subtasks stay in `position` order within their parent regardless of active sort
2. A parent's position in the sorted list ignores its subtasks' field values
3. A P1 subtask buried at position 5 within a parent is invisible to someone sorting by impact

## Design: "Best Subtask Drives Parent + Subtasks Sort Within"

Two complementary behaviors, both achieved by enhancing `sortTasks()`:

### A) Sort subtasks within each parent

When user sorts by impact ascending, subtasks reorder P1 → P4 within the parent.
Completed subtasks always sink to the bottom. Tiebreaker: `position` (original user order).

### B) Parent's effective sort value = best pending subtask's value

"Best" = the subtask that would rank first under the current sort direction.
- Impact asc: parent effective value = `min(subtask impacts)` (= highest priority subtask)
- Duration asc: parent effective value = `min(subtask durations)` (= quickest subtask)
- No pending subtasks → falls back to parent's own field value

This means a parent with a P1 subtask outranks a parent with only P3/P4 subtasks, even if the parent's own impact is P4.

### Behavior Matrix

| Sort | Direction | Parent Ranks By | Subtask Order |
|------|-----------|----------------|---------------|
| Impact | Asc (P1→P4) | min(subtask impacts) | P1 first |
| Impact | Desc (P4→P1) | max(subtask impacts) | P4 first |
| Duration | Asc (short→long) | min(subtask durations) | Shortest first |
| Duration | Desc (long→short) | max(subtask durations) | Longest first |
| Clarity | Asc (auto→brain) | min(subtask clarity) | Autopilot first |
| Clarity | Desc (brain→auto) | max(subtask clarity) | Brainstorm first |

## Implementation

**Single file change: `frontend/src/lib/task-utils.ts`**

1. Extract `getSortValue()` helper from the existing switch statement — works for both `TaskResponse` and `SubtaskResponse` since they share `impact`, `duration_minutes`, `clarity`
2. Enhance `sortTasks()` to:
   - For each parent task: sort pending subtasks by field+direction (tiebreak: position), completed subtasks to bottom (sorted by position)
   - Compute effective sort value from first sorted pending subtask (or parent's own value if no pending subtasks)
   - Sort top-level array by effective values (tiebreak: parent's own value)
   - Return new task objects with reordered subtask arrays

**No changes needed in:** `task-panel.tsx` (already calls `sortTasks()`), `task-item.tsx` (`SubtaskTree` renders in array order), `ui-store.ts`, `sort-controls.tsx`, backend

## Edge Cases

- **No subtasks**: Uses task's own value (unchanged from current)
- **All subtasks completed**: Falls back to parent's own field value
- **Null duration**: `?? 0` sorts as shortest (same as current)
- **Null clarity**: `?? "normal"` sorts as middle (same as current)
- **Standalone tasks vs parents**: Both participate equally — standalone uses own value, parent uses best subtask

## Verification

1. Sort by impact asc → parent with P1 subtask appears before parent with only P3/P4
2. Expand parent → subtasks ordered P1, P2, P3, P4 with completed at bottom
3. Toggle to desc → order reverses
4. Sort by duration → parent with 5-min subtask ranks near top in ascending
5. Complete all subtasks → parent falls back to own value
6. Frontend checks pass: `cd frontend && npx tsc --noEmit && npx biome check . && npm run build`
