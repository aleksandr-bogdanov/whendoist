# Whendoist Brand System

> Complete brand specification for Whendoist. This document serves as the single source of truth for all brand elements, design decisions, and implementation guidelines.

**Version:** 1.7
**Last Updated:** January 2026
**Status:** Phase 2 complete, Phase 3 cohesiveness fixes applied (green→purple, gradients documented, border radius scale, motion spec)

---

## Related Documentation

| Document | Purpose | Status |
|----------|---------|--------|
| **docs/DESIGN-IMPLEMENTATION-PLAN.md** | Implementation roadmap for integrating this brand system into the app | **PRIMARY** |
| **docs/brand/UI-KIT.md** | Interactive component specifications | Complete |
| **docs/brand/COLOR-SYSTEM.md** | Detailed color palette with tints and shades | Complete |
| **DESIGN.md** | Current (legacy) app design patterns | DEPRECATED after v1.0 |

**Note:** This brand system (BRAND.md) defines the TARGET design. DESIGN.md describes the CURRENT implementation. During the v1.0 migration, refer to both documents.

### Implementing This Brand System

This document defines **what** the brand looks like. For **how** to implement it in the app, see:

| Implementation Task | Resource |
|---------------------|----------|
| **CSS token migration** | `docs/DESIGN-IMPLEMENTATION-PLAN.md` → Phase 1 |
| **Component styling (buttons, forms, panels)** | `docs/DESIGN-IMPLEMENTATION-PLAN.md` → Phase 2 |
| **Page-by-page CSS extraction** | `docs/DESIGN-IMPLEMENTATION-PLAN.md` → Phase 3 |
| **Dark mode implementation** | `docs/DESIGN-IMPLEMENTATION-PLAN.md` → Phase 4 |
| **Icon and illustration integration** | `docs/DESIGN-IMPLEMENTATION-PLAN.md` → Phase 5 |

**Start here:** `docs/DESIGN-IMPLEMENTATION-PLAN.md` contains complete CSS token definitions, component code, visual regression testing setup, and rollback procedures.

---

## Table of Contents

1. [Brand Foundation](#brand-foundation)
2. [Logo & Wordmark](#logo--wordmark)
3. [Color System](#color-system)
4. [Typography](#typography)
5. [Iconography](#iconography)
6. [Patterns & Textures](#patterns--textures)
7. [Photography & Imagery](#photography--imagery)
8. [Motion & Animation](#motion--animation)
9. [Voice & Tone](#voice--tone)
10. [Applications](#applications)
11. [Asset Files](#asset-files)

---

## Brand Foundation

### Brand Essence

**Whendoist** answers the question: *"WHEN do I do my tasks?"*

While other tools tell you *what* to do (task lists) or *when* you're busy (calendars), Whendoist bridges the gap — helping you decide *when* to actually do your tasks.

### Core Values

| Value | Expression |
|-------|------------|
| **Clarity** | Clear visual hierarchy, no clutter |
| **Intentionality** | Every element has purpose |
| **Calm** | Muted palette, gentle interactions |
| **Trust** | Consistent, predictable behavior |

### Design Principles

1. **Similarity through roundness, separation through boldness**
   - Rounded forms create harmony across elements
   - Weight differences create clear hierarchy

2. **Tint-based interactions**
   - Hover/active states use color tints, not shadows
   - Shadows reserved for overlays only

3. **Information density without noise**
   - Dense layouts with clear visual breathing room
   - Borders and dividers, not cards with gaps

4. **Purple for success states**
   - Success/connected/check states use purple, not green
   - Green reserved for third-party brand icons only

---

## Logo & Wordmark

### Primary Wordmark

The Whendoist wordmark combines a custom **W icon** with **Quicksand typography**. The W icon serves as a functional letter, replacing the "W" in "Whendoist".

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   [W ICON]  4px  hendoist                               │
│      ↑       ↑        ↑                                 │
│   3-bar    gap    Quicksand 500                         │
│   icon            #1E293B                               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Wordmark Specifications

| Property | Value | Notes |
|----------|-------|-------|
| **Font Family** | `Quicksand` | Google Fonts |
| **Font Weight** | `500` | Medium — lighter than icon for hierarchy |
| **Text Color** | `#1E293B` | Dark Slate |
| **Gap** | `4px` | @ 6.5rem base size, scales proportionally |
| **Vertical Offset** | `12px` | Icon sits 12px above baseline @ 6.5rem |
| **Icon/Text Ratio** | `0.769` | Icon height = 77% of text height |

### Size Scale

| Size | Text | Icon W×H | Gap | Offset | Use Case |
|------|------|----------|-----|--------|----------|
| **Hero** | 6.5rem (104px) | 90×80px | 4px | 12px | Landing page, splash screens |
| **Large** | 3rem (48px) | 42×37px | 2px | 5.5px | Page headers, marketing |
| **Medium** | 1.75rem (28px) | 24×21px | 1px | 3px | Section headers, cards |
| **Small** | 1.25rem (20px) | 17×15px | 1px | 2px | Navigation, footer, mobile |

### HTML Implementation

```html
<!-- Required: Google Fonts -->
<link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500&display=swap" rel="stylesheet">

<!-- Wordmark Component (Hero size) -->
<div style="display: inline-flex; align-items: flex-end;">
  <svg viewBox="38 40 180 160" width="90" height="80" 
       style="margin-bottom: 12px; margin-right: 4px;">
    <rect x="48" y="40" width="28" height="160" rx="14" fill="#167BFF" transform="rotate(-8 62 120)"/>
    <rect x="114" y="72" width="28" height="127.3" rx="14" fill="#6D5EF6"/>
    <rect x="180" y="40" width="28" height="160" rx="14" fill="#A020C0" transform="rotate(8 194 120)"/>
  </svg>
  <span style="font-family: 'Quicksand', sans-serif; font-weight: 500; font-size: 6.5rem; color: #1E293B; line-height: 1;">hendoist</span>
</div>
```

### CSS Component

```css
/* Wordmark Base */
.wm { display: inline-flex; align-items: flex-end; }
.wm svg { flex-shrink: 0; }
.wm span { 
  font-family: 'Quicksand', sans-serif; 
  font-weight: 500; 
  color: #1E293B; 
  line-height: 1; 
}

/* Size variants */
.wm.hero svg { width: 90px; height: 80px; margin-bottom: 12px; margin-right: 4px; }
.wm.hero span { font-size: 6.5rem; }

.wm.lg svg { width: 42px; height: 37px; margin-bottom: 5.5px; margin-right: 2px; }
.wm.lg span { font-size: 3rem; }

.wm.md svg { width: 24px; height: 21px; margin-bottom: 3px; margin-right: 1px; }
.wm.md span { font-size: 1.75rem; }

.wm.sm svg { width: 17px; height: 15px; margin-bottom: 2px; margin-right: 1px; }
.wm.sm span { font-size: 1.25rem; }

/* Dark background variant */
.wm.inverse span { color: #FFFFFF; }
```

---

## W Icon

The W icon represents the three **clarity levels** through color and the letter **W** through form.

### Visual Structure

```
     ╱╲    ╱╲
    ╱  ╲  ╱  ╲
   ╱    ╲╱    ╲
  ╱      V     ╲
 │      │       │
 │      │       │
 │  B   │  P    │  M
 └──────┴───────┘

B = Blue (#167BFF) - Executable
P = Purple (#6D5EF6) - Defined  
M = Magenta (#A020C0) - Exploratory
```

### Construction Specifications

| Property | Value | Notes |
|----------|-------|-------|
| **ViewBox** | `38 40 180 160` | Optimized crop for icon-as-W alignment |
| **Bar Width** | 28px | Consistent across all three bars |
| **Outer Bar Height** | 160px | Full height bars |
| **Center Bar Height** | 127.3px | Shorter to create V-dip effect |
| **Corner Radius** | 14px | 50% of width = pill caps |
| **Rotation** | ±8° | Outer bars lean outward |
| **Rotation Origin** | Center of each bar | Blue: (62, 120), Magenta: (194, 120) |

### SVG Code

```svg
<svg viewBox="38 40 180 160" xmlns="http://www.w3.org/2000/svg">
  <!-- Blue bar (left, rotated -8°) -->
  <rect x="48" y="40" width="28" height="160" rx="14" fill="#167BFF" 
        transform="rotate(-8 62 120)"/>
  <!-- Purple bar (center, no rotation) -->
  <rect x="114" y="72" width="28" height="127.3" rx="14" fill="#6D5EF6"/>
  <!-- Magenta bar (right, rotated +8°) -->
  <rect x="180" y="40" width="28" height="160" rx="14" fill="#A020C0" 
        transform="rotate(8 194 120)"/>
</svg>
```

### Icon Variants

| Variant | Use Case | File |
|---------|----------|------|
| **Full Color** | Primary use, light backgrounds | `w-icon-color.svg` |
| **Monochrome Dark** | Light backgrounds, print, low-color contexts | `w-icon-dark.svg` |
| **Monochrome White** | Dark backgrounds, overlays | `w-icon-white.svg` |

### App Icon Suite

Complete icon set for all platforms, generated from the canonical W icon.

#### PWA & Android Icons

| Size | Purpose | File | Notes |
|------|---------|------|-------|
| 512×512 | App stores, PWA | `app-icon-512.png` | Standard icon |
| 384×384 | PWA | `app-icon-384.png` | High-DPI Android |
| 256×256 | PWA | `app-icon-256.png` | Standard Android |
| 192×192 | PWA manifest | `app-icon-192.png` | Required for PWA |

#### Maskable Icons (Android Adaptive)

Maskable icons have extra padding (content in center 80%) for adaptive icon shapes.

| Size | File | Notes |
|------|------|-------|
| 512×512 | `maskable-512.png` | Safe zone compliant |
| 384×384 | `maskable-384.png` | Safe zone compliant |
| 192×192 | `maskable-192.png` | Safe zone compliant |

SVG source: `app-icon-maskable.svg`

#### Apple Touch Icons

Apple devices require specific sizes. All use white background, no transparency.

| Size | Device | File |
|------|--------|------|
| 180×180 | iPhone 6 Plus+ | `apple-touch-icon-180.png` |
| 167×167 | iPad Pro | `apple-touch-icon-167.png` |
| 152×152 | iPad (iOS 7+) | `apple-touch-icon-152.png` |
| 120×120 | iPhone (iOS 7+) | `apple-touch-icon-120.png` |
| 76×76 | iPad (legacy) | `apple-touch-icon-76.png` |

#### Favicons

| Size | Use Case | File |
|------|----------|------|
| SVG | Modern browsers | `brand/favicon.svg` |
| 48×48 | Windows taskbar | `favicon-48.png` |
| 32×32 | Standard favicon | `favicon-32.png` |
| 16×16 | Small favicon | `favicon-16.png` |

#### Social Media & App Stores

| Dimensions | Platform | File |
|------------|----------|------|
| 1200×630 | Open Graph (Facebook, LinkedIn) | `og-image-1200x630.png` |
| 1200×600 | Twitter Card | `twitter-card-1200x600.png` |
| 1024×1024 | App Store submission | `app-store-1024.png` |

#### Generating PNG Icons

Use the PNG Export Tool at `docs/brand/png-export.html`:

1. Open in Chrome or Firefox
2. Click "Download All Icons (ZIP)" for complete set
3. Or click individual icons to download specific sizes
4. Extract to `static/img/` directory

**File naming convention:**
- PWA icons: `app-icon-{size}.png`
- Maskable: `maskable-{size}.png`
- Apple: `apple-touch-icon-{size}.png`
- Favicon: `favicon-{size}.png`

---

## Marketing Assets (Phase 2B)

Complete marketing asset suite for social media, email, and press.

### Social Media Profile Images

Square avatars for platform profiles (Twitter/X, LinkedIn, GitHub, etc.).

| Size | File | Use Case |
|------|------|----------|
| 400×400 | `profile-400.png` | High-res (Twitter, LinkedIn) |
| 200×200 | `profile-200.png` | Standard |
| 128×128 | `profile-128.png` | Small (GitHub, Discord) |
| 400×400 | `profile-dark-400.png` | Dark backgrounds |

### Social Media Post Templates

Ready-to-customize templates for announcements and features.

| Dimensions | File | Platform |
|------------|------|----------|
| 1200×1200 | `post-square-1200.png` | Instagram, Twitter |
| 1200×628 | `post-landscape-1200x628.png` | Facebook, LinkedIn |
| 1200×675 | `post-feature-1200x675.png` | Feature announcements |
| 1080×1920 | `post-story-1080x1920.png` | Stories (IG, FB) |

### Email Headers

Branded headers for transactional and marketing emails.

| Dimensions | File | Use Case |
|------------|------|----------|
| 600×200 | `email-header-600x200.png` | Standard header with gradient |
| 600×150 | `email-header-compact-600x150.png` | Compact with gradient bar |
| 600×300 | `email-banner-600x300.png` | Hero banner with tagline |

### Press Kit Assets

High-resolution assets for press and media.

| Dimensions | File | Use Case |
|------------|------|----------|
| 1200×400 | `press-logo-horizontal-1200x400.png` | Press releases, articles |
| 800×800 | `press-logo-stacked-800x800.png` | Square format |
| 1024×1024 | `press-icon-1024.png` | App store, high-res icon |
| 1200×800 | `press-colors-1200x800.png` | Brand colors reference |

### Generating Marketing Assets

Use the Marketing Export Tool at `docs/brand/marketing-export.html`:

1. Open in Chrome or Firefox
2. Wait for "Ready!" status (fonts must load)
3. Click "Download All Marketing Assets (ZIP)" for complete set
4. Or click individual assets to download specific files
5. Extract to `static/img/` directory

See `docs/brand/PRESS-KIT.md` for usage guidelines and brand rules.

---

## Color System

### Clarity Colors

The three clarity colors represent task readiness states and form the W icon.

| Name | Hex | RGB | HSL | Usage |
|------|-----|-----|-----|-------|
| **Executable Blue** | `#167BFF` | 22, 123, 255 | 214°, 100%, 54% | Ready to execute, clear next action |
| **Defined Purple** | `#6D5EF6` | 109, 94, 246 | 246°, 89%, 67% | Defined task, needs focus |
| **Exploratory Magenta** | `#A020C0` | 160, 32, 192 | 288°, 71%, 44% | Needs research or deep thinking |

### Clarity Tints

Lighter versions for backgrounds and subtle highlights.

| Name | Hex | Usage |
|------|-----|-------|
| **Executable Tint** | `#EAF2FF` | Zombie mode backgrounds |
| **Defined Tint** | `#EFEEFF` | Normal mode backgrounds |
| **Exploratory Tint** | `#F3ECFA` | Focus mode backgrounds |

### Brand Text Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| **Dark Slate** | `#1E293B` | 30, 41, 59 | Primary text, wordmark on light BG |
| **White** | `#FFFFFF` | 255, 255, 255 | Wordmark on dark BG |

### Semantic Status Colors

Colors for UI states and feedback. **Note:** Success states use purple, not green.

| Name | Hex | Usage |
|------|-----|-------|
| **Danger/Error** | `#DC2626` | Errors, delete actions, destructive operations |
| **Warning** | `#F97316` | Caution states, sync issues |
| **Info** | `#167BFF` | Informational messages (uses Executable Blue) |
| **Success** | `#6D5EF6` | Completion, connection, success (uses Defined Purple) |

> **Critical Brand Rule:** Green (`#10B981`, `#16a34a`) is reserved for:
> 1. Password strength meters (industry standard exception)
> 2. Third-party brand icons (Google, Apple, Todoist)
>
> All Whendoist success states use purple.

### Impact Colors (Priority)

| Level | Name | Color | Border | Row Wash |
|-------|------|-------|--------|----------|
| **P1** | High | `#C9505A` | `#E8A0A6` | `rgba(201, 80, 90, 0.030)` |
| **P2** | Medium | `#B8860B` | `#D4A84B` | `rgba(184, 134, 11, 0.022)` |
| **P3** | Low | `#1A9160` | `#5AB88A` | `rgba(26, 145, 96, 0.030)` |
| **P4** | Minimal | `#6B7385` | `#9CA3B0` | `rgba(107, 115, 133, 0.018)` |

### Extended Palette

Full color system documentation available in `docs/brand/COLOR-SYSTEM.md`.

| Category | Colors | Status |
|----------|--------|--------|
| Neutrals | Slate scale (50-950) | Complete |
| Semantic | Danger, Warning, Impact levels | Complete |
| Gradients & Glass | Primary gradient, glassmorphism | Complete |
| Shadows | 3-tier system (card, elevated, CTA) | Complete |
| Dark Mode | Full token set | Complete |
| Accessibility | WCAG AA verified | Complete |

**Interactive Tool:** Open `docs/brand/color-reference.html` for live color previews, contrast testing, and theme toggling.

---

## Typography

### Brand Font

**Quicksand** — A geometric sans-serif with rounded terminals.

| Property | Value |
|----------|-------|
| **Family** | Quicksand |
| **Source** | Google Fonts |
| **URL** | `https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap` |

### Why Quicksand?

1. **Rounded terminals** mirror the W icon's 14px pill caps
2. **Geometric structure** aligns with the icon's mathematical precision
3. **Light weights available** create hierarchy against bold icon
4. **Excellent readability** at all sizes
5. **Open source** and widely available

### Font Weights

| Weight | Name | Usage |
|--------|------|-------|
| 400 | Regular | Body text (if needed) |
| 500 | Medium | **Wordmark text** |
| 600 | SemiBold | Emphasis |
| 700 | Bold | Headlines (marketing) |

### Type Scale

*(App typography defined in DESIGN.md; this section covers brand/marketing typography)*

| Element | Size | Weight | Notes |
|---------|------|--------|-------|
| Hero Headline | 4rem+ | 700 | Landing page hero |
| Section Title | 2rem | 600 | Page sections |
| Body Large | 1.25rem | 400 | Feature descriptions |
| Body | 1rem | 400 | Standard text |
| Caption | 0.875rem | 500 | Labels, meta |

---

## Border Radius Scale

A systematic scale for rounded corners, derived from the W icon's pill cap ratio.

### CSS Variables

```css
:root {
    --radius-xs: 4px;   /* Icon buttons, small chips */
    --radius-sm: 6px;   /* Inputs, standard buttons, panels */
    --radius-md: 8px;   /* Dropdowns, popovers */
    --radius-lg: 12px;  /* Settings panels, modals */
    --radius-xl: 14px;  /* Wizard cards, hero elements */
    --radius-full: 9999px; /* Pills, badges, dots */
}
```

### Scale Rationale

| Size | Value | Use Case | Notes |
|------|-------|----------|-------|
| **xs** | 4px | Icon buttons, small chips | Minimal rounding |
| **sm** | 6px | Inputs, standard buttons | Default UI elements |
| **md** | 8px | Dropdowns, popovers | Moderate emphasis |
| **lg** | 12px | Panels, modals | Container elements |
| **xl** | 14px | Wizard cards, hero elements | Matches W icon pill cap (28px width × 50%) |
| **full** | 9999px | Pills, badges, status dots | Perfect circles |

### Usage Examples

```css
/* Buttons */
.btn { border-radius: var(--radius-sm); }
.icon-btn { border-radius: var(--radius-xs); }

/* Form elements */
.input { border-radius: var(--radius-sm); }
.dropdown-menu { border-radius: var(--radius-md); }

/* Containers */
.settings-panel { border-radius: var(--radius-lg); }
.wizard-card { border-radius: var(--radius-xl); }

/* Pills and badges */
.badge { border-radius: var(--radius-full); }
.status-dot { border-radius: var(--radius-full); }
```

> **Design Connection:** The `--radius-xl` value (14px) directly echoes the W icon's pill-cap corners (28px bar width × 50% = 14px radius), creating visual harmony between the brand mark and UI elements.

---

## Iconography & Illustrations

### Icon Principles

1. **Rounded corners** matching brand aesthetic (14px radius for large, scales down)
2. **2px stroke weight** for consistency (2.5px for emphasis)
3. **Clarity colors** for semantic meaning
4. **Simple geometric forms** over detailed illustrations
5. **120×120 viewBox** standard for all illustrations (5× the 24×24 icon viewBox)

### Asset Type by Size (Decision Boundary)

When choosing between icons and illustrations, use this size guide:

| Size Range | Asset Type | Examples |
|------------|------------|----------|
| **12-24px** | Base icons | Buttons, inline text, navigation |
| **24-31px** | Colored icons | Status indicators, emphasized states |
| **32-48px** | Tinted icons | Toast feedback, small empty states, inline modals |
| **64-120px** | Illustrations | Full empty states, onboarding, modal success/error |

**Why this boundary?**
- **32px** is the crossover point where tinted icons (with background circles) become visually appropriate
- Below 32px, the tinted background adds visual noise without benefit
- Above 48px, illustrations provide better emotional resonance and detail

**ViewBox Relationship:**
- UI icons: `0 0 24 24` (standard)
- Illustrations: `0 0 120 120` (5× scale, maintains proportional stroke relationships)

**Stroke Scaling:**
- UI icons: 2px stroke at 24×24
- Illustrations: 2-3px primary strokes, 1.5px details at 120×120
- The ~1.25× stroke increase compensates for larger viewing size

### Illustration System (Phase 2E)

The illustration system provides consistent, friendly graphics for empty states, errors, success moments, and onboarding.

#### Design Language

| Aspect | Specification |
|--------|--------------|
| **ViewBox** | 120×120 pixels (standard) |
| **Background** | Soft circle with clarity tint (opacity 0.5-0.6) |
| **Stroke Weight** | 2-3px for outlines, 1.5px for details |
| **Corner Radius** | Rounded (matching W icon pill caps) |
| **Colors** | Clarity palette + neutrals |

#### Color Usage in Illustrations

| Color | Hex | Usage |
|-------|-----|-------|
| **Executable Blue** | `#167BFF` | Time, search, connection success |
| **Defined Purple** | `#6D5EF6` | Primary actions, checkmarks, shields |
| **Exploratory Magenta** | `#A020C0` | Calendar, setup, creative tasks |
| **Warning Orange** | `#F97316` | Sync issues, warnings |
| **Error Red** | `#DC2626` | Errors, failures, locked states |
| **Neutral Gray** | `#C7CFDA` / `#E2E8F0` | Empty placeholders, disabled states |

#### Dark Mode Considerations for Illustrations

Illustration background tints need different values in dark mode to maintain visual harmony:

| Tint | Light Mode | Dark Mode |
|------|-----------|-----------|
| **Blue (Executable)** | `#EAF2FF` | `rgba(22, 123, 255, 0.15)` |
| **Purple (Defined)** | `#EFEEFF` | `rgba(109, 94, 246, 0.15)` |
| **Magenta (Exploratory)** | `#F3ECFA` | `rgba(160, 32, 192, 0.15)` |
| **Neutral** | `#F1F5F9` | `rgba(148, 163, 184, 0.12)` |

**Implementation Options:**

1. **CSS Variables (Recommended):** Update SVGs to use `fill="var(--blue-tint)"` with dark mode definitions
2. **Separate SVG Variants:** Maintain `-dark.svg` versions for each illustration
3. **CSS Filter:** Apply `filter: invert(1) hue-rotate(180deg)` with adjustments (not recommended)

```css
/* CSS variable approach */
:root {
    --illustration-blue-tint: #EAF2FF;
    --illustration-purple-tint: #EFEEFF;
    --illustration-magenta-tint: #F3ECFA;
}

[data-theme="dark"] {
    --illustration-blue-tint: rgba(22, 123, 255, 0.15);
    --illustration-purple-tint: rgba(109, 94, 246, 0.15);
    --illustration-magenta-tint: rgba(160, 32, 192, 0.15);
}
```

### Empty State Illustrations

| File | Description | Background Tint |
|------|-------------|-----------------|
| `empty-tasks.svg` | Clipboard with empty checkboxes | Purple (#EFEEFF) |
| `empty-thoughts.svg` | Lightbulb outline (no ideas yet) | Blue (#EAF2FF) |
| `empty-calendar.svg` | Calendar grid with no events | Magenta (#F3ECFA) |
| `empty-analytics.svg` | Bar chart with flat/no data | Purple (#EFEEFF) |
| `empty-search.svg` | Magnifying glass with question mark | Blue (#EAF2FF) |
| `empty-inbox.svg` | Open box (clean inbox) | Purple (#EFEEFF) |

### Error Illustrations

| File | Description | Primary Color |
|------|-------------|---------------|
| `error-connection.svg` | Broken chain links with X mark | Red (#DC2626) |
| `error-sync.svg` | Circular arrows with warning indicator | Orange (#F97316) |
| `error-generic.svg` | Warning triangle with exclamation | Orange/Red |
| `error-auth.svg` | Lock with X badge (access denied) | Red (#DC2626) |
| `error-calendar.svg` | Calendar with warning badge | Orange (#F97316) |

### Success Illustrations

| File | Description | Primary Color |
|------|-------------|---------------|
| `success-complete.svg` | Checkmark circle | Purple (#6D5EF6) |
| `success-allclear.svg` | Sun with rays (zero inbox feeling) | Purple (#6D5EF6) |
| `success-connected.svg` | Linked chain | Purple/Blue |
| `success-setup.svg` | Rocket launch with flames | Magenta (#A020C0) |
| `success-encrypted.svg` | Shield with lock (security enabled) | Purple (#6D5EF6) |

### Onboarding Illustrations

| File | Description | Primary Color |
|------|-------------|---------------|
| `onboarding-welcome.svg` | W icon with Hi! speech bubble | Purple (#6D5EF6) |
| `onboarding-time.svg` | Clock with clarity color hands | Blue (#167BFF) |
| `onboarding-energy.svg` | Three-bar energy visualization | All clarity colors |
| `onboarding-organize.svg` | Folder with task cards | Purple (#6D5EF6) |

### Action Illustrations

| File | Description | Primary Color |
|------|-------------|---------------|
| `import-data.svg` | Task cards flowing into container | Blue (#167BFF) |

### Usage Guidelines

#### In Empty States

```html
<div class="empty-state">
    <img src="/static/img/illustrations/empty-tasks.svg"
         alt="" width="80" height="80" aria-hidden="true">
    <p>No tasks yet</p>
    <p class="empty-hint">Create a task to get started</p>
</div>
```

#### In Error Messages

```html
<div class="error-state">
    <img src="/static/img/illustrations/error-connection.svg"
         alt="" width="64" height="64" aria-hidden="true">
    <p>Unable to connect</p>
    <button>Try again</button>
</div>
```

#### Sizing Recommendations

| Context | Size | Notes |
|---------|------|-------|
| Full-page empty state | 120×120 or 100×100 | Centered, above message |
| Panel empty state | 80×80 | Compact spaces |
| Modal/dialog | 64×64 | Error or success feedback |
| Toast notification | 32×32 | Inline with text |

### Planned Elements

- [ ] UI icon style guide (small icons for buttons/nav)
- [ ] Feature icons (calendar, task, domain, etc.)
- [ ] Loading/progress illustrations
- [ ] Achievement/milestone graphics

---

## Patterns & Textures

*(To be developed in brand kit iteration)*

### Planned Elements

- [ ] Background patterns
- [ ] Card textures
- [ ] Decorative elements
- [ ] Loading states

---

## Photography & Imagery

*(To be developed in brand kit iteration)*

### Planned Guidelines

- [ ] Photo treatment style
- [ ] Illustration style
- [ ] Screenshot presentation
- [ ] Social media imagery

---

## Motion & Animation

Motion design creates a responsive, polished experience while respecting user preferences.

### Duration Scale

```css
:root {
    /* Transition durations */
    --duration-instant: 0.1s;   /* Micro-feedback: button states, toggles */
    --duration-fast: 0.15s;     /* Standard UI: hover states, focus rings */
    --duration-normal: 0.2s;    /* Larger movements: dropdowns, panels */
    --duration-slow: 0.3s;      /* Page transitions, modals */
    --duration-emphasis: 0.4s;  /* Celebration moments, wizard transitions */
}
```

### Easing Functions

```css
:root {
    /* Easing curves */
    --ease-default: ease;                           /* General purpose */
    --ease-out: ease-out;                           /* Elements entering */
    --ease-in-out: ease-in-out;                     /* Symmetric motion */
    --ease-spring: cubic-bezier(0.4, 0, 0.2, 1);    /* Snappy, natural feel */
    --ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1); /* Playful emphasis */
}
```

### Animation Patterns

| Pattern | Duration | Easing | Use Case |
|---------|----------|--------|----------|
| **Button hover** | 0.15s | ease | State change feedback |
| **Focus ring** | 0.15s | ease | Accessibility indicator |
| **Dropdown open** | 0.2s | ease-out | Menu appearance |
| **Modal entry** | 0.3s | ease-out | Overlay appearance |
| **Toast slide-up** | 0.3s | ease-out | Notification entry |
| **Wizard step** | 0.35s | ease-out | Step transitions |
| **Progress dot** | 0.25s | spring | Completion feedback |
| **Drag feedback** | 0.1s | ease | Real-time response |

### Spinner Animation

```css
@keyframes spin {
    to { transform: rotate(360deg); }
}

.spinner {
    animation: spin 1s linear infinite;
}
```

### Reduced Motion

Always respect user preferences:

```css
@media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
    }
}
```

### Implementation Examples

```css
/* Standard button */
.btn {
    transition: all var(--duration-fast) var(--ease-default);
}

/* Dropdown menu */
.dropdown-menu {
    transition: opacity var(--duration-normal) var(--ease-out),
                transform var(--duration-normal) var(--ease-out);
}

/* Modal with scale */
.modal {
    animation: modalIn var(--duration-slow) var(--ease-out);
}

@keyframes modalIn {
    from {
        opacity: 0;
        transform: scale(0.95) translateY(10px);
    }
    to {
        opacity: 1;
        transform: scale(1) translateY(0);
    }
}
```

---

## Voice & Tone

*(To be developed in brand kit iteration)*

### Planned Elements

- [ ] Writing guidelines
- [ ] Error message patterns
- [ ] Empty state copy
- [ ] Onboarding language

### Initial Principles

1. **Clear over clever** — Prioritize understanding
2. **Encouraging** — Support user confidence
3. **Concise** — Respect user attention
4. **Consistent** — Same terms throughout

---

## Applications

### Digital Applications

| Application | Status | Notes |
|-------------|--------|-------|
| Web App | Active | Primary product |
| PWA | Active | Mobile experience |
| Marketing Site | Planned | Landing page |
| Email Templates | Planned | Transactional emails |
| Social Media | Planned | Profile images, posts |

### Wordmark Usage by Context

| Context | Size | Variant |
|---------|------|---------|
| App header (desktop) | Medium | Full color |
| App header (mobile) | Small | Full color |
| Landing page hero | Hero | Full color |
| Footer | Small | Full color or Dark |
| Favicon | — | Icon only |
| Social avatar | — | Icon only |
| Dark mode UI | Any | Inverse text |

---

## Asset Files

### Directory Structure

```
static/img/brand/           # SVG source files (canonical)
├── w-icon-color.svg        # Full color W icon
├── w-icon-dark.svg         # Monochrome dark
├── w-icon-white.svg        # Monochrome white
├── app-icon-512.svg        # Square app icon
├── app-icon-maskable.svg   # Maskable icon (safe zone)
└── favicon.svg             # Browser favicon

static/img/                 # Generated PNG files
├── app-icon-512.png        # PWA icon
├── app-icon-384.png
├── app-icon-256.png
├── app-icon-192.png
├── maskable-512.png        # Android adaptive icons
├── maskable-384.png
├── maskable-192.png
├── apple-touch-icon-180.png  # Apple devices
├── apple-touch-icon-167.png
├── apple-touch-icon-152.png
├── apple-touch-icon-120.png
├── apple-touch-icon-76.png
├── favicon-48.png          # Favicons
├── favicon-32.png
├── favicon-16.png
├── og-image-1200x630.png   # Social media
├── twitter-card-1200x600.png
├── logo.png                # Legacy wordmark
│
│   # Marketing Assets (Phase 2B)
├── profile-400.png         # Social media profile
├── profile-200.png
├── profile-128.png
├── profile-dark-400.png    # Dark background variant
├── email-header-600x200.png
├── email-header-compact-600x150.png
├── email-banner-600x300.png
├── press-logo-horizontal-1200x400.png
├── press-logo-stacked-800x800.png
└── press-icon-1024.png

static/img/illustrations/    # Illustration SVG files (Phase 2E)
├── empty-tasks.svg          # Empty task list
├── empty-thoughts.svg       # Empty thought cabinet
├── empty-calendar.svg       # Empty calendar
├── empty-analytics.svg      # No analytics data
├── empty-search.svg         # No search results
├── empty-inbox.svg          # Clean inbox
├── error-connection.svg     # Connection failed
├── error-sync.svg           # Sync failed
├── error-generic.svg        # Generic error
├── error-auth.svg           # Auth failed
├── error-calendar.svg       # Calendar sync error
├── success-complete.svg     # Task completed
├── success-allclear.svg     # All done
├── success-connected.svg    # Service connected
├── success-setup.svg        # Setup complete
├── success-encrypted.svg    # Encryption enabled
├── onboarding-welcome.svg   # Welcome screen
├── onboarding-time.svg      # Time management
├── onboarding-energy.svg    # Energy modes
├── onboarding-organize.svg  # Organization
└── import-data.svg          # Data import

docs/brand/
├── brand-guide.html           # Visual reference (interactive)
├── png-export.html            # Complete PNG generator tool (Phase 2A)
├── marketing-export.html      # Marketing assets generator (Phase 2B)
├── color-reference.html       # Interactive color system tool (Phase 2C)
├── ui-kit-reference.html      # Interactive component library (Phase 2D)
├── illustration-reference.html # Interactive illustration gallery (Phase 2E)
├── brand-verification.html    # Automated consistency checker
├── wordmark-component.html
├── brand-spec.json            # Machine-readable specs
├── PRESS-KIT.md               # Press kit documentation
├── COLOR-SYSTEM.md            # Color system specification
└── UI-KIT.md                  # Component library documentation (Phase 2D)
```

### Quick Reference

**Wordmark:**
- Font: Quicksand 500
- Color: #1E293B
- Gap: 4px @ 6.5rem
- ViewBox: 38 40 180 160

**Clarity colors:**
- Blue: #167BFF (Executable)
- Purple: #6D5EF6 (Defined)
- Magenta: #A020C0 (Exploratory)

**Tints:**
- Blue tint: #EAF2FF
- Purple tint: #EFEEFF
- Magenta tint: #F3ECFA

---

## Design Decisions Log

### January 2026

**Wordmark Gap: 4px**
- Natural letter spacing would be 4.5px (measured via ghost overlay tool)
- Chose 4px for slightly tighter feel
- Reasoning: Heavier icon "earns" being closer to text
- Creates stronger cohesion between bold icon and lighter text

**Font Choice: Quicksand**
- Evaluated 24 typefaces for icon-as-W concept
- Quicksand's rounded terminals best echo icon's pill caps
- Weight 500 provides ideal hierarchy against bold icon
- Geometric structure matches icon's mathematical precision

**ViewBox: 38 40 180 160**
- Custom crop optimized for icon-as-W alignment
- Ensures proper baseline alignment with text
- Maintains visual balance at all sizes

**Vertical Offset: 12px @ 6.5rem**
- Compensates for Quicksand's specific metrics
- Aligns icon baseline with text baseline
- Scales proportionally with size

---

## Next Steps

### Brand Kit Phase 2

#### Phase 2A: App Icon Suite (Complete)
- [x] Maskable icon SVG with safe zone
- [x] PNG export tool with all sizes
- [x] Apple touch icons (5 sizes)
- [x] PWA manifest with icon declarations
- [x] HTML meta tags (OG, Twitter Card)
- [x] Comprehensive icon documentation

#### Phase 2B: Marketing Assets (Complete)
- [x] Social media profile images (400, 200, 128px + dark variant)
- [x] Social media post templates (square, landscape, feature, story)
- [x] Email headers and banners (3 sizes)
- [x] Press kit with documentation and high-res assets
- [x] Marketing export tool (`docs/brand/marketing-export.html`)

#### Phase 2C: Color System Expansion (Complete)
- [x] Neutral palette formalization (Tailwind Slate scale)
- [x] Dark mode color tokens with theme switching
- [x] WCAG AA accessibility verification for all combinations
- [x] Interactive color reference tool (`docs/brand/color-reference.html`)
- [x] Comprehensive documentation (`docs/brand/COLOR-SYSTEM.md`)

#### Phase 2D: UI Kit (Complete)
- [x] Button styles documentation (primary, secondary, ghost, danger, complete, wizard variants)
- [x] Form elements (inputs, segmented controls, toggles, checkboxes, day buttons)
- [x] Card and panel patterns (settings panels, modal sections, wizard cards)
- [x] Component library documentation (`docs/brand/UI-KIT.md`)
- [x] Interactive reference tool (`docs/brand/ui-kit-reference.html`)

#### Phase 2E: Illustration System (Complete)
- [x] Empty state illustrations (tasks, thoughts, calendar, analytics, search, inbox)
- [x] Error illustrations (connection, sync, generic, auth, calendar)
- [x] Success illustrations (complete, allclear, connected, setup, encrypted)
- [x] Onboarding graphics (welcome, time, energy, organize)
- [x] Interactive reference tool (`docs/brand/illustration-reference.html`)

#### Phase 2F: UI Icon System (Complete)
- [x] 107 SVG icons across 10 categories
- [x] Three-tier architecture: Base, Colored, Tinted
- [x] Unique Whendoist signature icons (clarity-mode, when, domain)
- [x] Semantic colored variants using brand colors
- [x] Tinted decorative variants matching illustration style
- [x] SVG sprite file (`static/img/icons/ui-icons.svg`)
- [x] Interactive icon reference (`docs/brand/icon-reference.html`)

---

## UI Icon System

> **107 icons** across 10 categories, organized in a three-tier architecture.

### Design Philosophy

The icon system bridges functional UI needs with Whendoist brand identity through a **three-tier architecture**:

| Tier | Purpose | Style | Use Case |
|------|---------|-------|----------|
| **Base** | Functional UI | Stroke-only, `currentColor` | Buttons, navigation, standard UI |
| **Colored** | Semantic meaning | Stroke with brand colors | Success, warning, error states |
| **Tinted** | Decorative/emotional | Filled with tinted backgrounds | Empty states, modals, larger contexts |

This architecture ensures:
1. **Functional flexibility** — Base icons adapt to any context via `currentColor`
2. **Brand reinforcement** — Colored variants use the clarity color system
3. **Visual cohesion** — Tinted variants match the illustration style

### Style Specifications

All UI icons follow a consistent style for visual harmony:

| Property | Value |
|----------|-------|
| ViewBox | `0 0 24 24` |
| Stroke Width | `2px` |
| Stroke Caps | `round` (echoes W icon pill caps) |
| Stroke Joins | `round` |
| Fill | `none` (stroke-only for base icons) |
| Color | `currentColor` (inherits) |

### Icon Categories

| Category | Count | Description |
|----------|-------|-------------|
| **Whendoist Signature** | 4 | Unique brand icons: `clarity-mode`, `when`, `domain`, `w-icon` |
| **Semantic Colored** | 15 | Pre-colored using brand colors for semantic meaning |
| **Tinted Decorative** | 8 | Icons with backgrounds, matching illustration style |
| Actions | 14 | edit, delete, copy, download, refresh, undo |
| Navigation | 16 | menu, chevrons, arrows, logout, home (includes stroke variants) |
| Objects | 13 | calendar, clock, task, folder, lock, shield |
| Status | 7 | spinner, check-circle, alert, info |
| Features | 14 | energy, thought, analytics, settings, search, filter |
| Misc | 14 | eye, bell, sun, moon, cloud, database, grid |
| Third-Party Brand | 1 | google |

### Whendoist Signature Icons

Unique icons that embody the Whendoist brand identity:

| Icon | Description | Colors |
|------|-------------|--------|
| `clarity-mode` | Three horizontal bars representing clarity levels | Blue, Purple, Magenta |
| `when` | Calendar + clock representing core app concept | Stroke with embedded clock |
| `domain` | Folder with W-inspired accent bars | Blue, Purple, Magenta accents |
| `w-icon` | The W brand mark | Full clarity spectrum |

### Semantic Color Mapping

| Color | Hex | Semantic Meaning | Icons |
|-------|-----|------------------|-------|
| **Purple** | `#6D5EF6` | Success, completion, defined | `check-purple`, `check-circle-purple`, `shield-check-purple`, `task-purple`, `star-filled-purple`, `thought-purple` |
| **Blue** | `#167BFF` | Action, time, executable | `clock-blue`, `energy-blue`, `info-blue` |
| **Magenta** | `#A020C0` | Exploration, scheduling | `lightbulb-magenta`, `search-magenta`, `calendar-magenta` |
| **Orange** | `#F97316` | Warning | `alert-circle-orange`, `alert-triangle-orange` |
| **Red** | `#DC2626` | Error, danger | `x-circle-red` |

### Tinted Decorative Icons

For larger contexts (32px+), these icons include background tints matching the illustration style:

| Icon | Background Tint | Fill Color |
|------|-----------------|------------|
| `check-circle-tinted` | Purple tint (#EFEEFF) | Purple (#6D5EF6) |
| `x-circle-tinted` | Red tint (#FEE2E2) | Red (#DC2626) |
| `alert-tinted` | Orange tint (#FEF3C7) | Orange (#F97316) |
| `info-tinted` | Blue tint (#EAF2FF) | Blue (#167BFF) |
| `shield-tinted` | Purple tint (#EFEEFF) | Purple (#6D5EF6) |
| `calendar-tinted` | Magenta tint (#F3ECFA) | Magenta (#A020C0) |
| `energy-tinted` | Blue tint (#EAF2FF) | Blue (#167BFF) |
| `thought-tinted` | Purple tint (#EFEEFF) | Purple (#6D5EF6) |

### Icon Sizes

| Size | Use Case |
|------|----------|
| 12px | Inline with small text, chips |
| 16px | Buttons, table cells |
| 20px | Standard UI elements (default) |
| 24px | Headers, emphasis |
| 32px+ | Tinted decorative icons, hero sections |

### Usage Guidelines

#### When to Use Each Tier

| Scenario | Recommended Tier | Example |
|----------|-----------------|---------|
| Button icon | Base | `<use href="#edit"/>` |
| Navigation | Base | `<use href="#chevron-right"/>` |
| Success toast | Colored | `<use href="#check-purple"/>` |
| Error message | Colored | `<use href="#x-circle-red"/>` |
| Empty state | Tinted | `<use href="#check-circle-tinted"/>` at 32px+ |
| Modal success | Tinted | `<use href="#shield-tinted"/>` at 64px |
| Feature header | Whendoist Signature | `<use href="#clarity-mode"/>` |

#### Inline SVG (Base icons)

```html
<svg viewBox="0 0 24 24" width="20" height="20"
     fill="none" stroke="currentColor"
     stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="20 6 9 17 4 12"/>
</svg>
```

#### SVG Sprite Reference

```html
<!-- Base icon -->
<svg class="icon" width="20" height="20">
  <use href="/static/img/icons/ui-icons.svg#check"/>
</svg>

<!-- Colored variant (no additional attributes needed) -->
<svg class="icon" width="20" height="20">
  <use href="/static/img/icons/ui-icons.svg#check-purple"/>
</svg>

<!-- Tinted decorative (use at 32px+) -->
<svg class="icon" width="48" height="48">
  <use href="/static/img/icons/ui-icons.svg#check-circle-tinted"/>
</svg>
```

### Files

| File | Description |
|------|-------------|
| `static/img/icons/ui-icons.svg` | SVG sprite with all icons as symbols |
| `static/img/icons/README.md` | Usage documentation |
| `docs/brand/icon-reference.html` | Interactive reference with copy-to-clipboard |

---

## Phase 2 Cohesiveness Audit & Improvement Plan

> **Status:** Review completed January 2026
> **Purpose:** Identify inconsistencies and gaps across Phase 2A-2F to improve brand cohesion

---

### Executive Summary

Phase 2 delivers substantial brand assets (icons, illustrations, colors, UI components), but documentation fragmentation and principle violations undermine cohesion. The most critical issues are:

1. **Green color usage contradicts brand principle** — UI-KIT uses green despite "purple for success" rule
2. **Gradients and glass effects are undocumented** — Wizard components use variables that don't exist in any spec
3. **Color system is fragmented** — Different files define different parts of the palette
4. **Tinted icons vs. illustrations boundary is unclear** — No guidance on when to use which

---

### Critical Issues (Must Fix)

#### Issue 1: Green Color Contradiction

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

#### Issue 2: Undocumented Gradients and Glass Effects

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

#### Issue 3: Color System Fragmentation

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
1. Update BRAND.md Color System section to include ALL colors:
   - Clarity colors (existing)
   - Semantic status colors (danger, warning, info)
   - Impact colors (P1-P4)
   - Neutral slate scale reference
2. Add cross-reference: "See COLOR-SYSTEM.md for implementation details"
3. Migrate UI-KIT to use new token names (or document mapping clearly)

---

### High Priority Issues

#### Issue 4: Tinted Icons vs Illustrations Boundary

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

#### Issue 5: Rounded Corner Inconsistency

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

#### Issue 6: Dark Mode Gaps

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
1. Add dark mode variants for illustration tints:
   ```css
   [data-theme="dark"] {
       --blue-tint: rgba(22, 123, 255, 0.15);
       --purple-tint: rgba(109, 94, 246, 0.15);
       --magenta-tint: rgba(160, 32, 192, 0.15);
   }
   ```
2. Update illustration SVGs to use CSS variables or provide dark variants
3. Add dark mode section to UI-KIT.md

---

### Medium Priority Issues

#### Issue 7: Icon Count Discrepancy

**Documented:** "90+ icons"
**Actual count from icon-reference.html:** 106 icons

**Recommended Fix:** Update to "100+ icons" or give exact count

---

#### Issue 8: ViewBox Rationale Missing

**Current ViewBoxes:**
- W icon: 38 40 180 160 (custom crop)
- UI icons: 0 0 24 24 (standard)
- Illustrations: 0 0 120 120 (5× UI icons)

**Problem:** No documented rationale for the 120×120 choice or relationship to 24×24

**Recommended Fix:**
Add to Icon Principles section:
> "Illustrations use 120×120 viewBox (5× the standard icon viewBox) to provide detail while maintaining proportional stroke relationships. At this scale, 2px strokes on icons become 2-3px on illustrations."

---

#### Issue 9: Third-Party Brand Icon Gaps

**Current:** Only Google documented

**Missing:** Apple (passkeys), Todoist (import feature)

**Recommended Fix:**
Add to Third-Party Brand category:
```javascript
{ id: 'apple', paths: '...', brand: true },
{ id: 'todoist', paths: '...', brand: true }
```

---

#### Issue 10: Stroke Width Relationship Unclear

**Current:**
- UI icons: 2px stroke
- Illustrations: 2-3px outlines, 1.5px details

**Problem:** No mathematical relationship or scaling guidance

**Recommended Fix:**
Document in Illustration System section:
> "Stroke widths scale at approximately 1.25× from icons to illustrations. For consistency, use 2.5px for primary strokes and 1.5px for secondary details."

---

### Low Priority Issues

#### Issue 11: Naming Convention Inconsistencies

**Examples:**
- `success-allclear` (no hyphen between words)
- `success-complete` (consistent)
- `empty-tasks` vs `import-data` (verb vs noun)

**Recommended Fix:**
Establish naming convention:
> "Use `[state]-[noun]` pattern: `empty-tasks`, `error-connection`, `success-setup`"

---

#### Issue 12: Marketing Assets Lack Visual Spec

**Problem:** Email headers mention "gradient" but no visual spec exists

**Recommended Fix:**
Add to Marketing Assets section:
```
Email Header Gradient:
- Direction: 135deg
- Start: #6D5EF6 (Purple)
- End: #167BFF (Blue)
- Wordmark: White, centered
```

---

#### Issue 13: Animation/Motion Still "To Be Developed"

**Problem:** Phase 2F has animated spinners but no motion spec

**Recommended Fix:**
Add basic motion guidelines:
```css
/* Transition durations */
--duration-instant: 0.1s;   /* Micro-feedback */
--duration-fast: 0.15s;     /* Standard UI */
--duration-normal: 0.2s;    /* Larger movements */
--duration-slow: 0.3s;      /* Page transitions */

/* Easing */
--ease-default: ease;
--ease-spring: cubic-bezier(0.4, 0, 0.2, 1);
```

---

### Implementation Priority Order

| Phase | Items | Effort | Impact |
|-------|-------|--------|--------|
| **3A** | Fix green contradiction, document gradients/glass | Low | Critical |
| **3B** | Consolidate color system, add dark mode guidance | Medium | High |
| **3C** | Define border radius scale, icon/illustration boundary | Low | Medium |
| **3D** | Update icon count, add missing brand icons | Low | Low |
| **3E** | Naming conventions, motion spec | Low | Low |

---

### Verification Checklist

After implementing fixes, verify:

- [x] All CSS variables referenced in UI-KIT.md are defined in COLOR-SYSTEM.md
- [x] No green used for success states (except password strength)
- [x] Border radius values use defined scale variables
- [x] Dark mode tokens cover all tint backgrounds
- [x] Icon count in docs matches actual count (107 icons)
- [x] Illustrations have dark mode consideration documented

**Last verified:** Phase 3 implementation complete (January 2026)

---

### Files Requiring Updates

| File | Changes Needed |
|------|----------------|
| `BRAND.md` | Add semantic colors, border radius scale, update icon count |
| `COLOR-SYSTEM.md` | Add gradients, glass effects, shadows, row hover |
| `UI-KIT.md` | Fix green → purple, add dark mode section, migrate tokens |
| `static/img/icons/README.md` | Update icon count |

---

*This improvement plan is part of the Whendoist Brand System v1.6 audit.*

---

*This document is maintained alongside CLAUDE.md and DESIGN.md as part of the Whendoist project documentation.*
