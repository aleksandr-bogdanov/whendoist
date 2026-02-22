---
version: v0.54.41
pr: TBD
created: 2026-02-22
---

# DnD UX Improvements: Toast Duration, Badge Text, Drop-Between-Tasks

## Context

After shipping drag-and-drop reparenting (PR #417), user testing revealed:
1. Toast duration too short — wants 10s like Google Calendar/Gmail
2. "Make subtask" badge is wrong when reparenting a subtask to a different parent — should say "Change parent"
3. Subtask → standalone doesn't work in practice — `task-drop-*` wins collision priority over `task-list-drop`, so there's no accessible drop target for promoting
4. Reparent target visual is too harsh (ring + glow) — wants more thoughtful design

## Changes

### 1. Global 10-second toast duration

**File: `frontend/src/main.tsx`**

Set default duration on `Toaster` component:
```tsx
<Toaster
  richColors
  position="bottom-right"
  toastOptions={{ duration: 10000, ...(prefersReducedMotion ? { duration: undefined } : {}) }}
/>
```

Then **remove all individual `duration: 5000`** from toast calls across:
- `task-dnd-context.tsx` (~10 occurrences)
- `task-item.tsx` (~3 occurrences)
- `domain-group.tsx` (~2 occurrences)
- Any other files with `duration: 5000`

This gives a single source of truth for toast duration.

### 2. Conditional badge text

**File: `frontend/src/components/task/task-item.tsx`**

The badge above the reparent target currently always says "Make subtask". Change it to:
- `"↳ Make subtask"` — when dragging a **standalone task** onto another task
- `"↳ Change parent"` — when dragging a **subtask** (already has parent_id) onto a different task

Logic: Check `activeTaskData?.parent_id != null` (already available from `useDndState().activeTask`). If the subtask is from drag data (SubtaskItem sets `data: { parentId }`), use that.

Actually, `dndState.activeTask` has `parent_id` for top-level tasks (it's null) but for subtasks found via `findTask`, the field comes from the `SubtaskResponse` cast. Need to verify: the `findTask` function returns `{ ...st, subtasks: [] } as unknown as AppRoutersTasksTaskResponse` for subtasks, and `SubtaskResponse` doesn't have `parent_id`. So we check the drag data's `parentId` instead.

Better approach: In `DndStateCtx`, add `activeParentId: number | null` derived from drag data in `handleDragStart`. Then in `task-item.tsx`:
```tsx
const isReparent = dndState.activeParentId != null;
// badge text:
isReparent ? "Change parent" : "Make subtask"
```

**File: `frontend/src/components/task/task-dnd-context.tsx`**

Extend `DndStateContextValue`:
```tsx
interface DndStateContextValue {
  activeId: UniqueIdentifier | null;
  activeTask: AppRoutersTasksTaskResponse | null;
  activeParentId: number | null;  // NEW
}
```

In `handleDragStart`, extract parentId from drag data:
```tsx
const parentId = event.active.data.current?.parentId ?? null;
// Store in dragState, expose via context
```

### 3. Drop-between-tasks (insertion zones)

**Goal**: Thin droppable zones between tasks that activate when dragging a subtask. Dropping on a gap promotes the subtask to standalone.

#### 3a. Insertion zone droppables in `domain-group.tsx`

Between each task in the `.map()`, render a `TaskInsertionZone` component:
- **Droppable ID**: `task-gap-{index}` (index = position in the task list)
- **Only active when** a subtask is being dragged (`dndState.activeParentId != null`)
- **Normal state**: 4px tall invisible spacer
- **Hover state**: Expands to 8px with a visible purple insertion line

```tsx
function TaskInsertionZone({ index, isActive }: { index: number; isActive: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `task-gap-${index}`,
    data: { type: "task-gap", index },
    disabled: !isActive,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "transition-all duration-150",
        isActive ? "h-2 -my-0.5 relative z-10" : "h-0",
        isOver && "h-3",
      )}
    >
      {isOver && (
        <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-[#6D5EF6]" />
          <div className="flex-1 h-0.5 rounded-full bg-[#6D5EF6]" />
        </div>
      )}
    </div>
  );
}
```

Render in the task loop:
```tsx
{tasks.map((task, i) => (
  <React.Fragment key={task.id}>
    {i === 0 && <TaskInsertionZone index={0} isActive={isSubtaskDrag} />}
    <motion.div ...>
      <TaskItem ... />
    </motion.div>
    <TaskInsertionZone index={i + 1} isActive={isSubtaskDrag} />
  </React.Fragment>
))}
```

Where `isSubtaskDrag = dndState.activeParentId != null`.

#### 3b. Collision detection + handler in `task-dnd-context.tsx`

Add `task-gap-*` to collision priority (between `task-drop-*` and `task-list-*`):
```
date-group → anytime → calendar-overlay → task-drop → task-gap → task-list → other
```

Add `"promote"` to the `overType` union.

Add `parseTaskId` and `getOverType` handling for `task-gap-*` prefix.

Add promote handler for `task-gap-*` drops:
```tsx
if (overId.startsWith("task-gap-")) {
  // Same promote logic as task-list subtask handler
  // Set parent_id = null, optimistic update, undo toast
}
```

#### 3c. Drag overlay update in `task-drag-overlay.tsx`

Add `isPromoting` prop. When true, show an upward arrow icon and a blue/teal border (distinct from purple reparent).

Actually, keep it simple — reuse the existing overlay without reparent styling when promoting. The insertion line at the gap is sufficient visual feedback.

### 4. Reparent target visual refinement

**File: `frontend/src/components/task/task-item.tsx`**

Replace the harsh ring+glow with a more thoughtful design:

**Current** (too aggressive):
```
ring-2 ring-[#6D5EF6] bg-[#6D5EF6]/12 shadow-[0_0_0_2px_#6D5EF6,inset_0_0_12px_rgba(109,94,246,0.15)] scale-[1.01] rounded-lg
```

**New** (subtle indent + soft highlight):
```
bg-[#6D5EF6]/8 border-l-[#6D5EF6] translate-x-4 rounded-lg shadow-sm
```

Key visual cues:
- Soft purple wash background (`bg-[#6D5EF6]/8`)
- Left border becomes purple (already has 3px left border)
- Slight rightward indent (`translate-x-4`) — visually hints at "nesting under"
- Smooth transition
- Keep the floating badge but with slightly muted style

The indent is the key visual — it physically shows the task will become nested. Combined with the badge, it's very clear without being loud.

## Files to Modify

| File | Summary |
|------|---------|
| `frontend/src/main.tsx` | Set `toastOptions.duration: 10000` |
| `frontend/src/components/task/task-dnd-context.tsx` | Add `activeParentId` to context, `task-gap-*` collision/handler, `"promote"` overType |
| `frontend/src/components/task/task-item.tsx` | Conditional badge text, softer reparent visual |
| `frontend/src/components/task/domain-group.tsx` | Add `TaskInsertionZone` droppables between tasks |
| `frontend/src/components/task/task-drag-overlay.tsx` | No changes needed (overlay stays neutral for promote) |

## Verification

1. `cd frontend && npx tsc --noEmit && npx biome check . && npm run build`
2. Manual test matrix:
   - All toasts now dismiss after 10 seconds
   - Drag standalone → task shows "Make subtask" badge
   - Drag subtask → different task shows "Change parent" badge
   - Drag subtask → gap between tasks = promotes to standalone with insertion line indicator
   - Reparent target shows soft indent instead of harsh ring
   - All undo toasts still work
