---
version: v0.54.2
pr: 386, 387, 388
created: 2026-02-20
---

# Design Parity: Legacy → React SPA

> In-depth comparison of the legacy Jinja frontend and the new React SPA, measured against the brand specification. Identifies what to keep, what to change, and the exact CSS/component modifications required.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Element-by-Element Comparison](#element-by-element-comparison)
3. [Brand Compliance Audit](#brand-compliance-audit)
4. [What the React SPA Does Well (Keep)](#what-the-react-spa-does-well-keep)
5. [What Needs to Change](#what-needs-to-change)
6. [Implementation Priorities](#implementation-priorities)

---

## Executive Summary

The legacy frontend was purpose-built with ~15,000 lines of hand-written CSS implementing the full brand specification. The React SPA was scaffolded with shadcn/ui (zinc "new-york" preset) and Tailwind, then customized with brand colors and the Nunito font. The result is **functionally near-parity** but **visually generic** — it reads as "a React app with purple accents" rather than "the Whendoist brand".

The gap is not in missing features but in **surface treatment**: backgrounds, button styles, shadows, spacing, calendar event styling, interactive states, and the overall warmth/depth of the visual layer. The fixes are almost entirely CSS-level — component structure and logic can stay as-is.

**Key findings:**
- The canvas background is pure white instead of the brand's warm `#F8FAFC` (slate-50)
- Primary buttons are near-black (shadcn default) instead of brand purple
- Calendar events use raw Google Calendar colors (garish purples, greens) instead of the legacy's subtle outlined cards
- No glass/blur effects, no shadow depth system, no hover-reveal micro-interactions
- The CTA button "Plan My Day" lost its gradient + glow treatment
- Task panel and calendar panel lack the card/surface elevation that the legacy had
- Focus rings, interactive hovers, and row hovers are generic instead of purple-tinted

---

## Element-by-Element Comparison

### 1. Page Background (Canvas)

| Aspect | Legacy | React SPA | Brand Spec | Verdict |
|--------|--------|-----------|------------|---------|
| Color | `#F8FAFC` (slate-50) | `oklch(1 0 0)` = `#FFFFFF` (pure white) | `#F8FAFC` | **Change** — use brand canvas |

The legacy's `#F8FAFC` gives a slight warmth that prevents the clinical feel of pure white. This is an easy global fix.

### 2. Header

| Aspect | Legacy | React SPA | Verdict |
|--------|--------|-----------|---------|
| Height | 80px | 80px (`h-20`) | Same — **keep** |
| Background | Glass blur (`backdrop-filter`) | Solid `bg-background` | **Change** — add glass effect |
| Gradient bar | 2px, opacity ~0.35 | 2px, opacity 0.35 | Same — **keep** |
| W icon size | ~42×37px (Large spec) | 30×28px | **Change** — scale up to brand spec "small" (17×15) or "medium" (24×21). Current is already close to medium. Legacy used "large" |
| Nav tab style | Pill with subtle bg | Same approach | **Keep** |
| Nav font | 0.6875rem semibold tracking 0.06em | Same | Same — **keep** |

The header is close. The main gap is the glass/blur treatment that makes it feel elevated when scrolling.

### 3. Energy Selector

| Aspect | Legacy | React SPA | Verdict |
|--------|--------|-----------|---------|
| Layout | Emoji pills + 3 colored dots | Same | **Keep** |
| Dot colors | Blue/Purple/Violet per brand | Same | **Keep** |
| "ENERGY" label | 0.55rem uppercase | 0.5625rem uppercase | Close — **keep** |

This component translates well. **No changes needed.**

### 4. Task Panel Header

| Aspect | Legacy | React SPA | Verdict |
|--------|--------|-----------|---------|
| Background | `bg-panel` (#F1F5F9) inset | Transparent with `border-b` | **Change** — add subtle panel bg |
| Spectrum bar | Gradient at bottom | Identical gradient | **Keep** |
| "+ New Task" button | Not visible (legacy used inline add) | Dark filled (shadcn primary = near-black) | **Change** — use brand purple or keep subtle |
| Column headers | CLARITY↑ DURATION IMPACT, tiny uppercase | Same style | **Keep** |
| Column widths | 54/48/44/28px | 60/58/48/36px | Slightly wider — **keep** (better for touch) |
| Settings gear | On same row as columns | Separate settings panel button | **Keep** (React approach is fine) |

### 5. Task Item (Row)

| Aspect | Legacy | React SPA | Verdict |
|--------|--------|-----------|---------|
| Impact rail | 2px left border, colored by priority | 2px left border, same colors | Same — **keep** |
| Rail rounding | `10px 0 0 10px` (rounded on left edge) | None (square left edge) | **Change** — add left-edge rounding |
| Checkbox | 14×14 rounded-square, appears on hover | 18×18 SVG circle, always visible | **Keep** React's approach — always-visible is better for touch. Purple fill on complete is correct per brand |
| Row padding | 11px with inset dividers | `py-1.5` (~6px) | **Consider** — slightly more padding for readability |
| Row divider | `border-subtle` (~5.5% opacity) | `border-border/40` | Similar — **keep** |
| Hover state | Purple-tinted `rgba(109,94,246,0.03)` | Generic `bg-accent` (shadcn zinc) | **Change** — use purple-tinted hover |
| Completed opacity | 0.7 | 0.6 | Close — **keep** |
| Completion animation | Scale pulse + bar animation | None | **Consider** — add subtle animation on complete |
| Hover-reveal actions | Kebab at `opacity:0`, fades in | Same approach | **Keep** |
| Font size (title) | 0.85rem | `text-sm` (0.875rem) | Equivalent — **keep** |
| Meta font size | 0.65rem | 0.65rem | Same — **keep** |

### 6. Domain Groups

| Aspect | Legacy | React SPA | Verdict |
|--------|--------|-----------|---------|
| Container | `<details>` with subtle border | Collapsible card with `rounded-[10px]` | **Keep** React's approach (proper card) |
| Header bg | Panel-colored (`#F1F5F9`) | `bg-muted/50` | Similar — **keep** |
| Domain name font | 0.875rem | `text-[0.95rem]` | Close — **keep** |
| Count badge | Plain number next to name | `bg-background/60` rounded pill | **Keep** React's approach (cleaner) |
| Inline "Add task" | `+ Add task` ghost button | Same | **Keep** |
| Left border accent | Purple left border on group | None | **Consider** — legacy's left accent was brand-reinforcing |

### 7. Scheduled Section

| Aspect | Legacy | React SPA | Verdict |
|--------|--------|-----------|---------|
| Section header | "SCHEDULED 13" + "12 past" amber badge + dashed separator line | "Scheduled" with icon + count + collapsible chevron | **Keep** React's approach — more functional |
| Overdue grouping | Single "past" badge | Dedicated "Overdue X" section with warning icon, grouped by days overdue | **Keep** React's approach — **much better UX** |
| Overdue text color | Red on dates only | Red headers ("Xd overdue") | **Keep** — the React overdue treatment is superior |

### 8. Calendar Panel

| Aspect | Legacy | React SPA | Verdict |
|--------|--------|-----------|---------|
| Container | Card with 12px radius, subtle border | Flex column, no explicit card | **Change** — add card treatment (border, radius) |
| Background | White surface with slight elevation | Plain `bg-background` | **Change** — add subtle differentiation from canvas |
| Day header | Centered "WEDNESDAY, FEB 18" with arrows | Same layout | **Keep** |
| "Today" button | Floating pill at bottom with shadow | Inline in header, outline variant | **Keep** React's inline placement (better UX) |
| Plan My Day CTA | Gradient purple button with sparkle icon + purple glow shadow | Dark filled button (shadcn primary) | **Change** — this is the hero CTA, should have gradient + glow per brand |
| Hour labels | 0.65rem, tabular-nums | text-[10px] | Legacy slightly larger — **consider** increasing |
| Hour grid lines | Subtle with 2nd-hour banding | `border-border/40` | Similar — **keep** |
| Current time line | Purple line + glowing dot | Red dot + red line | **Change** — brand spec uses purple (`--now: #6D5EF6`) for the now-line, not red |
| Scroll behavior | Swipe carousel, scroll-snap | Same carousel with scroll-snap | **Keep** |
| Zoom controls | Floating pill with `+`/`-` + shadow | Same approach | **Keep** |
| ANYTIME section | Thin strip at top | Same | **Keep** |

### 9. Calendar Events (Google Calendar)

This is the **single largest visual difference** between the two designs.

| Aspect | Legacy | React SPA | Verdict |
|--------|--------|-----------|---------|
| Style | Subtle outlined card: white bg, 1px border, 6px radius | Solid colored block: raw Google bg color fills entire event | **Change** — the React approach is visually overwhelming |
| Text color | Dark text on light card | White text on colored bg | **Change** — dark text on light card is more readable and refined |
| Visual weight | Events are subordinate to the time grid | Events dominate and obscure the grid | **Change** — events should complement, not overpower |
| Impact rail | 2px colored left border on events | None | **Change** — add impact rail for consistency |
| Opacity | ~0.9 | 0.9 with hover to 1 | Similar — but the solid color at 0.9 is still very loud |
| Icons | No icons in event cards | Calendar icon + external link icon | **Keep** icons (good affordance), but tone down the card |

**Recommended approach:** Use the Google Calendar color as a left accent or subtle tint (10-15% opacity background) rather than filling the entire card. Keep the card style similar to the scheduled task cards — white/surface background, subtle border, colored left rail.

### 10. Calendar Scheduled Tasks

| Aspect | Legacy | React SPA | Verdict |
|--------|--------|-----------|---------|
| Style | Outlined card with impact rail, 6px radius | Card with impact rail, `rounded-[10px]` | **Change** — 10px is too rounded for small cards; use 6px per brand spec |
| Background | White with subtle border | `bg-card` with `border-border/40` | Similar — **keep** |
| Icon | None | `CheckCircle2` in `text-primary` | **Keep** (good affordance) |
| Font | 0.65rem | text-xs | Similar — **keep** |

### 11. Buttons (Global)

| Aspect | Legacy | React SPA | Brand Spec | Verdict |
|--------|--------|-----------|------------|---------|
| Primary | `--text` (near-black) bg, white text | `oklch(0.21...)` (near-black) bg, white text | Same — both use dark primary | Legacy and React match here |
| CTA (gradient) | Purple gradient + glow shadow + shine | Not used in React | Brand spec defines `--gradient-primary` | **Change** — apply to key CTAs (Plan My Day, onboarding) |
| Complete | Purple-tinted with border | Not a separate variant | Brand defines `.btn-complete` | **Consider** for future use |
| Height | 32px | 36px (`h-9`) | Brand says 32px | **Keep** 36px (better touch target) |
| Border radius | 6px | Tailwind `rounded-md` (6px) | Brand says 6px | Same — **keep** |
| Font weight | 600 | Shadcn default (500) | Brand says 600 | **Change** — bump button font-weight to 600 |

### 12. Shadows and Depth

| Aspect | Legacy | React SPA | Verdict |
|--------|--------|-----------|---------|
| Card shadow | `--shadow-card`: multi-layer with 24px blur | `shadow-sm` or none | **Change** — add brand shadow tiers |
| Hover lift | `translateY(-2px)` + shadow increase | None | **Consider** on interactive cards |
| CTA glow | Purple glow (`--shadow-cta`) | None | **Change** — apply to Plan My Day button |
| Glass effects | Blur 16px on sticky headers | None | **Change** — add glass blur to sticky headers |
| Focus ring | Purple `rgba(109,94,246,0.3)` | Generic `ring-ring/50` (zinc-based) | **Change** — use purple focus ring |

### 13. Spacing and Layout

| Aspect | Legacy | React SPA | Verdict |
|--------|--------|-----------|---------|
| Container padding | 3rem (48px) | `px-2 sm:px-3` (8-12px on content) | **Consider** — React is more compact. Fine for mobile, could use more breathing room on desktop |
| Content max-width | 1100px | 1200px | Similar — **keep** |
| Panel gap | 2-column grid `2fr 1fr` | `flex-[3]` / `flex-[2]` (60/40) | Same proportions — **keep** |
| Task list content padding | 48px sides | 8-12px sides | **Change** — increase desktop padding |

### 14. Typography

| Aspect | Legacy | React SPA | Verdict |
|--------|--------|-----------|---------|
| Body font | Nunito (400-700) | Nunito (400-700) | Same — **keep** |
| Brand font | Quicksand for wordmark | Quicksand loaded but unused | **Keep** (only needed for wordmark/marketing) |
| Section headers | 0.62rem, 700, uppercase, tracking 0.14em | Similar styles | **Keep** |
| Base text | 0.85rem | 0.875rem (text-sm) | Equivalent — **keep** |
| Letter spacing | Aggressive tracking on labels (0.06-0.14em) | Same approach | **Keep** |

---

## Brand Compliance Audit

### Passing (Correctly Implemented)

1. **Brand colors defined** — `#6D5EF6`, `#167BFF`, `#A020C0` all present in globals.css
2. **Impact colors** — P1-P4 all correct hex values
3. **Clarity tints** — All three tint colors correct
4. **Nunito font** — Loaded and applied globally
5. **Purple for success** — Checkboxes use `#6D5EF6` fill on complete (verified in code, line 457 of task-item.tsx)
6. **Gradient spectrum bar** — Present in both header and task panel header
7. **W icon construction** — Correct SVG with proper viewBox, colors, and rotation
8. **Impact left rail** — 2px border on task items with correct priority colors
9. **Dark mode support** — Full dark theme with `.dark` class toggle
10. **Energy selector** — Three-level system with brand emoji + colored dots

### Failing (Non-Compliant)

| # | Issue | Brand Spec | Current React | Severity |
|---|-------|-----------|--------------|----------|
| 1 | Canvas background | `--bg-canvas: #F8FAFC` | `#FFFFFF` (pure white) | Medium |
| 2 | Primary button color concept | Key CTAs should use purple gradient | Near-black shadcn default for all | Medium |
| 3 | Plan My Day button | Gradient + glow + sparkle CTA treatment | Plain dark button | High — this is the signature CTA |
| 4 | Calendar now-line | Purple (`--now: #6D5EF6`) | Red (`bg-red-500`) | Medium |
| 5 | Google Calendar event style | Subtle outlined cards | Solid colored blocks (garish) | High — dominates the calendar visually |
| 6 | Focus ring color | Purple `rgba(109,94,246,0.22)` | Generic zinc ring | Low |
| 7 | Interactive hover | Purple-tinted `rgba(109,94,246,0.06)` | Generic `bg-accent` (zinc gray) | Medium |
| 8 | Glass/blur effects | Defined in brand: `--glass-blur: 20px` | Not used anywhere | Medium |
| 9 | Shadow system | 3-tier brand shadow system | Minimal shadcn `shadow-sm` only | Medium |
| 10 | Panel backgrounds | `--bg-panel: #F1F5F9` for inset areas | Not differentiated from canvas | Low |
| 11 | Impact rail left rounding | `10px 0 0 10px` on left edge | Square left edge | Low |
| 12 | Calendar event/card radius | 6px for calendar items | 10px (`rounded-[10px]`) | Low |

### Ambiguous (Acceptable Deviation)

| # | Aspect | Notes |
|---|--------|-------|
| 1 | Primary button = near-black | Both legacy and React use dark primary. Brand spec mentions purple for CTAs but not for all primary buttons. The dark-primary approach works well. |
| 2 | Checkbox design | Legacy used square, React uses circle. Both are valid. The circle feels more modern and is brand-purple on complete. |
| 3 | Tighter spacing | React is more compact than legacy. This is fine for mobile-first but could use more breathing room on desktop. Not a brand violation. |
| 4 | "Overdue" section | New in React. Not in brand spec but excellent UX addition. |

---

## What the React SPA Does Well (Keep)

These elements are **equal or better** than the legacy design and should not be regressed:

### 1. Overdue Task Grouping
The legacy just had a "12 past" badge. The React app groups by "7d overdue", "4d overdue", etc. with a red warning icon. This is a significant UX improvement.

### 2. Custom SVG Checkbox
The hand-drawn circle checkbox with purple fill on complete, ghost checkmark on hover, and proper touch target expansion is excellent. It's more refined than the legacy's square checkbox.

### 3. Subtask Progress Display
"LYCA 1/7 ⏱ 2h/2h" showing completion ratio and time estimates. Legacy didn't have this inline.

### 4. Mobile Touch Patterns
Swipe-to-complete, swipe-to-schedule, long-press action sheet, pull-to-refresh — none of these existed in the legacy. These are critical for mobile-first.

### 5. Framer Motion Task Animations
Enter/exit animations on task items with layout animations. Legacy had CSS animations but Framer is smoother.

### 6. Drag Overlay with Backdrop Blur
The DnD overlay with `backdrop-filter: blur` is more polished than legacy's plain drag shadow.

### 7. Collapsible Domain Cards
Using proper Collapsible components with chevron rotation is better than the legacy's `<details>` approach.

### 8. Inline Quick Add
The "+ Quick" button for rapid task creation is a workflow improvement.

### 9. Filter Toggle (SCHEDULED/COMPLETED)
Clean toggle approach for showing/hiding sections.

### 10. Context Menu on Right-Click
Desktop users get a proper context menu with Edit/Complete/Schedule/Delete options, which the legacy also had but the React implementation is cleaner.

---

## What Needs to Change

Ordered by visual impact, grouped into tiers.

### Tier 1: High Impact, Low Effort (CSS-only)

These changes dramatically improve brand alignment with minimal code changes.

#### 1.1 Canvas Background Color
**File:** `frontend/src/styles/globals.css`

Change the root `--background` from pure white to brand canvas:
```css
/* Before */
--background: oklch(1 0 0);  /* #FFFFFF */

/* After */
--background: oklch(0.987 0.002 247.839);  /* #F8FAFC — brand canvas */
```

Also update `--card` to stay pure white for card surfaces:
```css
--card: oklch(1 0 0);  /* stays white — cards on slate-50 canvas */
```

This single change adds warmth and depth to the entire app.

#### 1.2 Interactive Hover States → Purple-Tinted
**Files:** globals.css + component classes

Add custom Tailwind utilities or CSS variables:
```css
:root {
  --interactive-hover: rgba(109, 94, 246, 0.04);
  --row-hover: rgba(109, 94, 246, 0.03);
}
```

Replace `hover:bg-accent` on task rows with `hover:bg-[rgba(109,94,246,0.04)]` (or a custom Tailwind utility).

#### 1.3 Focus Ring → Brand Purple
**File:** globals.css

Override the shadcn `--ring` variable:
```css
:root {
  --ring: oklch(0.585 0.233 277.117);  /* ~#6D5EF6 */
}
```

This makes all focus rings brand-purple instead of zinc.

#### 1.4 Calendar Now-Line → Purple
**File:** `day-column.tsx` or wherever the current-time indicator is rendered

Change `bg-red-500` to `bg-[#6D5EF6]` (or `bg-brand`). The brand spec explicitly says `--now: var(--purple-500)`.

#### 1.5 Impact Rail Left Rounding
**File:** `task-item.tsx` inline style

Add border-radius to the left edge:
```tsx
style={{
  borderLeftWidth: 2,
  borderLeftColor: impactColor,
  borderRadius: '4px 0 0 4px',  // round the left edge
}}
```

### Tier 2: High Impact, Medium Effort

#### 2.1 Calendar Events → Subtle Outlined Cards (not solid color blocks)

This is the **most visually jarring difference**. Currently, Google Calendar events fill with their raw calendar color (e.g., bright purple `#7986cb`, bright green `#33b679`), creating garish blocks that overpower the calendar grid.

**Target design** (matching legacy):
- White/surface background
- 1px subtle border
- 3px colored left rail (using the Google Calendar color)
- Dark text (not white)
- 6px border-radius
- Optional: very subtle tint (`{color}10` = 6% opacity fill)

**File:** `frontend/src/components/calendar/calendar-event.tsx`

Replace the current inline styles with:
```tsx
style={{
  top, height, width, left,
  backgroundColor: backgroundColor ? `${backgroundColor}12` : 'var(--card)',
  borderLeft: `3px solid ${backgroundColor ?? 'var(--border)'}`,
  border: '1px solid var(--border)',
  borderLeftWidth: 3,
  borderLeftColor: backgroundColor,
  color: undefined,  // inherit dark text
}}
className="... bg-card text-foreground ..."
```

#### 2.2 Plan My Day Button → Gradient CTA Treatment

The "Plan My Day" button is the single most important CTA in the app. The brand spec defines a gradient + glow treatment for CTAs.

**Target:**
- Background: `linear-gradient(135deg, #6D5EF6 0%, #8B7CF7 50%, #A78BFA 100%)`
- Text: white
- Shadow: `0 4px 20px rgba(109, 94, 246, 0.25), 0 8px 40px rgba(109, 94, 246, 0.15)`
- Hover: slightly darker gradient + `translateY(-1px)` + stronger shadow
- Sparkle icon (already present in some versions)

**File:** Where `Plan My Day` button is rendered in the calendar header.

Either create a `variant="cta"` for the Button component or apply inline styles. A dedicated variant is cleaner:

```tsx
// In button.tsx CVA variants, add:
cta: "bg-gradient-to-br from-[#6D5EF6] via-[#8B7CF7] to-[#A78BFA] text-white shadow-[0_4px_20px_rgba(109,94,246,0.25)] hover:shadow-[0_6px_28px_rgba(109,94,246,0.30)] hover:-translate-y-px transition-all",
```

#### 2.3 Glass/Blur Headers

Add backdrop blur to sticky/scrolling headers for the premium glass feel.

**Header component:**
```tsx
<header className="relative flex h-20 items-center ... backdrop-blur-md bg-background/85">
```

**Task panel header:**
```tsx
<div className="... backdrop-blur-md bg-background/90 sticky top-0 z-10">
```

#### 2.4 Shadow System

Add the brand shadow tiers as CSS custom properties:
```css
:root {
  --shadow-card: 0 2px 8px rgba(15, 23, 42, 0.04), 0 4px 24px rgba(15, 23, 42, 0.06);
  --shadow-raised: 0 4px 16px rgba(15, 23, 42, 0.06), 0 8px 40px rgba(15, 23, 42, 0.08);
  --shadow-cta: 0 4px 20px rgba(109, 94, 246, 0.25), 0 8px 40px rgba(109, 94, 246, 0.15);
}
```

Apply `--shadow-card` to domain group cards, calendar panel border, and floating controls.

### Tier 3: Medium Impact, Medium Effort

#### 3.1 Calendar Panel as a Proper Card

Give the calendar panel visual separation from the task panel:
- Add `border rounded-xl bg-card` wrapper
- Or at minimum, a left border separator with subtle gradient (legacy used `linear-gradient(to bottom, transparent, var(--border-subtle) 10%, var(--border-subtle) 90%, transparent)`)

#### 3.2 Calendar Card Border Radius

Reduce calendar card rounding from 10px to 6px:
- Scheduled task cards: `rounded-[6px]` instead of `rounded-[10px]`
- Event cards: `rounded-md` (already 6px) — correct
- Anytime pills: keep `rounded-full`

Small cards with large rounding look "bubbly" rather than "professional".

#### 3.3 Task Row Padding (Desktop)

Add slightly more vertical breathing room on desktop:
```tsx
className="... py-1.5 sm:py-2 ..."
```

And more horizontal padding on the task list container:
```tsx
<div className="p-2 sm:p-4 space-y-2">
```

#### 3.4 Task Panel Header Background

Add a subtle background to differentiate the header area:
```tsx
<div className="... bg-muted/30 ...">
```

This matches the legacy's panel header treatment where controls sit on a slightly darker background.

### Tier 4: Low Impact, Polish

#### 4.1 Completion Micro-Animation
Add a subtle scale pulse on checkbox completion:
```css
@keyframes completion-pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); }
}
```

#### 4.2 Domain Group Left Accent
Consider adding a subtle 2px left border in brand purple to domain group cards (like the legacy had). This reinforces the brand's "left rail = visual hierarchy" pattern.

#### 4.3 Strikethrough Animation on Complete
Legacy had a clip-path animation for the strikethrough appearing across the task title. A CSS-only enhancement.

#### 4.4 Hour Grid Banding
Legacy alternated background on every 2nd hour row with `rgba(15, 23, 42, 0.015)`. This subtle banding aids readability.

#### 4.5 Calendar Day Dimming
Legacy dimmed past days (`opacity: 0.7`) and future days (`opacity: 0.85`), keeping today at full opacity with a subtle purple tint. Consider replicating.

---

## Implementation Priorities

### Phase 1: Foundation (1 PR)
> Highest ROI — makes the entire app feel branded vs. generic

1. **Canvas background** → `#F8FAFC` (globals.css, 1 line)
2. **Focus ring** → purple (globals.css, 1 line)
3. **Interactive hover** → purple-tinted (globals.css + a few component classes)
4. **Now-line** → purple instead of red (day-column.tsx, 1 line)
5. **Impact rail rounding** → `4px 0 0 4px` (task-item.tsx, 1 line)
6. **Calendar event restyling** → outlined cards instead of solid blocks (calendar-event.tsx)

### Phase 2: CTA & Depth (1 PR)
> Makes the app feel premium

1. **Plan My Day button** → gradient + glow CTA variant
2. **Glass blur headers** → `backdrop-blur-md` on header + panel headers
3. **Shadow system** → add brand shadow tiers to CSS, apply to cards and controls
4. **Calendar card radius** → 6px instead of 10px

### Phase 3: Polish (1 PR)
> Finishing touches

1. **Desktop spacing** → more padding on task list and panel headers
2. **Calendar panel card treatment** → visible boundary with the task panel
3. **Panel header backgrounds** → subtle `bg-muted/30`
4. **Completion animation** → scale pulse on checkbox
5. **Hour grid banding** → alternating row tints

---

## Appendix: Color Token Mapping

For reference, the exact CSS variable mapping from brand spec → React globals.css:

| Brand Token | Brand Value | React Variable | Current React Value | Action |
|-------------|------------|----------------|--------------------|----|
| `--bg-canvas` | `#F8FAFC` | `--background` | `#FFFFFF` | Change |
| `--bg-panel` | `#F1F5F9` | `--muted` | zinc equivalent | Consider |
| `--bg-surface` | `#FFFFFF` | `--card` | `#FFFFFF` | Keep |
| `--text-primary` | `#0B1220` | `--foreground` | near-black | Keep |
| `--border-subtle` | `rgba(15,23,42,0.055)` | — | — | Add |
| `--border-default` | `rgba(15,23,42,0.085)` | `--border` | oklch zinc | Consider |
| `--primary` | `#6D5EF6` | — | near-black (shadcn) | Keep shadcn primary for buttons; add `--brand` for CTA usage |
| `--now` | `#6D5EF6` | — | red-500 | Change |
| `--focus-ring` | `rgba(109,94,246,0.22)` | `--ring` | zinc | Change |
| `--interactive-hover` | `rgba(109,94,246,0.06)` | — | — | Add |
| `--row-hover` | `rgba(109,94,246,0.03)` | — | — | Add |
| `--shadow-card` | multi-layer soft | — | — | Add |
| `--shadow-cta` | purple glow | — | — | Add |
| `--glass-bg` | `rgba(255,255,255,0.85)` | — | — | Add |
| `--glass-blur` | `20px` | — | — | Add |

---

*This document is the starting point for implementation. Each Phase should be a separate PR following the project's versioned PR convention.*
