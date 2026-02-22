---
version: v0.54.11
pr: 397
created: 2026-02-21
---

# Fix Recurring Task Actions in Scheduled Section & Mobile

## Context

Recurring tasks in the task list (scheduled section) have several bugs where actions target the wrong instance or the parent task. The calendar's `InstanceCard` works correctly — this fix brings the task list to parity. Key user expectation: "if it was 5 days overdue and I click skip, it's now 4 days overdue."

## Bugs Found

### B1: Checkbox completes TODAY's instance, not the overdue one
- **File**: `task-item.tsx:148` — `data: null` means backend defaults to today
- If task is overdue for Feb 16, clicking checkbox completes Feb 21 instead

### B2: "Complete" menu item has same wrong-date problem
- **File**: `task-item.tsx:209` — same `data: null`

### B3: Optimistic update marks PARENT task as completed
- **File**: `task-item.tsx:127-146`
- Backend only completes the instance; parent stays "pending" → visual flicker

### B4: "Skip this one" missing for upcoming/today recurring tasks
- **File**: `scheduled-section.tsx:169-183` — `pendingInstance` only passed for overdue groups

### B5: Instance fetch only runs for overdue recurring tasks
- **File**: `scheduled-section.tsx:42-51` — `enabled: hasOverdueRecurring`

### B6: Date group header shows recurrence start, not instance date
- **File**: `scheduled-section.tsx:27` — groups by `task.scheduled_date` (recurrence start)

### B7: Mobile "Skip instance" only finds today's instance
- **File**: `task-action-sheet.tsx:47-56` — queries `today..today` only

### B8: "Unschedule" on recurring task modifies entire series
- **File**: `task-item.tsx:403-407` — sets parent's `scheduled_date: null`

## Changes

### 1. `frontend/src/components/task/scheduled-section.tsx`

**Fetch instances for ALL recurring tasks (B5):**
- `hasAnyRecurring = tasks.some(t => t.is_recurring)`
- `startDate = min(oldestOverdueDate, today)` (cover both overdue and upcoming)
- `enabled: hasAnyRecurring`

**Fix grouping for recurring tasks (B6):**
- Compute `pendingInstanceMap` first (move above grouping)
- Before `groupScheduledByDate`, override recurring tasks' `scheduled_date` with their pending instance date
- This makes recurring tasks appear under the correct date group

**Pass `pendingInstance` to ALL groups (B4):**
- Both overdue and upcoming groups: `pendingInstance={pendingInstanceMap.get(task.id)}`

### 2. `frontend/src/components/task/task-item.tsx`

**Fix checkbox for recurring tasks (B1, B3):**
- Import `useCompleteInstanceApiV1InstancesInstanceIdCompletePost` and `useUncompleteInstanceApiV1InstancesInstanceIdUncompletePost`
- In `handleToggleComplete`: if `task.is_recurring && pendingInstance`:
  - Use `completeInstance.mutate({ instanceId: pendingInstance.id })` (not toggleComplete on parent)
  - Optimistic update: mark instance as completed in instances cache
  - On success: invalidate instances, tasks, and pending-past-count queries

**Fix menu "Complete" (B2):**
- In `handleMenuComplete`: same routing to instance endpoint when `pendingInstance` exists
- Label: "Complete this one" when `pendingInstance`, else "Complete"

**Hide "Unschedule" for recurring tasks (B8):**
- Condition: `task.scheduled_date && !task.is_recurring` (both context menu and dropdown)

### 3. `frontend/src/components/mobile/task-action-sheet.tsx`

**Accept `pendingInstance` prop (B7):**
- Add optional `pendingInstance?: InstanceResponse` prop
- Use for "Skip instance" instead of today-only query
- Add "Complete this one" button using `useCompleteInstanceApiV1InstancesInstanceIdCompletePost`
- Fall back to today-query when prop not provided

**Wire up**: `domain-group.tsx:307` — pass `pendingInstance` (or skip since domain groups rarely have recurring tasks; lower priority)

## Files to Modify

1. `frontend/src/components/task/scheduled-section.tsx` — instance fetch scope, grouping, prop passing
2. `frontend/src/components/task/task-item.tsx` — checkbox, menu actions, imports
3. `frontend/src/components/mobile/task-action-sheet.tsx` — accept prop, add complete action

## Verification

1. `cd frontend && npx tsc --noEmit && npx biome check . && npm run build`
2. Overdue recurring task → "Skip this one" → date advances by 1 period
3. Overdue recurring task → checkbox → completes the overdue instance (not today's)
4. Today/upcoming recurring task → "Skip this one" and "Complete this one" available
5. Date group header shows instance date, not recurrence start
6. "Unschedule" hidden for recurring tasks in task list
