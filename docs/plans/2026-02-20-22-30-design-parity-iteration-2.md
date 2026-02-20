---
version: v0.54.3
pr:
created: 2026-02-20
---

# Design Parity Iteration 2: Post-Phase 1–3 Audit

> Fresh visual audit of the React SPA after all three phases of the original design-parity plan (v0.54.0–v0.54.2, PRs #386–#388) were merged. Compares the current state against the legacy frontend, the brand spec, and the two side-by-side screenshots.

---

## Table of Contents

1. [Phase 1–3 Changelog (Verified)](#phase-13-changelog-verified)
2. [Remaining Gaps from Original Plan](#remaining-gaps-from-original-plan)
3. [Newly Visible Issues](#newly-visible-issues)
4. [Missed Details](#missed-details)
5. [Actionable Changes by Tier](#actionable-changes-by-tier)

---

## Phase 1–3 Changelog (Verified)

Every item from the original plan verified against the shipped code.

### Phase 1: Foundation (PR #386, v0.54.0)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1.1 | Canvas background → `#F8FAFC` | **Shipped** | `globals.css:83` — `--background: oklch(0.987 0.002 247.839)` = `#F8FAFC` |
| 1.2 | Interactive hover → purple-tinted | **Shipped** | `task-item.tsx` — `hover:bg-[rgba(109,94,246,0.04)]` on task rows and subtask rows |
| 1.3 | Focus ring → brand purple | **Shipped** | `globals.css:100` — `--ring: oklch(0.585 0.233 277.117)` = `#6D5EF6` |
| 1.4 | Now-line → purple | **Shipped** | `day-column.tsx` — `bg-[#6D5EF6]` on both circle and line |
| 1.5 | Impact rail left rounding | **Shipped** | `task-item.tsx` — `borderRadius: isParent ? undefined : "4px 0 0 4px"` |
| 1.6 | Calendar events → outlined cards | **Shipped** | `calendar-event.tsx` — `bg-card` + `border border-border/60 border-l-[3px]` + `${backgroundColor}10` tint |

### Phase 2: CTA & Depth (PR #387, v0.54.1)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 2.1 | Plan My Day → gradient CTA | **Shipped** | `button.tsx` — `variant="cta"` with `bg-gradient-to-br from-[#6D5EF6] via-[#8B7CF7] to-[#A78BFA]` + `shadow-[var(--shadow-cta)]` |
| 2.2 | Glass blur headers | **Shipped** | `header.tsx` — `backdrop-blur-md bg-background/85`; `task-panel.tsx` — `backdrop-blur-md bg-muted/30` |
| 2.3 | Shadow system | **Shipped** | `globals.css:79-81` — `--shadow-card`, `--shadow-raised`, `--shadow-cta` all defined (light + dark) |
| 2.4 | Calendar card radius → 6px | **Shipped** | `scheduled-task-card.tsx` — `rounded-[6px]` |

### Phase 3: Polish (PR #388, v0.54.2)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 3.1 | Desktop row padding | **Shipped** | `task-item.tsx` — `py-1.5 sm:py-2` |
| 3.2 | Calendar panel card treatment | **Shipped** | `calendar-panel.tsx` — `border-l md:border md:rounded-xl md:shadow-[var(--shadow-card)]` |
| 3.3 | Panel header backgrounds | **Shipped** | `task-panel.tsx` — `bg-muted/30`; `calendar-panel.tsx` header — `bg-muted/30 md:rounded-t-xl` |
| 3.4 | Completion pulse animation | **Shipped** | `globals.css:186-196` — `@keyframes completion-pulse`; `task-item.tsx` — `animate-[completion-pulse_0.35s_ease-out]` |
| 3.5 | Hour grid banding | **Shipped** | `day-column.tsx` — even hours get `backgroundColor: "rgba(15, 23, 42, 0.015)"` |
| 3.6 | Domain card shadows | **Shipped** | `domain-group.tsx` — `shadow-[var(--shadow-card)]` |

**Summary:** All 16 planned items across 3 phases shipped successfully. The foundation is solid.

---

## Remaining Gaps from Original Plan

Items the plan called out as "consider" or that were partially implemented.

### Gap 1: Button Base `font-weight` Still 500

**Plan said:** "bump button font-weight to 600" (Section 11, Buttons)
**Current:** `button.tsx:8` base uses `font-medium` (Tailwind = 500). Only the CTA variant overrides to `font-semibold` (600).
**Impact:** Primary buttons like "+ New Task" render at 500 weight — lighter than the brand spec's 600.

### Gap 2: Residual `hover:bg-accent` (Zinc) on Interactive Elements

**Plan said:** Replace `hover:bg-accent` with purple-tinted hover everywhere.
**Current:** Purple hover is applied to task rows and subtask rows only. These elements still use zinc-tinted `hover:bg-accent`:
- `task-item.tsx:517` — subtask expand toggle
- `task-item.tsx:623` — kebab menu button
- `anytime-task-pill.tsx:20` — anytime pill
- `scheduled-section.tsx:73` — section header toggle
- `completed-section.tsx:34` — section header toggle
- `deleted-section.tsx:47,80` — section rows
- `domain-group.tsx:186` — `hover:bg-muted/80` (not zinc, but also not purple)
- `calendar-panel.tsx:445,453` — zoom control buttons (`hover:bg-muted`)

### Gap 3: Domain Group Left Accent Not Added

**Plan said:** "Consider adding a subtle 2px left border in brand purple to domain group cards" (Section 4.2).
**Current:** Domain groups have no left accent. The legacy had a purple left border on groups, reinforcing the brand's "left rail = visual hierarchy" pattern. Not implemented.

### Gap 4: Strikethrough Animation Not Implemented

**Plan said:** "Legacy had a clip-path animation for the strikethrough appearing across the task title" (Section 4.3).
**Current:** Completed tasks use plain `line-through text-muted-foreground` — no animation on the strikethrough appearance.

### Gap 5: Calendar Day Dimming (Past/Future)

**Plan said:** "Legacy dimmed past days (opacity: 0.7) and future days (opacity: 0.85), keeping today at full opacity" (Section 4.5).
**Current:** Adjacent-day panels use `bg-muted/30` background and events get `dimmed` prop → `opacity-60`. This is a coarser approach. The legacy applied graduated opacity to the day columns themselves, making today visually "pop" relative to surrounding days. React's approach dims uniformly.

### Gap 6: Sort Column Headers Not Uppercase

**Plan said:** "CLARITY↑ DURATION IMPACT, tiny uppercase" — both legacy and React were noted as same style.
**Actual state:** `sort-controls.tsx` labels are title-case (`"Clarity"`, `"Duration"`, `"Impact"`) with no `uppercase` class. The legacy used all-uppercase "CLARITY DURATION IMPACT". While `tracking-[0.06em]` and `font-semibold` are correct, the lack of `uppercase` breaks the brand's consistent label convention visible everywhere else (ENERGY, SCHEDULED, COMPLETED — all uppercase).

### Gap 7: Task List Container Desktop Padding Still Tight

**Plan said:** "Increase desktop padding" (Section 3.3, Task Row Padding).
**Current:** `task-panel.tsx` uses `px-2 sm:px-4` for the content area (8px / 16px). Legacy used `3rem` (48px) content padding. The task content on desktop still feels considerably more cramped than legacy. The `sm:px-4` (16px) is only ~33% of the legacy's 48px.

---

## Newly Visible Issues

Problems that only became apparent now that the Phase 1–3 changes are in place, or issues introduced by those changes.

### Issue 1: Calendar Event Body Tint Too Subtle (`6%` opacity)

The calendar event restyling uses `${backgroundColor}10` — this is a hex suffix meaning 6% opacity (hex `10` = 16/255 ≈ 6%). On a white card, this produces an almost imperceptible tint. The legacy used a clear white background with the colored left rail providing all differentiation.

**Problem:** With both a subtle tint AND a left rail, the events look fine. But when multiple events sit next to each other (e.g., 1:30 PM "Грин" and 2:30 PM "Оля Зубкова" in the screenshots), the very subtle tint difference between event colors is nearly invisible. The left rail does all the work.

**Recommendation:** Either:
- Drop the body tint entirely (use plain `bg-card`) for cleaner look matching legacy exactly, OR
- Increase to `${backgroundColor}18` (hex `18` = 24/255 ≈ 9%) for slightly more visible differentiation

### Issue 2: Calendar Event Visual Weight vs Legacy

Comparing the two screenshots, React calendar events are noticeably "busier" than legacy:

| Element | Legacy | React |
|---------|--------|-------|
| Icons | None | Calendar icon + external link icon |
| Time display | Just `"05:00"` inline | `"5:00 AM - 6:00 AM"` as separate line |
| Left rail width | 2px | 3px |
| Visual density | Minimal — just time + title | Time + title + icons + time range |

The icons and time range are good affordances, but they make the events larger and more complex than legacy's clean cards. For **short events** (30m), this is especially noticeable — the content may clip.

**Recommendation:** For events shorter than 45 minutes, consider hiding the time range row and showing only the title (like legacy did for short events).

### Issue 3: Calendar Panel Border-Radius Mismatch

- Domain group cards: `rounded-[10px]`
- Calendar panel: `md:rounded-xl` = 14px (from `calc(var(--radius) + 4px)` where `--radius: 0.625rem` = 10px)
- Scheduled task cards: `rounded-[6px]`

The brand spec defines `--radius-lg: 12px` for cards. Both 10px (domain groups) and 14px (calendar panel) are off. They should be consistent at 12px.

### Issue 4: W Icon Still at "Small" Size

The legacy header used the "large" W icon (42×37px). React uses the "small" size (17×15px per `brand-spec.json`). The original plan noted this discrepancy but left it as "keep" — however, looking at the screenshots side by side, the legacy header has significantly more visual presence due to the larger icon. The React header feels bare in comparison.

The brand spec defines a "medium" size at 24×21px that would split the difference.

### Issue 5: `--card` vs Canvas Contrast for Domain Groups

Domain groups use `bg-card` (pure white `#FFFFFF`) on the `#F8FAFC` canvas. Combined with the `--shadow-card`, this creates a nice subtle elevation. However, the task rows *inside* the domain group also sit on this white card surface, making the row hover (`rgba(109,94,246,0.04)`) less visible against white than it was against the old flat `#F8FAFC` surface.

**Not a bug — just a shift in perception.** The hover still works but is 4% opacity on white vs what would've been 4% on slate-50. Negligible difference.

### Issue 6: Zoom Controls Don't Match Brand Interaction Pattern

The floating zoom controls at the bottom of the calendar use:
- `hover:bg-muted` (zinc-tinted hover)
- `bg-card border border-border shadow-[var(--shadow-card)]` (card surface)

While structurally correct, the hover should be purple-tinted per the brand's interactive hover convention.

---

## Missed Details

Things the original plan didn't catch that are now visible in the side-by-side screenshot comparison.

### Detail 1: Completed Task Styling Difference

- **Legacy:** Completed tasks had `color: rgba(15, 23, 42, 0.5)` but **no strikethrough**. The text just faded.
- **React:** Completed tasks have `line-through text-muted-foreground` — visible strikethrough decoration.

Both approaches are valid. The React approach is actually more conventional and clearer about completion state. **No change needed** — just documenting the difference.

### Detail 2: Parent Task Impact Rail

In the React SPA, parent tasks that have subtasks use `borderLeftColor: "var(--border)"` instead of the impact color. This is intentional — it differentiates parents from leaves. In legacy, parent tasks also had a neutral rail. **Consistent — no change needed.**

### Detail 3: Subtask Left Connector Line

- **Legacy:** Subtasks had a visible vertical purple line on the left connecting them to the parent task (the "completion bar").
- **React:** Subtasks are indented (`depth * 24 + 8px` padding) with their own impact rail colors, but no explicit connecting line to the parent.

The legacy's connector line made the parent–child relationship more visually explicit. React relies on indentation and collapse state.

**Recommendation:** Consider adding a subtle vertical connector line (2px, `border-border`) on the left side of expanded subtask areas, bridging from parent to last child. This reinforces hierarchy.

### Detail 4: Task Row Hover Inner Glow

- **Legacy:** On hover, task rows got both a background change AND `box-shadow: inset 0 0 0 1px rgba(109, 94, 246, 0.15)` (inner glow).
- **React:** On hover, rows only get `bg-[rgba(109,94,246,0.04)]`.

The legacy's inner glow added a refined, premium feel to the hover state — a subtle purple border appeared around the entire row. The React hover is functional but less sophisticated.

### Detail 5: Legacy Primary Button Had Gradient + Active Press

Legacy `.btn-primary`:
```css
background: linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 100%), #0B1220;
/* Active state: */
transform: translateY(1px);
box-shadow: var(--shadow-sm);
```

React `variant="default"`: `bg-primary text-primary-foreground hover:bg-primary/90` — flat color, no gradient sheen, no press animation.

The legacy's subtle top-to-bottom white sheen (8% → 0%) on the dark button gave it depth. This is a polish detail.

### Detail 6: Calendar "ANYTIME" Section Differences

- **Legacy:** Simple thin strip at top, always present.
- **React:** Has `ANYTIME` label + either task pills or "No tasks" text + acts as drop target.

React is functionally superior. **No change needed.**

### Detail 7: Section Toggle Styling (SCHEDULED / COMPLETED)

The filter-bar uses plain text buttons with `text-foreground/38` for inactive state. Legacy had a similar approach. The React version matches the brand's uppercase label convention (`text-[0.6875rem] font-semibold tracking-[0.06em] uppercase`). **This is correct — no change needed.**

### Detail 8: Overdue Section Badge Count

Looking at the React screenshot, the overdue section shows detailed grouping ("7d overdue", "4d overdue", "3d overdue") with red warning styling. This is vastly superior to legacy's simple "12 past" amber badge. **Keep as-is.**

---

## Actionable Changes by Tier

### Tier 1: Quick Wins (CSS/className only, no logic changes)

#### 1.1 Button Base Font-Weight → 600

**File:** `frontend/src/components/ui/button.tsx`
**Line 8:** Change `font-medium` to `font-semibold` in the base variant class.

```diff
- "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all ..."
+ "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-all ..."
```

The CTA variant already has `font-semibold` — this makes it consistent and matches the brand spec's `font-weight: 600` for buttons.

#### 1.2 Sort Column Headers → Uppercase

**File:** `frontend/src/components/dashboard/sort-controls.tsx`
**Line 25:** Add `uppercase` to the className.

```diff
- "flex items-center justify-center gap-0.5 text-[0.6875rem] font-semibold tracking-[0.06em] transition-colors",
+ "flex items-center justify-center gap-0.5 text-[0.6875rem] font-semibold tracking-[0.06em] uppercase transition-colors",
```

This makes the column headers match every other label in the app (ENERGY, SCHEDULED, COMPLETED all use uppercase).

#### 1.3 Replace Remaining `hover:bg-accent` with Purple-Tinted Hover

**Files and changes:**

| File | Line | Current | Replace With |
|------|------|---------|-------------|
| `task-item.tsx` | 517 | `hover:bg-accent` | `hover:bg-[rgba(109,94,246,0.06)]` |
| `task-item.tsx` | 623 | `hover:bg-accent` | `hover:bg-[rgba(109,94,246,0.06)]` |
| `anytime-task-pill.tsx` | 20 | `hover:bg-accent/50` | `hover:bg-[rgba(109,94,246,0.04)]` |
| `scheduled-section.tsx` | 73 | `hover:bg-accent/50` | `hover:bg-[rgba(109,94,246,0.04)]` |
| `completed-section.tsx` | 34 | `hover:bg-accent/50` | `hover:bg-[rgba(109,94,246,0.04)]` |
| `deleted-section.tsx` | 47 | `hover:bg-accent/50` | `hover:bg-[rgba(109,94,246,0.04)]` |
| `deleted-section.tsx` | 80 | `hover:bg-accent/30` | `hover:bg-[rgba(109,94,246,0.03)]` |
| `calendar-panel.tsx` | 445 | `hover:bg-muted` | `hover:bg-[rgba(109,94,246,0.06)]` |
| `calendar-panel.tsx` | 453 | `hover:bg-muted` | `hover:bg-[rgba(109,94,246,0.06)]` |
| `domain-group.tsx` | 186 | `hover:bg-muted/80` | `hover:bg-muted/70` (keep muted here — large surface) |

Note: Leave `hover:bg-accent` in `button.tsx` (outline/ghost variants) and `toggle.tsx` as-is — those are shadcn base components used app-wide and the context is different (discrete controls vs. brand-tinted content surfaces).

#### 1.4 Calendar Event — Drop Body Tint, Use Plain White

**File:** `frontend/src/components/calendar/calendar-event.tsx`

Change the inline `backgroundColor` from the 6% tint to just use the card background:

```diff
- backgroundColor: item.backgroundColor ? `${item.backgroundColor}10` : undefined,
+ // No body tint — clean white card, color comes from left rail only (matches legacy)
```

Remove the inline `backgroundColor` style entirely. The card already has `bg-card` in its className. This makes events cleaner and matches the legacy's approach exactly.

#### 1.5 W Icon Size → Medium (24×21)

**File:** `frontend/src/components/layout/header.tsx`

Change the W icon SVG dimensions from small (17×15) to medium (24×21):

```diff
- <svg viewBox="38 40 180 160" width="17" height="15" ...>
+ <svg viewBox="38 40 180 160" width="24" height="21" ...>
```

This is the brand spec's "medium" size — a good balance between the legacy's oversized "large" (42×37) and the current too-small "small" (17×15). It gives the header more visual presence without being as dominant as legacy.

#### 1.6 Consistent Card Border-Radius → 12px

**Files:**
- `domain-group.tsx` — change `rounded-[10px]` to `rounded-xl` (will resolve to 14px with current --radius, but see below)
- OR adjust `--radius` in `globals.css` so `rounded-xl` = 12px

Actually, the cleanest fix is to make the domain group use `rounded-[12px]` explicitly and the calendar panel use `md:rounded-[12px]`:

| File | Current | Change |
|------|---------|--------|
| `domain-group.tsx` | `rounded-[10px]` | `rounded-[12px]` |
| `calendar-panel.tsx` | `md:rounded-xl` | `md:rounded-[12px]` |
| `calendar-panel.tsx` header | `md:rounded-t-xl` | `md:rounded-t-[12px]` |

This aligns with the brand spec's `--radius-lg: 12px`.

### Tier 2: Medium Effort (Small component changes)

#### 2.1 Task Row Hover Inner Glow

**File:** `frontend/src/components/task/task-item.tsx`

Add a subtle inset shadow on hover to match legacy's refined hover treatment:

```diff
- "... hover:bg-[rgba(109,94,246,0.04)]",
+ "... hover:bg-[rgba(109,94,246,0.04)] hover:shadow-[inset_0_0_0_1px_rgba(109,94,246,0.12)]",
```

Apply to both parent task rows and subtask rows. This adds the premium purple inner glow that legacy had.

#### 2.2 Primary Button Gradient Sheen

**File:** `frontend/src/components/ui/button.tsx`

Add a subtle top-to-bottom white gradient to the default button variant for depth:

```diff
- "bg-primary text-primary-foreground hover:bg-primary/90",
+ "bg-primary text-primary-foreground hover:bg-primary/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.08)_0%,transparent_100%),var(--primary)]",
```

Actually, this is complex to apply via Tailwind and could be fragile. A simpler approach:

```diff
- "bg-primary text-primary-foreground hover:bg-primary/90",
+ "bg-primary text-primary-foreground hover:bg-primary/90 [background-image:linear-gradient(180deg,rgba(255,255,255,0.08),transparent)]",
```

This gives the dark primary button the same subtle sheen the legacy had.

#### 2.3 Desktop Task List Padding Increase

**File:** `frontend/src/components/dashboard/task-panel.tsx`

Increase the task scroll area's horizontal padding on desktop:

```diff
- className="flex-1 min-h-0 overflow-y-auto relative"
+ className="flex-1 min-h-0 overflow-y-auto relative sm:px-2 lg:px-4"
```

And update the domain group content to have slightly more internal padding on desktop:

**File:** `frontend/src/components/task/domain-group.tsx`

The domain groups already have their own padding. The main gap is the scroll container's side padding. Adding `sm:px-2 lg:px-4` (8px / 16px) on the scroll area provides more breathing room without reaching legacy's aggressive 48px.

#### 2.4 Calendar Event Compact Mode for Short Events

**File:** `frontend/src/components/calendar/calendar-event.tsx`

For events with `item.height < 32` (roughly <30 minutes), hide the time range line:

```tsx
const isCompact = item.height < 32;

// In the JSX:
{!isCompact && (
  <span className="truncate opacity-70 text-[10px]">
    {timeLabel}
  </span>
)}
```

This prevents short event cards from being overstuffed and matches legacy's behavior of only showing the title for short events.

### Tier 3: Polish (Optional enhancements)

#### 3.1 Subtask Connector Line

**File:** `frontend/src/components/task/task-item.tsx`

When subtasks are expanded, add a subtle vertical line connecting parent to children. This can be done with a pseudo-element or a wrapper div:

```tsx
{isExpanded && hasSubtasks && (
  <div className="relative">
    {/* Connector line */}
    <div
      className="absolute top-0 bottom-4 border-l-2 border-border/40"
      style={{ left: `${depth * 24 + 18}px` }}
    />
    {/* ... subtask items */}
  </div>
)}
```

The exact positioning needs to align with the subtask indent level. The line should span from just below the parent to the last child's vertical center.

#### 3.2 Domain Group Left Accent

**File:** `frontend/src/components/task/domain-group.tsx`

Add a subtle 2px left border in brand purple to domain group cards:

```diff
- className="rounded-[12px] border bg-card overflow-hidden shadow-[var(--shadow-card)]"
+ className="rounded-[12px] border border-l-2 border-l-[#6D5EF6]/20 bg-card overflow-hidden shadow-[var(--shadow-card)]"
```

The 20% opacity keeps it subtle while reinforcing the brand's "left rail" visual language.

#### 3.3 Strikethrough Clip-Path Animation

**File:** `frontend/src/styles/globals.css`

Add a keyframe animation for strikethrough appearing:

```css
@keyframes strikethrough-reveal {
  from { clip-path: inset(0 100% 0 0); }
  to   { clip-path: inset(0 0 0 0); }
}
```

**File:** `frontend/src/components/task/task-item.tsx`

Apply to newly-completed task titles using a CSS class that triggers on transition to completed state. This requires tracking "just completed" state briefly, which adds complexity. Lower priority.

#### 3.4 Calendar Day Graduated Dimming

**File:** `frontend/src/components/calendar/day-column.tsx`

Instead of uniform `bg-muted/30` + `opacity-60` for all adjacent days, apply graduated opacity:

- Previous evening (10PM–midnight): opacity 0.7
- Today: full opacity (1.0) — no bg tint
- Next morning (midnight–6AM): opacity 0.85

This makes today's column visually "pop" more, matching the legacy behavior.

---

## Summary Scorecard

| Category | Items | Shipped | Remaining |
|----------|-------|---------|-----------|
| Phase 1 (Foundation) | 6 | 6 | 0 |
| Phase 2 (CTA & Depth) | 4 | 4 | 0 |
| Phase 3 (Polish) | 6 | 6 | 0 |
| **Original plan items** | **16** | **16** | **0** |
| Gaps (incomplete/deferred) | 7 | — | 7 |
| New issues | 6 | — | 6 |
| Missed details | 8 | — | 3 actionable |

### Recommended Implementation Order

**Iteration 2A (1 PR — quick wins):**
1. Button font-weight → 600
2. Sort headers → uppercase
3. Replace remaining `hover:bg-accent` → purple-tinted
4. Calendar event drop body tint
5. W icon → medium 24×21
6. Card border-radius → 12px

**Iteration 2B (1 PR — refinements):**
1. Task row hover inner glow
2. Primary button gradient sheen
3. Desktop task list padding increase
4. Calendar event compact mode for short events

**Iteration 2C (1 PR — polish, optional):**
1. Subtask connector line
2. Domain group left accent
3. Calendar day graduated dimming

---

*This audit builds on [2026-02-20-design-parity-legacy-to-react.md](2026-02-20-design-parity-legacy-to-react.md). Each iteration should be a separate PR following the project's versioned PR convention.*
