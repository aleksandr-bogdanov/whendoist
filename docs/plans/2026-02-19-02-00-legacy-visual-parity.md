---
version: v0.50.0
pr: 354
created: 2026-02-19
---

# Legacy Visual Parity — React Frontend Restyling

## Context

The React SPA has feature parity with the legacy Jinja2 frontend, but the visual design diverged significantly during the migration. The legacy app had a clean, minimal, information-dense design that the user strongly prefers. This plan restyles the React frontend to match the legacy visual language — same features, legacy aesthetics.

**Key design decisions (user-confirmed):**
- Top horizontal tabs (no sidebar)
- Text priority labels (High/Mid/Low) instead of colored P1-P4 badges
- Grid-aligned task columns (clarity, duration, impact) matching sort header
- 2px impact rail (left border colored by priority) on all task rows
- Nunito body font (Quicksand for branding)
- Legacy W icon logo (three colored bars from BRAND.md)
- Single mega-PR (all changes at once)
- No plan-your-day banner (current approach is fine)

## Changes Overview

This is a **visual-only** refactor — no new features, no API changes, no state management changes. All existing functionality (drag-drop, encryption, keyboard shortcuts, mobile gestures, etc.) is preserved.

### 1. Typography — Add Nunito Font

**Files:** `frontend/index.html`, `frontend/src/app.css` (or Tailwind config)

- Add Google Fonts link for Nunito (400, 500, 600, 700)
- Add Quicksand for branding (already specified in BRAND.md)
- Set Nunito as default body font in Tailwind config or global CSS
- Keep Quicksand for logo/wordmark only

### 2. Layout — Remove Sidebar, Add Top Tabs

**Files:**
- `frontend/src/components/layout/app-shell.tsx` — remove Sidebar, restructure to top-tabs layout
- `frontend/src/components/layout/header.tsx` — **major rewrite**: replace current header with legacy-style header containing logo + navigation tabs + user actions
- `frontend/src/components/layout/sidebar.tsx` — **delete or gut**: sidebar is removed; domain filtering moves to task panel or is handled by domain groups inline
- `frontend/src/components/layout/mobile-nav.tsx` — update to match new navigation structure

**New header structure (legacy style):**
```
┌──────────────────────────────────────────────────────────┐
│  [W icon]    THOUGHTS  TASKS  ANALYTICS  SETTINGS    [→] │
└──────────────────────────────────────────────────────────┘
```
- W icon: SVG from BRAND.md (3 colored bars), "small" size (17×15px)
- Tabs: uppercase text, 0.75rem, 600 weight, letter-spacing 0.06em
- Active tab: border-bottom accent or bold weight
- Right side: logout arrow icon
- Bottom edge: 2px gradient bar (blue → purple → magenta) at 0.35 opacity

**Domain filtering without sidebar:**
- Remove `selectedDomainId` filtering from sidebar (domains are still shown as groups in the task list)
- Keep the sidebar domain-click-to-filter feature? → No, remove it. Users navigate domains by scrolling the grouped task list.

### 3. Energy Selector — Legacy Style

**File:** `frontend/src/components/dashboard/energy-selector.tsx`

**Current:** Text pills (Zombie/Normal/Focus) with battery icons, colored sliding indicator
**Target:** Emoji pills (🧟/☕/🧠) with "ENERGY" label and clarity dots below

- Replace battery icons with emojis
- Add "ENERGY" text label to the left
- Replace sliding colored background with per-pill active state (tinted background + box-shadow)
- Add 3 clarity dots below (6px circles: blue, purple, magenta; active = full opacity, inactive = 0.12)
- Container: rounded border, bg-panel
- Each pill: 26×20px, border-radius 4px

### 4. Sort Controls — Legacy Style

**File:** `frontend/src/components/dashboard/sort-controls.tsx`

**Current:** shadcn Button components with "Sort:" label
**Target:** Uppercase text buttons matching legacy

- Remove shadcn Button wrappers
- Use plain text buttons: `0.6875rem (11px)`, 600 weight, uppercase, letter-spacing 0.06em
- Inactive: muted gray (`rgba(15, 23, 42, 0.38)`)
- Active: dark text + sort arrow icon (↑/↓)
- Hover: text-primary color
- Add settings gear button (⚙) on the right side of the sort row

### 5. Filter Bar — Integrate into Sort Row

**File:** `frontend/src/components/dashboard/filter-bar.tsx`

The legacy app integrates Scheduled/Completed toggles into the settings panel, not as separate buttons. However, keeping them visible is fine for usability — just restyle:
- Smaller, more subtle toggle buttons
- Match the uppercase text style of sort controls

### 6. Task Panel Header — Two-Row Layout

**File:** `frontend/src/components/dashboard/task-panel.tsx`

Restructure the panel header to match legacy:
```
Row 1: [Energy selector]  [+ Quick]  [+ New Task]  [⚙]
Row 2: [CLARITY ↑]  [DURATION]  [IMPACT]  ... grid-aligned with task columns
```
- Row 2 uses CSS Grid matching task item columns
- Grid template: `1fr var(--col-clarity) var(--col-duration) var(--col-impact) var(--col-actions)`
- Add spectrum bar (2px gradient: blue → purple → magenta) as `::after` pseudo-element

### 7. Task Items — Grid Layout with Impact Rail

**File:** `frontend/src/components/task/task-item.tsx`

**Current:** Flex row with inline badges
**Target:** CSS Grid with aligned columns + impact rail

Grid columns: `1fr var(--col-clarity) var(--col-duration) var(--col-impact) var(--col-actions)`

CSS custom properties (define in global CSS or task-panel):
```css
--col-clarity: 60px;
--col-duration: 50px;
--col-impact: 40px;
--col-actions: 36px;
--col-gap: 8px;
--rail-w: 4px;  /* 2px rail + 2px gap */
```

**Impact Rail:** `::before` pseudo-element
- Position: absolute, left 0, top 0, bottom 0
- Width: 2px
- Color: `var(--impact-high)` / `--impact-medium` / `--impact-low` / `--impact-min`
- Border-radius: 0 2px 2px 0

**Priority display change:**
- Remove colored badge component
- Replace with text: "High" / "Mid" / "Low" / "Min"
- Color: use impact colors from BRAND.md (`#C9505A`, `#B8860B`, `#1A9160`, `#6B7385`)
- Font: 0.65rem, 600 weight

**Clarity display:**
- Text: "Autopilot" / "Brainstorm" (hide "Normal")
- Color: use clarity colors from BRAND.md
- Font: 0.65rem, 600 weight, pill shape

**Duration display:**
- Text: "1h 30m" / "45m" / "—"
- Font: 0.65rem, 500 weight, tabular-nums
- Color: muted gray

**Checkbox:**
- Change from circle to rounded square (border-radius: 8px instead of full)
- Size: 16×16px visible, 36px hit area
- Completed: purple checkmark (per brand: purple for success)

**Row dividers:**
- `::after` pseudo-element: 1px line, `var(--border-subtle)`, inset from left by rail width

**Subtask display:**
- Keep current expand/collapse behavior
- Subtask badge: small pill with count
- Indentation via left margin (not padding)

### 8. Domain Groups — Card Style

**File:** `frontend/src/components/task/domain-group.tsx`

**Current:** shadcn Collapsible with left border accent
**Target:** Card-like `<details>` styling matching legacy

- Container: `border: 1px var(--border-default)`, `border-radius: 10px`, `bg-surface`
- Header: flex row, `bg-panel`, padding `6px 12px 6px 24px`
  - Disclosure triangle (rotatable CSS arrow)
  - Domain emoji + name (0.95rem, 700 weight)
  - Task count pill
  - "+" add button (hover-reveal)
- Tasks inside: no extra border, dividers via `::after`
- Collapsed: only header visible
- Keep Collapsible component but restyle to match

### 9. Calendar Panel — Add Floating Controls

**File:** `frontend/src/components/calendar/calendar-panel.tsx`

Add legacy-style floating toolbar at bottom:
```
[Today]  [−] [+]
```
- Position: absolute, bottom 1rem, centered
- "Today" button: pill-shaped, white bg, border, shadow
- Zoom controls: pill container with +/− buttons
- Hover on Today: purple bg, white text

Also ensure:
- Day header matches legacy: "WEDNESDAY, FEB 18" + nav arrows + "✨ PLAN MY DAY" button
- Anytime section at top of calendar day
- Calendar event styling matches legacy (colored left border, time + title)

### 10. Calendar Task Cards — Impact Rail + Styling

**Files:**
- `frontend/src/components/calendar/scheduled-task-card.tsx`
- `frontend/src/components/calendar/calendar-event.tsx`

- Add 2px left impact rail to scheduled task cards
- Match border-radius: 10px
- White background, subtle border
- Completion checkbox: float right, rounded square
- Time display: top-left, muted

### 11. Logo — Legacy W Icon

**File:** `frontend/src/components/layout/header.tsx`

Replace current "W Whendoist" text logo with the W icon SVG from BRAND.md:
```svg
<svg viewBox="38 40 180 160" width="17" height="15">
  <rect x="48" y="40" width="28" height="160" rx="14" fill="#167BFF" transform="rotate(-8 62 120)"/>
  <rect x="114" y="72" width="28" height="127.3" rx="14" fill="#6D5EF6"/>
  <rect x="180" y="40" width="28" height="160" rx="14" fill="#A020C0" transform="rotate(8 194 120)"/>
</svg>
```
Use "small" size from brand spec: 17×15px icon.
No "hendoist" text in navigation — icon only.

### 12. Color Tokens — Align with Brand Spec

**File:** `frontend/src/app.css` or global CSS

Add CSS custom properties matching the brand color system:
```css
:root {
  /* Impact colors */
  --impact-high: #C9505A;
  --impact-medium: #B8860B;
  --impact-low: #1A9160;
  --impact-min: #6B7385;

  /* Clarity colors */
  --autopilot-color: #167BFF;
  --normal-color: #6D5EF6;
  --brainstorm-color: #A020C0;

  /* Clarity tints */
  --autopilot-tint: #EAF2FF;
  --normal-tint: #EFEEFF;
  --brainstorm-tint: #F3ECFA;

  /* Grid columns */
  --col-clarity: 60px;
  --col-duration: 50px;
  --col-impact: 40px;
  --col-actions: 36px;
  --col-gap: 8px;
  --rail-w: 4px;
}
```

### 13. Dark Mode — Preserve Compatibility

All changes must work with dark mode. Use semantic tokens (`var(--text-primary)`, etc.) instead of hardcoded colors. Impact/clarity colors stay the same in dark mode (they're semantic).

### 14. Mobile — Adapt for Smaller Screens

- Top tabs become scrollable or use a hamburger on very small screens
- Task grid columns collapse to flex on mobile (hide clarity/duration columns, keep title + impact)
- Impact rail stays visible on mobile
- Energy selector shows emoji-only (no labels) on mobile
- Bottom nav: keep existing mobile nav but update to match new style

## Files to Modify

| File | Change Type |
|------|-------------|
| `frontend/index.html` | Add Nunito + Quicksand fonts |
| `frontend/src/app.css` | Add color tokens, font family, grid variables |
| `frontend/src/components/layout/app-shell.tsx` | Remove Sidebar, restructure |
| `frontend/src/components/layout/header.tsx` | Major rewrite: top tabs + W icon |
| `frontend/src/components/layout/sidebar.tsx` | Delete or empty |
| `frontend/src/components/layout/mobile-nav.tsx` | Update navigation |
| `frontend/src/components/dashboard/task-panel.tsx` | Two-row header, grid layout |
| `frontend/src/components/dashboard/energy-selector.tsx` | Emoji pills + ENERGY label |
| `frontend/src/components/dashboard/sort-controls.tsx` | Uppercase text buttons |
| `frontend/src/components/dashboard/filter-bar.tsx` | Restyle to match |
| `frontend/src/components/task/task-item.tsx` | CSS Grid + impact rail + text priority |
| `frontend/src/components/task/domain-group.tsx` | Card style with details/summary |
| `frontend/src/components/task/task-list.tsx` | Minor adjustments for grid |
| `frontend/src/components/calendar/calendar-panel.tsx` | Floating controls |
| `frontend/src/components/calendar/scheduled-task-card.tsx` | Impact rail |
| `frontend/src/components/calendar/calendar-event.tsx` | Legacy event styling |
| `frontend/src/stores/ui-store.ts` | Remove `selectedDomainId` if sidebar removed |
| `frontend/tailwind.config.ts` or CSS | Nunito font family |

## Files to Delete

| File | Reason |
|------|--------|
| `frontend/src/components/layout/sidebar.tsx` | Sidebar removed (top tabs replace it) |

## Verification

1. `cd frontend && npx tsc --noEmit` — no TypeScript errors
2. `cd frontend && npx biome check .` — no lint errors
3. `cd frontend && npm run build` — production build succeeds
4. Visual check: compare React dashboard with legacy screenshot side-by-side
5. Mobile check: verify responsive layout at 375px, 768px, 1024px
6. Dark mode check: toggle theme, verify all elements visible
7. Keyboard shortcuts: verify j/k navigation, q quick-add, ? help still work
8. Drag-drop: verify task DnD to calendar still works
9. Encryption: verify task titles still decrypt correctly (no UI regression)
10. `uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test` — backend unaffected
