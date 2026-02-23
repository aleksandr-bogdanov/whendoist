---
version: v0.54.68
pr:
created: 2026-02-23
---

# Quick Add Subtask

## Context

Currently, adding subtasks requires either dragging a task onto a parent or using the full task editor to set a parent. This plan adds a fast inline "add subtask" flow — a ghost row at the bottom of expanded subtask trees, a hover '+' icon on parent rows, and an "Add subtask" entry in the mobile action sheet.

## Design

Three entry points, all funneling into the same ghost row inline input:

1. **Ghost row** — phantom subtask row at the bottom of expanded subtask area. Same nesting as siblings, muted styling (dashed border, faint "+" icon, "Add subtask..." placeholder). Click transforms to input. Enter creates, Escape cancels. Stays open after create for rapid sequential adds.

2. **Hover '+' icon** (desktop only) — appears on hover next to chevron/badge area. For existing parents: full opacity on hover. For non-parents: half opacity on hover, full on icon hover. Clicking auto-expands subtasks and focuses the ghost row input.

3. **"Add subtask" in mobile action sheet** — context menu entry that expands subtasks and focuses the ghost row.

### Eligibility

A task can receive subtasks if ALL are true:
- Not recurring (`!task.is_recurring`)
- Not completed (`task.status !== "completed"`)
- Not itself a subtask (`task.parent_id == null`)

## Files to Modify

### 1. `frontend/src/stores/ui-store.ts` — Add focus signal

Add to `UIState`:
```ts
subtaskAddFocusId: number | null;
```

Add to `UIActions`:
```ts
requestSubtaskAdd: (taskId: number) => void;
clearSubtaskAddFocus: () => void;
```

Implementation: `requestSubtaskAdd` expands the subtask tree (`expandedSubtasks.add(taskId)`) and sets `subtaskAddFocusId`. `clearSubtaskAddFocus` resets it to null. NOT persisted (transient signal) — no changes to `partialize`.

### 2. `frontend/src/components/task/subtask-ghost-row.tsx` — NEW component

Ghost row with two modes:
- **Placeholder mode**: muted row with `+` icon + "Add subtask..." text, click to activate
- **Editing mode**: inline `<input>` with auto-focus

Props: `parentTask: AppRoutersTasksTaskResponse`, `depth: number`

Creation logic (mirrors `domain-group.tsx` inline add pattern):
- Uses `useCreateTaskApiV1TasksPost()`, `useCrypto().encryptTaskFields()`
- Sets `parent_id: parentTask.id`, `domain_id: parentTask.domain_id`, `impact: 4`, `clarity: "normal"`
- Invalidates task list query, shows undo toast with delete action
- Clears input and keeps focused after create

Auto-focus wiring: reads `subtaskAddFocusId` from UI store; when it matches `parentTask.id`, enters editing mode and focuses input, then calls `clearSubtaskAddFocus()`.

Visual styling:
- `marginLeft: depth * 24px`, `paddingLeft: 8px` (matches `SubtaskItem`)
- Left border: `3px dashed border-border/30` (dashed to distinguish from real subtasks)
- Muted text: `text-muted-foreground/40`, hover brightens
- Wrapped in `motion.div` for smooth appear animation

### 3. `frontend/src/components/task/task-item.tsx` — Integration

**a) Update `SubtaskTree` to render ghost row:**
- Change prop from `parentId: number` to `parentTask: AppRoutersTasksTaskResponse`
- Derive `parentId` as `parentTask.id` for passing to `SubtaskItem`
- After the subtask map, render `<SubtaskGhostRow>` if task is eligible (not recurring, not completed)

**b) Show expanded section even when no subtasks exist:**
- Current condition: `hasSubtasks && isExpanded` (line 889)
- New: `isExpanded && (hasSubtasks || canHaveSubtasks)` where `canHaveSubtasks = !task.is_recurring && !isCompleted && task.parent_id == null`
- When only ghost row (no real subtasks), skip the connector line

**c) Add hover '+' icon (after subtask count badge, ~line 732):**
- `Plus` icon button, `hidden sm:flex`, `opacity-0 group-hover:opacity-100`
- For non-parents: `group-hover:opacity-50 hover:!opacity-100` (subtler)
- Clicking calls `requestSubtaskAdd(task.id)` from UI store
- Only rendered when `canHaveSubtasks` is true
- Add `Plus` to lucide-react imports

**d) Add "Add subtask" to context menu (line ~591, before separator):**
```tsx
{canHaveSubtasks && (
  <ContextMenuItem onClick={() => requestSubtaskAdd(task.id)}>
    <Plus className="h-3.5 w-3.5 mr-2" />
    Add subtask
  </ContextMenuItem>
)}
```

**e) Same for dropdown menu (line ~845, before separator):**
```tsx
{canHaveSubtasks && (
  <DropdownMenuItem onClick={() => { requestSubtaskAdd(task.id); setMenuOpen(false); }}>
    <Plus className="h-3.5 w-3.5 mr-2" />
    Add subtask
  </DropdownMenuItem>
)}
```

**f) Destructure `requestSubtaskAdd` from `useUIStore()` at line 76.**

### 4. `frontend/src/components/mobile/task-action-sheet.tsx` — Add action

Add `onAddSubtask` prop:
```ts
onAddSubtask?: (task: AppRoutersTasksTaskResponse) => void;
```

Add action button after "Schedule", before "Skip instance" / "Delete":
```tsx
{!task.is_recurring && !isCompleted && task.parent_id == null && (
  <ActionButton
    icon={<Plus className="h-5 w-5" />}
    label="Add subtask"
    onClick={() => { close(); onAddSubtask?.(task); }}
  />
)}
```

Import `Plus` from lucide-react.

### 5. `frontend/src/components/task/domain-group.tsx` — Wire action sheet

Pass `onAddSubtask` to `TaskActionSheet`:
```tsx
<TaskActionSheet
  ...
  onAddSubtask={(task) => requestSubtaskAdd(task.id)}
/>
```

Destructure `requestSubtaskAdd` from `useUIStore()` at line 58.

## Implementation Order

1. `ui-store.ts` — add state + actions
2. `subtask-ghost-row.tsx` — new component
3. `task-item.tsx` — integrate ghost row, '+' icon, menus
4. `task-action-sheet.tsx` — add "Add subtask" action
5. `domain-group.tsx` — wire action sheet callback

## Verification

1. `cd frontend && npx tsc --noEmit` — no type errors
2. `cd frontend && npx biome check .` — lint passes
3. `cd frontend && npm run build` — production build succeeds
4. Manual testing:
   - Expand a parent task → ghost row visible at bottom → click → type → Enter → subtask created, input stays open
   - Hover a parent task → '+' icon appears → click → expands + focuses input
   - Hover a non-parent task → '+' icon appears but subtler → click → expands empty area with ghost row focused
   - Mobile long-press → "Add subtask" in action sheet → subtask area expands with focused input
   - Verify recurring tasks, completed tasks, and subtasks do NOT show the '+' icon or ghost row
