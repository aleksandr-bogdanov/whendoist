# Whendoist Design System

> **Scope:** This design system documents the **Tasks space** UI patterns established in v0.5. The Thoughts space and Settings space will be aligned to these patterns in future releases.

## App Overview

**Whendoist** is a task management and day planning application that combines:
- Task list with domains (projects/categories)
- Day calendar with hourly time slots
- Energy-based task filtering (Zombie/Normal/Focus modes)
- Drag-and-drop scheduling
- Google Calendar integration

### Application Spaces

| Space | Purpose | Design Status |
|-------|---------|---------------|
| **Tasks** | Day planning with task list and calendar | v0.5 (this document) |
| **Thoughts** | Quick capture and brain dump | Planned |
| **Settings** | Account and calendar configuration | Planned |

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Domains** | Project/category containers for tasks (e.g., "Work", "Personal") |
| **Clarity** | Task readiness level: Executable, Defined, Exploratory |
| **Impact** | Priority: P1 (highest) to P4 (lowest) |
| **Energy Mode** | Filters tasks by clarity based on user's current energy level |
| **Anytime Tasks** | Tasks scheduled for a date but no specific time |

---

## Design Philosophy

### Enterprise Aesthetic
- **Tint-based interactions** — hover/active states use subtle color tints, not shadows
- **Shadows for overlays only** — modals, popovers, toasts, floating buttons
- **Single color signal per row** — impact owns the row (rail + wash), chips are neutral
- **Calm hierarchy** — muted colors, minimal visual noise, clear information architecture

### Visual Grammar
- **Impact rail** — 2px colored left border on all task rows (list, calendar, anytime)
- **Grid columns** — task metadata in fixed-width, aligned columns
- **Inset dividers** — row separators start after the rail, not cutting through it
- **Neutral hover** — slate tint on hover, purple reserved for selection

---

## Color Palette

### Background Layers (Tailwind Slate Scale)

```css
--dark-bg: #F8FAFC;      /* slate-50: canvas, app chrome, headers */
--grey-bg: #F1F5F9;      /* slate-100: panels, columns, secondary areas */
--light-bg: #FFFFFF;     /* card surfaces, primary content */
--elevated-bg: #FFFFFF;  /* modals, popovers, tooltips */
```

**Layer Hierarchy:**
- `dark-bg` → Outermost (page canvas, structural chrome)
- `grey-bg` → Panels, domain headers, anytime tray, adjacent day slots
- `light-bg` → Cards, task items, calendar hour grid, nav selector

### Text Colors

```css
--text: #0B1220;                    /* Primary text - near black */
--text-muted: rgba(15, 23, 42, 0.64);  /* Secondary text */
--text-faint: rgba(15, 23, 42, 0.46);  /* Tertiary/hint text */
```

### Brand / Primary

```css
--primary: #6D5EF6;      /* Digital lavender - main brand color */
--primary-hover: #5B4CF0;
--primary-tint: #E9E7FF; /* Light lavender background */
```

### Clarity Colors (Mode Mapping)

| Clarity | Color | Tint | Energy Mode |
|---------|-------|------|-------------|
| Executable | `#167BFF` | `#EAF2FF` | Zombie (low energy) |
| Defined | `#6D5EF6` | `#EFEEFF` | Normal |
| Exploratory | `#A020C0` | `#F3ECFA` | Focus (high energy) |

### Impact Colors (Priority Levels)

| Impact | Label | Rail Color | Row Wash |
|--------|-------|------------|----------|
| P1 | High | `#E8A0A6` | `rgba(201, 80, 90, 0.03)` |
| P2 | Medium | `#B8860B` | `rgba(184, 134, 11, 0.022)` |
| P3 | Low | `#1A9160` | `rgba(26, 145, 96, 0.03)` |
| P4 | Minimal | `#6B7385` | `rgba(107, 115, 133, 0.018)` |

**Note:** Row wash values are deliberately subtle (< 0.03 alpha) for enterprise calm.

### Border System (3-Tier Hierarchy)

```css
--border-hair: rgba(15, 23, 42, 0.055);  /* Inner dividers, grid lines */
--border: rgba(15, 23, 42, 0.085);       /* Cards, inputs, chips */
--border-strong: rgba(15, 23, 42, 0.12); /* Active containers, focus */
```

### Interactive States

```css
--row-hover: rgba(15, 23, 42, 0.02);     /* Neutral slate tint */
--row-active: rgba(109, 94, 246, 0.10);  /* Purple tint for selection */
--focus-ring: rgba(109, 94, 246, 0.22);  /* Focus outline color */
```

---

## Typography

### Base Font
- **Font Family:** System default (via Pico CSS)
- **Base Size:** `15px`

### Type Scale

| Element | Size | Weight | Transform | Letter Spacing |
|---------|------|--------|-----------|----------------|
| Task title | `0.85rem` | 400 | — | — |
| Column headers | `11px` | 600 | uppercase | `0.06em` |
| Section headers | `0.7rem` | 600 | uppercase | `0.05em` |
| Meta values | `0.65rem` | 500 | — | — |
| Energy label | `0.55rem` | 600 | uppercase | `0.03em` |
| Day separator | `11px` | 600 | uppercase | `0.10em` |

---

## Layout & Spacing

### Container
```css
max-width: 1100px;
--content-padding: 3rem;
```

### Dashboard Grid
```css
grid-template-columns: 2fr 1fr;  /* Tasks : Calendar ratio */
--layout-gap: 1.5rem;
```

### Task Row Columns
```css
--col-duration: 68px;
--col-impact: 56px;
--col-clarity: 80px;
--col-gap: 12px;
--rail-w: 2px;
```

### Common Spacing

| Token | Value | Usage |
|-------|-------|-------|
| Panel gap | `1.5rem` | Between major sections |
| Row padding | `9px 12px` | Inside task rows |
| Chip gap | `12px` | Between grid columns |

---

## Components

### Task Item (Grid Layout)

```
┌──┬────────────────────────┬────────┬────────┬──────────┐
│▌ │ Task title             │  30m   │  High  │ Defined  │
│▌ │                        │        │   •    │    •     │
└──┴────────────────────────┴────────┴────────┴──────────┘
 ↑              ↑               ↑        ↑         ↑
rail    content (flex)      duration  impact   clarity
                            (68px)   (56px)    (80px)
```

- **Rail:** 2px pseudo-element, colored by impact
- **Divider:** 1px line starting after rail (inset)
- **Hover:** Neutral slate tint `rgba(15, 23, 42, 0.02)`
- **Selected:** Purple tint with purple rail

### Column Separators (Header Only)

Vertical separator lines appear only in the header row, centered in the column gaps. Task rows have clean, uninterrupted content.

### Anytime Lane (Tray Style)

```
┌─────────────────────────────────────────────────────────┐
│ ANYTIME │ ┌──────────────┐ ┌──────────────┐            │
│         │ │▌ Task name   │ │▌ Task name   │            │
│         │ └──────────────┘ └──────────────┘            │
└─────────────────────────────────────────────────────────┘
     ↑              ↑
   label     white cards with rail
```

- **Container:** Subtle grey tray with rounded corners
- **Cards:** White background with impact rail
- **Layout:** Flex wrap, gap between cards

### Calendar Hour Grid

- **Row height:** 60px desktop, 40px mobile
- **Banding:** Alternating rows with `rgba(15, 23, 42, 0.015)`
- **Major lines:** Every 2 hours with stronger border
- **Time labels:** Right-aligned, tabular-nums, 54px gutter

### Day Separator (Line + Pill)

```
────────────────── [ START OF MONDAY ] ──────────────────
```

- **Line:** 1px horizontal, extends to edges
- **Pill:** Centered label with white background, rounded
- **Spacing:** Negative margins to not consume layout space

### Scheduled Task (Calendar)

```
┌──────────────────────────────────────────┐
│▌ 09:00  Task title that might wrap to   │
│▌ 30m    multiple lines for longer...    │
└──────────────────────────────────────────┘
```

- **Position:** Absolute, sized by duration
- **Rail:** Same impact color system as list
- **Text:** Line-clamped based on available height

### Trash Bin (Drag Target)

- **Default:** Hidden, icon only
- **On drag:** Slides up from bottom center
- **On hover:** Shows "Delete" label, red tint

---

## States & Transitions

### Transition Timing
```css
transition: all 0.15s ease;  /* Standard */
transition: all 0.2s ease;   /* Larger animations */
```

### Task Row States

| State | Background | Rail | Border |
|-------|------------|------|--------|
| Default | Impact wash | Impact color | None |
| Hover | `rgba(15, 23, 42, 0.02)` | Unchanged | None |
| Selected | `rgba(109, 94, 246, 0.10)` | Primary | None |
| Dragging | `opacity: 0.5` | — | — |
| Scheduled | `opacity: 0.5` | — | Dashed |

### During Drag Operations

- All non-dragged rows lose background (transparent)
- Hover effects disabled to prevent flicker
- Ghost preview shows simplified task card

---

## Responsive Breakpoints

```css
@media (max-width: 900px), (orientation: portrait) {
    /* Mobile layout: stacked, smaller text */
}

@media (max-width: 580px) {
    /* Compact: abbreviated labels (DUR, IMP, CLR) */
}
```

### Mobile Adjustments

| Element | Desktop | Mobile |
|---------|---------|--------|
| Header height | 68px | 40px |
| Hour row height | 60px | 40px |
| Grid columns | 68/56/80px | 44/40/56px |
| Touch targets | — | Min 44px |

---

## Icons

| Icon | Usage | Type |
|------|-------|------|
| 🧟 | Zombie mode (low energy) | Emoji |
| ☕ | Normal mode | Emoji |
| 🧠 | Focus mode (high energy) | Emoji |
| ✨ | Plan My Day button | Emoji |
| ↻ | Recurring task indicator | Unicode |
| 🗑️ | Trash bin (drag to delete) | Emoji |
| ▶ | Collapse/expand arrow | Unicode |

---

## File Structure

```
static/css/
├── app.css        # Design tokens, header, nav, toast
├── dashboard.css  # Task list, calendar, drag-drop
└── dialog.css     # Task edit dialog

static/js/
├── drag-drop.js      # Drag scheduling, trash bin
├── plan-tasks.js     # Time range selection, auto-schedule
├── task-dialog.js    # Create/edit task modal
├── task-sort.js      # Column sorting
├── energy-selector.js # Energy mode toggle
├── recurrence-picker.js # Repeat pattern UI
└── toast.js          # Notification system
```

---

## Version History

| Version | Focus | Key Changes |
|---------|-------|-------------|
| v0.5 | UI Polish | Grid columns, inset dividers, tint-based states, calm enterprise aesthetic |
| v0.4 | Native Tasks | Task CRUD, recurrence, drag-to-delete |
| v0.3 | Planning | Auto-schedule, PWA, mobile |
| v0.2 | Scheduling | Drag-drop, calendar carousel |
| v0.1 | Foundation | OAuth, dashboard, energy filtering |

---

*Last updated: January 2026 (v0.5)*
