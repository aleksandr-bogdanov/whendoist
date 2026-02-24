# Task Interaction Patterns Analysis

**Date:** 2026-02-10
**Status:** Proposal — awaiting review

---

## Current Interaction Matrix

| Action | Task List Item | Scheduled Card | Anytime Pill |
|---|---|---|---|
| **Complete** | Gutter (hover) / Swipe-R (mobile) | Gutter (always visible) | Gutter (always visible) |
| **Edit** | Click body → dialog | Click body → dialog | Click body → dialog |
| **Delete** | Kebab / Right-click / Swipe-L / Dialog | Right-click / Dialog | Right-click / Dialog |
| **Skip** | Kebab / Right-click (recurring) | Quick-action / Right-click (recurring) | N/A |
| **Unschedule** | Kebab / Right-click (scheduled) | Quick-action / Right-click / Drag-off | Quick-action / Right-click / Drag-off |
| **Schedule** | Drag to calendar | — | — |
| **Reschedule** | — | Drag | Drag to time grid |
| **Full menu** | Kebab **+** Right-click | Right-click **only** | Right-click **only** |

## Three-Tier Interaction Model

The current design uses progressive disclosure with three tiers:

1. **Always visible:** Completion gutter
2. **Hover-revealed (one click):** Kebab (task list) or Quick-action (calendar)
3. **Hidden (right-click / long-press):** Full context menu

## What Works Well (Keep)

1. **Click body → Edit is universal.** Same mental model everywhere. The editor has Delete in the footer, so edit/delete are always discoverable without menus.
2. **Completion gutter is universal** with smart variants: hover-revealed in the dense task list (space-efficient), always-visible on calendar (execution context).
3. **Right-click → full menu is universal.** Consistent power-user escape hatch.
4. **Drag semantics are context-appropriate.** List → schedule. Card → reschedule. Off-calendar → unschedule. Trash → delete.
5. **Calendar quick-action is good progressive disclosure.** Surfaces the ONE most relevant action per card. Skip for recurring, unschedule for one-off.

## The Kebab vs Quick-Action Asymmetry

Task list has a **kebab** (hover → full menu). Calendar has a **quick-action** (hover → direct action). This asymmetry is intentional and well-reasoned:

- Task list is a **management view** — you browse, triage, reorganize. The "next action" varies, so a menu makes sense.
- Calendar is an **execution view** — you're working through your day. The "next action" is predictable (skip or unschedule), so a direct-action button makes sense.

The controls look different (⋮ dots vs action icon), so visual language communicates the behavior difference.

## Problems Found

### Problem 1: Mobile — hover-revealed controls are invisible (CRITICAL)

Both `.kebab-btn` and `.calendar-quick-action` use `opacity: 0` revealed by parent `:hover`. There are **zero** `@media (hover: none)` or `@media (pointer: coarse)` overrides in the CSS.

On touch devices:
- **Task list:** Swipe handles complete/delete, but **skip and unschedule require long-press** (undiscoverable). Kebab is invisible.
- **Calendar:** Complete gutter works (always visible), but **skip and unschedule require long-press** (undiscoverable). Quick-action is invisible.

Long-press is the least discoverable mobile gesture. Users who don't know it have zero visible path to skip or unschedule.

### Problem 2: Short calendar cards hide quick-action entirely (MINOR)

`.duration-short .calendar-quick-action { display: none; }` completely removes the button. These tasks can only be managed via right-click. On mobile = long-press only.

### Problem 3: Skip on task list is two clicks (FRICTION)

Skip is the #1 action for recurring tasks in the task list ("not today"). Currently: hover → kebab → skip (two clicks + aiming). On calendar it's one click via quick-action.

### Problem 4: "Drag to reschedule" hint pollutes context menu (MINOR)

A permanent menu item that's a hint, not an action. Clutters the menu after the user learns it.

### Problem 5: Swipe-left-to-delete is risky (DESIGN NOTE)

Unlike email where archive is expected, task deletion is destructive. The 2-second undo window is short. Many task apps use swipe-left for postpone instead.

## Proposed Fixes

### Fix 1: Mobile visibility for action buttons (CRITICAL)

```css
@media (hover: none) {
    .kebab-btn { opacity: 0.4; }
    .calendar-quick-action { opacity: 0.4; }
    .complete-gutter--hover .complete-check { opacity: 0.5; }
}
```

Three lines that fix the entire mobile discoverability problem.

### Fix 2: Quick-action for short calendar cards (MINOR)

Instead of `display: none`, shrink and reposition:

```css
.duration-short .calendar-quick-action {
    width: 16px;
    height: 16px;
    top: 2px;
    right: 2px;
    transform: none;
}
```

### Fix 3: Quick-action on task list for recurring/scheduled (OPTIONAL)

Add a skip/unschedule quick-action button for task list items that have a primary action. This would make the model:

| Surface | Has primary action? | Hover button |
|---|---|---|
| Task list (unscheduled, non-recurring) | No | Kebab → menu |
| Task list (scheduled, non-recurring) | Yes (unschedule) | Quick-action |
| Task list (recurring instance) | Yes (skip) | Quick-action |
| Calendar (any) | Yes (skip or unschedule) | Quick-action |

Trade-off: Mixed controls within the task list (some kebab, some quick-action). Alternative: show both — quick-action left of kebab for items that have a primary action.

### Fix 4: Remove "Drag to reschedule" from context menu (MINOR)

Replace with a first-visit tooltip or remove entirely.

## Priority

1. **Fix 1** — Critical, tiny effort, fixes entire mobile UX
2. **Fix 2** — Minor, tiny effort, improves edge case
3. **Fix 3** — Optional, moderate effort, biggest UX improvement for recurring-task-heavy users
4. **Fix 4** — Minor, trivial effort, reduces menu noise
