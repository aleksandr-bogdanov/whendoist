---
version: v0.55.57
pr: 550
created: 2026-02-28
---

# Desktop Inspector: De-touchify Field Pickers

## Context

The desktop inspector panel (`task-inspector.tsx`) reuses mobile-first field picker
components unchanged. All buttons use `px-2.5 py-2 rounded-lg active:scale-95` —
touch-sized chips with press-scale feedback that look phone-y on desktop. Reference
desktop apps (Linear, Todoist, Things 3) use tighter padding and hover states.

## Approach: Responsive shared components (Approach A)

Add `md:` responsive overrides to shared field pickers. Mobile stays untouched.
Desktop gets: smaller padding, `rounded-md`, hover instead of scale, wrapping instead
of scrolling for domains.

## Files to modify

1. **`frontend/src/components/task/field-pickers.tsx`** — shared DomainChipRow, ImpactButtonRow, ScheduleButtonRow
2. **`frontend/src/components/task/task-inspector.tsx`** — inline Duration/Clarity buttons, Domain wrapper, FieldRow label alignment, ParentPickerPopover trigger

**NOT modified:** `thought-triage-drawer.tsx` — mobile stays as-is. Its inline buttons
already have `active:scale-95`; the `md:` overrides on shared components won't apply
since the drawer is only rendered below `md:`.

## Changes

### 1. field-pickers.tsx

**DomainChipRow container (line 24):**
```
"flex gap-1.5 w-max" → "flex gap-1.5 w-max md:w-auto md:flex-wrap md:gap-1"
```
- `md:w-auto` allows wrapping (mobile keeps `w-max` for horizontal scroll)
- `md:flex-wrap` wraps chips to second line if needed
- `md:gap-1` tighter spacing

**DomainChipRow buttons (line 32):**
```
Add: "md:rounded-md md:px-2 md:py-1 md:active:scale-100"
```
- Inactive state: no hover change needed — `active:bg-secondary/80` already serves as
  hover on desktop (Tailwind `active:` fires on mousedown too)

**ImpactButtonRow container (line 58):**
```
"grid grid-cols-4 gap-1.5" → "grid grid-cols-4 gap-1.5 md:gap-1"
```

**ImpactButtonRow buttons (line 66):**
```
"rounded-lg py-2 text-[13px] font-medium transition-all active:scale-95"
→ add: "md:rounded-md md:py-1 md:active:scale-100 md:hover:brightness-110"
```
- `hover:brightness-110` works on top of inline `style={{ backgroundColor }}`

**ScheduleButtonRow container (line 107):**
```
"flex gap-1.5 items-center" → "flex gap-1.5 items-center md:gap-1"
```

**ScheduleButtonRow Today/Tomorrow buttons (lines 111, 123):**
```
"rounded-lg px-3 py-2 text-[13px] font-medium transition-colors active:scale-95"
→ add: "md:rounded-md md:px-2.5 md:py-1 md:active:scale-100"
```

**ScheduleButtonRow calendar button (line 135):**
```
"rounded-lg px-2 py-2 text-[13px] font-medium transition-colors active:scale-95"
→ add: "md:rounded-md md:py-1 md:active:scale-100 md:hover:bg-secondary/80"
```

**ScheduleButtonRow clear button (line 148):**
```
"rounded-lg px-2 py-2 text-[13px] text-muted-foreground active:text-foreground"
→ add: "md:py-1 md:hover:text-foreground"
```

### 2. task-inspector.tsx

**Domain wrapper (line 211):**
```
"rounded-lg transition-all duration-300 overflow-x-auto scrollbar-hide"
→ "rounded-lg transition-all duration-300"
```
Remove `overflow-x-auto scrollbar-hide` — chips now wrap via DomainChipRow's `md:flex-wrap`.

**FieldRow label (line 434):**
```
"text-xs text-muted-foreground shrink-0 w-16 pt-2"
→ "text-xs text-muted-foreground shrink-0 w-16 pt-2 md:pt-1"
```
Aligns label with shorter `md:py-1` buttons.

**Duration buttons (line 326):**
```
"rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors"
→ "rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors md:rounded-md md:px-2 md:py-1"
```

**Duration container (line 318):**
```
"flex gap-1.5" → "flex gap-1.5 md:gap-1"
```

**Clarity buttons (line 361):**
```
"rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all"
→ "rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all md:rounded-md md:px-2 md:py-1 md:hover:brightness-110"
```

**Clarity container (line 352):**
```
"flex gap-1.5" → "flex gap-1.5 md:gap-1"
```

**ParentPickerPopover trigger (line 509):**
```
"flex items-center justify-between w-full rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors"
→ add: "md:rounded-md md:px-2 md:py-1"
```

## Summary of changes per field

| Field | Structural? | Mobile change | Desktop change |
|-------|------------|---------------|----------------|
| Domain | Yes (wrap) | None | Chips wrap, shrink, no scale |
| Impact | No | None | Shrink, hover:brightness, no scale |
| When | No | None | Shrink, no scale |
| Duration | No | None | Shrink |
| Clarity | No | None | Shrink, hover:brightness |
| Parent | No | None | Shrink |

## Verification

```bash
cd frontend && npx tsc -p tsconfig.app.json --noEmit && npx biome check . && npm run build
```

Visual check:
1. Desktop inspector: all buttons should be ~26px tall instead of ~32px
2. Domain chips should wrap to second line if they overflow
3. Hover on Impact/Clarity should subtly brighten
4. No `active:scale-95` press feedback on desktop
5. Mobile drawer: unchanged — same chunky touch chips
