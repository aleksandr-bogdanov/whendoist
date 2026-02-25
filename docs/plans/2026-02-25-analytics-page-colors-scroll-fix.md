---
version: v0.55.15
pr:
created: 2026-02-25
---

# Fix Analytics Page: Colors and Scroll

## Context

The new React SPA analytics page has three issues compared to the legacy version:
1. **Charts render as BLACK** instead of brand purple — because `--primary` in light mode is near-black (shadcn zinc theme), and all charts use `hsl(var(--primary))`
2. **Page doesn't scroll** — Radix `<ScrollArea>` doesn't work reliably in the flex layout
3. **Colors don't follow brand guide** — recurring rate colors use green (brand says success = purple)

The fix uses the existing `--color-brand: #6d5ef6` CSS variable (already defined in globals.css `@theme` block) for all chart/accent colors, and replaces ScrollArea with native overflow scroll.

## Changes

### 1. Fix scroll — `analytics.lazy.tsx`

Replace `<ScrollArea className="flex-1">` with `<div className="flex-1 min-h-0 overflow-y-auto">`. Remove ScrollArea import.

### 2. Fix chart colors — 6 component files

Replace `hsl(var(--primary))` → `var(--color-brand)` in Recharts props, and `bg-primary` → `bg-brand` in Tailwind classes:

| File | What changes |
|------|-------------|
| `daily-chart.tsx` | Bar `fill` |
| `day-of-week-chart.tsx` | Bar `fill` |
| `velocity-chart.tsx` | 7-day avg line `stroke` |
| `domain-breakdown.tsx` | First entry in COLORS array |
| `heatmap.tsx` | `bg-primary/*` → `bg-brand/*` (intensity levels + legend, 8 replacements) |
| `stat-card.tsx` | Icon `bg-primary/10` → `bg-brand/10`, `text-primary` → `text-brand` |

### 3. Fix recurring rate colors — `recurring-list.tsx`

- `text-green-500` → `text-brand` (success = purple per brand guide)
- `text-yellow-500` → `text-amber-500`
- `text-red-500` → `text-destructive`

### Not changed

- **Impact chart** — colors come from API, already correct
- **AgingStats bar** — green/blue/yellow/red represent time ranges, not success states
- **Trend indicators** — green/red for up/down are universal directional colors
- **`--primary` CSS variable** — NOT changed (would break buttons/controls globally)

## Files

- `frontend/src/routes/_authenticated/analytics.lazy.tsx`
- `frontend/src/components/analytics/daily-chart.tsx`
- `frontend/src/components/analytics/day-of-week-chart.tsx`
- `frontend/src/components/analytics/velocity-chart.tsx`
- `frontend/src/components/analytics/domain-breakdown.tsx`
- `frontend/src/components/analytics/heatmap.tsx`
- `frontend/src/components/analytics/stat-card.tsx`
- `frontend/src/components/analytics/recurring-list.tsx`

## Verification

```bash
cd frontend && npx tsc -p tsconfig.app.json --noEmit && npx biome check . && npm run build
```

Visual checks:
- Page scrolls on both mobile and desktop
- Bar charts show purple bars instead of black
- Heatmap uses purple gradient
- Stat card icons are purple-tinted
- Domain pie starts with purple
- Velocity trend line is purple
- Recurring rates: purple ≥80%, amber ≥50%, red <50%
