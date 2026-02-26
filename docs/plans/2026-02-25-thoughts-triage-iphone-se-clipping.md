---
version:
pr: 523
created: 2026-02-25
---

# Fix: Thoughts Triage Panel Clipping on iPhone SE

## Context

On iPhone SE (375px), the expanded triage panel clips content at the right edge:
- Domain chip "Side Project" is cut off
- Priority label "P4 Min" shows as "P4 Mi..."
- "Convert" button is partially hidden

Root cause: Two `overflow-hidden` declarations (card wrapper line 309, triage panel line 548) that clip content extending near the container edge. The original redesign plan explicitly stated "No `overflow: hidden` (PWA viewport rule)" but it was added during implementation.

Secondary cause: Domain chip buttons lack `shrink-0`, so flex shrinks them instead of wrapping, causing text to overflow button boundaries and get clipped.

## Changes

**Single file:** `frontend/src/routes/_authenticated/thoughts.lazy.tsx`

### 1. Remove `overflow-hidden` from card wrapper (line 309)

```
Before: className="border-b border-border/50 overflow-hidden"
After:  className="border-b border-border/50"
```

The wrapper contains only block-flow children (ThoughtCard + TriagePanel). No overflow clipping needed.

### 2. Remove `overflow-hidden` from triage panel (line 548)

```
Before: className="border-t border-border/30 px-4 pb-4 pt-3 space-y-2.5 bg-accent/10 overflow-hidden"
After:  className="border-t border-border/30 px-4 pb-4 pt-3 space-y-2.5 bg-accent/10"
```

Also benefits the SmartInputAutocomplete dropdown which needs to overflow the panel boundary.

### 3. Add `shrink-0` to domain chip buttons (line 591)

```
Before: "rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors"
After:  "rounded-full shrink-0 px-3.5 py-2 text-[13px] font-medium transition-colors"
```

Prevents flex from shrinking chips — forces proper `flex-wrap` behavior. With 5 domains, row 1 gets 3 chips (~263px), row 2 gets 2 chips (~184px), both fitting within the 343px content area.

### 4. Tighten mobile selector spacing (line 582)

```
Before: className="space-y-3 md:hidden"
After:  className="space-y-2.5 md:hidden"
```

Matches the panel's own `space-y-2.5` rhythm. Saves ~6px total across sections.

## What NOT to change

- Priority button `py-2.5` padding — 40px touch targets meet iOS HIG minimum
- Domain chips horizontal scroll — wrapping is more discoverable
- No other files affected

## Verification

```bash
cd frontend && npx tsc -p tsconfig.app.json --noEmit && npx biome check . && npm run build
```

Manual test at 375px (iPhone SE in Chrome DevTools):
1. Expand a thought with 5+ domains
2. Verify domain chips wrap correctly without clipping
3. Verify all 4 priority labels fully visible
4. Verify "Convert" button fully visible
5. Verify desktop shows no regression (mobile selectors are `md:hidden`)
