---
version: v0.54.50
pr: 422, 432, 433, 434, 436
created: 2026-02-22
---

# Handoff: Calendar Card Visual Styling

## Goal

Restyle calendar cards to visually distinguish three item types:
1. **Regular tasks** (one-time, scheduled)
2. **Recurring task instances**
3. **Google Calendar events**

Previously only recurring instances had colored backgrounds. Regular tasks and GCal events looked nearly identical (white cards with a colored left border).

---

## Decisions Made

### 1. "All-colored" is the permanent base for tasks
- Regular tasks: impact-colored background at `1A` (~10% opacity), 3px solid left border, dark text
- Recurring instances: impact-colored background at `2A` (~16% opacity), 3px solid left border, impact-colored text + ↻ icon
- Anytime pills: impact-colored background at `1A` (~10%), 3px solid left border, pill-shaped

### 2. GCal events need a distinct visual treatment
- The user chose "Outline" as the preferred style: white (`bg-card`) background, uniform `2px` colored border on all sides, `text-foreground` for title
- Three other styles are also implemented behind a toggle for comparison: full-border, dashed, strip
- A floating palette button near the zoom controls cycles through the 4 GCal event styles

### 3. All left borders must be 3px consistently
- ScheduledTaskCard: inline `borderLeft: 3px solid ${impactColor}` (was already 3px)
- InstanceCard: changed from Tailwind `border-l-2` (2px) to inline `borderLeft: 3px solid` (3px)
- GCal events: uniform `2px` border on ALL sides (intentionally different shape language — border-box vs accent-stripe)

### 4. GCal event title text uses `text-foreground`
- Changed from `text-muted-foreground` to `text-foreground` across all 4 GCal styles for better contrast
- Time labels remain `text-muted-foreground` (secondary info)

### 5. Non-uniform GCal border was rejected
- Tried 3px left / 1.5px other sides — user said "looks way off", reverted to uniform 2px

---

## Completed (Merged PRs)

| PR | Version | Description |
|----|---------|-------------|
| #422 | v0.54.37 | Initial card style toggle with 4 approaches (default/colored/all-colored/bordered) |
| #432 | v0.54.46 | Replaced with GCal-focused picker, tasks always colored with stronger tints |
| #433 | v0.54.47 | Removed `pl-0.5` left padding, outline style gets `bg-card` + thicker border |
| #434 | v0.54.48 | InstanceCard 2px→3px left border, GCal `text-foreground`, non-uniform border (later reverted) |
| #436 | v0.54.50 | Removed `z-10` from time ruler (attempted fix for 1px white line), reverted GCal to uniform 2px |

### Files Modified
- `frontend/src/stores/ui-store.ts` — Added `CardStyle` type (`outline | full-border | dashed | strip`), `cycleCardStyle` action, persisted in localStorage
- `frontend/src/components/calendar/scheduled-task-card.tsx` — Always tinted `${impactColor}1A`, removed `border border-border/40` and `bg-card`
- `frontend/src/components/calendar/anytime-task-pill.tsx` — Always tinted `${impactColor}1A`, removed conditional bg
- `frontend/src/components/calendar/day-column.tsx` — InstanceCard: `border-l-2` → inline 3px, bg `${impactColor}2A`, removed `useUIStore` import
- `frontend/src/components/calendar/calendar-event.tsx` — Full rewrite: 4 distinct GCal styles (outline/full-border/dashed/strip), `text-foreground` titles
- `frontend/src/components/calendar/calendar-panel.tsx` — Added `CardStyleToggle` component (floating palette button), removed `z-10` from time ruler

---

## BLOCKER: 1px White Vertical Line

### Problem
A persistent 1px white vertical line appears at the left edge of the calendar grid (between the time ruler labels and the card left borders). It visually clips the first pixel of every card's left border accent.

### What was tried
1. **Removed `pl-0.5`** from items container in `day-column.tsx` (PR #433) — did NOT fix it
2. **Removed `z-10`** from time ruler in `calendar-panel.tsx` (PR #436) — hypothesis was that the ruler's `bg-background` at z-10 was painting over the carousel's first pixel. **Needs user verification** — may or may not have fixed it.

### Root cause analysis
The time ruler (`flex-shrink-0 w-12 bg-background`) is a flex sibling of the carousel (`flex-1 overflow-x-auto`). At their shared boundary, there appears to be a 1px rendering artifact. Possible causes:
- ~~`z-10` on ruler painting white bg over carousel~~ (removed in v0.54.50, pending verification)
- Subpixel rendering gap at the flex boundary (browser-dependent)
- `overflow-x: auto` on carousel creating a stacking context that clips the first pixel
- Scroll-snap alignment not pixel-perfect

### If the fix didn't work, next steps to try
1. Add `position: relative; z-index: 1` to the items container in `day-column.tsx` — elevate cards above any background layers
2. Add `margin-left: -1px` to DayColumn or the items container to compensate for the gap
3. Add an explicit `border-r border-border/20` to the time ruler to make the boundary intentional
4. Use Chrome DevTools "Elements > Computed" on the boundary to inspect exact pixel rendering
5. Try `will-change: transform` on the carousel to force GPU compositing

---

## What Remains

### Must do
- **Verify the 1px white line is fixed** after PR #436 — if not, apply next fix from the list above
- **Decide if the card style toggle should stay** — the user picked "outline" as the winner. The toggle could be removed and outline made permanent, or kept for future A/B testing

### Nice to have
- **Dark mode verification** — all 4 GCal styles should be checked in dark mode
- **Remove unused styles** — if the user commits to "outline", the other 3 GCal styles (full-border, dashed, strip) and the toggle UI can be removed to simplify code
- **Consider removing `CardStyle` from localStorage persistence** if the toggle is removed

---

## Competitor Research Summary

Research was conducted on 8 apps (Motion, Todoist, TickTick, Fantastical, Google Calendar, Apple Calendar, Akiflow, Sunsama). Key patterns:
- **Left accent border** = most common task indicator (Apple, Sunsama)
- **Solid fill = owned/accepted**, outline/no-fill = external/tentative (Google Calendar, Motion)
- **Checkbox icon** distinguishes tasks from events (Google, Fantastical, Todoist)
- **Border style** (solid vs dashed) encodes flexibility (Motion)
- **Opacity gradient** separates committed vs tentative items (Sunsama, Motion)

Our approach aligns with Google Calendar's pattern: filled cards = your tasks, outlined cards = external events.

---

## Key Architecture Notes

- `CardStyle` type exported from `ui-store.ts` — used by `calendar-event.tsx` only (tasks are always colored now)
- Task card styles are unconditional — no store dependency in `scheduled-task-card.tsx`, `anytime-task-pill.tsx`, or `day-column.tsx` (InstanceCard)
- The `CalendarEventCard` component has 4 code paths (one per style), each a complete `<button>` JSX block — intentionally not abstracted to keep each style independently tweakable
- Impact color hex suffixes used for opacity: `0D`=5%, `1A`=10%, `2A`=16%, `50`=31%, `60`=38%, `90`=56%
