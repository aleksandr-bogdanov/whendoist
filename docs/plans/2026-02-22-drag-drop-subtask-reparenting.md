---
version:
pr:
created: 2026-02-22
---

# Drag & Drop Subtask Reparenting

## Context

Currently, tasks and subtasks are draggable for scheduling (to/from calendar), but there's no working drag-and-drop for reparenting. The reparent code in `task-dnd-context.tsx:757-802` is **dead code** — tasks aren't registered as droppable targets, so the collision detection never matches them.

This plan adds 4 DnD reparenting operations with distinct visual feedback, undo support, and proper optimistic updates.

## Operations

| Operation | Drop Target | Result |
|-----------|------------|--------|
| Subtask → different parent | Another top-level task | Reparent (change parent_id) |
| Task → subtask | Another top-level task | Set parent_id |
| Subtask → standalone task | Task list empty area | Promote (parent_id = null) |
| Task → task (make subtask) | Another top-level task | Set parent_id (destructive — distinct visual) |

## No Backend Changes

The API already supports everything:
- `PUT /tasks/{id}` with `parent_id: X` → reparent
- `PUT /tasks/{id}` with `parent_id: null` → promote
- Backend validates: depth-1 limit, no recurring parents, no self-nesting, no circular refs

## Implementation

### 1. Expose drag state via React context (`task-dnd-context.tsx`)

Create a lightweight context to share active drag info with TaskItems:

```tsx
interface DndStateContext {
  activeId: UniqueIdentifier | null;
  activeTask: AppRoutersTasksTaskResponse | null;
}
```

Export `useDndState()` hook. Wrap children in `<DndStateCtx.Provider>`.

**Performance**: Only includes `activeId` and `activeTask` (change 2x per drag: start + end). Does NOT include `overId`/`overType` which change on every pointer move — those stay in local component state.

### 2. Make TaskItem a droppable target (`task-item.tsx`)

Each `TaskItem` registers as both draggable AND droppable:

- **Draggable ID**: `String(task.id)` (unchanged)
- **Droppable ID**: `task-drop-{task.id}` (new prefix)
- **Merged ref**: Callback ref that calls both `setDragRef` and `setDropRef`
- **Disabled when invalid**: `task.parent_id !== null || task.is_recurring || isSelf || activeHasSubtasks || isChildOfActive || isAlreadyParent`

`canReceiveChild` is a `useMemo` that checks all validation rules using `activeTask` from context. When disabled, dnd-kit skips the droppable in collision detection — zero overhead.

### 3. Update collision detection (`task-dnd-context.tsx`)

Add `task-drop-*` to the priority chain:

```
date-group → anytime → calendar-overlay → task-drop (reparent) → task-list → other
```

`task-drop-*` is higher priority than `task-list` so hovering over a specific task nests rather than "dropping on the list area". Only empty space in the task list triggers promote/unschedule.

Also add `task-drop-*` handling to `parseTaskId` and `getOverType` (new `"reparent"` type).

### 4. Visual feedback for "Make subtask" — VERY distinct

When hovering over a valid reparent target, the task gets:

**Target task styling (via `isOver` from `useDroppable`):**
- Purple ring + glow: `ring-2 ring-[#6D5EF6] shadow-[0_0_0_2px_#6D5EF6,inset_0_0_12px_rgba(109,94,246,0.15)]`
- Purple wash background: `bg-[#6D5EF6]/12`
- Slight scale: `scale-[1.01]`
- Rounded: `rounded-lg`
- Smooth transition: `transition-all duration-150`

**"Make subtask" badge** — floating above the target:
- Absolute positioned pill at top-center: `absolute -top-2.5 left-1/2 -translate-x-1/2 z-20`
- Purple background with white text: `bg-[#6D5EF6] text-white text-[10px] font-semibold`
- Shows `↳ Make subtask` text
- `pointer-events-none` so it doesn't interfere with drop

**Drag overlay enhancement (`task-drag-overlay.tsx`):**
- When `overType === "reparent"`, the overlay gets a purple border + `CornerDownRight` icon
- Gives the dragged card a visual "I'm about to nest" treatment

### 5. Reparent handler with optimistic updates + undo (`task-dnd-context.tsx`)

Replace the dead code at lines 757-802 with a proper handler for `task-drop-*` prefix:

**Optimistic update** (instant visual):
1. Remove task from top-level list (if standalone) or from old parent's subtasks (if subtask)
2. Add to new parent's `subtasks` array as a `SubtaskResponse`
3. Auto-expand parent's subtask list via `expandSubtask(overTaskId)`

**Undo support**:
- Toast: `Made "{taskTitle}" a subtask of "{parentTitle}"` with Undo button
- Undo restores snapshot via `queryClient.setQueryData` and calls `updateTask({ parent_id: prevParentId })`

### 6. Promote handler for subtask → standalone (`task-dnd-context.tsx`)

Modify the existing `task-list-drop` handler (line 689) to check subtask status FIRST:

```
if dropped on task-list:
  if task.parent_id !== null → PROMOTE (set parent_id: null)
  else if task.scheduled_date → UNSCHEDULE (existing behavior)
```

**Optimistic update**: Remove from parent's subtasks, add as top-level task.
**Toast**: `Promoted "{taskTitle}" to standalone task` with Undo.

### 7. Add `expandSubtask` to UI store (`ui-store.ts`)

Non-toggle method (expand only, never collapse):
```tsx
expandSubtask: (taskId) => set(state => {
  if (state.expandedSubtasks.has(taskId)) return state;
  const next = new Set(state.expandedSubtasks);
  next.add(taskId);
  return { expandedSubtasks: next };
}),
```

Used after reparent to auto-expand the target parent.

### 8. Clean up dead `dragOverTaskId` prop threading

Remove `dragOverTaskId` prop from: `TaskListProps`, `DomainGroupProps`, `TaskItemProps` (`isDropTarget`). Drop target state is now self-contained via `useDroppable`'s `isOver`.

### 9. Pass `parentId` to SubtaskItem for drag data

`SubtaskResponse` doesn't have `parent_id`, but we need it in the drag data for promote/reparent logic. Pass `parentId` prop from `SubtaskTree` → `SubtaskItem`, include in draggable data:

```tsx
data: { type: "subtask", task: subtask, parentId }
```

## Files to Modify

| File | Summary |
|------|---------|
| `frontend/src/components/task/task-dnd-context.tsx` | Context provider, collision detection, reparent handler, promote handler, overlay prop |
| `frontend/src/components/task/task-item.tsx` | `useDroppable` + merged ref, `canReceiveChild`, visual feedback, badge, remove `isDropTarget`, pass `parentId` |
| `frontend/src/components/task/task-drag-overlay.tsx` | `isReparenting` prop, arrow icon, purple border |
| `frontend/src/components/task/task-list.tsx` | Remove `dragOverTaskId` prop |
| `frontend/src/components/task/domain-group.tsx` | Remove `dragOverTaskId` and `isDropTarget` pass-through |
| `frontend/src/stores/ui-store.ts` | Add `expandSubtask` action |

## Edge Cases

- **Self-drop**: Disabled via `canReceiveChild`
- **Drop on own parent (no-op)**: Detected and returns early
- **Circular (parent → own child)**: Disabled via `canReceiveChild`
- **Task with children → subtask**: Disabled via `canReceiveChild`
- **Recurring target**: Disabled via `canReceiveChild`
- **Subtask target (depth > 1)**: Disabled via `canReceiveChild`
- **Subtask dragged to calendar**: Passes through to existing schedule handler (no interference)

## Verification

1. `cd frontend && npx tsc --noEmit && npx biome check . && npm run build`
2. Manual test matrix:
   - Drag standalone task → another task = makes subtask, parent auto-expands
   - Drag subtask → different parent task = reparents
   - Drag subtask → empty task list area = promotes to standalone
   - Drag task with subtasks → another task = droppable disabled (no highlight)
   - Drag onto recurring task = droppable disabled
   - All operations show undo toast
   - Undo restores previous state
