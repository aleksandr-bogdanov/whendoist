# Brand Cohesiveness Audit & Improvement Plan

> **Date:** 2026-01-22
> **Status:** Completed — fixes applied in BRAND.md v1.7
> **Archived from:** BRAND.md Phase 2 Cohesiveness Audit section

This document was part of the Phase 2→3 brand system improvement cycle. The issues identified here have been addressed in the main BRAND.md specification.

---

## Executive Summary

Phase 2 delivers substantial brand assets (icons, illustrations, colors, UI components), but documentation fragmentation and principle violations undermine cohesion. The most critical issues are:

1. **Green color usage contradicts brand principle** — UI-KIT uses green despite "purple for success" rule
2. **Gradients and glass effects are undocumented** — Wizard components use variables that don't exist in any spec
3. **Color system is fragmented** — Different files define different parts of the palette
4. **Tinted icons vs. illustrations boundary is unclear** — No guidance on when to use which

---

## Critical Issues (Must Fix)

### Issue 1: Green Color Contradiction

**Severity:** Critical — Directly violates stated brand principle

**Brand Principle (BRAND.md line 58-60):**
> "Purple for success states — Success/connected/check states use purple, not green. Green reserved for third-party brand icons only."

**Violations Found in UI-KIT.md:**
```css
/* .btn-complete uses green */
.btn-complete {
    background: rgba(16, 185, 129, 0.08);  /* Green */
    color: #059669;                         /* Green */
}

/* Password strength meter uses green */
.wizard-strength-fill.good { background: #10B981; }
.wizard-strength-fill.strong { background: #059669; }

/* Status dot uses green */
.status-dot.connected { background: #16a34a; }
```

**Recommended Fix:**
1. Change `.btn-complete` to use purple tints
2. Keep password strength as-is (industry convention exception)
3. Document green exception: "Green permitted for password strength indicators (user expectation) and third-party brand icons"
4. Change `.status-dot.connected` to purple

---

### Issue 2: Undocumented Gradients and Glass Effects

**Severity:** Critical — Components reference non-existent variables

**UI-KIT.md references these undefined variables:**
```css
--gradient-primary          /* Not defined anywhere */
--gradient-primary-hover    /* Not defined anywhere */
--glass-bg                  /* Not defined anywhere */
--glass-bg-strong           /* Not defined anywhere */
--glass-border              /* Not defined anywhere */
--shadow-sm                 /* Not defined anywhere */
--shadow-card               /* Not defined anywhere */
--row-hover                 /* Not defined anywhere */
```

**Recommended Fix:**
Add "Gradients & Effects" section to COLOR-SYSTEM.md:
```css
/* Gradients */
--gradient-primary: linear-gradient(135deg, #6D5EF6 0%, #5B4CF0 100%);
--gradient-primary-hover: linear-gradient(135deg, #5B4CF0 0%, #4A3DE8 100%);

/* Glass Effects */
--glass-bg: rgba(255, 255, 255, 0.65);
--glass-bg-strong: rgba(255, 255, 255, 0.85);
--glass-border: rgba(15, 23, 42, 0.06);

/* Shadows */
--shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.06);
--shadow-card: 0 4px 12px rgba(15, 23, 42, 0.08);

/* Interaction */
--row-hover: rgba(15, 23, 42, 0.02);
```

---

### Issue 3: Color System Fragmentation

**Severity:** High — Information scattered across 3 files

**Current State:**
- **BRAND.md:** Clarity colors + tints (6 colors)
- **COLOR-SYSTEM.md:** Full palette including slate scale, semantic colors, dark mode
- **UI-KIT.md:** Uses legacy token names (`--dark-bg`, `--grey-bg`, etc.)

**Problems:**
1. Semantic colors (Orange #F97316, Red #DC2626) only appear in Phase 2E/2F docs, not in core color section
2. Impact colors (P1-P4) documented only in COLOR-SYSTEM.md
3. UI-KIT uses different token names than COLOR-SYSTEM recommends
4. No single source of truth for all colors

**Recommended Fix:**
1. Update BRAND.md Color System section to include ALL colors
2. Add cross-reference: "See COLOR-SYSTEM.md for implementation details"
3. Migrate UI-KIT to use new token names (or document mapping clearly)

---

## High Priority Issues

### Issue 4: Tinted Icons vs Illustrations Boundary

**Severity:** High — Confusing guidance for implementers

**Current Documentation:**
- Tinted icons: "Use at 32px+"
- Illustrations: "64-120px recommended"

**Problem:** What about 32-63px? Both are options with no guidance.

**Recommended Fix:**
Add clear sizing guidance:
```
| Size Range | Asset Type | Example Use |
|------------|------------|-------------|
| 12-24px    | Base icons | Buttons, inline UI |
| 24-31px    | Colored icons | Status indicators |
| 32-48px    | Tinted icons | Toast feedback, small empty states |
| 64-120px   | Illustrations | Full empty states, modals, onboarding |
```

---

### Issue 5: Rounded Corner Inconsistency

**Severity:** High — No systematic scale

**Current State (observed radii):**
- 2px (checkbox details)
- 4px (icon buttons)
- 5px (segment buttons, day buttons)
- 6px (inputs, standard buttons, panels)
- 8px (dropdowns)
- 10px (wizard inputs, options)
- 12px (settings panels, modals)
- 14px (capture stack, wizard cards) — matches W icon pill cap ratio

**Problem:** No documented scale or rationale

**Recommended Fix:**
Define Border Radius Scale in BRAND.md:
```css
/* Border Radius Scale */
--radius-xs: 4px;   /* Icon buttons, small chips */
--radius-sm: 6px;   /* Inputs, standard buttons */
--radius-md: 8px;   /* Dropdowns, popovers */
--radius-lg: 12px;  /* Panels, modals */
--radius-xl: 14px;  /* Wizard cards, hero elements */

/* Rationale: xl (14px) matches W icon pill cap (28px width × 50%) */
```

---

### Issue 6: Dark Mode Gaps

**Severity:** High — Incomplete implementation guidance

**Current State:**
- COLOR-SYSTEM.md has dark mode tokens for colors
- UI-KIT has no dark mode considerations
- Illustrations use hardcoded light-mode tint colors
- Tinted icons use hardcoded light-mode backgrounds

**Problems:**
1. Illustration tint backgrounds (#EFEEFF, #EAF2FF, etc.) will clash with dark canvas
2. UI-KIT patterns don't adapt to dark mode

**Recommended Fix:**
1. Add dark mode variants for illustration tints
2. Update illustration SVGs to use CSS variables or provide dark variants
3. Add dark mode section to UI-KIT.md

---

## Medium Priority Issues

### Issue 7: Icon Count Discrepancy

**Documented:** "90+ icons"
**Actual count from icon-reference.html:** 106 icons

**Fix:** Update to "100+ icons" or give exact count

---

### Issue 8: ViewBox Rationale Missing

**Current ViewBoxes:**
- W icon: 38 40 180 160 (custom crop)
- UI icons: 0 0 24 24 (standard)
- Illustrations: 0 0 120 120 (5× UI icons)

**Problem:** No documented rationale for the 120×120 choice

**Fix:** Add to Icon Principles section documentation

---

### Issue 9: Third-Party Brand Icon Gaps

**Current:** Only Google documented
**Missing:** Apple (passkeys), Todoist (import feature)

---

### Issue 10: Stroke Width Relationship Unclear

**Current:**
- UI icons: 2px stroke
- Illustrations: 2-3px outlines, 1.5px details

**Problem:** No mathematical relationship or scaling guidance

---

## Low Priority Issues

### Issue 11: Naming Convention Inconsistencies

**Examples:**
- `success-allclear` (no hyphen between words)
- `success-complete` (consistent)
- `empty-tasks` vs `import-data` (verb vs noun)

---

### Issue 12: Marketing Assets Lack Visual Spec

**Problem:** Email headers mention "gradient" but no visual spec exists

---

### Issue 13: Animation/Motion Still "To Be Developed"

**Problem:** Phase 2F has animated spinners but no motion spec

---

## Implementation Priority Order

| Phase | Items | Effort | Impact |
|-------|-------|--------|--------|
| **3A** | Fix green contradiction, document gradients/glass | Low | Critical |
| **3B** | Consolidate color system, add dark mode guidance | Medium | High |
| **3C** | Define border radius scale, icon/illustration boundary | Low | Medium |
| **3D** | Update icon count, add missing brand icons | Low | Low |
| **3E** | Naming conventions, motion spec | Low | Low |

---

## Verification Checklist

After implementing fixes, verify:

- [x] All CSS variables referenced in UI-KIT.md are defined in COLOR-SYSTEM.md
- [x] No green used for success states (except password strength)
- [x] Border radius values use defined scale variables
- [x] Dark mode tokens cover all tint backgrounds
- [x] Icon count in docs matches actual count (107 icons)
- [x] Illustrations have dark mode consideration documented

**Last verified:** Phase 3 implementation complete (January 2026)

---

## Files That Were Updated

| File | Changes Applied |
|------|----------------|
| `BRAND.md` | Added semantic colors, border radius scale, updated icon count |
| `COLOR-SYSTEM.md` | Added gradients, glass effects, shadows, row hover |
| `UI-KIT.md` | Fixed green → purple, added dark mode section, migrated tokens |
| `static/img/icons/README.md` | Updated icon count |

---

*Archived January 2026 as part of documentation restructuring.*
