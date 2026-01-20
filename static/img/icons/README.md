# Whendoist Icon System

> A brand-cohesive icon system with **107 icons** across three tiers: Base, Colored, and Tinted.

## Three-Tier Architecture

| Tier | Purpose | Style | Use Case |
|------|---------|-------|----------|
| **Base** | Functional UI | Stroke-only, `currentColor` | Buttons, navigation, standard UI |
| **Colored** | Semantic meaning | Stroke with brand colors | Success, warning, error states |
| **Tinted** | Decorative/emotional | Filled with tinted backgrounds | Empty states, modals, 32px+ |

## Quick Start

```html
<!-- Base icon (adapts to context) -->
<svg class="icon" width="20" height="20">
  <use href="/static/img/icons/ui-icons.svg#check"/>
</svg>

<!-- Colored variant (pre-colored) -->
<svg class="icon" width="20" height="20">
  <use href="/static/img/icons/ui-icons.svg#check-purple"/>
</svg>

<!-- Tinted decorative (use at 32px+) -->
<svg class="icon" width="48" height="48">
  <use href="/static/img/icons/ui-icons.svg#check-circle-tinted"/>
</svg>
```

## Whendoist Signature Icons

Unique icons embodying the brand identity:

| Icon | Description |
|------|-------------|
| `clarity-mode` | Three bars in clarity colors (Blue/Purple/Magenta) |
| `when` | Calendar + clock — "when do I do this?" |
| `domain` | Folder with W-inspired accent |
| `w-icon` | The W brand mark |

## Semantic Colors

| Color | Hex | Meaning | Examples |
|-------|-----|---------|----------|
| Purple | `#6D5EF6` | Success/completion | `check-purple`, `shield-check-purple` |
| Blue | `#167BFF` | Action/time | `clock-blue`, `energy-blue` |
| Magenta | `#A020C0` | Exploration | `lightbulb-magenta`, `calendar-magenta` |
| Orange | `#F97316` | Warning | `alert-circle-orange` |
| Red | `#DC2626` | Error | `x-circle-red` |

## Standard Sizes

| Size | Use Case |
|------|----------|
| 12px | Inline with small text |
| 16px | Buttons, chips |
| 20px | Standard UI (default) |
| 24px | Headers, emphasis |
| 32px+ | Tinted decorative icons |

## Categories

- **Whendoist Signature** — Brand-specific icons
- **Semantic Colored** — Pre-colored variants
- **Tinted Decorative** — Icons with backgrounds
- **Actions** — edit, delete, copy, download, etc.
- **Navigation** — menu, chevrons, arrows, etc.
- **Objects** — calendar, clock, task, folder, etc.
- **Status** — spinner, check-circle, alert, etc.
- **Features** — energy, thought, analytics, etc.
- **Miscellaneous** — eye, bell, sun, moon, etc.

## Style Guide

All base icons follow these specifications:

```
ViewBox:      0 0 24 24
Stroke Width: 2px
Stroke Caps:  round
Stroke Joins: round
Fill:         none
Color:        currentColor
```

## Interactive Reference

Open `docs/brand/icon-reference.html` for the complete interactive reference with:
- Visual gallery of all icons
- Click-to-copy functionality
- Multiple export formats (inline, sprite, CSS)
- Category filtering

## Files

| File | Description |
|------|-------------|
| `ui-icons.svg` | SVG sprite with all icons |
| `README.md` | This documentation |
