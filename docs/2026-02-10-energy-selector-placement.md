# Mobile UX: Energy Selector Placement Assessment

## Problem

On large iPhones (15 Pro Max, 6.7"), the energy selector pills at the top of the
task list are unreachable with one-handed thumb use. Energy switching is the
most-used control on the tasks page — it filters the entire task list by cognitive
load (Zombie/Normal/Focus). It needs to be in the thumb zone.

## Current Layout (top to bottom)

```
┌─────────────────────────────────┐
│  Logo   THOUGHTS TASKS ...  [→] │  ← site-header (60px)
├─────────────────────────────────┤
│  ENERGY 🧟☕🧠 ●●  CLR↑ DUR IMP │  ← task-list-header (sticky)
├─────────────────────────────────┤
│  ▼ Career  5                    │
│  ┌─────────────────────────────┐│
│  │ Task title    Autopilot — Mid││  ← scrollable task list
│  │ Task title    Autopilot — Mid││
│  └─────────────────────────────┘│
│  ...                            │
│  (scrolls)                      │
├─────────────────────────────────┤
│  [Tasks]    (+)    [Schedule]   │  ← mobile-tabs (fixed bottom)
└─────────────────────────────────┘
```

The energy selector is at the TOP — farthest from the natural thumb rest position
at the bottom of the screen.

## Constraint

The sort headers (CLARITY ↑, DUR, IMPACT) serve as **column labels** that
must visually align with `.task-meta` values in each row. They MUST stay at the
top, above the task list. Moving them to the bottom would break the column
header → column data visual association.

The energy selector, however, is a **filter** — it's conceptually independent
of column positions. It can live anywhere.

## Options

### Option A: Energy strip above the bottom tab bar

```
│  ...task list scrolls...        │
├─────────────────────────────────┤
│  🧟  ☕  🧠    ●●●              │  ← energy strip (~36px)
├─────────────────────────────────┤
│  [Tasks]    (+)    [Schedule]   │  ← mobile-tabs
└─────────────────────────────────┘
```

A thin horizontal strip with the 3 energy pills + clarity dots, sitting directly
above the tab bar. The task-list-header becomes just the sort column labels.

**Pros:**
- Energy pills are in the thumb zone — easy one-handed tap
- Clean separation: filtering at bottom, column sorting at top
- Top header becomes slimmer (just sort labels) → more content visible
- Conceptually similar to iOS toolbar pattern (actions near bottom)

**Cons:**
- Two stacked bars at bottom — consumes ~96px + safe area
- Task list content area shrinks by ~36px
- Visual disconnect: energy affects what's shown in the list above, but the
  control is at the bottom (though this is standard for filters in iOS apps)
- Need to adjust `padding-bottom` on `.tasks-panel.mobile-active`

**Implementation complexity:** Medium
- Move `.energy-wrapper` HTML below `.task-list-container` (or use CSS `order`)
- Create new fixed-position strip above `.mobile-tabs`
- Adjust bottom padding calculations

### Option B: Energy pills integrated into the bottom tab bar

```
│  ...task list scrolls...        │
├─────────────────────────────────┤
│  🧟 ☕ 🧠 │ [Tasks] (+) [Sched]│  ← combined bar
└─────────────────────────────────┘
```

Energy pills become part of the tab bar itself, on the left side.

**Pros:**
- Single bottom bar — no extra vertical space
- All primary controls in one strip
- Maximizes content area

**Cons:**
- Tab bar becomes crowded (5 interactive elements + FAB in one row)
- Energy pills lose their "filter" visual identity, blend with navigation
- Hard to fit on narrow screens (iPhone SE/Mini)
- Mixes navigation (tabs) with filtering (energy) — different conceptual layers

**Implementation complexity:** Medium-High
- Restructure `.mobile-tabs` HTML
- Responsive layout challenges on narrow screens

### Option C: Energy pills as a floating pill bar (centered above tab bar)

```
│  ...task list scrolls...        │
│                                 │
│         ┌───────────┐           │
│         │ 🧟  ☕  🧠 │           │  ← floating pill (overlays content)
│         └───────────┘           │
├─────────────────────────────────┤
│  [Tasks]    (+)    [Schedule]   │
└─────────────────────────────────┘
```

A compact floating capsule positioned above the tab bar, overlapping the task
list content slightly.

**Pros:**
- Visually distinctive — clearly a filter, not navigation
- Doesn't consume dedicated vertical space (overlaps scroll area)
- Thumb-reachable
- Aesthetically clean, modern (similar to Apple Maps floating controls)

**Cons:**
- Overlaps last visible task item(s)
- Need scroll padding at bottom so last task isn't hidden behind it
- More complex z-index/positioning
- Could feel "in the way" when scrolling

**Implementation complexity:** Medium
- Fixed-position element with z-index above task list
- Add scroll padding to compensate for overlap

### Option D: Swipe gesture on tab bar to cycle energy

No visual change — swipe left/right on the tab bar area to cycle through
Zombie → Normal → Focus.

**Pros:**
- Zero UI changes, zero space consumption
- Fast once learned (muscle memory)
- Power-user friendly

**Cons:**
- Not discoverable at all
- Conflicts with potential tab-switching swipe gestures
- No visual affordance
- Accessibility concerns

**Implementation complexity:** Low (JS only)

### Option E: Full control bar above tab bar (energy + sort)

```
│  ...task list scrolls...        │
├─────────────────────────────────┤
│  🧟☕🧠  ●●●    CLR↑  DUR  IMP │  ← full control bar
├─────────────────────────────────┤
│  [Tasks]    (+)    [Schedule]   │
└─────────────────────────────────┘
```

Move the ENTIRE task-list-header above the tab bar.

**Pros:**
- All controls in thumb zone
- Maximum content area at top (just tasks, no header)
- Header doesn't eat into scroll area

**Cons:**
- **Breaks column alignment** — sort headers are no longer above their columns
- Three stacked fixed bars is too heavy: site-header + control-bar + tabs
- Actually makes the bottom area very heavy (~156px of fixed UI)
- Sort headers below data they describe is confusing

**Verdict:** Rejected. Column labels must stay above columns.

---

## Recommendation

**Option A (energy strip above tab bar)** is the best balance:

1. Moves the most-used control to the thumb zone
2. Preserves column label alignment at the top
3. Standard iOS pattern (toolbar above tab bar)
4. Moderate implementation effort
5. Clean visual separation of concerns

The ~36px vertical cost is worth it because:
- The current energy row at the top is ~36px anyway — net change is zero
  (it moves from top to bottom, freeing the top)
- The top header becomes just sort labels (slimmer, ~20px)
- Net gain in visible content area: ~16px

### Visual mockup of recommended layout:

```
┌─────────────────────────────────┐
│  Logo   THOUGHTS TASKS ...  [→] │  ← site-header (60px, unchanged)
├─────────────────────────────────┤
│           CLR↑   DUR   IMPACT   │  ← slim sort-only header (~24px)
├─────────────────────────────────┤
│  ▼ Career  5                    │
│  Task title       Autopilot Mid │  ← more visible content!
│  Task title       Autopilot Mid │
│  ...                            │
│  (scrolls)                      │
├─────────────────────────────────┤
│  ENERGY  🧟  ☕  🧠    ●●●      │  ← energy strip (~36px, NEW)
├─────────────────────────────────┤
│  📋Tasks     (+)     📅Schedule │  ← mobile-tabs (unchanged)
└─────────────────────────────────┘
```

### Implementation approach:

1. **CSS-only on mobile** — use `position: fixed` for the energy strip, between
   task list and tab bar. No HTML changes needed (CSS `order` or fixed positioning).
2. **Adjust `.tasks-panel.mobile-active` padding-bottom** to account for the
   energy strip height (~36px more).
3. **Hide energy from sticky header** on mobile (`display: none !important`)
4. **Show energy strip** only at `max-width: 900px`
5. **Desktop unchanged** — energy stays in the header as before

### Questions to decide before implementing:

1. Should the energy strip have a visible background/border, or be transparent
   with floating pills?
2. Should the clarity dots (●●●) move with the energy pills, or stay in the
   header?
3. On the Schedule tab, should the energy strip hide (since it doesn't affect
   the calendar view)?
