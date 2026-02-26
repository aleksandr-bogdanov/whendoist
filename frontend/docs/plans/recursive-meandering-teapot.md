# Implementation Plan: Bottom Sheet Triage Drawer

## Context

The inline `ThoughtTriageCard` expansion consumes ~60% of the iPhone viewport, pushing other
thoughts off-screen. We're replacing it with a vaul-based bottom sheet drawer that slides up
as an overlay, keeping the thought list visible behind it. The picker components are extracted
as reusable pieces for a future mobile task edit drawer.

## Step 1: Create shared field picker components

**New file:** `frontend/src/components/task/field-pickers.tsx`

Extract three stateless, controlled picker components from the current inline code in
`thoughts.lazy.tsx` (lines 510-613):

### `DomainChipRow`
```ts
Props: { domains: DomainResponse[], selectedId: number | null, onSelect: (id: number, name: string) => void }
```
- Horizontal scrollable row with full-bleed scroll (`-mx-4 px-4`)
- Each chip: pill shape, domain `.color` as fill (selected) or 15% opacity tint (unselected)
- Active: solid background + white text. Inactive: tinted background + color text
- Shows "Choose a domain" label when `selectedId` is null
- Min touch target: `py-2 px-3.5` (same as current)

### `ImpactButtonRow`
```ts
Props: { value: number | null, onChange: (impact: number) => void }
```
- 4 buttons in a flex row using `IMPACT_OPTIONS` and `IMPACT_COLORS` from `task-utils.ts`
- Active: ring + tinted background. Inactive: secondary
- Toggle: tapping active value calls `onChange` with same value (parent decides behavior)

### `ScheduleButtonRow`
```ts
Props: { selectedDate: string | null, onSelectToday: () => void, onSelectTomorrow: () => void, onClear: () => void }
```
- "Today" / "Tomorrow" buttons + conditional "Clear" link
- Active state: primary fill when `selectedDate` matches today/tomorrow string

All pickers: `active:scale-95` press feedback, 44px min touch height, no internal state.

**Reuse from existing code:**
- `IMPACT_OPTIONS`, `IMPACT_COLORS` from `frontend/src/lib/task-utils.ts`
- `cn()` from `frontend/src/lib/utils.ts`
- Exact same styling patterns currently in `thoughts.lazy.tsx` lines 510-613

## Step 2: Create `ThoughtTriageDrawer`

**New file:** `frontend/src/components/task/thought-triage-drawer.tsx`

Uses vaul `Drawer` directly (same pattern as existing `components/mobile/bottom-sheet.tsx`).

### Props
```ts
interface ThoughtTriageDrawerProps {
  thought: TaskResponse | null       // null = closed
  domains: DomainResponse[]
  onConvert: (thought: TaskResponse, data: ConvertData) => void
  onDelete: (thought: TaskResponse) => void
  onOpenChange: (open: boolean) => void
}
```

### Internal structure
```
Drawer.Root (open={!!thought}, onOpenChange)
  Drawer.Portal
    Drawer.Overlay (bg-black/40, z-50)
    Drawer.Content (fixed bottom-0, rounded-t-2xl, max-w-lg mx-auto)
      Drawer.Handle (vaul native)
      Drawer.Title (sr-only for a11y: "Triage thought")
      <scrollable body>
        Smart input (editable title, uses useSmartInput)
        MetadataPill row (from parsed.tokens)
        DomainChipRow (from field-pickers.tsx)
        Collapsible "More options" section:
          ImpactButtonRow
          ScheduleButtonRow
          DurationChipRow (inline, simple — 5 preset chips from DURATION_PRESETS)
          ClarityChipRow (inline, simple — 3 chips from CLARITY_OPTIONS)
      </scrollable body>
      <sticky footer>
        Delete button (ghost, destructive)
        Convert button (domain-colored when domain selected, grey when not)
      </sticky footer>
```

### Key implementation details

**Smart input remount:** Use `key={thought?.id}` on the inner content component so
`useSmartInput({ initialInput: thought.title, domains })` re-initializes cleanly when
switching between thoughts.

**Picker → tapToken wiring:** Each picker's callback wires to `tapToken`:
```ts
// DomainChipRow onSelect:
(id, name) => tapToken("@", name, /@\S+/)
// ImpactButtonRow onChange:
(impact) => tapToken("!", IMPACT_KEYWORDS[impact], /!(high|mid|low|min|p[1-4])\b/i)
// ScheduleButtonRow:
onSelectToday: () => tapToken("", "today", /\b(today|tomorrow|...)\b/i)
```

**Accordion state:** Persisted in `localStorage("triage-more-expanded")`. Uses
`Collapsible` / `CollapsibleTrigger` / `CollapsibleContent` from `components/ui/collapsible.tsx`.
Trigger shows `ChevronRight` that rotates on open.

**Convert button color:** When `parsed.domainId` is set, find the domain's color and apply
it as the button's background. Use `transition-colors duration-200` for smooth shift.
When no domain, use default disabled grey.

**Footer layout:** `sticky bottom-0 bg-background border-t` inside the scrollable
container. Contains Delete (left) and Convert (right, flex-1).

**Duration & Clarity pickers:** Simple inline chip rows (not extracted to field-pickers.tsx
since they're small and only used in "More options"). Use `DURATION_PRESETS` +
`formatDurationLabel` and `CLARITY_OPTIONS` + `CLARITY_COLORS` from `task-utils.ts`.

**No auto-focus on open.** Users tap domain chips first (primary action). They tap the
input to edit only when needed.

## Step 3: Refactor `thoughts.lazy.tsx`

**Modified file:** `frontend/src/routes/_authenticated/thoughts.lazy.tsx`

### Remove (~185 lines)
- `ThoughtTriageCard` function component (lines 379-639)
- `expandedId` state and `handleToggleExpand` callback
- `disabled={expandedId === thought.id}` from TaskSwipeRow
- Inline expanded/collapsed branching in card list
- Imports: `ChevronUp`, `IMPACT_COLORS`, `IMPACT_OPTIONS`, `SmartInputAutocomplete`,
  `MetadataPill`, `useSmartInput`

### Add (~15 lines)
- `selectedThought` state: `TaskResponse | null`
- `ThoughtTriageDrawer` rendered once at page level (outside the card loop)
- `ThoughtCard.onToggleExpand` → `onTap` that sets `selectedThought`
- Import `ThoughtTriageDrawer` from new file

### Keep unchanged
- `ThoughtCard` (collapsed row)
- `TaskSwipeRow` wrapping each card (always enabled now — no disabled state)
- Bottom capture input
- `handleConvert`, `handleDelete`, `handleSend` — passed as callbacks to drawer
- All crypto/query/mutation logic

### Result
The thoughts page drops from ~640 lines to ~350 lines. The card list becomes a simple
flat list of tappable rows. The capture input is always visible.

## Step 4: Version bump & PR prep

- Bump version in `pyproject.toml`
- Run `uv lock`
- Update `CHANGELOG.md`
- Rename plan file from random name to `2026-02-26-18-30-bottom-sheet-triage-drawer.md`

## Files Summary

| Action | File |
|--------|------|
| Create | `frontend/src/components/task/field-pickers.tsx` |
| Create | `frontend/src/components/task/thought-triage-drawer.tsx` |
| Modify | `frontend/src/routes/_authenticated/thoughts.lazy.tsx` |
| Modify | `pyproject.toml` (version bump) |
| Modify | `CHANGELOG.md` |

## Verification

```bash
# Frontend checks (must all pass)
cd frontend && npx tsc -p tsconfig.app.json --noEmit && npx biome check . && npm run build

# Backend checks (no backend changes, but sanity)
uv run ruff format . && uv run ruff check .
```

Manual verification at 375px viewport:
1. Tap a thought → bottom sheet slides up with thought title, domain chips, footer
2. Tap a domain chip → convert button turns domain color, chip highlights
3. Tap "More options" → accordion expands with priority/schedule/duration/clarity
4. Tap convert → drawer closes, success toast, thought moves to domain
5. Swipe-to-delete works on all cards (no disabled state)
6. Drag handle down → dismisses drawer
7. Tap overlay → dismisses drawer
8. Bottom capture input stays visible when drawer is closed
