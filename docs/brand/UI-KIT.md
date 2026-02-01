# Whendoist UI Kit

> Complete component library specification for Whendoist. This document provides implementation details for all reusable UI components.

**Version:** 1.0
**Last Updated:** January 2026
**Status:** Phase 2D Complete

---

## Table of Contents

1. [Design Tokens](#design-tokens)
2. [Buttons](#buttons)
3. [Form Elements](#form-elements)
4. [Cards & Panels](#cards--panels)
5. [Interactive Elements](#interactive-elements)
6. [Layout Patterns](#layout-patterns)
7. [Typography Components](#typography-components)
8. [State & Feedback](#state--feedback)

---

## Design Tokens

All components use CSS custom properties from `app.css`. For the complete color system including dark mode tokens and WCAG accessibility verification, see [COLOR-SYSTEM.md](COLOR-SYSTEM.md).

### Key Color Tokens

```css
/* Primary */
--primary: #6D5EF6;
--primary-hover: #5B4CF0;

/* Semantic */
--danger: #DC2626;

/* See COLOR-SYSTEM.md for complete palette */
```

### Spacing

```css
--col-gap: 6px;          /* Column gap in grids */
--layout-gap: 1.5rem;    /* Major layout sections */
--content-padding: 3rem; /* Container padding */
```

### Transitions

```css
/* Standard */
transition: all 0.15s ease;

/* Fast feedback */
transition: all 0.1s ease;

/* Larger movements */
transition: all 0.2s ease;
```

---

## Buttons

### Button Base

All buttons share these base styles:

```css
.btn {
    all: unset;
    box-sizing: border-box;
    height: 32px;
    padding: 0 14px;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
    white-space: nowrap;
}
```

### Button Variants

#### Primary Button

Dark filled button for primary actions.

```css
.btn-primary {
    background: var(--text, #0F172A);
    color: #fff;
}

.btn-primary:hover {
    background: #0B1220;
}
```

**Usage:** Submit forms, confirm actions, primary CTAs

#### Secondary Button

Outlined button for secondary actions.

```css
.btn-secondary {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-muted);
}

.btn-secondary:hover {
    background: rgba(15, 23, 42, 0.04);
    border-color: var(--border-strong);
    color: var(--text);
}
```

**Usage:** Cancel buttons, alternative actions

#### Ghost Button

Minimal button with no border.

```css
.btn-ghost {
    background: transparent;
    color: var(--text-muted);
}

.btn-ghost:hover {
    background: rgba(15, 23, 42, 0.06);
    color: var(--text);
}
```

**Usage:** Toolbar actions, compact interfaces

#### Danger Button

Red-tinted button for destructive actions.

```css
.btn-danger {
    background: rgba(220, 38, 38, 0.08);
    border: 1px solid rgba(220, 38, 38, 0.2);
    color: var(--danger);
}

.btn-danger:hover {
    background: rgba(220, 38, 38, 0.14);
    border-color: rgba(220, 38, 38, 0.3);
}
```

**Usage:** Delete actions, irreversible operations

#### Danger Outline Button

Danger button without background.

```css
.btn-danger-outline {
    background: transparent;
    border: 1px solid rgba(220, 38, 38, 0.25);
    color: var(--danger);
}

.btn-danger-outline:hover {
    background: rgba(220, 38, 38, 0.06);
    border-color: rgba(220, 38, 38, 0.35);
}
```

**Usage:** Dangerous actions in compact spaces

#### Complete Button

Purple-tinted button for completion actions (per brand guidelines: purple for success states).

```css
.btn-complete {
    background: rgba(109, 94, 246, 0.08);
    border: 1px solid rgba(109, 94, 246, 0.25);
    color: var(--primary);
    gap: 4px;
}

.btn-complete:hover {
    background: rgba(109, 94, 246, 0.14);
    border-color: rgba(109, 94, 246, 0.35);
}

/* Completed state - darker purple for emphasis */
.btn-complete.is-completed {
    background: rgba(109, 94, 246, 0.12);
    border-color: rgba(109, 94, 246, 0.35);
    color: #5B4CF0;
}
```

**Usage:** Task completion toggles

### Wizard Buttons (Modern)

Used in onboarding and landing pages with glassmorphism.

#### Wizard Primary Button

```css
.wizard-btn-primary {
    height: 52px;
    padding: 0 28px;
    min-width: 130px;

    background: var(--gradient-primary);
    color: #fff;
    border: none;
    border-radius: 12px;

    font-size: 0.9rem;
    font-weight: 600;

    box-shadow:
        0 2px 8px rgba(109, 94, 246, 0.25),
        0 4px 16px rgba(109, 94, 246, 0.20),
        0 8px 24px rgba(109, 94, 246, 0.12);
}

.wizard-btn-primary:hover {
    background: var(--gradient-primary-hover);
    transform: translateY(-1px);
}

/* Desktop: smaller */
@media (min-width: 600px) {
    .wizard-btn-primary {
        height: 46px;
        font-size: 0.85rem;
    }
}
```

**Usage:** Primary CTAs in wizards, landing pages

#### Wizard Secondary Button

```css
.wizard-btn-secondary {
    height: 52px;
    padding: 0 26px;

    background: var(--glass-bg);
    backdrop-filter: blur(8px);
    color: var(--text-muted);
    border: 1px solid var(--glass-border);
    border-radius: 12px;
    box-shadow: var(--shadow-sm);
}
```

**Usage:** Back buttons, skip actions in wizards

#### Wizard Ghost Button

```css
.wizard-btn-ghost {
    background: transparent;
    border: none;
    color: var(--text-muted);
    text-decoration: underline;
    text-underline-offset: 3px;

    padding: 12px 16px;
    margin: -12px -16px;  /* Expand touch target */
}
```

**Usage:** Skip links, tertiary actions

### Icon Buttons

Square buttons containing only an icon.

```css
.icon-btn {
    all: unset;
    box-sizing: border-box;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    border: 1px solid var(--border-hair);
    background: rgba(255, 255, 255, 0.85);
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
}

/* Edit variant */
.icon-btn.edit:hover {
    border-color: rgba(109, 94, 246, 0.35);
    background: rgba(109, 94, 246, 0.08);
    color: var(--primary);
}

/* Delete variant */
.icon-btn.delete:hover {
    border-color: rgba(220, 38, 38, 0.25);
    background: rgba(220, 38, 38, 0.06);
    color: var(--danger);
}
```

**Usage:** Row actions (edit, delete), compact interfaces

---

## Form Elements

### Text Input

Standard single-line input field.

```css
.input {
    height: 36px;
    border-radius: 6px;
    border: 1px solid var(--border);
    padding: 0 10px;
    background: #fff;
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--text);
    margin: 0;
}

.input:hover {
    border-color: var(--border-strong);
}

/* Focus with drop-shadow (not clipped by overflow) */
.input:focus {
    border-color: rgba(99, 102, 241, 0.5) !important;
    box-shadow: none !important;
    outline: none !important;
    filter: drop-shadow(0 0 4px rgba(99, 102, 241, 0.4)) !important;
    position: relative;
    z-index: 1;
}

.input::placeholder {
    color: var(--text-faint);
}
```

**Note:** The `filter: drop-shadow()` technique is required because `box-shadow` gets clipped by `overflow-y: auto` containers.

### Wizard Input (Touch-Friendly)

Larger input for mobile and wizard contexts.

```css
.wizard-input {
    width: 100%;
    height: 52px;
    padding: 0 16px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--light-bg);
    font-size: 16px;  /* Prevents iOS zoom */
}

@media (min-width: 600px) {
    .wizard-input {
        height: 44px;
        padding: 0 14px;
    }
}
```

### Textarea (Capture Description)

Auto-growing textarea with modern field-sizing.

```css
.capture-desc {
    min-height: 44px;
    max-height: 200px;
    resize: none;
    font-size: 0.9rem;
    font-weight: 500;
    line-height: 1.5;
    padding: 12px 15px;
    overflow-y: auto;
    field-sizing: content;  /* Grows with content */
}
```

### Capture Stack (Joined Input + Textarea)

Title and description in one visual container.

```css
.capture-stack {
    border: 1px solid var(--border);
    border-radius: 14px;
    background: #fff;
    overflow: hidden;
}

.capture-stack:focus-within {
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.18);
    border-color: rgba(99, 102, 241, 0.55);
}

.capture-field {
    width: 100%;
    border: 0;
    outline: 0;
    background: transparent;
    padding: 16px 18px;
}

.capture-divider {
    height: 1px;
    background: var(--border-hair);
    margin: 0 18px;
}
```

### Segmented Control

Radio-button-like selection with visual segments.

```css
.segmented {
    background: var(--light-bg);
    border: 1px solid var(--border);
    border-radius: 6px;
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
    color: var(--text-muted);
    cursor: pointer;
}

.seg-btn:hover {
    background: rgba(15, 23, 42, 0.04);
    color: var(--text);
}

.seg-btn.is-active {
    background: rgba(15, 23, 42, 0.06);
    color: var(--text);
}
```

#### Impact Colored Segments

```css
.seg-btn[data-impact="1"] { color: var(--impact-high); }
.seg-btn[data-impact="2"] { color: var(--impact-medium); }
.seg-btn[data-impact="3"] { color: var(--impact-low); }
.seg-btn[data-impact="4"] { color: var(--impact-min); }
```

#### Clarity Colored Segments

```css
.seg-btn[data-clarity="executable"] { color: var(--executable-color); }
.seg-btn[data-clarity="defined"] { color: var(--defined-color); }
.seg-btn[data-clarity="exploratory"] { color: var(--exploratory-color); }
```

### Toggle Switch

Compact on/off toggle.

```css
.option-toggle {
    position: relative;
    width: 32px;
    height: 18px;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
}

.toggle-track {
    display: block;
    width: 100%;
    height: 100%;
    background: rgba(15, 23, 42, 0.15);
    border-radius: 9px;
    transition: background 0.15s ease;
}

.option-toggle.active .toggle-track {
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
    transition: transform 0.15s ease;
}

.option-toggle.active .toggle-thumb {
    transform: translateX(14px);
}
```

### Checkbox (Wizard Style)

Touch-friendly checkbox for mobile contexts.

```css
.wizard-checkbox {
    width: 24px;
    height: 24px;
    min-width: 24px;
    border: 2px solid var(--border);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.wizard-checkbox.checked {
    background: var(--primary);
    border-color: var(--primary);
}

.wizard-checkbox.checked::after {
    content: "\2713";
    color: #fff;
    font-size: 0.8rem;
    font-weight: 700;
}

/* Desktop: smaller */
@media (min-width: 600px) {
    .wizard-checkbox {
        width: 20px;
        height: 20px;
        border-radius: 4px;
    }
    .wizard-checkbox.checked::after {
        font-size: 0.7rem;
    }
}
```

### Day Button (Recurrence Picker)

Day-of-week toggle buttons.

```css
.day-btn {
    all: unset;
    box-sizing: border-box;
    width: 28px;
    height: 28px;
    border-radius: 5px;
    border: 1px solid var(--border);
    background: #fff;
    font-size: 0.6rem;
    font-weight: 650;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
}

/* Weekend styling */
.day-btn[data-day="SA"],
.day-btn[data-day="SU"] {
    color: var(--text-faint);
}

.day-btn.is-active {
    background: var(--text);
    border-color: var(--text);
    color: #fff;
}
```

---

## Cards & Panels

### Settings Panel

Standard panel used in Settings page.

```css
.settings-panel {
    background: var(--light-bg);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
}

.settings-panel__hd {
    background: var(--grey-bg);
    border-bottom: 1px solid var(--border-hair);
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
    color: var(--text-muted);
    margin: 0 0 4px 0;
}

.panel-desc {
    font-size: 0.72rem;
    color: var(--text-faint);
    line-height: 1.4;
    margin: 0;
}
```

### Modal Section

Grouped section within modals.

```css
.modal-section {
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: visible;
    background: var(--light-bg);
    margin-bottom: 10px;
}

.section-title {
    background: var(--grey-bg);
    border-bottom: 1px solid var(--border-hair);
    padding: 10px 14px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(15, 23, 42, 0.50);
}
```

### Wizard Card (Glassmorphism)

Modern glass-effect card for wizards.

```css
.wizard-card {
    background: var(--glass-bg-strong);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--glass-border);
    border-radius: 14px;
    padding: 16px;
    box-shadow: var(--shadow-card);
}

@media (min-width: 600px) {
    .wizard-card {
        padding: 18px;
    }
}
```

### Page Surface

Full-width content container for pages.

```css
.page-surface {
    width: 100%;
    max-width: 1100px;
    background: var(--grey-bg);
    border: 1px solid var(--border-hair);
    border-radius: 12px;
    padding: 32px 36px 44px;
}
```

---

## Interactive Elements

### Settings Row

Standard row in settings panels with hover reveal actions.

```css
.settings-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border-hair);
    background: var(--light-bg);
    min-height: 44px;
}

.settings-row:last-child {
    border-bottom: none;
}

.settings-row:hover {
    background: var(--row-hover);
}

/* Actions hidden until hover */
.row-actions {
    margin-left: auto;
    display: flex;
    gap: 8px;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.12s ease;
}

.settings-row:hover .row-actions {
    opacity: 1;
    pointer-events: auto;
}
```

### Detail Row (Modal)

Label + control pair in modals.

```css
.detail-row {
    display: grid;
    grid-template-columns: 72px 1fr;
    align-items: center;
    gap: 10px;
    padding: 7px 14px;
    border-bottom: 1px solid var(--border-hair);
}

.detail-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--text-faint);
}

.detail-control {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
}
```

### Wizard Option (Selectable Row)

Touch-friendly selectable option.

```css
.wizard-option {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 56px;
    padding: 12px 14px;
    background: var(--light-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.15s ease;
}

.wizard-option:active {
    transform: scale(0.98);
    background: var(--row-hover);
}

.wizard-option.selected {
    border-color: var(--primary);
    background: rgba(109, 94, 246, 0.04);
}

@media (min-width: 600px) {
    .wizard-option {
        min-height: 48px;
    }
    .wizard-option:hover {
        background: var(--row-hover);
        border-color: var(--border-strong);
    }
    .wizard-option:active {
        transform: none;
    }
}
```

### Domain Dropdown

Upward-opening dropdown for domain selection.

```css
.domain-dropdown {
    position: relative;
}

.domain-dropdown-btn {
    all: unset;
    box-sizing: border-box;
    height: 32px;
    padding: 0 10px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: #fff;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

.domain-dropdown-menu {
    position: absolute;
    bottom: 100%;
    left: 0;
    margin-bottom: 4px;
    min-width: 160px;
    max-height: 200px;
    overflow-y: auto;
    background: #fff;
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
    padding: 4px;
    display: none;
    z-index: 10;
}

.domain-dropdown.is-open .domain-dropdown-menu {
    display: block;
}
```

### Progress Dots (Wizard)

Step progress indicator.

```css
.wizard-progress {
    display: flex;
    justify-content: center;
    gap: 10px;
}

.wizard-progress-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--border);
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.wizard-progress-dot.completed {
    background: var(--primary);
}

.wizard-progress-dot.current {
    background: var(--primary);
    box-shadow: 0 0 0 3px rgba(109, 94, 246, 0.2);
}

.wizard-progress-dot.optional {
    border: 2px solid var(--border);
    background: transparent;
}

@media (min-width: 600px) {
    .wizard-progress {
        gap: 8px;
    }
    .wizard-progress-dot {
        width: 6px;
        height: 6px;
    }
}
```

---

## Layout Patterns

### Two-Column Grid

Used in Settings page.

```css
.settings-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
}

@media (max-width: 900px) {
    .settings-grid {
        grid-template-columns: 1fr;
    }
}
```

### Form Grid (2-Column Fields)

Side-by-side form fields.

```css
.form-grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    overflow: visible;
}

.form-field {
    padding: 10px 14px;
    border-bottom: 1px solid var(--border-hair);
}

.form-grid-2 .form-field {
    border-right: 1px solid var(--border-hair);
}

.form-grid-2 .form-field:last-child {
    border-right: 0;
}

@media (max-width: 640px) {
    .form-grid-2 {
        grid-template-columns: 1fr;
    }
    .form-grid-2 .form-field {
        border-right: 0;
    }
}
```

### Joined Controls

Multiple inputs styled as one.

```css
.field-controls {
    display: grid;
    grid-template-columns: 1fr 100px;
    gap: 0;
}

.field-controls > .input:first-child {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
}

.field-controls > .input:last-child {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    margin-left: -1px;
}
```

---

## Typography Components

### Page Title

```css
.settings-title {
    margin: 0 0 28px 0;
    text-transform: uppercase;
    letter-spacing: 0.10em;
    font-weight: 700;
    font-size: 1.5rem;
    line-height: 1;
    color: var(--text);
}
```

### Panel Title

```css
.panel-title {
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-weight: 700;
    font-size: 0.62rem;
    color: var(--text-muted);
}
```

### Field Label

```css
.field-label {
    font-size: 0.55rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-faint);
    margin-bottom: 8px;
}
```

### Keycap Hint

Keyboard shortcut indicator.

```css
.keycap {
    height: 22px;
    padding: 0 10px;
    border-radius: 6px;
    background: #fff;
    border: 1px solid var(--border-hair);
    font-weight: 800;
    letter-spacing: 0.14em;
    font-size: 0.62rem;
    text-transform: uppercase;
}
```

---

## State & Feedback

### Status Dot

Connection status indicator.

```css
.status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-faint);
}

/* Purple for connected state (per brand: purple for success, not green) */
.status-dot.connected {
    background: var(--primary);  /* #6D5EF6 */
}
```

### Provider Row (Integration Status)

```css
.provider-icon {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--grey-bg);
    border: 1px solid var(--border-hair);
    border-radius: 6px;
}

.provider-name {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text);
}

.provider-status {
    font-size: 0.7rem;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    gap: 5px;
}
```

### Password Strength Meter

**Note:** This is a documented exception to the "purple for success" rule. Password strength meters use the industry-standard red→yellow→green color progression that users universally expect. Using purple here would confuse users.

```css
.wizard-strength-bar {
    flex: 1;
    height: 4px;
    background: var(--border);
    border-radius: 2px;
    overflow: hidden;
}

.wizard-strength-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.2s ease, background 0.2s ease;
}

/* Exception: Password strength uses industry-standard colors */
.wizard-strength-fill.weak { width: 25%; background: #DC2626; }
.wizard-strength-fill.fair { width: 50%; background: #F59E0B; }
.wizard-strength-fill.good { width: 75%; background: #10B981; }
.wizard-strength-fill.strong { width: 100%; background: #059669; }
```

### Disabled Panel State

```css
.settings-panel--disabled .settings-panel__bd {
    opacity: 0.5;
    pointer-events: none;
}

.panel-disabled-notice {
    padding: 12px 16px;
    font-size: 0.75rem;
    color: var(--text-muted);
    background: rgba(15, 23, 42, 0.02);
    border-bottom: 1px solid var(--border-hair);
}
```

---

## Best Practices

### Touch Targets

- Minimum touch target: **44px** on mobile
- Use negative margins to expand clickable area without affecting layout:
  ```css
  padding: 12px 16px;
  margin: -12px -16px;
  ```

### Focus States

- Always use `filter: drop-shadow()` instead of `box-shadow` when the element is inside a scrolling container
- Include `!important` when overriding Pico CSS defaults

### Hover vs Active

- Desktop: Use `:hover` for state changes
- Mobile: Use `:active` with `transform: scale(0.98)` for feedback
- Wrap hover-specific styles in `@media (min-width: 600px)` or `@media (hover: hover)`

### Color Usage

- **Purple for success states** — Use `var(--primary)` for completed/connected/success, not green
- **Green exceptions:**
  - Password strength meters (industry standard that users universally expect)
  - Third-party brand icons (Google, Todoist, etc.)
- **Impact colors for priority** — P1-P4 have specific colors; don't repurpose

> **Brand Rule:** Green (`#10B981`, `#16a34a`) is NEVER used for Whendoist success states.
> All completion, connection, and success UI uses purple (`#6D5EF6`). See BRAND.md for rationale.

---

## Dark Mode Considerations

When implementing dark mode for UI components, follow these guidelines:

### Token Mapping

Components should use semantic tokens that automatically adapt:

| Light Mode Token | Dark Mode Value |
|-----------------|-----------------|
| `--light-bg` | `--slate-800` (#1E293B) |
| `--grey-bg` | `--slate-900` (#0F172A) |
| `--dark-bg` | `--slate-950` (#020617) |
| `--text` | `--slate-50` (#F8FAFC) |
| `--text-muted` | `rgba(248, 250, 252, 0.72)` |
| `--border` | `rgba(248, 250, 252, 0.10)` |
| `--glass-bg` | `rgba(15, 23, 42, 0.85)` |
| `--glass-border` | `rgba(248, 250, 252, 0.08)` |

### Tint Backgrounds (Clarity Colors)

Tint backgrounds need different opacities in dark mode:

```css
/* Light mode */
--executable-tint: #EAF2FF;
--defined-tint: #EFEEFF;
--exploratory-tint: #F3ECFA;

/* Dark mode */
[data-theme="dark"] {
    --executable-tint: rgba(22, 123, 255, 0.15);
    --defined-tint: rgba(109, 94, 246, 0.15);
    --exploratory-tint: rgba(160, 32, 192, 0.15);
}
```

### Button Adjustments

Primary buttons may need lighter variants in dark mode for sufficient contrast:

```css
[data-theme="dark"] {
    --primary: #8B7CF7;        /* Lighter purple */
    --primary-hover: #9D8FF8;
}
```

### Glass Effects

Glass effects should invert for dark backgrounds:

```css
[data-theme="dark"] {
    --glass-bg: rgba(15, 23, 42, 0.75);
    --glass-bg-strong: rgba(15, 23, 42, 0.88);
    --glass-border: rgba(248, 250, 252, 0.08);
}
```

See `docs/brand/COLOR-SYSTEM.md` for complete dark mode token definitions.

---

*Part of the Whendoist Brand System. See [BRAND.md](/BRAND.md) for design principles and [COLOR-SYSTEM.md](COLOR-SYSTEM.md) for color tokens.*
