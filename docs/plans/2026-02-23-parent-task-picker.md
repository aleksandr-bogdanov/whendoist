---
version:
pr:
created: 2026-02-23
---

# Searchable Parent Task Picker

## Context

The current "Parent Task" selector in the task editor is a plain `<Select>` dropdown (lines 410-436 of `task-editor.tsx`) that lists every top-level non-recurring task with no search, no domain context, a generic "Task updated" toast, and no undo. It also requires the full form save to apply. Meanwhile, DnD reparenting already does immediate apply + a detailed toast with undo. The promote button is a separate action in a different part of the editor. This is inconsistent and unusable at scale.

## Changes

### 1. Create `frontend/src/components/task/parent-task-picker.tsx` (new)

Self-contained component with `Popover` + search input + filtered list. No new dependencies — uses existing `Popover`, `Input`, lucide icons.

**Props:**
```tsx
interface ParentTaskPickerProps {
  task: AppRoutersTasksTaskResponse;
  parentTasks: AppRoutersTasksTaskResponse[];
  domains: DomainResponse[];
}
```

**Closed state:** Button styled like `SelectTrigger` showing current parent (domain icon + title) or "None (top-level)", with `ChevronDown`.

**Open state:** Popover matching trigger width containing:
- Search input (auto-focused, `Search` icon)
- "None (top-level)" always first
- Separator
- Filtered task list (domain icon + title), excluding current task
- "No matching tasks" empty state

**On select:** Immediate API call using `useUpdateTaskApiV1TasksTaskIdPut`, with:
- Optimistic cache update (same pattern as DnD reparenting in `task-dnd-context.tsx:990-1068`)
- Construct `SubtaskResponse` from task for cache manipulation
- `useUIStore.getState().expandSubtask()` when assigning to parent
- Toast: `Made "X" a subtask of "Y"` or `Promoted "X" to top-level` with **Undo**
- Undo: snapshot restore + reverse mutation (identical to DnD)

**Local state for current parent:** Track `currentParentId` via `useState` initialized from `task.parent_id`, updated on successful mutation — avoids stale prop issue.

### 2. Modify `frontend/src/components/task/task-editor.tsx`

**Remove:**
- `ArrowUpFromLine` from lucide import (line 2)
- `parentId` state (line 80)
- `setParentId(...)` in populate effect (lines 100, 117)
- `parsedParentId` and `parent_id: parsedParentId` from `handleSave` (lines 180, 187, 218)
- `handlePromote` function (lines 318-331)
- Entire `{/* Parent task */}` Select block (lines 410-436)
- "Promote to top-level" button (lines 646-656)

**Add:**
- `import { ParentTaskPicker } from "./parent-task-picker"`
- In place of the old Select block:
  ```tsx
  {isEdit && task && parentTasks && parentTasks.length > 0 && (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">Parent Task</Label>
      <ParentTaskPicker task={task} parentTasks={parentTasks} domains={domains} />
    </div>
  )}
  ```

**Note:** Parent assignment on task *create* is removed. Subtask creation is done via DnD (the standard flow). The picker is edit-mode only.

## No new dependencies

Everything uses existing imports:
- `Popover`/`PopoverTrigger`/`PopoverContent` from `@/components/ui/popover`
- `useUpdateTaskApiV1TasksTaskIdPut`, `getListTasksApiV1TasksGetQueryKey` from `@/api/queries/tasks/tasks`
- `useQueryClient` from TanStack Query
- `toast` from sonner, `announce` from `@/components/live-announcer`
- `useUIStore` from `@/stores/ui-store`
- `Search`, `ChevronDown`, `X` from lucide-react

## Verification

```bash
cd frontend && npx tsc --noEmit && npx biome check . && npm run build
```

Manual: open task editor → change parent → verify toast shows "Made X a subtask of Y" with Undo → click Undo → verify revert.
