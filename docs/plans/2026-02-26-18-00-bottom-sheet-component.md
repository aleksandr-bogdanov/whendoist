---
version:
pr:
created: 2026-02-26
---

# Design: Universal Bottom Sheet for Triage & Task Edit

## Problem

The current Thoughts triage panel expands inline, consuming ~60% of the 667px iPhone viewport.
On iPhone SE (568px), it pushes other thoughts off-screen entirely. The expanded card also
competes with the bottom capture input, mixing "triage mode" and "capture mode" on one screen.
Additionally, the TaskEditor uses a right-side `Sheet` that's awkward on mobile.

## Solution

A reusable `Drawer` component (wrapping `vaul`, already installed v1.1.2) that slides up from
the bottom. Two immediate consumers:

1. **Thought triage** — replaces inline `ThoughtTriageCard`
2. **Task edit on mobile** — replaces the right-side `Sheet` at `md:` breakpoint (future PR)

---

## Component Architecture

### Layer 1: `Drawer` UI primitive

**File:** `frontend/src/components/ui/drawer.tsx`

Standard shadcn/ui Drawer wrapping `vaul`. Exports:

```
Drawer, DrawerTrigger, DrawerClose, DrawerPortal,
DrawerOverlay, DrawerContent, DrawerHeader, DrawerFooter,
DrawerTitle, DrawerDescription, DrawerHandle
```

Key props on `DrawerContent`:
- No snap points needed — vaul's default auto-height behavior works well
- `onOpenAutoFocus` suppressed by default (we manage focus ourselves)
- Max width: `max-w-lg mx-auto` so it doesn't stretch absurdly wide on desktop/tablet
- Rounded top corners: `rounded-t-2xl`

Overlay: `bg-black/40` (lighter than Dialog's 50% — sheet is less modal)

### Layer 2: Shared picker components

Extract from `thoughts.lazy.tsx` into reusable, stateless sub-components.
**File:** `frontend/src/components/task/field-pickers.tsx`

#### `DomainChipRow`
```ts
interface DomainChipRowProps {
  domains: DomainResponse[]
  selectedId: number | null
  onSelect: (domainId: number, domainName: string) => void
  label?: string          // shown when nothing selected, e.g. "Choose a domain"
}
```
- Horizontal scroll, full-bleed (negative margin trick for edge-to-edge scroll)
- Each chip: pill shape, domain color as background (selected) or tinted (unselected)
- Active chip: solid fill + white text. Inactive: 8% opacity fill + domain color text

#### `ImpactButtonRow`
```ts
interface ImpactButtonRowProps {
  value: number | null
  onChange: (impact: number) => void
}
```
- 4 buttons in a row (not grid — row wraps better on ultra-narrow screens)
- Uses `IMPACT_OPTIONS` and `IMPACT_COLORS` from `task-utils.ts`
- Active: ring + tinted background. Inactive: secondary background
- Toggle behavior: tapping already-active value deselects it (sets null)

#### `ScheduleButtonRow`
```ts
interface ScheduleButtonRowProps {
  selectedDate: string | null
  onSelect: (date: string) => void
  onClear: () => void
}
```
- "Today" / "Tomorrow" buttons
- Active: primary fill. Inactive: secondary
- "Clear" link appears when a date is selected

#### `DurationChipRow`
```ts
interface DurationChipRowProps {
  value: number | null
  onChange: (minutes: number | null) => void
}
```
- Chips: 15m, 30m, 1h, 2h, 4h (from `DURATION_PRESETS`)
- Toggle: tap active = deselect

#### `ClarityChipRow`
```ts
interface ClarityChipRowProps {
  value: string | null
  onChange: (clarity: string) => void
}
```
- Chips: Autopilot, Normal, Brainstorm
- Uses `CLARITY_COLORS` for active tinting

All pickers follow the same pattern:
- Stateless (controlled via props)
- 44px minimum touch target height on all buttons
- `active:scale-95` press feedback
- No labels by default (the containing layout adds section headers if needed)

### Layer 3: `ThoughtTriageDrawer`

**File:** `frontend/src/components/task/thought-triage-drawer.tsx`

```ts
interface ThoughtTriageDrawerProps {
  thought: TaskResponse | null   // null = closed
  domains: DomainResponse[]
  onConvert: (thought: TaskResponse, data: ConvertData) => void
  onDelete: (thought: TaskResponse) => void
  onOpenChange: (open: boolean) => void
}
```

Composes `Drawer` + pickers + smart input into the triage experience.

---

## Layout: Triage Mode (Default)

```
┌─────────────────────────────────────┐
│                                     │
│          ▔▔▔▔ (drag handle)         │
│                                     │
│  ┌─────────────────────────────────┐│
│  │ Cancel HBO Max subscription   📎││  ← Smart input (editable)
│  └─────────────────────────────────┘│
│  [# Work] [! High]                  │  ← Metadata pills (from parser)
│                                     │
│  ● Work  ● Health&Fit  ● Personal ▸│  ← Domain chips (h-scroll)
│                                     │
│  ▸ Priority, schedule & more        │  ← Accordion (collapsed by default)
│                                     │
│ ┌───────────────────────────────────┐
│ │ 🗑 Delete          Convert → ●   ││  ← Sticky footer
│ └───────────────────────────────────┘
└─────────────────────────────────────┘
```

**Height:** Auto-sized to content. With accordion collapsed: roughly 280px (~42% of 667px
viewport). With accordion expanded: roughly 440px (~66%).

## Layout: Accordion Expanded

```
│  ▾ Priority, schedule & more        │
│                                     │
│  Priority                           │
│  ┌P1 High┐ ┌P2 Mid┐ ┌P3 Low┐ ┌P4┐ │
│                                     │
│  Schedule                           │
│  ┌ Today ┐ ┌Tomorrow┐  Clear        │
│                                     │
│  Duration                           │
│  ┌15m┐ ┌30m┐ ┌ 1h ┐ ┌2h┐ ┌4h┐     │
│                                     │
│  Clarity                            │
│  ┌Autopilot┐ ┌Normal┐ ┌Brainstorm┐ │
│                                     │
```

Accordion state persisted in `localStorage` (`triage-more-expanded`). If the user always
opens it, it stays open for all future triages.

## Layout: With Keyboard Open (iOS)

```
┌─────────────────────────────────────┐
│          ▔▔▔▔ (drag handle)         │
│                                     │
│  ┌─────────────────────────────────┐│
│  │ Cancel HBO Max sub…      (caret)││  ← Focused
│  └─────────────────────────────────┘│
│  [# Work]                           │  ← Pills
│                                     │
│  ● Work  ● Health  ● Personal   ►  │  ← Domains still visible
│                                     │
│ ┌───────────────────────────────────┐│
│ │ 🗑 Delete         Convert → ●    ││  ← Footer above keyboard
│ └───────────────────────────────────┘│
├─────────────────────────────────────┤
│           iOS Keyboard              │
│          (252px tall)               │
└─────────────────────────────────────┘
```

**Keyboard strategy:**
- `vaul` positions drawer content with CSS `fixed; bottom: 0`
- On iOS Safari, the visual viewport shrinks when keyboard opens; `vaul` adjusts
  automatically in recent versions
- The accordion section auto-collapses when keyboard is open (detected via
  `visualViewport.height < screen.height * 0.75`) to keep domain chips + footer visible
- On keyboard dismiss, the accordion re-expands if it was previously open
- The footer uses `position: sticky; bottom: 0` within the drawer's scroll container,
  so it naturally sits at the visible bottom edge

**Autocomplete dropdown:** When the user types `#` in the smart input, the
`SmartInputAutocomplete` dropdown appears *below the input but inside the drawer's scroll
area*. This works because the drawer content scrolls — no z-index wars with the keyboard.

---

## Convert Button Behavior

The "Convert to Task" button is the key CTA. Its state communicates readiness:

| State | Appearance |
|-------|-----------|
| No domain selected | Grey/disabled, muted text "Convert to Task →" |
| Domain selected | **Domain color** background, white text, enabled |
| Converting... | Domain color + spinner, disabled |

The color transition uses `transition-colors duration-200`. When the user taps "Work"
(green), the button smoothly shifts from grey to green. This creates a satisfying
cause → effect loop.

---

## Interaction Flow

### Opening
1. User taps a collapsed `ThoughtCard` in the list
2. `selectedThought` state is set → `ThoughtTriageDrawer` opens
3. Smart input auto-focuses → keyboard opens (if `autoFocus` desired; otherwise stays closed
   and user taps input to edit)
4. The thought list dims behind the overlay but stays visible

**Auto-focus decision:** Do NOT auto-focus the input. Most users will tap a domain chip
first (the primary action), not edit the title. Auto-focus would open the keyboard
immediately, hiding half the UI. Let users tap the input only when they want to edit.

### Triaging
1. User taps a domain chip → domain is selected, convert button lights up
2. (Optional) User taps "Priority, schedule & more" to expand the accordion
3. (Optional) User taps priority/schedule/duration/clarity chips
4. User taps "Convert to Task →"

**Or, power-user flow via smart input:**
1. User taps the title text to edit it
2. Types `#Work !high tomorrow 30m`
3. Parser extracts all metadata → domain chip auto-highlights, pills appear
4. User taps "Convert to Task →" (or presses Enter on keyboard)

### Closing
- Drag the handle downward past threshold → dismiss (no save)
- Tap the overlay → dismiss
- After successful convert → drawer auto-closes, success toast with undo
- After delete → drawer auto-closes, delete toast with undo

### Smart Input ↔ Picker Sync

This is critical: the smart input and the tap pickers must stay in sync.

- **Tapping a domain chip** calls `tapToken("#", domainName, /#\S+/)` → inserts/replaces
  `#DomainName` in the input text → parser re-evaluates → `parsed.domainId` updates →
  chip highlights
- **Typing `#Work` in the input** → parser extracts domain → chip highlights
- **Dismissing a token pill** (X button) → removes the token from input → chip unhighlights

This bidirectional sync already exists in `useSmartInput()` via `tapToken()`. No new
logic needed — just wire the pickers to call `tapToken()` with the right patterns (exactly
as the current `ThoughtTriageCard` does).

---

## Changes to Thoughts Page

### Remove
- `ThoughtTriageCard` component (entire thing — ~170 lines)
- `expandedId` state
- Inline expanded/collapsed branching in the card list
- `disabled={expandedId === thought.id}` on `TaskSwipeRow`

### Add
- `selectedThought` state: `TaskResponse | null`
- `ThoughtTriageDrawer` rendered once at page level (not per-card)
- `ThoughtCard.onToggleExpand` renamed to `onTap` → sets `selectedThought`

### Keep
- `ThoughtCard` (collapsed row) — unchanged
- `TaskSwipeRow` around each card — unchanged, always enabled now
- Bottom capture input — unchanged, always visible
- All mutation handlers (`handleConvert`, `handleDelete`, `handleSend`) — moved to drawer
  or kept as callbacks passed to drawer

### Result
The thought list becomes a simple flat list of tappable cards. Swipe works on all of them
(no disabled state needed). The capture input is always visible. The triage happens in the
overlay drawer, completely decoupled from the list layout.

---

## Desktop Behavior

On all screen sizes, use the Drawer. Benefits:
- One codebase, one interaction pattern
- Bottom sheets work well on desktop (Linear, Notion, Figma all use them)
- The `max-w-lg` constraint keeps it from looking absurd on wide screens

On desktop, the Drawer content renders centered at bottom with rounded corners and max
width of 32rem (512px). The overlay covers the full viewport.

---

## Future: Task Edit on Mobile

The same `Drawer` primitive will be used for task editing on mobile. The plan:

1. `TaskEditor` currently uses `Sheet` (right-side) — works well on desktop, cramped on mobile
2. Create `TaskEditDrawer` that composes the same picker components but with full form fields
   (title, description textarea, domain select, impact/clarity/duration/schedule pickers,
   recurrence, subtasks)
3. The page-level component detects viewport width:
   - `md:` and above → use `Sheet` (right-side, existing)
   - Below `md:` → use `TaskEditDrawer` (bottom sheet)

This is a future PR. The shared picker components extracted in this PR will be reused there.

---

## New Files

| File | Purpose |
|------|---------|
| `components/ui/drawer.tsx` | shadcn/ui Drawer primitive (vaul wrapper) |
| `components/task/field-pickers.tsx` | Shared picker components (domain, impact, schedule, etc.) |
| `components/task/thought-triage-drawer.tsx` | Triage-specific drawer composition |

## Modified Files

| File | Change |
|------|--------|
| `routes/_authenticated/thoughts.lazy.tsx` | Remove inline triage, add drawer |

## Deleted Code

| What | Lines |
|------|-------|
| `ThoughtTriageCard` component | ~170 lines in `thoughts.lazy.tsx` |
| `expandedId` state + branching | ~15 lines |

---

## PWA Safety Checklist

- [ ] No `overflow: hidden` on html/body
- [ ] No `position: fixed` on page containers (vaul uses fixed on the drawer itself, which
      is fine — it's a portal, not a page container)
- [ ] No `100dvh` — vaul uses its own height calculation
- [ ] Drawer content scrolls with `overflow-y: auto` inside fixed container (safe pattern)
- [ ] Footer uses `sticky` not `fixed` inside the scroll container

---

## Open Questions

1. **Auto-focus input on open?** Recommendation: NO. Opening the keyboard immediately on
   a 375px screen would hide the domain chips (the primary interaction). Let users tap the
   input explicitly when they want to edit. The default flow is: open → tap domain → convert.

2. **Accordion default state?** Start collapsed. Persist in localStorage. The 80% use case
   is "pick a domain and go" — don't tax everyone with 4 extra picker rows.

3. **Should the smart input show syntax hints?** Not in triage. The power-user flow
   (typing tokens) is secondary to the tap-based flow. Adding syntax hints would add visual
   noise. The `TaskQuickAdd` dialog already has hints for the keyboard-heavy flow.

4. **Drag-to-dismiss vs. tap-overlay-to-dismiss:** Both. vaul supports both by default.
   The overlay tap requires user confirmation if form is dirty (domain or title changed).
