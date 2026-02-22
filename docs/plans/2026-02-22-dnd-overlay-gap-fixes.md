---
version:
pr:
created: 2026-02-22
---

# Fix DnD overlay visibility + gap drop zone hitboxes

## Context

When dragging a task onto another task to reparent it, the floating drag overlay card
covers the target row and ghost placeholder, making it hard to see what you're dropping
onto. Additionally, the `TaskInsertionZone` gap drop zones between tasks are only 8px
tall (12px on hover), making them nearly impossible to target for promoting subtasks.

## Changes

### 1. Reduce overlay opacity when reparenting

**File:** `frontend/src/components/task/task-dnd-context.tsx` (~line 1146-1153)

Add opacity + scale transition to the overlay wrapper div when `isReparenting`:

```tsx
<div ref={overlayContentRef} className={dragState.overType === "reparent" ? "opacity-40 scale-95 transition-all duration-150" : "transition-all duration-150"}>
```

This makes the target row + ghost placeholder clearly visible through the semi-transparent overlay.

### 2. Increase TaskInsertionZone hitbox

**File:** `frontend/src/components/task/domain-group.tsx` (lines 25-48)

Increase the droppable element height from 8px → 28px, and increase the negative margins
to compensate so visual spacing stays the same:

```tsx
// Before
className="relative -my-1 z-10 transition-all duration-150"
style={{ height: isOver ? 12 : 8 }}

// After
className="relative -my-3 z-10 transition-all duration-150"
style={{ height: isOver ? 32 : 28 }}
```

The visual indicator (purple dot + line) remains centered in the zone via `top-1/2 -translate-y-1/2`,
so the appearance doesn't change — only the invisible hit area grows from 8px to 28px.

## Verification

1. `cd frontend && npx tsc --noEmit && npx biome check . && npm run build`
2. Manual: drag a task onto another task — overlay should fade to ~40% opacity, target row + ghost clearly visible
3. Manual: drag a subtask between tasks — gap zones should be much easier to hit
