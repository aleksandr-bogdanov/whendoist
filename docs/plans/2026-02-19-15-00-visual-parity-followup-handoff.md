---
version: v0.50.2
pr: 355, 356
created: 2026-02-19
---

# Handoff: Legacy Visual Parity Follow-Up Fixes

## Context

After merging v0.50.0 (PR #354) — a large React frontend restyling to match the legacy Jinja2 aesthetic — the user tested the deployed version and reported visual/UX issues. These were addressed across two follow-up PRs.

**Base plan:** `docs/plans/2026-02-19-02-00-legacy-visual-parity.md`

## What Was Completed

### PR #355 — v0.50.1 (merged)
Branch: `fix/visual-parity-followup`

| Fix | File(s) | Details |
|-----|---------|---------|
| Page scroll lock | `app-shell.tsx` | Changed `overflow-y-auto` → `overflow-hidden` on `<main>` so only task list ScrollArea and calendar scroll independently |
| Context menu positioning | `task-item.tsx`, new `context-menu.tsx` | Right-click menu was appearing in wrong place because DropdownMenu's Popper overrode inline positioning. Created proper Radix ContextMenu component. DropdownMenu kept for kebab button. |
| Domain group count pill | `domain-group.tsx` | Removed `flex-1` from domain name, added `mr-auto` to pill so it sits next to name instead of right edge |
| Calendar zoom sensitivity | `calendar-panel.tsx` | Added delta accumulator (50px threshold) before stepping zoom — tames macOS trackpad |
| Calendar column width | `day-column.tsx`, `calendar-panel.tsx` | Replaced `width:100%; minWidth:200px` with `flex-1 min-w-[140px]`; changed `overflow-auto` → `overflow-y-auto overflow-x-hidden` |
| Parent task display | `task-item.tsx` | Neutral border rail, no clarity/impact columns, aggregated remaining/total duration from subtasks |
| Scheduled section overdue | `scheduled-section.tsx` | Split past-dated tasks under red "Overdue" banner with AlertTriangle icon |
| Circular checkboxes | `task-item.tsx` | Replaced rounded-square divs with SVG circles matching brand `check-circle-tinted` |

### PR #356 — v0.50.2 (merged)
Branch: `fix/visual-parity-followup-2`

| Fix | File(s) | Details |
|-----|---------|---------|
| Task list scroll | `dashboard.tsx` | Added `min-h-0` to dashboard root div and task panel wrapper — flex children now shrink properly for ScrollArea |
| macOS back swipe | `globals.css` | Added `overscroll-behavior-x: none` on html/body |
| Calendar horizontal scroll | `calendar-panel.tsx` | Restored `overflow-auto` (was `overflow-y-auto overflow-x-hidden` from PR #355) |
| Calendar duplicate Today | `calendar-panel.tsx` | Removed Today button from header bar (kept only in floating controls) |
| Checkbox muting | `task-item.tsx` | Uncompleted circles: 20% opacity (was 40%), check invisible (0% opacity) until hover |
| Parent task click | `task-item.tsx` | Title click on parent toggles expand/collapse instead of opening editor |
| Parent task count | `task-item.tsx` | Shows active/total subtask count (e.g. "3/5") in clarity column alongside aggregated duration |

## Decisions Made

1. **ContextMenu vs DropdownMenu**: Used Radix ContextMenu for right-click (native cursor positioning) and kept DropdownMenu for kebab button. Both share same menu items but as separate components.
2. **Parent task philosophy**: Parents are containers per `docs/SUBTASKS.md` — no clarity, no impact, neutral border. Duration and count show aggregates. Title click expands instead of editing.
3. **Calendar layout**: User wants horizontal scroll to work (they like unbounded scroll) but wanted thinner columns. Final: `flex-1 min-w-[140px]` columns with `overflow-auto`.
4. **Calendar header vs floating controls**: Removed duplicate Today/zoom from header. Header has prev/next arrows + Plan button. Floating has Today + zoom in/out.
5. **overscroll-behavior-x**: Applied globally to prevent macOS two-finger back navigation, which was the original reason the user wanted to disable page-wide scrolling.
6. **Checkbox style**: Brand SVG circles from `BRAND.md` icon system. Completed = filled purple (#6D5EF6) with white check. Uncompleted = very muted circle outline, check appears on hover.

## Current State

- **Branch**: `fix/visual-parity-followup-2` (both PRs merged to master)
- **Version**: `0.50.2`
- **Working tree**: Clean
- All checks pass: ruff, pyright, biome, tsc, tests (402 passed), build

## Files Changed (Across Both PRs)

### New Files
- `frontend/src/components/ui/context-menu.tsx` — Radix ContextMenu shadcn-style wrapper

### Modified Files
- `frontend/src/components/layout/app-shell.tsx` — overflow-hidden on main
- `frontend/src/components/calendar/calendar-panel.tsx` — zoom accumulator, overflow-auto, removed header Today/zoom
- `frontend/src/components/calendar/day-column.tsx` — flex-1 min-w-[140px]
- `frontend/src/components/task/task-item.tsx` — ContextMenu, SVG checkboxes, parent task display, expand on click
- `frontend/src/components/task/domain-group.tsx` — pill positioning
- `frontend/src/components/task/scheduled-section.tsx` — overdue/upcoming split
- `frontend/src/routes/_authenticated/dashboard.tsx` — min-h-0 on flex containers
- `frontend/src/styles/globals.css` — overscroll-behavior-x: none

## What Remains / Known Issues

The user is actively testing the deployed version and providing visual fixes one by one. Potential areas that may need attention:

1. **Mobile testing**: None of these fixes were mobile-specific. The overscroll-behavior and checkbox changes should be verified on iOS PWA.
2. **Calendar day column width**: The `min-w-[140px]` may need tuning based on screen sizes. User originally said "make each day thinner" but may want specific widths.
3. **Scheduled section "Overdue" UX**: The user had a scratch note "Think through how to organize 'past' scheduled tasks" — the current red banner is a first pass, may need refinement.
4. **Parent task editor access**: Since title click now toggles expand, users must use the kebab menu or right-click → Edit to open the editor for parent tasks. This is intentional but worth monitoring.
5. **Further visual polish**: The user context says "I'm testing the deployed version and will provide visual fixes one by one" — expect more iterations.

## Blockers Encountered

None. All fixes were straightforward CSS/React changes. The only tricky one was the ContextMenu positioning where Radix's Popper was overriding inline styles — solved by using the proper ContextMenu primitive.
