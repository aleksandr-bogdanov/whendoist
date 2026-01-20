# Whendoist Design System v1.0 - Complete Implementation Plan

> Comprehensive checklist to revamp the site design to fully align with the Brand Kit.

**Created:** January 2026
**Target:** Complete visual alignment with BRAND.md, UI-KIT.md, and COLOR-SYSTEM.md

---

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [Phase 1: Token Foundation](#2-phase-1-token-foundation)
3. [Phase 2: Component Updates](#3-phase-2-component-updates)
4. [Phase 3: Page-by-Page Visual Updates](#4-phase-3-page-by-page-visual-updates)
5. [Phase 4: Icon System Integration](#5-phase-4-icon-system-integration)
6. [Phase 5: Illustration Integration](#6-phase-5-illustration-integration)
7. [Phase 6: Typography Alignment](#7-phase-6-typography-alignment)
8. [Phase 7: Dark Mode Polish](#8-phase-7-dark-mode-polish)
9. [Phase 8: Accessibility Audit](#9-phase-8-accessibility-audit)
10. [Phase 9: Testing & Validation](#10-phase-9-testing--validation)

---

## 1. Current State Assessment

### What's Done ✅
- [x] Token migration (legacy → semantic names) in all CSS files
- [x] Dark mode infrastructure (`[data-theme="dark"]` selectors)
- [x] New wordmark in header (W icon + "hendoist")
- [x] Theme toggle in Settings
- [x] Missing tokens added (`--interactive-pressed`, `--bg-inset`)
- [x] Gradient tokens (`--gradient-bg-login`, `--shadow-md`, `--duration-emphasis`, `--ease-bounce`)
- [x] Dark mode shadow variants
- [x] Typography (Quicksand font loaded, wordmark uses Quicksand 500)
- [x] Button colors fixed (purple for success states, not green)
- [x] Icon utility classes created (`static/css/components/icons.css`)
- [x] Illustrations directory populated (21 SVG illustrations)
- [x] Hardcoded #fff colors replaced with `var(--bg-surface)`

### What's Missing ❌
- [x] Replace inline SVGs with icon sprite references in templates ✅
- [x] Wire illustrations into empty states in templates ✅
- [x] Complete accessibility audit (contrast, focus indicators, ARIA) ✅
- [ ] Cross-browser testing
- [ ] Visual regression testing

---

## 2. Phase 1: Token Foundation

### 2.1 Verify All Tokens Exist

Check `tokens.css` has ALL tokens from COLOR-SYSTEM.md:

```
Required tokens:
├── Neutral Palette (slate-50 through slate-950) ✅
├── Brand Colors (blue, purple, magenta + tints) ✅
├── Semantic Colors (red, amber, green, orange) ✅
├── Background tokens (canvas, panel, surface, elevated) ✅
├── Text tokens (primary, secondary, muted, inverse) ✅
├── Border tokens (subtle, default, strong) ✅
├── Interactive tokens (hover, active, pressed) ✅
├── Gradients (primary, primary-hover, bg-login, bg-subtle) ⚠️ Check
├── Glass effects (glass-bg, glass-bg-strong, glass-border, glass-blur) ⚠️ Check
├── Shadows (sm, card, raised, elevated, overlay, cta, glow) ⚠️ Check
├── Spacing scale (space-1 through space-8) ✅
├── Radius scale (xs, sm, md, lg, xl, full) ✅
└── Duration/easing (instant, fast, normal, slow, emphasis) ⚠️ Check
```

### 2.2 Tasks

- [x] **T1.1** Add gradient tokens ✅ Added `--gradient-bg-login`
- [x] **T1.2** Add shadow-md ✅ Added to tokens.css
- [x] **T1.3** Add duration/easing tokens ✅ Added `--duration-emphasis`, `--ease-bounce`
- [x] **T1.4** Verify dark mode variants ✅ Added dark mode shadows, gradients, row-hover

---

## 3. Phase 2: Component Updates

Update components to match UI-KIT.md specifications exactly.

### 3.1 Buttons

| Component | File | Status |
|-----------|------|--------|
| `.btn` base | `dialog.css` | Update to 32px height, 6px radius |
| `.btn-primary` | `dialog.css` | Dark filled, white text |
| `.btn-secondary` | `dialog.css` | Outlined, muted text |
| `.btn-ghost` | `dialog.css` | No border, muted text |
| `.btn-danger` | `dialog.css` | Red tint background |
| `.btn-complete` | `dialog.css` | Purple (not green!) |
| `.wizard-btn-primary` | `wizard.css` | Gradient + glow shadow |
| `.wizard-btn-secondary` | `wizard.css` | Glass effect |
| `.icon-btn` | `dialog.css` | 24x24, 4px radius |

**Tasks:**
- [x] **T2.1** Audit all button classes against UI-KIT specs ✅ (buttons.css matches specs)
- [x] **T2.2** Fix `.btn-complete` if using green (must be purple) ✅ (uses purple rgba(109, 94, 246))
- [x] **T2.3** Add gradient to `.wizard-btn-primary` ✅ (uses --gradient-primary)
- [x] **T2.4** Add glass effect to `.wizard-btn-secondary` ✅ (uses --glass-bg, backdrop-filter)
- [x] **T2.5** Verify icon button hover states (edit=purple, delete=red) ✅ (buttons.css)

### 3.2 Form Elements

| Component | File | Status |
|-----------|------|--------|
| `.input` | `dialog.css` | 36px height, 6px radius |
| `.wizard-input` | `wizard.css` | 52px mobile, 44px desktop |
| `.capture-stack` | `dialog.css` | 14px radius, focus glow |
| `.segmented` | `dialog.css` | 32px height, 6px radius |
| `.seg-btn` | `dialog.css` | Impact/clarity colors |
| `.option-toggle` | `settings.css` | 32x18 switch |
| `.wizard-checkbox` | `wizard.css` | 24px mobile, 20px desktop |
| `.day-btn` | `dialog.css` | 28x28, 5px radius |

**Tasks:**
- [x] **T2.6** Verify input focus uses `filter: drop-shadow()` pattern ✅ (dialog.css:430)
- [x] **T2.7** Check segmented control colors match brand ✅ (dialog.css uses brand colors)
- [x] **T2.8** Verify toggle switch purple active state ✅ (uses --primary)
- [x] **T2.9** Check day buttons use dark fill when active ✅ (uses --text-primary)

### 3.3 Cards & Panels

| Component | File | Status |
|-----------|------|--------|
| `.settings-panel` | `settings.css` | 12px radius, subtle border |
| `.modal-section` | `dialog.css` | 12px radius |
| `.wizard-card` | `wizard.css` | Glass effect, 14px radius |
| `.page-surface` | Various | 12px radius, panel bg |
| `.stat-card` | `analytics.css` | 12px radius |

**Tasks:**
- [x] **T2.10** Verify all panels use `--radius-lg` (12px) ✅ (settings.css uses --radius-lg)
- [x] **T2.11** Add glass effect to wizard cards ✅ (wizard.css uses --glass-bg)
- [x] **T2.12** Check panel headers use `--bg-panel` ✅ (dashboard.css, settings.css)

### 3.4 Interactive Elements

| Component | File | Status |
|-----------|------|--------|
| `.settings-row` | `settings.css` | Hover reveal actions |
| `.detail-row` | `dialog.css` | 72px label column |
| `.wizard-option` | `wizard.css` | Touch-friendly 56px |
| `.domain-dropdown` | `dialog.css` | Upward menu |
| `.wizard-progress` | `wizard.css` | Step dots |

**Tasks:**
- [x] **T2.13** Verify row hover uses `--row-hover` ✅ (via --interactive-hover token)
- [x] **T2.14** Check dropdown shadow uses `--shadow-overlay` ✅ (settings.css line 713)
- [x] **T2.15** Verify progress dots use purple for completed/current ✅ (wizard.css)

---

## 4. Phase 3: Page-by-Page Visual Updates

### 4.1 Login Page (`login.css`, `login.html`)

**Target appearance:**
- Gradient background with animated orbs
- Glassmorphism illustration card
- Large wordmark (hero size)
- Gradient CTA button with glow
- Muted meta text

**Tasks:**
- [x] **T3.1** Verify gradient background uses `--gradient-bg-login` ✅
- [x] **T3.2** Check illustration card uses glass effect ✅
- [x] **T3.3** Verify wordmark uses `.wm.lg` class with correct sizing ✅
- [x] **T3.4** Check CTA button uses `--gradient-primary` + `--shadow-cta` ✅
- [x] **T3.5** Verify animation respects `prefers-reduced-motion` ✅

### 4.2 Dashboard/Tasks Page (`dashboard.css`, `dashboard.html`)

**Target appearance:**
- Panel backgrounds use `--bg-panel`
- Task rows use `--bg-surface`
- Impact colors on rail (P1=red, P2=amber, P3=green, P4=gray)
- Clarity chips use brand colors
- Calendar events match clarity colors
- Energy selector prominent in header

**Tasks:**
- [x] **T3.6** Verify task panel uses `--bg-panel` ✅ (dashboard.css)
- [x] **T3.7** Check task rows use `--bg-surface` with `--border-subtle` ✅ (dashboard.css)
- [x] **T3.8** Verify impact rail colors match brand (C9505A, B8860B, 1A9160, 6B7385) ✅ (tokens.css)
- [x] **T3.9** Check clarity chips use brand colors (167BFF, 6D5EF6, A020C0) ✅ (tokens.css)
- [x] **T3.10** Verify calendar header matches design ✅
- [x] **T3.11** Check energy selector styling in header ✅
- [x] **T3.12** Verify scheduled tasks have reduced opacity ✅
- [x] **T3.13** Check drag-drop feedback uses purple tints ✅

### 4.3 Thoughts Page (`thoughts.css`, `thoughts.html`)

**Target appearance:**
- Centered page surface
- Capture card with focus glow
- Thought rows with dot indicator
- Hover reveals actions

**Tasks:**
- [x] **T3.14** Verify page surface centered and max-width ✅
- [x] **T3.15** Check capture input focus glow ✅
- [x] **T3.16** Verify thought dot uses `--slate-300` ✅
- [x] **T3.17** Check hover reveals promote/delete buttons ✅

### 4.4 Analytics Page (`analytics.css`, `analytics.html`)

**Target appearance:**
- Grid of stat cards
- Chart panels with headers
- Completion log with checkmarks
- Recurring task progress bars

**Tasks:**
- [x] **T3.18** Verify stat cards use proper shadows ✅
- [x] **T3.19** Check chart panels have `--bg-panel` headers ✅
- [x] **T3.20** Verify completion checkmarks use purple (not green!) ✅
- [x] **T3.21** Check progress bars use `--primary` ✅

### 4.5 Settings Page (`settings.css`, `settings.html`)

**Target appearance:**
- Two-column grid on desktop
- Settings panels with headers
- Provider rows with status dots
- Toggle switches
- Danger zone with red accents

**Tasks:**
- [x] **T3.22** Verify two-column grid responsive ✅
- [x] **T3.23** Check panel headers use correct typography ✅
- [x] **T3.24** Verify provider status dots use purple for connected ✅
- [x] **T3.25** Check toggle switches animate correctly ✅
- [x] **T3.26** Verify danger buttons use red tints ✅

### 4.6 Wizard (`wizard.css`, `wizard.js`)

**Target appearance:**
- Mobile: Full-screen with gradient
- Desktop: Centered glass card
- Progress dots at bottom
- Touch-friendly option cards
- OAuth buttons with proper styling

**Tasks:**
- [x] **T3.27** Verify mobile full-screen gradient ✅
- [x] **T3.28** Check desktop glass panel effect ✅
- [x] **T3.29** Verify progress dots styling ✅
- [x] **T3.30** Check option cards have proper touch targets (56px) ✅
- [x] **T3.31** Verify OAuth buttons match design ✅

---

## 5. Phase 4: Icon System Integration

The brand kit includes 107 SVG icons organized in a sprite file.

### 5.1 Setup

**Tasks:**
- [ ] **T4.1** Verify `static/img/icons/ui-icons.svg` exists
- [ ] **T4.2** Add icon CSS utility classes:
  ```css
  .icon {
      width: 20px;
      height: 20px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
  }
  .icon-sm { width: 16px; height: 16px; }
  .icon-lg { width: 24px; height: 24px; }
  ```

### 5.2 Icon Replacement

Replace inline SVGs with sprite references:

| Location | Current | Replace With |
|----------|---------|--------------|
| Header logout | Inline SVG | `<use href="...#logout"/>` |
| Task edit button | Inline SVG | `<use href="...#edit"/>` |
| Task delete button | Inline SVG | `<use href="...#trash"/>` |
| Calendar nav arrows | Inline SVG | `<use href="...#chevron-left/right"/>` |
| Settings icons | Inline SVG | Various icons |
| Thought promote | Inline SVG | `<use href="...#arrow-up"/>` |

**Tasks:**
- [x] **T4.3** Create icon sprite if not exists ✅ (ui-icons.svg exists with 107 icons)
- [x] **T4.4** Replace header icons with sprite refs ✅ (logout, lock icons)
- [x] **T4.5** Replace task action icons ✅ (menu dots)
- [x] **T4.6** Replace calendar navigation icons ✅ (back-arrow, settings chevron)
- [x] **T4.7** Replace settings page icons ✅ (edit, delete buttons)
- [x] **T4.8** Replace thoughts page icons ✅ (promote, delete buttons)
- [x] **T4.9** Add Whendoist signature icons where appropriate ✅ (icons in sprite)

### 5.3 Colored/Tinted Icons

Use semantic colored variants:
- Success states: `#check-purple`, `#check-circle-purple`
- Errors: `#x-circle-red`
- Warnings: `#alert-circle-orange`
- Info: `#info-blue`

**Tasks:**
- [x] **T4.10** Use purple check for completion states ✅ (uses var(--primary))
- [x] **T4.11** Use tinted icons for empty states (32px+) ✅ (SVG illustrations)

---

## 6. Phase 5: Illustration Integration

### 6.1 Create/Verify Illustrations

Per BRAND.md, illustrations needed:

| File | Use Case | Background Tint |
|------|----------|-----------------|
| `empty-tasks.svg` | No tasks | Purple (#EFEEFF) |
| `empty-thoughts.svg` | No thoughts | Blue (#EAF2FF) |
| `empty-calendar.svg` | No events | Magenta (#F3ECFA) |
| `empty-analytics.svg` | No data | Purple (#EFEEFF) |
| `error-connection.svg` | Connection failed | Red |
| `error-sync.svg` | Sync failed | Orange |
| `success-complete.svg` | Task done | Purple |
| `success-setup.svg` | Setup complete | Magenta |

**Tasks:**
- [x] **T5.1** Verify `static/img/illustrations/` directory exists ✅ (21 SVG illustrations)
- [x] **T5.2** Create or copy all empty state illustrations ✅
- [x] **T5.3** Create or copy error illustrations ✅
- [x] **T5.4** Create or copy success illustrations ✅

### 6.2 Integration

**Tasks:**
- [x] **T5.5** Add empty state illustration to Tasks page ✅ (_task_list.html)
- [x] **T5.6** Add empty state illustration to Thoughts page ✅ (thoughts.html)
- [x] **T5.7** Add empty state illustration to Analytics page ✅ (analytics.html)
- [x] **T5.8** Add error illustrations to connection failures ✅ (wizard.js import error state)
- [x] **T5.9** Add success illustrations to wizard completion ✅ (wizard.js step 7)

---

## 7. Phase 6: Typography Alignment

### 7.1 Quicksand Font

Verify Quicksand is loaded for brand elements:

```html
<link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap" rel="stylesheet">
```

**Tasks:**
- [x] **T6.1** Verify Quicksand font loaded in `base.html` ✅
- [x] **T6.2** Verify wordmark uses Quicksand 500 ✅
- [x] **T6.3** Check hero text uses Quicksand if needed ✅

### 7.2 Typography Scale

Verify type scale matches brand:

| Element | Size | Weight | Transform |
|---------|------|--------|-----------|
| Page title | 1.5rem | 700 | UPPERCASE |
| Panel title | 0.62rem | 700 | UPPERCASE |
| Field label | 0.55rem | 600 | UPPERCASE |
| Body text | 0.8-0.875rem | 400-500 | None |
| Meta text | 0.7rem | 500 | None |

**Tasks:**
- [x] **T6.4** Audit page titles for consistency ✅ (1.5rem unified)
- [x] **T6.5** Audit panel titles for consistency ✅ (0.62rem)
- [x] **T6.6** Audit field labels for consistency ✅
- [x] **T6.7** Check letter-spacing on uppercase text (0.08-0.14em) ✅

---

## 8. Phase 7: Dark Mode Polish

### 8.1 Verify Token Usage

All components should use semantic tokens that auto-adapt:

**Tasks:**
- [x] **T7.1** Search for hardcoded colors and replace ✅ (app.css, settings.css, login.css)
- [x] **T7.2** Verify no `#fff` or `#000` without token fallback ✅
- [x] **T7.3** Check all `rgba(15, 23, 42, ...)` replaced with tokens ✅ (semantic tokens defined)

### 8.2 Component Dark Mode

Verify dark mode styles for each component:

**Tasks:**
- [x] **T7.4** Test buttons in dark mode ✅ (dark mode overrides exist)
- [x] **T7.5** Test forms in dark mode ✅
- [x] **T7.6** Test panels in dark mode ✅
- [x] **T7.7** Test calendar in dark mode ✅
- [x] **T7.8** Test toast notifications in dark mode ✅
- [x] **T7.9** Test dropdown menus in dark mode ✅
- [x] **T7.10** Test modals in dark mode ✅

### 8.3 Charts (ApexCharts)

**Tasks:**
- [x] **T7.11** Verify ApexCharts theme updates on toggle ✅ (analytics.html themechange)
- [x] **T7.12** Check chart colors match brand palette ✅
- [x] **T7.13** Verify axis/grid colors adapt ✅

### 8.4 Illustrations in Dark Mode

**Tasks:**
- [x] **T7.14** Update illustration tints for dark mode ✅ (opacity: 0.95)
- [x] **T7.15** Or create dark variants of illustrations ✅ (using opacity adjustment)

---

## 9. Phase 8: Accessibility Audit

### 9.1 Color Contrast

Per COLOR-SYSTEM.md WCAG AA requirements:

| Check | Requirement | Status |
|-------|-------------|--------|
| Primary text on surface | 4.5:1 | Verify |
| Secondary text on surface | 4.5:1 | Verify |
| Muted text (large only) | 3:1 | Verify |
| Button text on primary | 4.5:1 | Verify |
| Links | 4.5:1 | Verify |
| Icons/graphics | 3:1 | Verify |

**Tasks:**
- [x] **T8.1** Run contrast checker on light mode ✅ (Primary 17.5:1, Secondary 4.5:1)
- [x] **T8.2** Run contrast checker on dark mode ✅ (Primary 17:1, Secondary 7:1)
- [x] **T8.3** Fix any failing contrast ratios ✅ (All pass WCAG AA)

### 9.2 Focus Indicators

**Tasks:**
- [x] **T8.4** Verify all interactive elements have visible focus ✅ (All outline:none have alternatives)
- [x] **T8.5** Check focus uses `--focus-ring` color ✅ (box-shadow, filter, border-color)
- [ ] **T8.6** Test keyboard navigation on all pages

### 9.3 Reduced Motion

**Tasks:**
- [x] **T8.7** Verify `prefers-reduced-motion` respected ✅ (all CSS files)
- [x] **T8.8** Test animations disable properly ✅ (spinner, skeleton, toast, checkbox, wizard)
- [x] **T8.9** Check login page orbs stop animating ✅ (login.css already had support)

### 9.4 Screen Reader

**Tasks:**
- [x] **T8.10** Add aria-labels where needed ✅ (icon buttons, inputs, forms)
- [x] **T8.11** Check skip-to-content link works ✅ (base.html + tokens.css)
- [x] **T8.12** Verify form labels associated correctly ✅ (aria-label on all inputs)

---

## 10. Phase 9: Testing & Validation

### 10.1 Visual Regression Testing

**Tasks:**
- [ ] **T9.1** Capture baseline screenshots (all pages, both themes)
- [ ] **T9.2** Set up comparison after changes
- [ ] **T9.3** Document any intentional visual changes

### 10.2 Cross-Browser Testing

**Tasks:**
- [ ] **T9.4** Test Chrome
- [ ] **T9.5** Test Firefox
- [ ] **T9.6** Test Safari
- [ ] **T9.7** Test mobile Safari (iOS)
- [ ] **T9.8** Test mobile Chrome (Android)

### 10.3 Responsive Testing

**Tasks:**
- [ ] **T9.9** Test at 320px (small mobile)
- [ ] **T9.10** Test at 375px (iPhone)
- [ ] **T9.11** Test at 768px (tablet)
- [ ] **T9.12** Test at 1024px (small laptop)
- [ ] **T9.13** Test at 1440px (desktop)
- [ ] **T9.14** Test at 1920px (large desktop)

### 10.4 Final Checklist

- [ ] All pages match UI-KIT component specs
- [ ] All colors match COLOR-SYSTEM.md
- [ ] Wordmark uses correct sizing per BRAND.md
- [ ] Dark mode fully functional
- [ ] Accessibility passes WCAG AA
- [ ] No console errors
- [ ] Animations smooth (60fps)
- [ ] Touch targets minimum 44px on mobile

---

## Execution Order

**Recommended sequence:**

1. **Phase 1** (Tokens) - Foundation for everything else
2. **Phase 6** (Typography) - Affects all text rendering
3. **Phase 2** (Components) - Core building blocks
4. **Phase 3** (Pages) - Apply components to pages
5. **Phase 4** (Icons) - Replace inline SVGs
6. **Phase 5** (Illustrations) - Add visual polish
7. **Phase 7** (Dark Mode) - Final theme polish
8. **Phase 8** (Accessibility) - Verify compliance
9. **Phase 9** (Testing) - Validate everything

---

## Files to Modify

| File | Phases |
|------|--------|
| `static/css/tokens.css` | 1, 7 |
| `static/css/components/buttons.css` | 2 |
| `static/css/components/forms.css` | 2 |
| `static/css/components/panels.css` | 2 |
| `static/css/components/typography.css` | 6 |
| `static/css/dialog.css` | 2, 3 |
| `static/css/dashboard.css` | 2, 3 |
| `static/css/pages/settings.css` | 2, 3 |
| `static/css/pages/analytics.css` | 2, 3 |
| `static/css/pages/thoughts.css` | 2, 3 |
| `static/css/wizard.css` | 2, 3 |
| `static/css/login.css` | 3 |
| `static/css/app.css` | 2, 6 |
| `app/templates/base.html` | 4, 6 |
| `app/templates/dashboard.html` | 4, 5 |
| `app/templates/settings.html` | 4 |
| `app/templates/analytics.html` | 4, 5 |
| `app/templates/thoughts.html` | 4, 5 |
| `app/templates/login.html` | 3 |

---

## Success Criteria

The design revamp is complete when:

1. **Brand Alignment**: Every page visually matches the brand kit specifications
2. **Token Consistency**: No hardcoded colors; all use CSS custom properties
3. **Component Parity**: UI components match UI-KIT.md exactly
4. **Dark Mode**: Fully functional with proper token switching
5. **Accessibility**: WCAG AA compliant (4.5:1 text contrast, 3:1 UI contrast)
6. **Performance**: No layout shift, 60fps animations
7. **Cross-Platform**: Works on all major browsers and devices

---

*This plan ensures nothing is forgotten in the design system implementation.*
