---
version:
pr:
created: 2026-02-25
---

# Analytics Page Redesign

## Context

The Analytics page works but feels flat — no visual hierarchy, no section grouping, all 50/50 grids, missing chart types (`by_hour` data unused), no animations, and basic text-only displays where progress bars should be. This redesign brings it to production quality with hero stat card, section grouping, asymmetric grids, animated numbers, new charts, and visual progress bars — all purely frontend, no API changes needed.

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `components/analytics/active-hours-chart.tsx` | CREATE | Area chart with purple gradient for hour-of-day distribution |
| `components/analytics/resolution-chart.tsx` | CREATE | Donut chart for aging stats (replaces inline stacked bar) |
| `components/analytics/stat-card.tsx` | MODIFY | Add animated count-up using `motion` package |
| `components/analytics/recurring-list.tsx` | MODIFY | Add purple progress bars |
| `components/analytics/domain-breakdown.tsx` | MODIFY | Add center label showing total |
| `components/analytics/daily-chart.tsx` | MODIFY | Add `className` prop forwarding |
| `components/analytics/day-of-week-chart.tsx` | MODIFY | Add `className` prop forwarding |
| `components/analytics/heatmap.tsx` | MODIFY | Add `className` prop + mobile horizontal scroll |
| `components/analytics/impact-chart.tsx` | MODIFY | Add `className` prop forwarding |
| `components/analytics/velocity-chart.tsx` | MODIFY | Add `className` prop forwarding |
| `routes/_authenticated/analytics.lazy.tsx` | MODIFY | Major layout restructure (hero, sections, grids) |

All paths relative to `frontend/src/`. **2 new files, 9 modified files, 0 backend changes.**

## Phase 1: New Chart Components

### 1A: `active-hours-chart.tsx`
- Recharts `AreaChart` with `<defs>` gradient fill (purple, opacity 0.3→0.02)
- `by_hour: HourOfDayItem[]` data (24 items, 0-23 UTC) — exists in API, currently unused
- X-axis: format hours as "12am", "6am", "12pm" etc., show every 3rd-4th label
- Height: 200px, same tooltip/axis/grid styles as all other charts
- Empty state: "No hourly data yet" text inside Card

### 1B: `resolution-chart.tsx`
- Recharts `PieChart` donut replacing inline `AgingStats` stacked bar
- Same layout pattern as `domain-breakdown.tsx` (flex row: donut left, legend right)
- Colors per brief: Same day `#6D5EF6` (purple), Within week `#06B6D4` (cyan), Within month `#EAB308` (amber), Over month `#DC2626` (red)
- Center label: median days value (e.g. "3d")
- Below legend: avg/median stats (carried from current AgingStats)
- Props: `{ buckets, avgDays, medianDays }` — same interface as current AgingStats
- Returns `null` if total is 0

## Phase 2: Upgrade Existing Components

### 2A: `stat-card.tsx` — Animated count-up
- Use `animate` from `motion/react` (v12.34.1, already installed)
- Parse numeric part from value (handles `"85%"`, `"3d"`, plain numbers)
- Tween 0→target over ~600ms with easeOut
- Use `useRef` + `onUpdate` to set `textContent` directly (no re-renders)
- Respect `prefers-reduced-motion` — skip animation if true
- Keep all existing props/styling unchanged

### 2B: `recurring-list.tsx` — Progress bars
- Add `h-1.5` purple progress bar below subtitle for each task:
  ```
  <div className="h-1.5 w-full rounded-full bg-muted mt-1">
    <div className="h-full rounded-full bg-brand" style={{ width: `${task.rate}%` }} />
  </div>
  ```
- Keep existing layout structure and color-coded percentage text

### 2C: `domain-breakdown.tsx` — Center label
- Import `Label` from recharts
- Compute total: `data.reduce((sum, d) => sum + d.count, 0)`
- Add `<Label value={total} position="center" className="fill-foreground" style={{ fontSize: 20, fontWeight: 700 }} />` inside `<Pie>`

## Phase 3: Main Page Layout Restructure

### Header update
- Date range display below title: compute start/end from `days` state, format with `Intl.DateTimeFormat`
- Keep range selector buttons unchanged

### Hero stat card (replaces first stat card)
- Full-width gradient card: `linear-gradient(135deg, #6D5EF6 0%, #8B7CF7 50%, #A78BFA 100%)`
- White text, large number (text-5xl), animated count-up using `motion`
- Show pending count as subtitle
- Mini sparkline: tiny Recharts `LineChart` (no axes/grid) showing last 7 entries of `daily_completions`

### Supporting stat cards
- 3 cards below hero (Rate, Streak, This Week) in `grid-cols-2 sm:grid-cols-3`
- Remove Completed card (now in hero) and Pending (shown in hero subtitle)

### Section grouping
- Add `SectionLabel` inline component: `uppercase tracking-[0.14em] font-bold text-[0.62rem] text-muted-foreground`
- Three sections: OVERVIEW, PATTERNS, DETAILS

### Asymmetric grids
- Daily + Domain: `grid-cols-[1.4fr_1fr]` (main chart wider)
- DayOfWeek + ActiveHours: `grid-cols-2` (equal)
- Impact + Resolution: `grid-cols-2` (equal)
- Velocity + Recent: `grid-cols-[1.4fr_1fr]`
- Heatmap, Recurring: full width

### Delete inline `AgingStats` component
- Replaced by `ResolutionChart`

### Panel hover effects
- Define `const PANEL_HOVER = "transition-all duration-200 hover:-translate-y-0.5 hover:[box-shadow:var(--shadow-raised)]"`
- Pass to each chart component via `className` prop

## Phase 4: Polish

### Add `className` prop to all chart components
- Add `className?: string` to each component's props interface
- Forward to root `<Card className={className}>`
- Affects: daily-chart, day-of-week-chart, domain-breakdown, heatmap, impact-chart, velocity-chart, recurring-list + the 2 new components

### Heatmap mobile scroll
- Wrap grid in `<div className="overflow-x-auto sm:overflow-visible">` with `min-w-max` on inner grid

## Final Layout

```
HEADER: "Analytics" + date range + [7d][30d][90d]

OVERVIEW:
  ┌─── Hero Card (gradient, full width) ─────────────────┐
  │  26 TASKS COMPLETED  ~~sparkline~~  (12 pending)     │
  └──────────────────────────────────────────────────────┘
  ┌─── Rate ───┐ ┌── Streak ──┐ ┌── This Week ──┐
  │ 51.0%      │ │ 🔥 14d     │ │ 17 (+143%)    │
  └────────────┘ └────────────┘ └───────────────┘

PATTERNS:
  ┌── Daily Completions (1.4fr) ──┐┌── Domain (1fr) ────┐
  │  Bar chart                    ││  Donut + total      │
  └───────────────────────────────┘└────────────────────┘
  ┌── Best Days (1fr) ───────────┐┌── Active Hours (1fr)┐
  │  Horizontal bars             ││  Area gradient      │
  └──────────────────────────────┘└────────────────────┘
  ┌── Heatmap (full width, scrollable mobile) ──────────┐
  │  Purple gradient grid, 12 weeks                     │
  └─────────────────────────────────────────────────────┘
  ┌── Impact (1fr) ─────────────┐┌── Resolution (1fr) ─┐
  │  P1-P4 colored bars         ││  Donut chart        │
  └─────────────────────────────┘└─────────────────────┘

DETAILS:
  ┌── Velocity (1.4fr) ─────────┐┌── Recent (1fr) ────┐
  │  Line + 7d avg              ││  Scrollable list    │
  └─────────────────────────────┘└────────────────────┘
  ┌── Recurring Tasks (full width) ─────────────────────┐
  │  Task name  [████████░░] 2/3  67%                   │
  └─────────────────────────────────────────────────────┘
```

## Verification

```bash
cd frontend && npx tsc -p tsconfig.app.json --noEmit && npx biome check . && npm run build
```

Visual check at `http://localhost:5173/analytics`:
- Hero gradient card renders with animated number
- Section labels (OVERVIEW/PATTERNS/DETAILS) visible
- Asymmetric grids (1.4fr+1fr) visually wider left column
- Active Hours area chart renders 24-hour distribution
- Resolution donut replaces old stacked bar
- Recurring tasks show purple progress bars
- Domain donut has center total label
- Panels lift on hover
- Heatmap scrolls horizontally on mobile (Chrome DevTools)
- Date range shows next to range selector
