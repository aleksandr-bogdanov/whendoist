# Whendoist Brand System

> Complete brand specification for Whendoist. This document serves as the single source of truth for all brand elements, design decisions, and implementation guidelines.

**Version:** 1.1
**Last Updated:** January 2026
**Status:** Wordmark finalized, App Icon Suite complete (Phase 2A)

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

### Extended Palette

*(To be expanded in brand kit iteration)*

| Category | Colors | Status |
|----------|--------|--------|
| Neutrals | Slate scale | Use Tailwind Slate |
| Semantic | Success, Warning, Danger | Defined in DESIGN.md |
| Accent | Secondary brand colors | Pending |

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

## Iconography

*(To be developed in brand kit iteration)*

### Planned Elements

- [ ] UI icon style guide
- [ ] Feature icons
- [ ] Empty state illustrations
- [ ] Onboarding graphics

### Icon Principles

1. **Rounded corners** matching brand aesthetic
2. **2px stroke weight** for consistency
3. **Clarity colors** for semantic meaning
4. **Simple forms** over detailed illustrations

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

*(To be developed in brand kit iteration)*

### Existing Animations

From DESIGN.md:
- Transitions: `0.15s ease` (standard), `0.2s ease` (larger movements)
- Toast slide-up animation
- Drag-drop feedback

### Planned Guidelines

- [ ] Loading animations
- [ ] Micro-interactions
- [ ] Page transitions
- [ ] Celebration moments

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
└── logo.png                # Legacy wordmark

docs/brand/
├── brand-guide.html        # Visual reference (interactive)
├── png-export.html         # Complete PNG generator tool
├── wordmark-component.html
└── brand-spec.json         # Machine-readable specs
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

#### Phase 2B: Marketing Assets (Planned)
- [ ] Social media profile images
- [ ] Social media post templates
- [ ] Email header banner
- [ ] Press kit / media assets

#### Phase 2C: Color System Expansion (Planned)
- [ ] Neutral palette formalization
- [ ] Dark mode color tokens
- [ ] Accessibility verification (WCAG AA)

#### Phase 2D: UI Kit (Planned)
- [ ] Button styles documentation
- [ ] Form elements
- [ ] Card patterns
- [ ] Component library

#### Phase 2E: Illustration System (Planned)
- [ ] Empty states
- [ ] Onboarding graphics
- [ ] Feature icons
- [ ] Error illustrations

---

*This document is maintained alongside CLAUDE.md and DESIGN.md as part of the Whendoist project documentation.*
