---
version:
pr:
created: 2026-02-28
---

# Thoughts Page — Mobile Visual Polish

## Context

The Thoughts page has font sizes and spacing that create a flat visual hierarchy on mobile. The user's actual thought text (14px) is barely larger than action button text (13px), touch targets are at the minimum threshold, and decorative elements (dot indicator, chevron) waste horizontal space on narrow screens. This plan addresses all 10 items from the mobile audit.

## Changes

### File 1: `frontend/src/routes/_authenticated/thoughts.lazy.tsx`

#### ThoughtsPage component

1. **Page title: `text-lg font-semibold` → `text-xl font-bold`** (line 253)
   - Creates a proper screen-level heading to match the glassmorphic native-app aesthetic

2. **Empty state illustration: add `h-28 w-28`** (line 268)
   - Override the default 80px to 112px via `illustrationClassName` (twMerge handles it)
   - Also pass `className="py-16"` to the EmptyState for better vertical centering on mobile

3. **Bottom fade: `h-96` → `h-48`** (line 322)
   - 384px gradient covers too much of the list; 192px is enough to smooth the transition

#### ThoughtCard component

4. **Row padding: `py-3` → `py-3.5`** (line 350)
   - With text-base (~24px line height), total row = ~52px — comfortably above 44pt minimum

5. **Title text: `text-sm` → `text-base`** (line 362)
   - Primary content should be the largest text in the card

6. **Remove dot indicator on mobile** (line 359)
   - Add `hidden md:block` — recovers ~18px of horizontal space on 375px screens

7. **Hide chevron on mobile** (line 370)
   - Add `hidden md:flex` — tap and swipe gestures make it redundant

8. **Timestamp color: `text-muted-foreground` → `text-muted-foreground/70`** (line 365)
   - Slightly more transparent to clearly rank below thought title

### File 2: `frontend/src/components/task/thought-triage-drawer.tsx`

#### DrawerBody labels (5 rows)

9. **All row labels: `text-[11px]` → `text-xs`** (lines 238, 268, 307, 324, 337, 372)
   - 12px is the floor for readable UI labels

10. **Flex-based rows: `w-[50px]` → `w-14`** (lines 268, 307, 324, 337, 372)
    - 56px gives breathing room for "Duration" label at 12px
    - Domain row keeps `pl-[58px]` absolute pattern (functional for horizontal scroll bleed) — bump to `pl-16` (64px) to match

#### Textarea editability signal

11. **Add bottom border to title textarea** (line 227)
    - Add `border-b border-border/40 focus:border-primary transition-colors`

## Files Modified

- `frontend/src/routes/_authenticated/thoughts.lazy.tsx` (ThoughtsPage + ThoughtCard)
- `frontend/src/components/task/thought-triage-drawer.tsx` (DrawerBody labels + textarea)

**NOT modified:** `frontend/src/components/ui/empty-state.tsx` — size override via props, no shared component change.

## Verification

1. `cd frontend && npx tsc -p tsconfig.app.json --noEmit` — type check
2. `cd frontend && npx biome check .` — lint
3. `cd frontend && npm run build` — production build
4. Visual check: open on mobile viewport (375×812) in browser DevTools
   - Thought cards should be ~52px tall with 16px text
   - No dot or chevron visible on mobile
   - Triage drawer labels should be 12px in 56px-wide column
   - Empty state illustration should be 112×112px
   - Bottom fade should be ~192px, not covering the last thought
