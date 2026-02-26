---
version:
pr:
created: 2026-02-26
---

# Feat: Swipe-left-to-delete on thought cards

## Context

Thoughts page needs iOS-style swipe-left-to-delete on each card. The app already has `TaskSwipeRow` (`components/task/task-swipe-row.tsx`) used in domain-group.tsx for tasks (swipe-right = complete/green, swipe-left = schedule/blue). It uses `@use-gesture/react`, haptics, and handles scroll conflicts. We reuse it with configurable icons/colors.

## Changes

### 1. Make `TaskSwipeRow` indicators configurable

**File:** `frontend/src/components/task/task-swipe-row.tsx`

Add a color map and optional props for icon/color overrides:

```ts
const SWIPE_COLORS = {
  green: { bg: "bg-green-500", bgFaint: "bg-green-500/20", text: "text-green-600" },
  blue:  { bg: "bg-blue-500",  bgFaint: "bg-blue-500/20",  text: "text-blue-600" },
  red:   { bg: "bg-red-500",   bgFaint: "bg-red-500/20",   text: "text-red-600" },
} as const;

interface TaskSwipeRowProps {
  children: React.ReactNode;
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  // Indicator overrides (defaults: right=green/Check, left=blue/CalendarDays)
  rightIcon?: React.ComponentType<{ className?: string }>;
  rightColor?: keyof typeof SWIPE_COLORS;
  leftIcon?: React.ComponentType<{ className?: string }>;
  leftColor?: keyof typeof SWIPE_COLORS;
}
```

Replace hardcoded `Check`/`CalendarDays` and `bg-green-*`/`bg-blue-*` with the configurable props. Defaults stay the same so existing usage in domain-group.tsx is unaffected.

### 2. Wrap thought cards with `TaskSwipeRow`

**File:** `frontend/src/routes/_authenticated/thoughts.lazy.tsx`

In the card list loop (~line 307), wrap each card with `TaskSwipeRow`:

```tsx
import { TaskSwipeRow } from "@/components/task/task-swipe-row";
import { Trash2 } from "lucide-react";

// In the map:
<TaskSwipeRow
  onSwipeLeft={() => handleDelete(thought)}
  leftIcon={Trash2}
  leftColor="red"
  disabled={expandedId === thought.id}
>
  <div className="border-b border-border/50 overflow-hidden">
    <ThoughtCard ... />
    {expandedId === thought.id && !editingId && <TriagePanel ... />}
  </div>
</TaskSwipeRow>
```

- **Swipe left** = delete (red background, trash icon)
- **No swipe right** (omit `onSwipeRight` — `TaskSwipeRow` already handles this)
- **Disabled when expanded** — triage panel is visible with its own delete button; prevents accidental swipes while interacting with panel controls

## What NOT to change

- `TaskSwipeRow` outer wrapper (`relative overflow-hidden touch-pan-y`) — already provides the clip context
- Existing domain-group.tsx usage — default props preserve current behavior
- Delete handler — already has undo toast support
- No new dependencies needed (`@use-gesture/react` already installed)

## Verification

```bash
cd frontend && npx tsc -p tsconfig.app.json --noEmit && npx biome check . && npm run build
```

Manual test at 375px:
1. Swipe a collapsed thought card left — red background with trash icon appears
2. Complete the swipe — thought is deleted, undo toast shown
3. Expand a thought — swiping is disabled
4. Verify task list swipe (domain-group) still works unchanged (green/blue)
