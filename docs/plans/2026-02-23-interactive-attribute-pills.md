---
version:
pr:
created: 2026-02-23
---

# Interactive Attribute Mini-Pills

## Context

Task rows currently display metadata (clarity, duration, impact) as static text on desktop. Editing requires opening the full task editor dialog. The legacy Jinja2 frontend showed these as pill-shaped elements. We want to bring that pattern to the React SPA — making the existing metadata interactive: on hover they reveal clickable affordance, and clicking opens a compact popover for quick inline editing.

## Brand Alignment

Popover interiors follow the **Segmented Control** pattern from `docs/brand/UI-KIT.md`:
- Container: `bg-secondary`, `border border-border`, `rounded-md`, `p-0.5`, `inline-flex`, `gap-0.5`
- Segment buttons: `h-7 px-2 rounded-[5px] text-[0.68rem] font-semibold`
- Hover (unselected): `hover:bg-[rgba(15,23,42,0.04)]`
- Active segment: colored per impact/clarity token
- Transition: `transition-all duration-150 ease` (brand standard)

Hover tokens from `docs/brand/COLOR-SYSTEM.md` and `globals.css`:
- Pill hover bg: `rgba(109,94,246,0.06)` (`--interactive-hover`)
- Pill hover border: `var(--border)` (from shadcn theme)
- Popover open: `rgba(109,94,246,0.10)` (`--interactive-active`)

Impact colors use the existing CSS vars: `--impact-high`, `--impact-medium`, `--impact-low`, `--impact-min`.
Clarity tints use: `--autopilot-tint`, `--normal-tint`, `--brainstorm-tint` (already dark-mode aware in `globals.css`).

## Design

### Visual Behavior
- **Default**: Metadata looks exactly as it does now (colored text labels)
- **Row hover**: Each metadata value gains a subtle pill border + background (`--interactive-hover`), cursor becomes pointer — signaling clickability
- **Click**: Opens a compact Radix Popover positioned below the pill, styled as a Segmented Control
- **Selection**: Immediately updates the task (optimistic mutation), popover closes

### Popover Designs — Segmented Control Pattern (compact, no headers)

**Impact** — 4 segment buttons in a row: `[P1 High] [P2 Mid] [P3 Low] [P4 Min]`
- Active: `background: var(--impact-{level})`, `color: white`
- Inactive: ghost, `hover:bg-[rgba(15,23,42,0.04)]` per brand spec
- Uses `data-impact` attribute for colored text on inactive segments

**Clarity** — 3 segment buttons in a row: `[Autopilot] [Normal] [Brainstorm]`
- Active: `background: var(--{mode}-tint)`, `color: var(--{mode}-color)`, `ring-1 ring-{mode}-color`
- Inactive: ghost style

**Duration** — presets + custom input:
- Row 1: `[15m] [30m] [1h] [2h] [4h]` segment buttons — auto-close on click
- Active: `bg-primary text-primary-foreground` (brand primary)
- Row 2: `[___] min` — small `<input>` field, commits on Enter, styled per brand input spec

### Scope
- Desktop only (`sm:` breakpoint) — matches current metadata visibility
- Leaf tasks + subtasks — NOT parent task containers (those show subtask stats)
- Completed tasks: pills render as static (no popover) to prevent accidental edits

## Implementation

### Step 1: Extract shared constants to `task-utils.ts`

Move `IMPACT_OPTIONS`, `CLARITY_OPTIONS`, `DURATION_PRESETS`, `formatDurationLabel` from `task-editor.tsx` (lines 55-71) to `task-utils.ts` and export them. Update `task-editor.tsx` to import from there.

### Step 2: Create `frontend/src/components/task/attribute-pills.tsx`

New file with:

- **`useAttributeUpdate()` hook** — shared optimistic mutation helper. Handles both top-level tasks and subtasks (walks `t.subtasks` array for subtask ID matches).
- **`ImpactPill`** `({ taskId, value, disabled })` — Popover with 4 impact segment buttons
- **`ClarityPill`** `({ taskId, value, disabled })` — Popover with 3 clarity segment buttons. When value is "normal" (currently shows nothing), renders a `—` dash that becomes interactive on hover.
- **`DurationPill`** `({ taskId, value, disabled })` — Popover with preset segment buttons + custom input

Each pill:
- Wraps in `<Popover>` from shadcn/ui
- Uses `onPointerDown={e => e.stopPropagation()}` on trigger AND content to prevent drag
- Uses `onOpenAutoFocus={e => e.preventDefault()}` to avoid stealing focus
- Hover reveal: `group-hover:bg-[rgba(109,94,246,0.06)] group-hover:ring-1 group-hover:ring-border` (brand `--interactive-hover`)
- Popover open state: `bg-[rgba(109,94,246,0.10)] ring-1 ring-ring` (brand `--interactive-active`)
- Passes `aria-label` on the trigger for accessibility
- Brand standard `transition-all duration-150` for all interactive transitions

### Step 3: Replace static metadata in `TaskItem` (lines 784-817)

Replace the 3 static `<span>` metadata columns with `<ImpactPill>`, `<ClarityPill>`, `<DurationPill>` wrapped in the same fixed-width column spans. Pass `disabled={isCompleted}`.

### Step 4: Replace static metadata in `SubtaskItem` (lines 1111-1143)

Same replacement for subtask rows.

## Files

| File | Action |
|------|--------|
| `frontend/src/lib/task-utils.ts` | Add exports: `IMPACT_OPTIONS`, `CLARITY_OPTIONS`, `DURATION_PRESETS`, `formatDurationLabel` |
| `frontend/src/components/task/task-editor.tsx` | Remove local constants (lines 55-71), import from `task-utils` |
| `frontend/src/components/task/attribute-pills.tsx` | **New**: 3 pill components + shared mutation hook |
| `frontend/src/components/task/task-item.tsx` | Replace static metadata with pill components in `TaskItem` and `SubtaskItem` |

## Verification

1. `cd frontend && npx tsc --noEmit && npx biome check . && npm run build`
2. Manual: hover a task row on desktop — pills show interactive border with brand `--interactive-hover` tint
3. Manual: click each pill type — popover opens as Segmented Control, selection updates task immediately
4. Manual: verify drag-and-drop still works (pills don't interfere)
5. Manual: completed tasks show pills as static/non-interactive
6. Manual: subtask pills work the same as parent task pills
7. Manual: verify dark mode — clarity tints use alpha variants from `globals.css` `.dark` block
