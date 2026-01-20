# Whendoist Color System

> Complete color specification with light/dark modes and WCAG AA accessibility verification.

**Version:** 1.0
**Last Updated:** January 2026

---

## Table of Contents

1. [Neutral Palette (Slate Scale)](#neutral-palette-slate-scale)
2. [Brand Colors](#brand-colors)
3. [Semantic Colors](#semantic-colors)
4. [Light Mode Tokens](#light-mode-tokens)
5. [Dark Mode Tokens](#dark-mode-tokens)
6. [WCAG AA Accessibility](#wcag-aa-accessibility)
7. [CSS Implementation](#css-implementation)

---

## Neutral Palette (Slate Scale)

Based on Tailwind CSS Slate, optimized for enterprise readability.

| Step | Hex | RGB | Light Mode Usage | Dark Mode Usage |
|------|-----|-----|------------------|-----------------|
| **50** | `#F8FAFC` | 248, 250, 252 | Page canvas | — |
| **100** | `#F1F5F9` | 241, 245, 249 | Panels, columns | — |
| **200** | `#E2E8F0` | 226, 232, 240 | Borders, dividers | Muted text |
| **300** | `#CBD5E1` | 203, 213, 225 | Disabled states | — |
| **400** | `#94A3B8` | 148, 163, 184 | Placeholder text | Secondary text |
| **500** | `#64748B` | 100, 116, 139 | Secondary text | — |
| **600** | `#475569` | 71, 85, 105 | — | Borders |
| **700** | `#334155` | 51, 65, 85 | — | Panels, cards |
| **800** | `#1E293B` | 30, 41, 59 | — | Elevated surfaces |
| **900** | `#0F172A` | 15, 23, 42 | Primary text base | Page canvas |
| **950** | `#020617` | 2, 6, 23 | — | Deep background |

### Usage Guidelines

- **50-100:** Background layers (light mode)
- **200-300:** Borders, disabled states
- **400-500:** Secondary/muted text
- **600-700:** Dark mode surfaces
- **800-950:** Dark mode backgrounds, light mode text base

---

## Brand Colors

### Clarity Colors (W Icon / Energy Modes)

| Name | Hex | RGB | HSL | Tint |
|------|-----|-----|-----|------|
| **Executable Blue** | `#167BFF` | 22, 123, 255 | 214°, 100%, 54% | `#EAF2FF` |
| **Defined Purple** | `#6D5EF6` | 109, 94, 246 | 246°, 89%, 67% | `#EFEEFF` |
| **Exploratory Magenta** | `#A020C0` | 160, 32, 192 | 288°, 71%, 44% | `#F3ECFA` |

### Primary Brand

| Name | Hex | Usage |
|------|-----|-------|
| **Primary** | `#6D5EF6` | Buttons, links, active states |
| **Primary Hover** | `#5B4CF0` | Button hover |
| **Primary Tint** | `#E9E7FF` | Selection backgrounds |

---

## Semantic Colors

### Impact (Priority)

| Level | Name | Color | Border | Row Wash |
|-------|------|-------|--------|----------|
| **P1** | High | `#C9505A` | `#E8A0A6` | `rgba(201, 80, 90, 0.030)` |
| **P2** | Medium | `#B8860B` | `#D4A84B` | `rgba(184, 134, 11, 0.022)` |
| **P3** | Low | `#1A9160` | `#5AB88A` | `rgba(26, 145, 96, 0.030)` |
| **P4** | Minimal | `#6B7385` | `#9CA3B0` | `rgba(107, 115, 133, 0.018)` |

### Status Colors

| Name | Hex | Usage |
|------|-----|-------|
| **Danger** | `#DC2626` | Errors, delete actions |
| **Success** | `#16A34A` | Third-party icons only (per brand rules) |
| **Warning** | `#B8860B` | Caution states |
| **Info** | `#167BFF` | Informational |

**Note:** Success UI states use Purple (`#6D5EF6`), not green. Green is reserved for third-party brand icons.

---

## Light Mode Tokens

Default theme. Applied via `:root`.

```css
:root {
    /* Backgrounds */
    --bg-canvas: #F8FAFC;      /* slate-50 */
    --bg-panel: #F1F5F9;       /* slate-100 */
    --bg-surface: #FFFFFF;     /* cards, inputs */
    --bg-elevated: #FFFFFF;    /* modals, popovers */

    /* Text */
    --text-primary: #0B1220;
    --text-secondary: rgba(15, 23, 42, 0.64);
    --text-muted: rgba(15, 23, 42, 0.46);
    --text-inverse: #FFFFFF;

    /* Borders */
    --border-subtle: rgba(15, 23, 42, 0.055);
    --border-default: rgba(15, 23, 42, 0.085);
    --border-strong: rgba(15, 23, 42, 0.12);

    /* Interactive */
    --interactive-hover: rgba(109, 94, 246, 0.06);
    --interactive-active: rgba(109, 94, 246, 0.10);
    --focus-ring: rgba(109, 94, 246, 0.22);
}
```

---

## Dark Mode Tokens

Inverted theme for dark mode support.

```css
[data-theme="dark"] {
    /* Backgrounds */
    --bg-canvas: #0F172A;      /* slate-900 */
    --bg-panel: #1E293B;       /* slate-800 */
    --bg-surface: #334155;     /* slate-700 */
    --bg-elevated: #475569;    /* slate-600 */

    /* Text */
    --text-primary: #F8FAFC;   /* slate-50 */
    --text-secondary: rgba(248, 250, 252, 0.72);
    --text-muted: rgba(248, 250, 252, 0.48);
    --text-inverse: #0F172A;

    /* Borders */
    --border-subtle: rgba(248, 250, 252, 0.06);
    --border-default: rgba(248, 250, 252, 0.10);
    --border-strong: rgba(248, 250, 252, 0.16);

    /* Interactive */
    --interactive-hover: rgba(109, 94, 246, 0.12);
    --interactive-active: rgba(109, 94, 246, 0.18);
    --focus-ring: rgba(109, 94, 246, 0.32);

    /* Brand colors stay the same but with adjusted tints */
    --primary: #8B7CF7;        /* Slightly lighter for dark bg */
    --primary-hover: #9D8FF8;
    --primary-tint: rgba(109, 94, 246, 0.20);

    /* Clarity tints for dark mode */
    --executable-tint: rgba(22, 123, 255, 0.15);
    --defined-tint: rgba(109, 94, 246, 0.15);
    --exploratory-tint: rgba(160, 32, 192, 0.15);
}
```

### Dark Mode System Preference

```css
@media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
        /* Apply dark mode tokens */
    }
}
```

---

## WCAG AA Accessibility

WCAG AA requires:
- **4.5:1** contrast ratio for normal text (< 18pt)
- **3:1** contrast ratio for large text (≥ 18pt bold or ≥ 24pt)
- **3:1** contrast ratio for UI components and graphics

### Light Mode Contrast Ratios

| Combination | Ratio | AA Normal | AA Large |
|-------------|-------|-----------|----------|
| `#0B1220` on `#FFFFFF` | **17.4:1** | Pass | Pass |
| `#0B1220` on `#F8FAFC` | **16.5:1** | Pass | Pass |
| `#0B1220` on `#F1F5F9` | **15.1:1** | Pass | Pass |
| `rgba(15,23,42,0.64)` on `#FFFFFF` | **6.8:1** | Pass | Pass |
| `rgba(15,23,42,0.46)` on `#FFFFFF` | **4.1:1** | Fail | Pass |
| `#6D5EF6` on `#FFFFFF` | **4.6:1** | Pass | Pass |
| `#167BFF` on `#FFFFFF` | **3.5:1** | Fail | Pass |
| `#A020C0` on `#FFFFFF` | **5.8:1** | Pass | Pass |
| `#C9505A` on `#FFFFFF` | **4.7:1** | Pass | Pass |
| `#FFFFFF` on `#6D5EF6` | **4.6:1** | Pass | Pass |

### Dark Mode Contrast Ratios

| Combination | Ratio | AA Normal | AA Large |
|-------------|-------|-----------|----------|
| `#F8FAFC` on `#0F172A` | **16.5:1** | Pass | Pass |
| `#F8FAFC` on `#1E293B` | **12.6:1** | Pass | Pass |
| `#F8FAFC` on `#334155` | **8.5:1** | Pass | Pass |
| `rgba(248,250,252,0.72)` on `#0F172A` | **10.8:1** | Pass | Pass |
| `#8B7CF7` on `#0F172A` | **6.8:1** | Pass | Pass |
| `#8B7CF7` on `#1E293B` | **5.2:1** | Pass | Pass |

### Accessibility Notes

1. **Muted text** (`--text-muted`) fails AA for normal text but passes for large text. Use only for:
   - Labels with icons
   - Secondary metadata
   - Timestamps

2. **Executable Blue** (`#167BFF`) fails AA for normal text on white. Solutions:
   - Use only for large text/icons
   - Add underline for links
   - Use darker variant `#0066E6` for text (5.0:1)

3. **Interactive elements** must have 3:1 contrast against background. All brand colors pass this threshold.

### Accessible Color Variants

| Original | Accessible Variant | Ratio on White |
|----------|-------------------|----------------|
| `#167BFF` | `#0066E6` | 5.0:1 |
| `#6D5EF6` | `#5B4CF0` | 5.5:1 |
| `#64748B` | `#475569` | 7.0:1 |

---

## CSS Implementation

### Complete Token Set

```css
:root {
    /* ===== Neutral Palette ===== */
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

    /* ===== Brand Colors ===== */
    --blue-500: #167BFF;
    --blue-600: #0066E6;  /* Accessible variant */
    --blue-tint: #EAF2FF;

    --purple-400: #8B7CF7;  /* Dark mode primary */
    --purple-500: #6D5EF6;  /* Primary */
    --purple-600: #5B4CF0;  /* Hover */
    --purple-tint: #EFEEFF;

    --magenta-500: #A020C0;
    --magenta-tint: #F3ECFA;

    /* ===== Semantic ===== */
    --red-500: #DC2626;
    --red-600: #C9505A;  /* Impact P1 */
    --amber-600: #B8860B;  /* Impact P2 / Warning */
    --green-600: #1A9160;  /* Impact P3 */
    --green-500: #16A34A;  /* Third-party success only */

    /* ===== Theme Tokens (Light) ===== */
    --bg-canvas: var(--slate-50);
    --bg-panel: var(--slate-100);
    --bg-surface: #FFFFFF;
    --bg-elevated: #FFFFFF;

    --text-primary: #0B1220;
    --text-secondary: rgba(15, 23, 42, 0.64);
    --text-muted: rgba(15, 23, 42, 0.46);

    --border-subtle: rgba(15, 23, 42, 0.055);
    --border-default: rgba(15, 23, 42, 0.085);
    --border-strong: rgba(15, 23, 42, 0.12);

    --primary: var(--purple-500);
    --primary-hover: var(--purple-600);
    --primary-text: var(--purple-600);  /* Accessible for text */
}

/* ===== Dark Mode ===== */
[data-theme="dark"],
.dark {
    --bg-canvas: var(--slate-900);
    --bg-panel: var(--slate-800);
    --bg-surface: var(--slate-700);
    --bg-elevated: var(--slate-600);

    --text-primary: var(--slate-50);
    --text-secondary: rgba(248, 250, 252, 0.72);
    --text-muted: rgba(248, 250, 252, 0.48);

    --border-subtle: rgba(248, 250, 252, 0.06);
    --border-default: rgba(248, 250, 252, 0.10);
    --border-strong: rgba(248, 250, 252, 0.16);

    --primary: var(--purple-400);
    --primary-hover: #9D8FF8;
    --primary-text: var(--purple-400);
}

/* Auto dark mode based on system preference */
@media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
        --bg-canvas: var(--slate-900);
        --bg-panel: var(--slate-800);
        /* ... rest of dark mode tokens */
    }
}
```

### Usage Examples

```css
/* Background layers */
body { background: var(--bg-canvas); }
.panel { background: var(--bg-panel); }
.card { background: var(--bg-surface); }
.modal { background: var(--bg-elevated); }

/* Text hierarchy */
h1, h2, h3 { color: var(--text-primary); }
p { color: var(--text-secondary); }
.meta { color: var(--text-muted); }

/* Borders */
.divider { border-color: var(--border-subtle); }
.input { border-color: var(--border-default); }
.input:focus { border-color: var(--border-strong); }

/* Interactive */
.btn-primary {
    background: var(--primary);
    color: white;
}
.btn-primary:hover {
    background: var(--primary-hover);
}
.link {
    color: var(--primary-text);  /* Accessible */
}
```

---

## Migration Notes

### From Current System

The current `app.css` uses legacy token names. Migration path:

| Old Token | New Token |
|-----------|-----------|
| `--dark-bg` | `--bg-canvas` |
| `--grey-bg` | `--bg-panel` |
| `--light-bg` | `--bg-surface` |
| `--elevated-bg` | `--bg-elevated` |
| `--text` | `--text-primary` |
| `--text-muted` | `--text-secondary` |
| `--text-faint` | `--text-muted` |
| `--border-hair` | `--border-subtle` |
| `--border` | `--border-default` |
| `--border-strong` | `--border-strong` |

### Dark Mode Implementation

1. Add `data-theme` attribute to `<html>`:
   ```html
   <html data-theme="light">
   ```

2. Toggle via JavaScript:
   ```javascript
   function toggleTheme() {
       const html = document.documentElement;
       const current = html.getAttribute('data-theme');
       html.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
       localStorage.setItem('theme', html.getAttribute('data-theme'));
   }
   ```

3. Initialize from preference:
   ```javascript
   const stored = localStorage.getItem('theme');
   const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
   document.documentElement.setAttribute('data-theme', stored || preferred);
   ```

---

*Part of the Whendoist Brand System. See BRAND.md for complete brand guidelines.*
