# Whendoist Design Implementation Plan

> Comprehensive roadmap for implementing the new brand system across all Whendoist pages.
> This document is designed for iterative development in Claude Code sessions.

**Created:** January 2026
**Status:** Planning Phase
**Brand Version:** 1.7 (Phase 2A-2F complete)
**Target App Version:** v1.0
**Related Docs:** BRAND.md, DESIGN.md (legacy), COLOR-SYSTEM.md, UI-KIT.md

---

## Important Context

### This Document vs. DESIGN.md

| Document | Purpose | Token System |
|----------|---------|--------------|
| **DESIGN.md** | Documents CURRENT implementation (legacy) | `--dark-bg`, `--grey-bg`, etc. |
| **This Plan** | Documents TARGET implementation (new) | `--bg-canvas`, `--bg-panel`, etc. |

During migration, both documents are valid references:
- Use DESIGN.md to understand existing behavior
- Use this plan to implement new patterns
- After v1.0, DESIGN.md will be deprecated and this plan becomes the canonical reference

### Reference Implementation: wizard.css

The `static/css/wizard.css` file (created in v0.9) already uses many of the new patterns:
- Glassmorphism effects (`backdrop-filter`)
- Modern button variants (`.wizard-btn-primary`, etc.)
- Mobile-first responsive design
- Touch-friendly sizing

Use wizard.css as a reference when implementing components.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [Implementation Strategy](#implementation-strategy)
4. [Phase 1: Foundation (CSS Token Migration)](#phase-1-foundation)
5. [Phase 2: Component System](#phase-2-component-system)
6. [Phase 3: Page Redesigns](#phase-3-page-redesigns)
7. [Phase 4: Dark Mode](#phase-4-dark-mode)
8. [Phase 5: Polish & Testing](#phase-5-polish--testing)
9. [Mobile-First Patterns](#mobile-first-patterns)
10. [JavaScript File Updates](#javascript-file-updates)
11. [Icon & Illustration Integration](#icon--illustration-integration)
12. [Pico CSS Considerations](#pico-css-considerations)
13. [Technical Specifications](#technical-specifications)
14. [Implementation Checklist](#implementation-checklist)
15. [Phase Completion Criteria](#phase-completion-criteria)
16. [Migration Rollback Plan](#migration-rollback-plan)
17. [Accessibility Requirements](#accessibility-requirements)
18. [Migration Commands](#migration-commands)
19. [CSS Import Order (CRITICAL)](#css-import-order-critical)
20. [Component Migration Priority](#component-migration-priority)
21. [CSS Error Boundaries](#css-error-boundaries)
22. [Visual Regression Testing Setup](#visual-regression-testing-setup)
23. [Animation Keyframes](#animation-keyframes-complete)
24. [Print Styles](#print-styles)
25. [Template Update Sequence](#template-update-sequence)
26. [CSS Bundling Strategy](#css-bundling-strategy)

---

## Executive Summary

### What Exists (Brand Assets - Complete)
The Whendoist brand system (v1.7) is fully documented with:
- **107 UI icons** in SVG sprite (`static/img/icons/ui-icons.svg`)
- **21 illustrations** for empty states, errors, success, onboarding
- **Complete color system** with light/dark mode tokens
- **UI Kit documentation** with button, form, card patterns
- **Interactive reference tools** in `docs/brand/`

### What Needs Implementation
The application CSS (`app.css`, `dashboard.css`, `dialog.css`) uses **legacy tokens** that don't match the new brand system. Four pages need systematic redesign:

| Page | Current State | Target State |
|------|---------------|--------------|
| **Tasks** | v0.5 design, legacy tokens | Modern glassmorphism, new tokens |
| **Thought Cabinet** | v0.6 design, inline CSS | Unified component system |
| **Analytics** | v0.7 design, mixed styles | ApexCharts + brand integration |
| **Settings** | v0.8 design, inline CSS | UI Kit components, dark mode ready |

### Key Migration: Token Names

| Legacy Token | New Token | Location |
|--------------|-----------|----------|
| `--dark-bg` | `--bg-canvas` | Canvas/page background |
| `--grey-bg` | `--bg-panel` | Panel backgrounds |
| `--light-bg` | `--bg-surface` | Card surfaces |
| `--elevated-bg` | `--bg-elevated` | Modals, popovers |
| `--text` | `--text-primary` | Primary text |
| `--text-muted` | `--text-secondary` | Secondary text |
| `--text-faint` | `--text-muted` | Tertiary text |
| `--border-hair` | `--border-subtle` | Inner dividers |
| `--border` | `--border-default` | Standard borders |

---

## Current State Analysis

### File Structure Assessment

```
static/css/
├── app.css           # 1,100+ lines, design tokens + global styles + header + toast
├── dashboard.css     # 1,800+ lines, Tasks page specific (task rows, calendar, drag-drop)
├── dialog.css        # 400+ lines, task edit modal
└── wizard.css        # 600+ lines, onboarding wizard (modern, already uses new patterns)

app/templates/
├── base.html         # Global layout, header, unlock modal
├── dashboard.html    # Tasks page (uses external CSS)
├── thoughts.html     # Thought Cabinet (INLINE CSS ~400 lines)
├── analytics.html    # Analytics page (INLINE CSS ~500 lines)
├── settings.html     # Settings page (INLINE CSS ~800 lines)
└── login.html        # Login page (INLINE CSS, modern design)
```

### Problems Identified

1. **Token Fragmentation**
   - `app.css` defines tokens in `:root` but uses a mix of old and new names
   - Templates with inline CSS duplicate token definitions
   - No single source of truth

2. **Inline CSS in Templates**
   - `thoughts.html`, `analytics.html`, `settings.html` have 400-800 lines of inline CSS
   - Duplicates patterns already in `app.css` and `dashboard.css`
   - Makes global style changes difficult

3. **Inconsistent Component Patterns**
   - Settings panels defined differently across templates
   - Button variants scattered and inconsistent
   - Form elements lack unified styling

4. **No Dark Mode**
   - All pages hardcode light mode colors
   - No `data-theme` attribute handling
   - Illustrations use hardcoded tint colors

5. **Missing Brand Assets in App**
   - UI icons exist but aren't integrated (still using emoji/inline SVG)
   - Illustrations exist but not used in empty states/errors
   - Wordmark component not used in header

---

## Implementation Strategy

### Guiding Principles

1. **Extract, don't duplicate** — Move inline CSS to external files
2. **Token first** — Use CSS variables for all values that might change
3. **Component mindset** — Create reusable patterns
4. **Progressive enhancement** — Dark mode as enhancement, not requirement
5. **Maintain functionality** — No regressions during redesign

### File Organization Target

```
static/css/
├── tokens.css        # NEW: All CSS custom properties (colors, spacing, shadows, etc.)
├── base.css          # NEW: Reset, body, html, typography primitives
├── components/       # NEW: Component-specific CSS
│   ├── buttons.css
│   ├── forms.css
│   ├── cards.css
│   ├── panels.css
│   └── ...
├── pages/            # NEW: Page-specific layouts
│   ├── tasks.css     # Refactored from dashboard.css
│   ├── thoughts.css  # Extracted from template
│   ├── analytics.css # Extracted from template
│   └── settings.css  # Extracted from template
├── app.css           # REFACTORED: imports + global utilities
└── dialog.css        # Keep (already external)
```

### Alternatively (Simpler)

Keep current structure but modernize in place:
1. **tokens.css** — New file with all design tokens
2. **app.css** — Global styles, import tokens
3. **dashboard.css** — Tasks page (rename to tasks.css?)
4. **dialog.css** — Keep as-is
5. **pages/*.css** — Extract from templates gradually

---

## Phase 1: Foundation

**Goal:** Establish CSS token system as single source of truth

### Step 1.1: Create tokens.css

Create `static/css/tokens.css` with complete design token set:

```css
/* =============================================================================
   Whendoist Design Tokens
   Brand System v1.7 - Single Source of Truth
   ============================================================================= */

:root {
    /* ===== Neutral Palette (Tailwind Slate) ===== */
    --slate-50: #F8FAFC;
    --slate-100: #F1F5F9;
    --slate-200: #E2E8F0;
    --slate-300: #CBD5E1;
    --slate-400: #94A3B8;
    --slate-500: #64748B;
    --slate-600: #475569;
    --slate-700: #334155;
    --slate-800: #1E293B;
    --slate-900: #0F172A;
    --slate-950: #020617;

    /* ===== Brand Colors (Clarity Spectrum) ===== */
    --blue-500: #167BFF;
    --blue-600: #0066E6;      /* Accessible variant */
    --blue-tint: #EAF2FF;

    --purple-400: #8B7CF7;     /* Dark mode primary */
    --purple-500: #6D5EF6;     /* Primary */
    --purple-600: #5B4CF0;     /* Hover */
    --purple-tint: #EFEEFF;

    --magenta-500: #A020C0;
    --magenta-tint: #F3ECFA;

    /* ===== Semantic Colors ===== */
    --red-500: #DC2626;
    --red-600: #C9505A;        /* Impact P1 */
    --amber-600: #B8860B;      /* Impact P2 / Warning */
    --green-600: #1A9160;      /* Impact P3 */
    --green-500: #16A34A;      /* Third-party only */
    --orange-500: #F97316;     /* Warning */

    /* ===== Theme Tokens (Light Mode Default) ===== */
    --bg-canvas: var(--slate-50);
    --bg-panel: var(--slate-100);
    --bg-surface: #FFFFFF;
    --bg-elevated: #FFFFFF;

    --text-primary: #0B1220;
    --text-secondary: rgba(15, 23, 42, 0.64);
    --text-muted: rgba(15, 23, 42, 0.46);
    --text-inverse: #FFFFFF;

    --border-subtle: rgba(15, 23, 42, 0.055);
    --border-default: rgba(15, 23, 42, 0.085);
    --border-strong: rgba(15, 23, 42, 0.12);

    --primary: var(--purple-500);
    --primary-hover: var(--purple-600);
    --primary-tint: #E9E7FF;

    /* ===== Interactive States ===== */
    --interactive-hover: rgba(109, 94, 246, 0.06);
    --interactive-active: rgba(109, 94, 246, 0.10);
    --focus-ring: rgba(109, 94, 246, 0.22);
    --row-hover: rgba(15, 23, 42, 0.02);

    /* ===== Gradients ===== */
    --gradient-primary: linear-gradient(135deg, #6D5EF6 0%, #8B7CF7 50%, #A78BFA 100%);
    --gradient-primary-hover: linear-gradient(135deg, #5B4CF0 0%, #7B6CF5 50%, #9B7BF8 100%);
    --gradient-bg-subtle: linear-gradient(180deg, #F8FAFC 0%, #F1F5F9 100%);

    /* ===== Glass Effects ===== */
    --glass-bg: rgba(255, 255, 255, 0.85);
    --glass-bg-strong: rgba(255, 255, 255, 0.92);
    --glass-border: rgba(255, 255, 255, 0.5);
    --glass-blur: 20px;

    /* ===== Shadows (3-Tier) ===== */
    --shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.05);
    --shadow-card: 0 2px 8px rgba(15, 23, 42, 0.04), 0 4px 24px rgba(15, 23, 42, 0.06);
    --shadow-raised: 0 4px 16px rgba(15, 23, 42, 0.06), 0 8px 40px rgba(15, 23, 42, 0.08);
    --shadow-elevated: 0 12px 48px rgba(15, 23, 42, 0.10), 0 4px 16px rgba(15, 23, 42, 0.06);
    --shadow-overlay: 0 10px 30px rgba(15, 23, 42, 0.10);
    --shadow-cta: 0 4px 20px rgba(109, 94, 246, 0.25), 0 8px 40px rgba(109, 94, 246, 0.15);
    --shadow-cta-hover: 0 6px 28px rgba(109, 94, 246, 0.30), 0 12px 48px rgba(109, 94, 246, 0.18);
    --shadow-glow: 0 0 40px rgba(109, 94, 246, 0.12);
    --shadow-glow-sm: 0 0 24px rgba(109, 94, 246, 0.10);

    /* ===== Border Radius Scale ===== */
    --radius-xs: 4px;
    --radius-sm: 6px;
    --radius-md: 8px;
    --radius-lg: 12px;
    --radius-xl: 14px;
    --radius-full: 9999px;

    /* ===== Spacing Scale ===== */
    --space-1: 4px;
    --space-2: 8px;
    --space-3: 12px;
    --space-4: 16px;
    --space-5: 20px;
    --space-6: 24px;
    --space-8: 32px;
    --space-10: 40px;
    --space-12: 48px;

    /* ===== Motion ===== */
    --duration-instant: 0.1s;
    --duration-fast: 0.15s;
    --duration-normal: 0.2s;
    --duration-slow: 0.3s;
    --ease-default: ease;
    --ease-out: ease-out;
    --ease-spring: cubic-bezier(0.4, 0, 0.2, 1);

    /* ===== Impact Colors ===== */
    --impact-p1: #C9505A;
    --impact-p1-border: #E8A0A6;
    --impact-p1-row: rgba(201, 80, 90, 0.030);
    --impact-p2: #B8860B;
    --impact-p2-border: #D4A84B;
    --impact-p2-row: rgba(184, 134, 11, 0.022);
    --impact-p3: #1A9160;
    --impact-p3-border: #5AB88A;
    --impact-p3-row: rgba(26, 145, 96, 0.030);
    --impact-p4: #6B7385;
    --impact-p4-border: #9CA3B0;
    --impact-p4-row: rgba(107, 115, 133, 0.018);

    /* ===== Clarity Colors ===== */
    --clarity-executable: var(--blue-500);
    --clarity-executable-tint: var(--blue-tint);
    --clarity-defined: var(--purple-500);
    --clarity-defined-tint: var(--purple-tint);
    --clarity-exploratory: var(--magenta-500);
    --clarity-exploratory-tint: var(--magenta-tint);

    /* ===== Layout ===== */
    --content-max-width: 1100px;
    --content-padding: 3rem;
    --layout-gap: 1.5rem;
    --header-height: 80px;

    /* ===== Task List Columns ===== */
    --col-duration: 68px;
    --col-impact: 56px;
    --col-clarity: 80px;
    --col-actions: 28px;
    --col-gap: 6px;
    --rail-width: 2px;

    /* ===== Z-Index Scale ===== */
    --z-base: 0;
    --z-dropdown: 100;
    --z-sticky: 200;
    --z-fixed: 300;
    --z-modal-backdrop: 400;
    --z-modal: 500;
    --z-popover: 600;
    --z-toast: 700;
    --z-tooltip: 800;
    --z-max: 9999;

    /* ===== Legacy Aliases (for migration) ===== */
    --dark-bg: var(--bg-canvas);
    --grey-bg: var(--bg-panel);
    --light-bg: var(--bg-surface);
    --elevated-bg: var(--bg-elevated);
    --text: var(--text-primary);
    --border-hair: var(--border-subtle);
    --border: var(--border-default);
}

/* ===== Dark Mode ===== */
[data-theme="dark"] {
    --bg-canvas: var(--slate-900);
    --bg-panel: var(--slate-800);
    --bg-surface: var(--slate-700);
    --bg-elevated: var(--slate-600);

    --text-primary: var(--slate-50);
    --text-secondary: rgba(248, 250, 252, 0.72);
    --text-muted: rgba(248, 250, 252, 0.48);
    --text-inverse: var(--slate-900);

    --border-subtle: rgba(248, 250, 252, 0.06);
    --border-default: rgba(248, 250, 252, 0.10);
    --border-strong: rgba(248, 250, 252, 0.16);

    --primary: var(--purple-400);
    --primary-hover: #9D8FF8;
    --primary-tint: rgba(109, 94, 246, 0.20);

    --interactive-hover: rgba(109, 94, 246, 0.12);
    --interactive-active: rgba(109, 94, 246, 0.18);
    --focus-ring: rgba(109, 94, 246, 0.32);

    --glass-bg: rgba(15, 23, 42, 0.75);
    --glass-bg-strong: rgba(15, 23, 42, 0.88);
    --glass-border: rgba(248, 250, 252, 0.08);

    --clarity-executable-tint: rgba(22, 123, 255, 0.15);
    --clarity-defined-tint: rgba(109, 94, 246, 0.15);
    --clarity-exploratory-tint: rgba(160, 32, 192, 0.15);

    /* Legacy aliases auto-update */
}

/* ===== Reduced Motion ===== */
@media (prefers-reduced-motion: reduce) {
    :root {
        --duration-instant: 0.01ms;
        --duration-fast: 0.01ms;
        --duration-normal: 0.01ms;
        --duration-slow: 0.01ms;
    }
}
```

### Step 1.2: Update app.css Import

Modify `app.css` to import tokens and remove duplicates:

```css
@import url('tokens.css');

/*
 * Whendoist - Global Styles
 * Design System: Brand v1.7
 *
 * NOTE: All design tokens are in tokens.css
 * This file contains global styles, header, nav, toast
 */

/* Remove the :root block - it's now in tokens.css */
/* Keep only component and layout styles */
```

### Step 1.3: Create Migration Script

Create `scripts/migrate-tokens.py` to find/replace legacy tokens:

```python
"""
Token Migration Script
Finds and replaces legacy CSS variable names with new ones
"""

REPLACEMENTS = {
    'var(--dark-bg)': 'var(--bg-canvas)',
    'var(--grey-bg)': 'var(--bg-panel)',
    'var(--light-bg)': 'var(--bg-surface)',
    'var(--elevated-bg)': 'var(--bg-elevated)',
    'var(--text-muted)': 'var(--text-secondary)',  # Note: Different semantic
    'var(--text-faint)': 'var(--text-muted)',
    'var(--border-hair)': 'var(--border-subtle)',
    'var(--border)': 'var(--border-default)',
    # ... etc
}
```

---

## Phase 2: Component System

**Goal:** Create unified, reusable component styles

### Step 2.1: Button System

Create `static/css/components/buttons.css`:

```css
/* =============================================================================
   Buttons - Based on docs/brand/UI-KIT.md
   ============================================================================= */

.btn {
    all: unset;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 32px;
    padding: 0 14px;
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-fast) var(--ease-default);
    white-space: nowrap;
    gap: 6px;
}

/* Primary - dark filled */
.btn-primary {
    background: var(--text-primary);
    color: var(--text-inverse);
}

.btn-primary:hover {
    background: #0B1220;
}

/* Secondary - outlined */
.btn-secondary {
    background: transparent;
    border: 1px solid var(--border-default);
    color: var(--text-secondary);
}

.btn-secondary:hover {
    background: rgba(15, 23, 42, 0.04);
    border-color: var(--border-strong);
    color: var(--text-primary);
}

/* Ghost - minimal */
.btn-ghost {
    background: transparent;
    color: var(--text-secondary);
}

.btn-ghost:hover {
    background: rgba(15, 23, 42, 0.06);
    color: var(--text-primary);
}

/* Danger - destructive */
.btn-danger {
    background: rgba(220, 38, 38, 0.08);
    border: 1px solid rgba(220, 38, 38, 0.2);
    color: var(--red-500);
}

.btn-danger:hover {
    background: rgba(220, 38, 38, 0.14);
    border-color: rgba(220, 38, 38, 0.3);
}

/* Complete - purple success (brand rule: no green) */
.btn-complete {
    background: rgba(109, 94, 246, 0.08);
    border: 1px solid rgba(109, 94, 246, 0.25);
    color: var(--primary);
}

.btn-complete:hover {
    background: rgba(109, 94, 246, 0.14);
    border-color: rgba(109, 94, 246, 0.35);
}

.btn-complete.is-completed {
    background: rgba(109, 94, 246, 0.12);
    border-color: rgba(109, 94, 246, 0.35);
    color: var(--purple-600);
}

/* Gradient CTA (wizard style) */
.btn-cta {
    height: 52px;
    padding: 0 28px;
    min-width: 130px;
    background: var(--gradient-primary);
    color: white;
    border: none;
    border-radius: var(--radius-lg);
    font-size: 0.9rem;
    box-shadow: var(--shadow-cta);
}

.btn-cta:hover {
    background: var(--gradient-primary-hover);
    transform: translateY(-1px);
    box-shadow: var(--shadow-cta-hover);
}

@media (min-width: 600px) {
    .btn-cta {
        height: 46px;
        font-size: 0.85rem;
    }
}

/* Icon Button */
.btn-icon {
    width: 24px;
    height: 24px;
    padding: 0;
    border-radius: var(--radius-xs);
    border: 1px solid var(--border-subtle);
    background: rgba(255, 255, 255, 0.85);
    color: var(--text-secondary);
}

.btn-icon.edit:hover {
    border-color: rgba(109, 94, 246, 0.35);
    background: rgba(109, 94, 246, 0.08);
    color: var(--primary);
}

.btn-icon.delete:hover {
    border-color: rgba(220, 38, 38, 0.25);
    background: rgba(220, 38, 38, 0.06);
    color: var(--red-500);
}
```

### Step 2.2: Form Elements

Create `static/css/components/forms.css`:

```css
/* =============================================================================
   Forms - Based on docs/brand/UI-KIT.md
   ============================================================================= */

/* Text Input */
.input {
    height: 36px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-default);
    padding: 0 10px;
    background: var(--bg-surface);
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--text-primary);
    transition: border-color var(--duration-fast) var(--ease-default);
}

.input:hover {
    border-color: var(--border-strong);
}

.input:focus {
    border-color: rgba(109, 94, 246, 0.5);
    outline: none;
    filter: drop-shadow(0 0 4px rgba(109, 94, 246, 0.4));
    position: relative;
    z-index: 1;
}

.input::placeholder {
    color: var(--text-muted);
}

/* Segmented Control */
.segmented {
    background: var(--bg-surface);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    height: 32px;
    padding: 2px;
    display: inline-flex;
    align-items: center;
    gap: 2px;
}

.seg-btn {
    all: unset;
    box-sizing: border-box;
    height: 28px;
    padding: 0 8px;
    border-radius: 5px;
    font-size: 0.68rem;
    font-weight: 650;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all var(--duration-fast) var(--ease-default);
}

.seg-btn:hover {
    background: rgba(15, 23, 42, 0.04);
    color: var(--text-primary);
}

.seg-btn.is-active {
    background: rgba(15, 23, 42, 0.06);
    color: var(--text-primary);
}

/* Toggle Switch */
.toggle {
    position: relative;
    width: 32px;
    height: 18px;
    background: rgba(15, 23, 42, 0.15);
    border-radius: var(--radius-full);
    cursor: pointer;
    transition: background var(--duration-fast) var(--ease-default);
}

.toggle.active {
    background: var(--primary);
}

.toggle-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    background: white;
    border-radius: 50%;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
    transition: transform var(--duration-fast) var(--ease-default);
}

.toggle.active .toggle-thumb {
    transform: translateX(14px);
}
```

### Step 2.3: Cards & Panels

Create `static/css/components/panels.css`:

```css
/* =============================================================================
   Panels & Cards - Based on docs/brand/UI-KIT.md
   ============================================================================= */

/* Settings Panel */
.panel {
    background: var(--bg-surface);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    overflow: hidden;
}

.panel-header {
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border-subtle);
    padding: 12px 16px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
}

.panel-title {
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-weight: 700;
    font-size: 0.62rem;
    color: var(--text-secondary);
    margin: 0 0 4px 0;
}

.panel-desc {
    font-size: 0.72rem;
    color: var(--text-muted);
    line-height: 1.4;
    margin: 0;
}

.panel-body {
    /* Content container */
}

/* Panel Row */
.panel-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border-subtle);
    background: var(--bg-surface);
    min-height: 44px;
    transition: background var(--duration-fast) var(--ease-default);
}

.panel-row:last-child {
    border-bottom: none;
}

.panel-row:hover {
    background: var(--row-hover);
}

/* Row actions (hidden until hover) */
.panel-row .row-actions {
    margin-left: auto;
    display: flex;
    gap: 8px;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--duration-instant) var(--ease-default);
}

.panel-row:hover .row-actions {
    opacity: 1;
    pointer-events: auto;
}

/* Glass Card (wizard style) */
.card-glass {
    background: var(--glass-bg-strong);
    backdrop-filter: blur(var(--glass-blur));
    -webkit-backdrop-filter: blur(var(--glass-blur));
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-xl);
    padding: 18px;
    box-shadow: var(--shadow-card);
}

/* Page Surface */
.page-surface {
    width: 100%;
    max-width: var(--content-max-width);
    background: var(--bg-panel);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: 32px 36px 44px;
}
```

### Step 2.4: Typography

Create `static/css/components/typography.css`:

```css
/* =============================================================================
   Typography - Based on docs/brand/BRAND.md
   ============================================================================= */

/* Page Title */
.page-title {
    margin: 0 0 28px 0;
    text-transform: uppercase;
    letter-spacing: 0.10em;
    font-weight: 700;
    font-size: 1.5rem;
    line-height: 1;
    color: var(--text-primary);
}

/* Section Title */
.section-title {
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-weight: 700;
    font-size: 0.62rem;
    color: var(--text-secondary);
}

/* Field Label */
.field-label {
    font-size: 0.55rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    margin-bottom: 8px;
}

/* Keycap Hint */
.keycap {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 22px;
    padding: 0 10px;
    border-radius: var(--radius-sm);
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    font-weight: 800;
    letter-spacing: 0.14em;
    font-size: 0.62rem;
    text-transform: uppercase;
}
```

---

## Phase 3: Page Redesigns

### 3.1: Tasks Page

**Current:** `dashboard.css` with legacy tokens
**Target:** Modern task list with new tokens, glass panels

**Key Changes:**
1. Migrate all tokens to new names
2. Apply `--radius-*` scale to all rounded elements
3. Update task row styles to use panel patterns
4. Add empty state illustration (`empty-tasks.svg`)
5. Integrate UI icons from sprite

**Files to Modify:**
- `static/css/dashboard.css` → `static/css/pages/tasks.css`
- `app/templates/dashboard.html`

### 3.2: Thought Cabinet Page

**Current:** Inline CSS in `thoughts.html` (~400 lines)
**Target:** External CSS using component system

**Key Changes:**
1. Extract CSS to `static/css/pages/thoughts.css`
2. Use `.panel`, `.panel-row` components
3. Update to new tokens
4. Add empty state illustration (`empty-thoughts.svg`)
5. Integrate lightbulb icon from sprite

**Files to Create/Modify:**
- `static/css/pages/thoughts.css` (new)
- `app/templates/thoughts.html`

### 3.3: Analytics Page

**Current:** Inline CSS in `analytics.html` (~500 lines)
**Target:** External CSS, ApexCharts theme integration

**Key Changes:**
1. Extract CSS to `static/css/pages/analytics.css`
2. Create ApexCharts theme config using brand tokens
3. Use new panel components
4. Add chart-specific styling
5. Add empty state illustration (`empty-analytics.svg`)

**ApexCharts Theme (Complete):**
```javascript
// static/js/chart-theme.js
const WhendoistChartTheme = {
    // Base options applied to all charts
    getBaseOptions: (isDarkMode = false) => ({
        chart: {
            fontFamily: 'inherit',
            foreColor: isDarkMode
                ? 'rgba(248, 250, 252, 0.72)'   // --text-secondary dark
                : 'rgba(15, 23, 42, 0.64)',     // --text-secondary light
            toolbar: { show: false },
            background: 'transparent',
            animations: {
                enabled: true,
                easing: 'easeinout',
                speed: 300
            }
        },
        colors: ['#6D5EF6', '#167BFF', '#A020C0', '#B8860B', '#C9505A'],
        grid: {
            borderColor: isDarkMode
                ? 'rgba(248, 250, 252, 0.06)'   // --border-subtle dark
                : 'rgba(15, 23, 42, 0.055)',    // --border-subtle light
            strokeDashArray: 0
        },
        tooltip: {
            theme: isDarkMode ? 'dark' : 'light',
            style: { fontSize: '12px' },
            y: { formatter: (val) => val }
        },
        dataLabels: {
            style: {
                fontSize: '11px',
                fontWeight: 600
            }
        },
        legend: {
            fontSize: '12px',
            fontWeight: 500,
            labels: {
                colors: isDarkMode
                    ? 'rgba(248, 250, 252, 0.72)'
                    : 'rgba(15, 23, 42, 0.64)'
            }
        }
    }),

    // Bar chart specific
    barOptions: {
        plotOptions: {
            bar: {
                borderRadius: 4,
                columnWidth: '60%'
            }
        }
    },

    // Donut chart specific
    donutOptions: {
        plotOptions: {
            pie: {
                donut: {
                    size: '70%',
                    labels: {
                        show: true,
                        name: { fontSize: '14px', fontWeight: 600 },
                        value: { fontSize: '24px', fontWeight: 700 }
                    }
                }
            }
        },
        stroke: { width: 0 }
    },

    // Heatmap specific (GitHub-style)
    heatmapOptions: {
        colors: ['#EFEEFF', '#C4B5FD', '#8B5CF6', '#6D5EF6', '#5B4CF0']
    },

    // Apply theme on load and theme change
    applyTheme: (charts, isDarkMode) => {
        const baseOptions = WhendoistChartTheme.getBaseOptions(isDarkMode);
        charts.forEach(chart => {
            chart.updateOptions(baseOptions, false, false);
        });
    }
};

// Listen for theme changes
document.addEventListener('themechange', (e) => {
    WhendoistChartTheme.applyTheme(window.analyticsCharts, e.detail.isDark);
});
```

**Files to Create/Modify:**
- `static/css/pages/analytics.css` (new)
- `static/js/chart-theme.js` (new)
- `app/templates/analytics.html`

### 3.4: Settings Page

**Current:** Inline CSS in `settings.html` (~800 lines)
**Target:** External CSS using panel components

**Key Changes:**
1. Extract CSS to `static/css/pages/settings.css`
2. Use unified `.panel`, `.panel-row`, `.btn-*` components
3. Update all tokens
4. Fix any remaining green → purple success states
5. Add proper dark mode preparation

**Files to Create/Modify:**
- `static/css/pages/settings.css` (new)
- `app/templates/settings.html`

---

## Phase 4: Dark Mode

**Goal:** Add full dark mode support

### Step 4.1: Theme Toggle

Add theme toggle to settings:
- UI in Settings → Appearance section
- JavaScript for toggle + localStorage persistence
- System preference detection

```javascript
// Theme initialization
const stored = localStorage.getItem('theme');
const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
document.documentElement.setAttribute('data-theme', stored || preferred);

// Theme toggle
function toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
}
```

### Step 4.2: Update All Pages

Ensure all pages work with `[data-theme="dark"]`:
1. Test each component visually
2. Verify contrast ratios meet WCAG AA
3. Check illustration tint backgrounds
4. Test ApexCharts in dark mode

### Step 4.3: Illustrations Dark Mode

Update SVGs or use CSS variables for tint backgrounds:
```css
[data-theme="dark"] {
    --blue-tint: rgba(22, 123, 255, 0.15);
    --purple-tint: rgba(109, 94, 246, 0.15);
    --magenta-tint: rgba(160, 32, 192, 0.15);
}
```

---

## Phase 5: Polish & Testing

### 5.1: Icon Integration

Replace emoji/inline SVG with sprite icons:

```html
<!-- Before -->
<span class="icon">🗑️</span>

<!-- After -->
<svg class="icon" width="16" height="16">
    <use href="/static/img/icons/ui-icons.svg#trash"/>
</svg>
```

**Icons to integrate:**
- Navigation: menu, chevrons, logout
- Actions: edit, delete, copy, download
- Objects: calendar, clock, task, folder
- Status: check-circle, alert, info

### 5.2: Illustration Integration

Add illustrations to empty states:

```html
<div class="empty-state">
    <img src="/static/img/illustrations/empty-tasks.svg"
         alt="" width="80" height="80" aria-hidden="true">
    <p class="empty-title">No tasks yet</p>
    <p class="empty-desc">Create a task to get started</p>
</div>
```

### 5.3: Testing Strategy

#### Visual Regression Testing

For CSS changes, use screenshot comparison to catch regressions:

```bash
# Install Playwright
uv run playwright install chromium

# Run visual tests
uv run pytest tests/visual/ -v --screenshot=on
```

**Key pages to screenshot:**
1. Tasks page (with tasks, with empty state)
2. Thought Cabinet (with thoughts, empty)
3. Analytics (with data, no data)
4. Settings (all panels expanded)
5. Wizard (all 8 steps)

#### Browser Matrix

| Browser | Priority | Notes |
|---------|----------|-------|
| Chrome/Edge | High | Primary target |
| Safari | High | iOS users, `backdrop-filter` |
| Firefox | Medium | No `backdrop-filter` fallback needed |
| Mobile Safari | High | PWA usage |
| Mobile Chrome | High | PWA usage |

#### Testing Checklist

**Visual Testing:**
- [ ] All pages render correctly in light mode
- [ ] All pages render correctly in dark mode
- [ ] Mobile responsive (< 600px)
- [ ] Tablet responsive (600-900px)
- [ ] Desktop (> 900px)
- [ ] Glass effects degrade gracefully (Firefox)
- [ ] Reduced motion preference respected

**Functional Testing:**
- [ ] Task CRUD operations work
- [ ] Drag and drop works
- [ ] Calendar interactions work
- [ ] All forms submit correctly
- [ ] Encryption/decryption works
- [ ] Passkey flow works
- [ ] Theme toggle persists after reload
- [ ] Toast notifications appear correctly

**Accessibility Testing:**
- [ ] Color contrast WCAG AA (use browser dev tools)
- [ ] Focus indicators visible on all interactive elements
- [ ] Keyboard navigation works (Tab, Shift+Tab, Enter, Escape)
- [ ] Screen reader compatible (test with VoiceOver/NVDA)
- [ ] No keyboard traps in modals

**Performance Testing:**
- [ ] CSS file sizes reasonable (< 50KB combined)
- [ ] No duplicate styles (audit with CSS Stats)
- [ ] Icons load efficiently (single sprite request)
- [ ] First paint < 1s on 3G

### 5.4: Form Validation Patterns

Define consistent error states for form elements:

```css
/* Input error state */
.input.is-error {
    border-color: var(--red-500);
    background: rgba(220, 38, 38, 0.04);
}

.input.is-error:focus {
    filter: drop-shadow(0 0 4px rgba(220, 38, 38, 0.3));
}

/* Error message */
.field-error {
    color: var(--red-500);
    font-size: 0.7rem;
    font-weight: 500;
    margin-top: 4px;
    display: flex;
    align-items: center;
    gap: 4px;
}

.field-error::before {
    content: "";
    width: 12px;
    height: 12px;
    background: url('/static/img/icons/ui-icons.svg#alert-circle-red');
}

/* Success state (purple per brand) */
.input.is-success {
    border-color: var(--primary);
}

/* Disabled state */
.input:disabled {
    background: var(--bg-panel);
    color: var(--text-muted);
    cursor: not-allowed;
}
```

**Inline validation pattern:**
```html
<div class="field">
    <label class="field-label">Email</label>
    <input type="email" class="input is-error" value="invalid">
    <span class="field-error">Please enter a valid email address</span>
</div>
```

### 5.5: Loading States

Define consistent loading patterns:

```css
/* Spinner animation */
@keyframes spin {
    to { transform: rotate(360deg); }
}

.spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--border-default);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}

.spinner-sm { width: 14px; height: 14px; border-width: 1.5px; }
.spinner-lg { width: 32px; height: 32px; border-width: 3px; }

/* Skeleton loading */
@keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
}

.skeleton {
    background: linear-gradient(
        90deg,
        var(--bg-panel) 25%,
        var(--bg-surface) 50%,
        var(--bg-panel) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: var(--radius-sm);
}

.skeleton-text { height: 1em; margin-bottom: 0.5em; }
.skeleton-title { height: 1.5em; width: 60%; }
.skeleton-avatar { width: 40px; height: 40px; border-radius: 50%; }

/* Button loading state */
.btn.is-loading {
    position: relative;
    color: transparent;
    pointer-events: none;
}

.btn.is-loading::after {
    content: "";
    position: absolute;
    width: 16px;
    height: 16px;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}
```

### 5.6: Toast Notifications

Define toast component for feedback messages:

```css
/* Toast container (positioned fixed) */
.toast-container {
    position: fixed;
    bottom: var(--space-6);
    left: var(--space-6);
    z-index: var(--z-toast);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

/* Toast base */
.toast {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background: var(--glass-bg-strong);
    backdrop-filter: blur(var(--glass-blur));
    -webkit-backdrop-filter: blur(var(--glass-blur));
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-elevated);
    min-width: 280px;
    max-width: 400px;
    animation: toastIn var(--duration-slow) var(--ease-out);
}

@keyframes toastIn {
    from {
        opacity: 0;
        transform: translateY(16px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.toast.is-exiting {
    animation: toastOut var(--duration-normal) var(--ease-default);
}

@keyframes toastOut {
    to {
        opacity: 0;
        transform: translateY(8px);
    }
}

/* Toast variants */
.toast-success .toast-icon { color: var(--primary); }
.toast-error .toast-icon { color: var(--red-500); }
.toast-warning .toast-icon { color: var(--amber-600); }
.toast-info .toast-icon { color: var(--blue-500); }

/* Toast content */
.toast-message {
    flex: 1;
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--text-primary);
}

/* Toast actions */
.toast-action {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--primary);
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
}

.toast-dismiss {
    width: 20px;
    height: 20px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
}
```

### 3.5: Login Page

**Current:** Inline CSS in `login.html` (~150 lines), already uses modern patterns
**Target:** Extract to external CSS for consistency

**Assessment:** Login page uses gradient background and modern button styles already matching wizard. Low priority for migration.

**Files to Modify:**
- `static/css/pages/login.css` (new, optional)
- `app/templates/login.html`

---

## Mobile-First Patterns

All pages should be designed mobile-first with progressive enhancement for larger screens.

### Breakpoints

```css
/* Mobile (base) — 0-599px */
/* No media query needed, this is the default */

/* Tablet — 600-899px */
@media (min-width: 600px) { }

/* Desktop — 900px+ */
@media (min-width: 900px) { }

/* Large desktop — 1200px+ (optional) */
@media (min-width: 1200px) { }
```

### Touch Target Sizes

| Element | Mobile | Desktop |
|---------|--------|---------|
| Buttons | 52px height | 32-44px |
| Icon buttons | 44×44px | 24-32px |
| List rows | 56px min-height | 44px |
| Form inputs | 52px height | 36-44px |
| Toggle switches | 44×24px | 32×18px |

### Touch Interactions

```css
/* Tap feedback on mobile */
@media (hover: none) {
    .btn:active,
    .row:active {
        transform: scale(0.98);
        transition: transform 0.1s ease;
    }
}

/* Hover only on devices that support it */
@media (hover: hover) {
    .btn:hover { background: var(--interactive-hover); }
    .row:hover { background: var(--row-hover); }
}

/* Remove hover effects on touch devices to prevent sticky states */
@media (hover: none) {
    .btn:hover { background: inherit; }
}
```

### Safe Areas (PWA)

```css
/* Respect device notches and home indicators */
.app-container {
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
}

/* Fixed bottom navigation */
.bottom-nav {
    padding-bottom: calc(var(--space-4) + env(safe-area-inset-bottom));
}
```

### Virtual Keyboard Handling

```css
/* Adjust layout when keyboard opens */
body.keyboard-open .bottom-nav {
    display: none;
}

body.keyboard-open .modal-content {
    max-height: 50vh;
}
```

```javascript
// Detect virtual keyboard
const visualViewport = window.visualViewport;
if (visualViewport) {
    visualViewport.addEventListener('resize', () => {
        const keyboardOpen = visualViewport.height < window.innerHeight * 0.75;
        document.body.classList.toggle('keyboard-open', keyboardOpen);
    });
}
```

### Swipe Gestures

For wizard/carousel navigation:

```javascript
// Swipe detection thresholds
const SWIPE_THRESHOLD = 80;      // Minimum distance in px
const VELOCITY_THRESHOLD = 0.5;   // Minimum velocity in px/ms

// Higher thresholds prevent accidental triggers on interactive elements
const STRICT_SWIPE_THRESHOLD = 120;
const STRICT_VELOCITY_THRESHOLD = 0.7;
```

---

## JavaScript File Updates

Several JS files reference CSS classes or create inline styles that need updating during migration.

### Files to Review

| File | Updates Needed |
|------|----------------|
| `static/js/drag-drop.js` | Uses `body.is-dragging`, trash bin styles — verify token usage |
| `static/js/task-dialog.js` | Creates modal styles, may use legacy tokens |
| `static/js/plan-tasks.js` | Selection overlay styles use hardcoded colors |
| `static/js/energy-selector.js` | Energy mode colors — update to CSS variables |
| `static/js/toast.js` | Toast positioning — verify z-index token usage |
| `static/js/recurrence-picker.js` | Day button styles — uses inline styles |
| `static/js/task-complete.js` | Completion animation colors |
| `static/js/crypto.js` | No CSS changes needed |
| `static/js/passkey.js` | No CSS changes needed |

### Pattern: JS → CSS Variable Alignment

When JS creates inline styles, prefer CSS classes:

```javascript
// Before (hardcoded)
element.style.background = 'rgba(109, 94, 246, 0.10)';

// After (CSS class)
element.classList.add('is-selected');
```

Or use CSS custom properties:

```javascript
// Read token value
const primary = getComputedStyle(document.documentElement)
    .getPropertyValue('--primary').trim();
```

---

## Icon & Illustration Integration

### Icon Sprite Usage

Use SVG sprite references for all UI icons:

```html
<!-- Inline icon -->
<svg class="icon" aria-hidden="true">
    <use href="/static/img/icons/ui-icons.svg#edit"/>
</svg>

<!-- Icon button with label -->
<button class="btn-icon" aria-label="Edit task">
    <svg class="icon" aria-hidden="true">
        <use href="/static/img/icons/ui-icons.svg#edit"/>
    </svg>
</button>
```

### Icon Sizes

| Size | Class | Dimensions | Use Case |
|------|-------|------------|----------|
| XS | `.icon-xs` | 12×12px | Inline with small text |
| SM | `.icon-sm` | 16×16px | Button icons, list items |
| MD | `.icon` (default) | 20×20px | Standard UI |
| LG | `.icon-lg` | 24×24px | Headers, prominent actions |
| XL | `.icon-xl` | 32×32px | Empty states, features |

```css
.icon { width: 20px; height: 20px; }
.icon-xs { width: 12px; height: 12px; }
.icon-sm { width: 16px; height: 16px; }
.icon-lg { width: 24px; height: 24px; }
.icon-xl { width: 32px; height: 32px; }
```

### Illustration Component Pattern

```css
.illustration {
    display: block;
    margin: 0 auto var(--space-4);
}

.illustration-sm { width: 48px; height: 48px; }
.illustration-md { width: 80px; height: 80px; }
.illustration-lg { width: 100px; height: 100px; }

.empty-state {
    text-align: center;
    padding: var(--space-8);
}

.empty-state .illustration {
    opacity: 0.9;
}

.empty-state .empty-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 var(--space-2);
}

.empty-state .empty-desc {
    font-size: 0.8rem;
    color: var(--text-secondary);
    margin: 0;
}
```

### Asset Mapping by Page

Map of which brand assets each page should integrate:

### Tasks Page (dashboard.html)

| Location | Asset | Size |
|----------|-------|------|
| Task actions | `edit`, `trash`, `check` | 16px |
| Domain collapse | `chevron-down`, `chevron-right` | 16px |
| Add task | `plus` | 16px |
| Empty task list | `empty-tasks.svg` | 80px |
| Calendar events | `calendar` | 12px inline |

### Thought Cabinet (thoughts.html)

| Location | Asset | Size |
|----------|-------|------|
| Capture hint | `lightbulb` | 16px |
| Promote action | `arrow-up`, `check` | 16px |
| Delete action | `trash` | 16px |
| Empty state | `empty-thoughts.svg` | 80px |

### Analytics (analytics.html)

| Location | Asset | Size |
|----------|-------|------|
| Stats icons | `check-circle`, `clock`, `chart-pie` | 24px |
| Empty state | `empty-analytics.svg` | 100px |
| Streak indicator | `star-filled-purple` | 20px |

### Settings (settings.html)

| Location | Asset | Size |
|----------|-------|------|
| Panel icons | Various per panel | 20px |
| Google integration | `google` | 24px |
| Encryption enabled | `shield-check-purple` | 24px |
| Lock status | `lock`, `unlock` | 16px |
| Passkey | `key` | 16px |
| Error states | `error-connection.svg`, etc. | 64px |
| Success states | `success-connected.svg`, etc. | 64px |

### Wizard (wizard flow)

| Location | Asset | Size |
|----------|-------|------|
| Welcome | `onboarding-welcome.svg` | 80px |
| Energy modes | `onboarding-energy.svg` | 64px |
| Calendar | `success-connected.svg` | 48px |
| Todoist | `import-data.svg` | 64px |
| Security | `success-encrypted.svg` | 48px |
| Progress dots | CSS (no icons) | — |

---

## Pico CSS Considerations

Whendoist uses Pico CSS as a base. During migration, be aware of:

### Pico Overrides Required

| Element | Pico Default | Our Override |
|---------|--------------|--------------|
| `button` | Heavy styling | Use `.btn` classes |
| `input` | Pico focus ring | `drop-shadow()` technique |
| `a` | Underline | Context-dependent |
| `dialog` | Pico modal | Custom `.modal-backdrop` |
| `table` | Heavy borders | Minimal lines |

### Recommended: Pico Import Strategy

```css
/* Import Pico for reset and typography only */
@import url('pico.min.css');

/* Override all component styles */
@import url('tokens.css');
@import url('components/index.css');
```

Or use Pico's classless-only version to minimize conflicts.

---

## Technical Specifications

### CSS Architecture

```
static/css/
├── tokens.css          # Design tokens (single source of truth)
├── base.css            # Reset, html, body styles
├── components/
│   ├── buttons.css     # All button variants
│   ├── forms.css       # Inputs, selects, toggles
│   ├── panels.css      # Cards, panels, rows
│   ├── typography.css  # Text styles
│   └── index.css       # Imports all components
├── pages/
│   ├── tasks.css       # Tasks page layout
│   ├── thoughts.css    # Thought Cabinet
│   ├── analytics.css   # Analytics + charts
│   └── settings.css    # Settings page
├── app.css             # Global styles + utilities
└── dialog.css          # Modal styles (existing)
```

### Template Updates

Each template should include:
```html
<link rel="stylesheet" href="/static/css/tokens.css">
<link rel="stylesheet" href="/static/css/base.css">
<link rel="stylesheet" href="/static/css/components/index.css">
<link rel="stylesheet" href="/static/css/pages/[page-name].css">
```

Or use a bundler to create a single CSS file.

### HTML Data Attributes

```html
<!-- Theme -->
<html data-theme="light">

<!-- Clarity -->
<div data-clarity="executable">
<div data-clarity="defined">
<div data-clarity="exploratory">

<!-- Impact -->
<div data-impact="1">  <!-- P1: High -->
<div data-impact="2">  <!-- P2: Medium -->
<div data-impact="3">  <!-- P3: Low -->
<div data-impact="4">  <!-- P4: Minimal -->
```

---

## Implementation Checklist

### Phase 1: Foundation
- [ ] Create `static/css/tokens.css`
- [ ] Update `app.css` to import tokens
- [ ] Create migration script for legacy tokens
- [ ] Run migration on all CSS files
- [ ] Test that nothing breaks

### Phase 2: Component System
- [ ] Create `static/css/components/buttons.css`
- [ ] Create `static/css/components/forms.css`
- [ ] Create `static/css/components/panels.css`
- [ ] Create `static/css/components/typography.css`
- [ ] Create `static/css/components/index.css`
- [ ] Test components in isolation

### Phase 3: Page Redesigns
- [ ] Tasks page: migrate dashboard.css
- [ ] Thoughts page: extract inline CSS
- [ ] Analytics page: extract inline CSS + chart theme
- [ ] Settings page: extract inline CSS
- [ ] Test all pages

### Phase 4: Dark Mode
- [ ] Add theme toggle to settings
- [ ] Add theme persistence
- [ ] Update illustrations for dark mode
- [ ] Update ApexCharts for dark mode
- [ ] Test all pages in dark mode

### Phase 5: Polish
- [ ] Integrate UI icon sprite
- [ ] Add empty state illustrations
- [ ] Add error state illustrations
- [ ] Run accessibility audit
- [ ] Run performance audit
- [ ] Final visual QA

---

## Phase Completion Criteria

Each phase must meet these criteria before moving to the next:

### Phase 1: Foundation — Complete When

- [ ] `static/css/tokens.css` exists with all tokens defined
- [ ] `app.css` imports `tokens.css` at the top
- [ ] Legacy aliases work (no visual changes)
- [ ] All pages load without CSS errors
- [ ] Brand color palette matches COLOR-SYSTEM.md

### Phase 2: Components — Complete When

- [ ] `static/css/components/` directory exists with all component files
- [ ] Button test page shows all variants correctly
- [ ] Form elements match UI-KIT.md specifications
- [ ] No inline button/form styles remain in templates
- [ ] Component classes have consistent naming (`.btn-*`, `.input`, `.panel-*`)

### Phase 3: Pages — Complete When

- [ ] Each page has < 50 lines of inline CSS (structural only)
- [ ] Page-specific CSS files exist where needed
- [ ] Empty states use brand illustrations
- [ ] All icons use the SVG sprite system
- [ ] ApexCharts theme config works

### Phase 4: Dark Mode — Complete When

- [ ] Theme toggle in Settings works
- [ ] All pages render correctly in dark mode
- [ ] Theme preference persists in localStorage
- [ ] System preference (`prefers-color-scheme`) is respected
- [ ] Charts update colors on theme change
- [ ] No hardcoded light-mode colors remain

### Phase 5: Polish — Complete When

- [ ] All testing checklist items pass
- [ ] No accessibility failures (WCAG AA)
- [ ] CSS bundle size < 50KB gzipped
- [ ] Performance audit shows no regressions
- [ ] DESIGN.md updated to reflect new system (or deprecated)

---

## Migration Rollback Plan

If issues arise during migration, follow these rollback procedures.

### Phase 1 Rollback (Token Migration)

If `tokens.css` causes issues:
1. Remove `@import url('tokens.css');` from `app.css`
2. Restore inline token definitions in `:root` block
3. Legacy aliases ensure no breaking changes — components still use old names

**Risk Level:** Low — legacy aliases provide backwards compatibility

### Phase 2 Rollback (Components)

If component CSS causes conflicts:
1. Comment out `@import url('components/index.css');` in app.css
2. Inline styles in templates continue to work
3. Each component file can be disabled independently

**Rollback command:**
```bash
# Disable single component
git checkout HEAD -- static/css/components/buttons.css

# Disable all components
git checkout HEAD -- static/css/components/
```

### Phase 3 Rollback (Page Redesigns)

Pages are migrated one at a time. If a page breaks:
1. Restore the template's inline `<style>` block from git
2. Remove the page-specific CSS import

**Per-page rollback:**
```bash
# Rollback Settings page only
git checkout HEAD -- app/templates/settings.html
git checkout HEAD -- static/css/pages/settings.css
```

### Phase 4 Rollback (Dark Mode)

Dark mode is additive. To disable:
1. Remove `data-theme` attribute from `<html>`
2. Theme toggle becomes non-functional but app works in light mode
3. No CSS changes needed — light mode is the default

### General Rollback Strategy

1. **Feature flags** — Use `FEATURE_NEW_DESIGN=false` env var during transition
2. **Branch protection** — All changes via PR, never direct to master
3. **Visual regression tests** — Screenshot comparison catches regressions
4. **User feedback** — Beta users can report issues before wider rollout

---

## Accessibility Requirements

WCAG 2.1 AA compliance is required for all components.

### Color Contrast

| Element | Minimum Ratio | Requirement |
|---------|---------------|-------------|
| Body text | 4.5:1 | AA Normal |
| Large text (≥18pt bold, ≥24pt) | 3:1 | AA Large |
| UI components | 3:1 | AA Graphics |
| Disabled elements | No minimum | Can be lower |

**Verified combinations** (see COLOR-SYSTEM.md):
- `--text-primary` on `--bg-surface`: 17.4:1 ✓
- `--text-secondary` on `--bg-surface`: 6.8:1 ✓
- `--primary` on white: 4.6:1 ✓

### Focus Indicators

All interactive elements must have visible focus:

```css
/* Default focus ring */
:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
}

/* For elements where outline doesn't work */
.btn:focus-visible {
    box-shadow: 0 0 0 3px var(--focus-ring);
}

/* Inside scrollable containers, use filter */
.modal .input:focus-visible {
    filter: drop-shadow(0 0 4px var(--focus-ring));
}
```

### Keyboard Navigation

| Key | Action |
|-----|--------|
| Tab | Move to next focusable element |
| Shift+Tab | Move to previous focusable element |
| Enter | Activate button/link |
| Space | Toggle checkbox, activate button |
| Escape | Close modal, cancel action |
| Arrow keys | Navigate within menus, lists |

**Modal focus trap:**
```javascript
// Keep focus within modal when open
modal.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
        const focusable = modal.querySelectorAll('button, input, a[href]');
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }
    if (e.key === 'Escape') {
        closeModal();
    }
});
```

### ARIA Attributes

| Component | Required ARIA |
|-----------|---------------|
| Modal | `role="dialog"`, `aria-modal="true"`, `aria-labelledby` |
| Toast | `role="alert"`, `aria-live="polite"` |
| Dropdown | `aria-expanded`, `aria-haspopup="listbox"` |
| Toggle | `role="switch"`, `aria-checked` |
| Progress | `role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax` |
| Tab panel | `role="tablist"`, `role="tab"`, `role="tabpanel"` |

### Screen Reader Considerations

- Decorative icons: `aria-hidden="true"`
- Icon-only buttons: `aria-label="Delete task"`
- Loading states: `aria-busy="true"`, announce via live region
- Dynamic content: `aria-live="polite"` for updates

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
    }
}
```

---

## Migration Commands

Quick reference for common migration tasks:

```bash
# Audit current CSS for legacy tokens
grep -rn "var(--dark-bg)" static/css/ app/templates/
grep -rn "var(--grey-bg)" static/css/ app/templates/
grep -rn "var(--light-bg)" static/css/ app/templates/

# Find inline styles in templates
grep -rn 'style="' app/templates/

# Count CSS lines per file
wc -l static/css/*.css

# Validate CSS syntax (requires stylelint)
npx stylelint static/css/**/*.css

# Generate CSS stats (requires css-stats)
npx css-stats static/css/app.css

# Run visual regression tests
uv run pytest tests/visual/ -v
```

---

## Appendix: File Dependencies

### Current State
```
base.html
├── app.css (all global styles)
└── (page-specific inline CSS)

dashboard.html
├── base.html
├── dashboard.css
└── dialog.css

thoughts.html
├── base.html
└── inline CSS (400 lines)

analytics.html
├── base.html
├── ApexCharts CDN
└── inline CSS (500 lines)

settings.html
├── base.html
└── inline CSS (800 lines)
```

### Target State
```
base.html
├── tokens.css
├── base.css
├── components/index.css
└── app.css (utilities only)

dashboard.html (Tasks)
├── base.html
├── pages/tasks.css
└── dialog.css

thoughts.html
├── base.html
└── pages/thoughts.css

analytics.html
├── base.html
├── ApexCharts CDN (with theme config)
└── pages/analytics.css

settings.html
├── base.html
└── pages/settings.css
```

---

## CSS Import Order (CRITICAL)

CSS specificity depends on import order. Load files in this exact sequence:

```html
<!-- In base.html <head> -->

<!-- 1. External dependencies (lowest specificity) -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.classless.min.css">

<!-- 2. Design tokens (custom properties - no specificity) -->
<link rel="stylesheet" href="/static/css/tokens.css">

<!-- 3. Base reset and typography (element selectors) -->
<link rel="stylesheet" href="/static/css/base.css">

<!-- 4. Component styles (class selectors) -->
<link rel="stylesheet" href="/static/css/components/index.css">

<!-- 5. Global app styles (higher specificity overrides) -->
<link rel="stylesheet" href="/static/css/app.css">

<!-- 6. Page-specific styles (loaded per page, highest specificity) -->
{% block page_css %}{% endblock %}
```

**Why this order matters:**
- Pico provides base element styles we override
- Tokens define variables used everywhere (no cascade conflict)
- Components override Pico's element styles with classes
- App.css provides global utilities that override components
- Page CSS has final say for page-specific overrides

### Pico CSS Override Strategy

Pico CSS uses moderate specificity. To override reliably:

```css
/* Pico uses: input { ... } */
/* We need: .input { ... } — class beats element ✓ */

/* Pico uses: button { ... } */
/* We need: .btn { ... } — class beats element ✓ */

/* For Pico's :focus styles, use !important or higher specificity */
.modal-backdrop .input:focus {
    /* .modal-backdrop .input = 0,2,0 specificity */
    border-color: rgba(99, 102, 241, 0.5);
}

/* If still not working, use !important as last resort */
.input:focus {
    outline: none !important;
    box-shadow: none !important;
    filter: drop-shadow(0 0 4px rgba(99, 102, 241, 0.4)) !important;
}
```

**Pico Classless Version:** Use `pico.classless.min.css` instead of `pico.min.css` to minimize conflicts. Classless only styles semantic elements (`<button>`, `<input>`), not classes.

---

## Component Migration Priority

Migrate components in this order for maximum impact with minimal risk:

| Priority | Component | Files Affected | Impact |
|----------|-----------|----------------|--------|
| 1 | **tokens.css** | All | Foundation for everything |
| 2 | **buttons.css** | All pages | Most visible, used everywhere |
| 3 | **forms.css** | Tasks, Settings, Wizard | High interaction frequency |
| 4 | **panels.css** | Settings, Thoughts | Major visual structure |
| 5 | **typography.css** | All pages | Consistency, low risk |
| 6 | **loading.css** | All pages | Progressive enhancement |

**Rationale:** Start with highest-visibility, lowest-risk components. Buttons and forms affect user perception immediately. Panels and typography are structural but lower risk.

---

## CSS Error Boundaries

Handle CSS loading failures gracefully:

```html
<!-- In base.html -->
<link rel="stylesheet" href="/static/css/tokens.css"
      onerror="document.documentElement.classList.add('css-error')">

<style>
    /* Fallback styles if tokens.css fails to load */
    .css-error {
        --bg-canvas: #F8FAFC;
        --bg-panel: #F1F5F9;
        --bg-surface: #FFFFFF;
        --text-primary: #0B1220;
        --text-secondary: rgba(15, 23, 42, 0.64);
        --border-default: rgba(15, 23, 42, 0.085);
        --primary: #6D5EF6;
    }

    /* Show error banner */
    .css-error::before {
        content: "⚠️ Some styles failed to load. Please refresh.";
        display: block;
        background: #FEF2F2;
        color: #B91C1C;
        padding: 8px 16px;
        text-align: center;
        font-size: 14px;
    }
</style>
```

---

## Visual Regression Testing Setup

### Step 1: Establish Baselines

Before any migration, capture baseline screenshots:

```bash
# Install Playwright
uv run playwright install chromium

# Create baseline directory
mkdir -p tests/visual/baselines

# Capture baselines (run with dev server on localhost:8000)
uv run python scripts/capture-baselines.py
```

**Baseline script (`scripts/capture-baselines.py`):**

```python
"""
Capture visual regression baselines for all pages.
Run this BEFORE starting migration to establish reference images.
"""
import asyncio
from playwright.async_api import async_playwright

PAGES = [
    ('tasks', '/'),
    ('tasks-empty', '/?test=empty'),
    ('thoughts', '/thoughts'),
    ('analytics', '/analytics'),
    ('settings', '/settings'),
    ('wizard-step1', '/?wizard=true&step=1'),
]

VIEWPORTS = [
    ('mobile', 375, 667),
    ('tablet', 768, 1024),
    ('desktop', 1440, 900),
]

async def capture_baselines():
    async with async_playwright() as p:
        browser = await p.chromium.launch()

        for page_name, url in PAGES:
            for viewport_name, width, height in VIEWPORTS:
                page = await browser.new_page(viewport={'width': width, 'height': height})
                await page.goto(f'http://localhost:8000{url}')
                await page.wait_for_load_state('networkidle')

                filename = f'tests/visual/baselines/{page_name}-{viewport_name}.png'
                await page.screenshot(path=filename, full_page=True)
                print(f'Captured: {filename}')

                await page.close()

        await browser.close()

asyncio.run(capture_baselines())
```

### Step 2: Compare After Changes

```bash
# After making CSS changes, compare against baselines
uv run pytest tests/visual/test_regression.py -v --screenshot=on
```

**Comparison test (`tests/visual/test_regression.py`):**

```python
import pytest
from playwright.sync_api import Page
from PIL import Image
import imagehash
import io

THRESHOLD = 5  # Maximum hash difference allowed

@pytest.mark.parametrize("page_name,url", [
    ('tasks', '/'),
    ('thoughts', '/thoughts'),
    ('analytics', '/analytics'),
    ('settings', '/settings'),
])
def test_visual_regression(page: Page, page_name: str, url: str):
    """Compare current page against baseline."""
    page.goto(f'http://localhost:8000{url}')
    page.wait_for_load_state('networkidle')

    current = page.screenshot()
    baseline_path = f'tests/visual/baselines/{page_name}-desktop.png'

    # Compare using perceptual hash (tolerates minor differences)
    current_hash = imagehash.phash(Image.open(io.BytesIO(current)))
    baseline_hash = imagehash.phash(Image.open(baseline_path))

    difference = current_hash - baseline_hash
    assert difference <= THRESHOLD, f"Visual regression detected: {difference} > {THRESHOLD}"
```

---

## Animation Keyframes (Complete)

All animations used in the app:

```css
/* ===== Animation Keyframes ===== */

/* Spinner (loading) */
@keyframes spin {
    to { transform: rotate(360deg); }
}

/* Skeleton shimmer (loading placeholder) */
@keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
}

/* Toast enter */
@keyframes toastIn {
    from {
        opacity: 0;
        transform: translateY(16px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* Toast exit */
@keyframes toastOut {
    to {
        opacity: 0;
        transform: translateY(8px);
    }
}

/* Modal enter */
@keyframes modalIn {
    from {
        opacity: 0;
        transform: scale(0.95) translateY(-10px);
    }
    to {
        opacity: 1;
        transform: scale(1) translateY(0);
    }
}

/* Modal backdrop */
@keyframes backdropIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

/* Dropdown open */
@keyframes dropdownIn {
    from {
        opacity: 0;
        transform: translateY(-4px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* Checkbox tick bounce */
@keyframes tickBounce {
    0% { transform: scale(0); }
    50% { transform: scale(1.2); }
    100% { transform: scale(1); }
}

/* Pulse (attention) */
@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
}

/* Focus ring expand */
@keyframes focusRingExpand {
    from {
        box-shadow: 0 0 0 0 rgba(109, 94, 246, 0.4);
    }
    to {
        box-shadow: 0 0 0 4px rgba(109, 94, 246, 0);
    }
}
```

---

## Print Styles

For printing analytics and task lists:

```css
/* ===== Print Styles ===== */
@media print {
    /* Hide non-essential UI */
    .site-header,
    .header-nav,
    .toast-container,
    .modal-backdrop,
    .btn-cta,
    .energy-selector {
        display: none !important;
    }

    /* Reset backgrounds for ink saving */
    body,
    .page-surface,
    .panel {
        background: white !important;
        color: black !important;
    }

    /* Ensure text is readable */
    * {
        color: black !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }

    /* Keep impact colors for task priority */
    .task-row::before {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }

    /* Expand all collapsed sections */
    .project-group.collapsed .project-tasks {
        display: block !important;
    }

    /* Page breaks */
    .panel {
        break-inside: avoid;
    }

    .chart-panel {
        break-inside: avoid;
        page-break-inside: avoid;
    }

    /* Hide interactive elements */
    .row-actions,
    .icon-btn,
    .toggle {
        display: none !important;
    }

    /* URL display for links */
    a[href]::after {
        content: " (" attr(href) ")";
        font-size: 0.8em;
        color: #666;
    }

    a[href^="javascript:"]::after,
    a[href^="#"]::after {
        content: "";
    }
}
```

---

## Template Update Sequence

When migrating, update templates in this order to avoid broken states:

### Phase 1: Foundation (No Visual Changes)

1. **Create `tokens.css`** — New file, no impact
2. **Update `base.html`** — Add `tokens.css` import at TOP of existing CSS
3. **Test** — All pages should look identical

### Phase 2: Components (Gradual)

4. **Create component files** — New files, no impact
5. **Update `base.html`** — Add `components/index.css` import
6. **For each page:** Replace inline styles with component classes ONE PAGE AT A TIME
7. **Test after each page**

### Phase 3: Page Extraction

For each page (do ONE at a time):

```
a. Create static/css/pages/{page}.css
b. Copy inline <style> content to new file
c. Add {% block page_css %} import in template
d. Delete inline <style> block
e. Test page thoroughly
f. Commit
```

**Order:** Settings → Thoughts → Analytics → Tasks (Tasks last because most complex)

---

## CSS Bundling Strategy

For production, consider bundling to reduce HTTP requests.

### Option A: Keep Separate (Recommended for v1.0)

During development and v1.0, keep files separate for:
- Easier debugging
- Cacheable individual files
- Simpler rollback

```html
<!-- ~5-6 HTTP requests, but cacheable -->
<link rel="stylesheet" href="/static/css/tokens.css">
<link rel="stylesheet" href="/static/css/base.css">
<link rel="stylesheet" href="/static/css/components/index.css">
<link rel="stylesheet" href="/static/css/app.css">
<link rel="stylesheet" href="/static/css/pages/{{ page_name }}.css">
```

### Option B: Bundle for Production (Post-v1.0)

After v1.0 stabilizes, create build process:

```bash
# Simple concatenation (no build tool needed)
cat static/css/tokens.css \
    static/css/base.css \
    static/css/components/*.css \
    static/css/app.css \
    > static/css/bundle.css

# Minify (optional)
npx cssnano static/css/bundle.css static/css/bundle.min.css
```

**Or use GitHub Actions:**

```yaml
# .github/workflows/build-css.yml
- name: Bundle CSS
  run: |
    cat static/css/tokens.css static/css/base.css static/css/components/*.css static/css/app.css > static/css/bundle.css
```

---

## Notes for Implementation

1. **Start with tokens.css** — This is the foundation; everything else depends on it
2. **Use legacy aliases** — Keep `--dark-bg` etc. as aliases during migration to prevent breaks
3. **One page at a time** — Don't try to redesign everything at once
4. **Test after each change** — Run the app and verify nothing broke
5. **Keep inline CSS temporarily** — Extract gradually, don't delete until external CSS is verified
6. **Dark mode last** — It's an enhancement; make sure light mode works first
7. **Follow import order** — CSS specificity depends on load order (see CSS Import Order section)
8. **Capture baselines first** — Run visual regression baseline capture before ANY migration work

---

## Quick Reference: File Locations

| Purpose | File |
|---------|------|
| Design tokens | `static/css/tokens.css` |
| Button styles | `static/css/components/buttons.css` |
| Form styles | `static/css/components/forms.css` |
| Panel styles | `static/css/components/panels.css` |
| Tasks page | `static/css/pages/tasks.css` |
| Thoughts page | `static/css/pages/thoughts.css` |
| Analytics page | `static/css/pages/analytics.css` |
| Settings page | `static/css/pages/settings.css` |
| Icon sprite | `static/img/icons/ui-icons.svg` |
| Illustrations | `static/img/illustrations/*.svg` |
| Color reference | `docs/brand/COLOR-SYSTEM.md` |
| Component specs | `docs/brand/UI-KIT.md` |
| Brand guidelines | `BRAND.md` |

---

*This document is designed for iterative Claude Code sessions. Each phase can be tackled independently.*
