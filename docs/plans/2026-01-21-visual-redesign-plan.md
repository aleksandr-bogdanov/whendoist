# Whendoist Visual Redesign Plan

> Complete visual refresh targeting v1.0 release. This plan covers all pages and components.

## Executive Summary

Whendoist is currently **functional but not memorable**. The infrastructure is solid (tokens, dark mode, components), but the visual design hasn't evolved beyond the initial MVP. This plan outlines targeted improvements that maximize visual impact.

**Design Goals:** Confident, Calm, Focused, Premium

**Principles:**
1. Reduce visual noise — every element earns its place
2. Increase contrast between primary and secondary content
3. Add subtle depth — shadows, overlays, layering
4. Introduce micro-interactions — polish that rewards engagement
5. Consistency over novelty — apply one pattern well, everywhere

---

## Page-by-Page Changes

### 1. Tasks Page (Dashboard)

#### Task List Header
- [ ] Move energy selector below header as horizontal pill bar (not floating in header)
- [ ] Remove sort icons until hover on column header
- [ ] Reduce header text opacity to 0.4 (from 0.6) so energy selector dominates
- [ ] Energy pills: increase size slightly (28px → 32px height)

#### Task Rows
- [ ] Increase row height from ~38px to 44px
- [ ] Add subtle inner shadow on hover: `inset 0 0 0 1px rgba(109, 94, 246, 0.15)`
- [ ] Make task title font-weight 500 → 600
- [ ] Meta columns (duration, impact, clarity): opacity 0.5 default, 1.0 on row hover
- [ ] Rail expands from 2px to 3px on hover
- [ ] Add completion pulse animation when checkbox clicked (scale 1 → 1.3 → 1, 200ms)
- [ ] Completed tasks: add gentle strikethrough animation (line draws left-to-right)

#### Calendar Panel
- [ ] Calendar events: add subtle top-to-bottom gradient (top 5% lighter)
- [ ] Round event corners more (4px → 6px)
- [ ] Scheduled tasks: use dotted left border to differentiate from calendar events
- [ ] During drag: event casts soft shadow (`0 8px 24px rgba(0,0,0,0.15)`) and scales 102%
- [ ] Today column: add very subtle purple tint background (`rgba(109, 94, 246, 0.02)`)
- [ ] "Now" line: make thicker (1px → 2px) and add subtle glow
- [ ] Hour labels: reduce opacity to 0.4 (less visual noise)
- [ ] Add subtle gradient separator between task list and calendar (not hard border)

#### Add Task FAB
- [ ] Add subtle shadow on hover
- [ ] Press effect: translateY 2px on active
- [ ] Pulse animation on first visit (draw attention)

---

### 2. Thoughts Page

#### Layout
- [ ] Merge capture card and thoughts list into single panel (capture as sticky header inside panel)
- [ ] Remove separate "Capture Card" — input lives directly in panel header area
- [ ] Add character counter as subtle progress bar under input (appears at 80% of limit)

#### Thought Rows
- [ ] Increase thought dot size (6px → 8px)
- [ ] Add staggered fade-in on page load (thoughts appear 50ms apart)
- [ ] Hover: dot animates to purple with scale bounce (1 → 1.2 → 1)
- [ ] Delete animation: row collapses with fade (height → 0 + opacity → 0)

#### Empty State
- [ ] Add contextual message: "Capture thoughts here. Promote the good ones to tasks."
- [ ] Illustration: gentle floating animation (translateY ±5px, 3s loop)

---

### 3. Analytics Page

#### Stats Row
- [ ] Make "Completed" stat larger (hero stat) — 2x size of others
- [ ] Add subtle background to stats row (distinct from panels below)
- [ ] Streak fire emoji: add subtle glow animation when streak > 0
- [ ] Stats: count-up animation on page load (0 → actual value, 500ms)

#### Charts
- [ ] Heatmap: make 1.5x larger (it's the signature visualization)
- [ ] Add loading skeleton while charts render
- [ ] Chart panels: add subtle hover lift effect (translateY -2px + shadow)
- [ ] Velocity chart: make taller (400px → 300px for better proportion with others)

#### Recent Completions
- [ ] Add checkmark animation on each row (staggered, like confetti)
- [ ] Hover: row slides right slightly (translateX 4px) with purple accent

#### Visual Grouping
- [ ] Group "Daily Completions" + "By Domain" with shared background section
- [ ] Group "Best Days" + "Active Hours" similarly
- [ ] Add section labels: "Overview", "Patterns", "Details"

---

### 4. Settings Page

#### Layout Overhaul
- [ ] Change to single-column layout (max-width: 640px, centered)
- [ ] Add section groupings with light background: Connections, Data, Security, Account
- [ ] Section headers: larger text (0.72rem), left-aligned, with subtle left border accent

#### Integration Cards
- [ ] Google/Todoist: convert from rows to larger visual cards
- [ ] Show provider logo (not just letter)
- [ ] Connected state: add green checkmark badge
- [ ] Disconnected: add subtle "Connect" CTA glow

#### Panels
- [ ] Reduce panel padding (current feels cramped with so many panels)
- [ ] Primary actions (Connect, Enable): use filled buttons
- [ ] Secondary actions (Disconnect, Disable): use ghost/outline buttons
- [ ] Danger zone: move to very bottom, add red-tinted background, more vertical spacing

#### Domain Management
- [ ] Domain rows: add drag handle for reordering (future feature prep)
- [ ] Emoji picker: make larger, add recent emojis section
- [ ] Add domain count in section header

---

### 5. Login Page

**Already polished (8/10). Minor refinements:**

- [ ] Value proposition text: increase line-height for readability
- [ ] "Continue with Google" button: add subtle shine animation on hover
- [ ] Footer links: increase tap target size on mobile
- [ ] Reduce floating orb animation intensity by 20% (less distracting)

---

### 6. Wizard

**Already good (7/10). Minor refinements:**

- [ ] Step transitions: add crossfade between steps (not just instant swap)
- [ ] Progress dots: connected with line that fills as you progress
- [ ] "Skip" button: make more prominent (users miss it)
- [ ] Final step: add confetti or celebration animation

---

## Component System Updates

### Buttons

```css
/* Primary button enhancements */
.btn-primary {
    /* Add subtle gradient */
    background: linear-gradient(180deg,
        rgba(255,255,255,0.08) 0%,
        transparent 100%
    ), var(--btn-primary-bg);

    /* Press effect */
    &:active {
        transform: translateY(1px);
        box-shadow: var(--shadow-sm); /* reduced from default */
    }
}

/* Ghost button hover */
.btn-ghost:hover {
    border: 1px solid var(--border-default); /* add border on hover */
}

/* Icon buttons */
.icon-btn {
    min-width: 32px;
    min-height: 32px; /* increased hit target */
}
```

### Inputs

```css
/* Focus enhancement */
input:focus {
    border-color: var(--primary);
    box-shadow: 0 0 0 3px rgba(109, 94, 246, 0.12);
}

/* Placeholder */
input::placeholder {
    opacity: 0.4; /* reduced from 0.64 */
}

/* Typing indicator (optional) */
input:not(:placeholder-shown) {
    border-color: var(--border-strong);
}
```

### Panels

```css
/* Panel header refinement */
.panel__hd {
    /* Add left accent on important panels */
    border-left: 3px solid var(--primary);
    padding-left: calc(16px - 3px);
}

/* Danger panel */
.panel--danger {
    background: rgba(220, 38, 38, 0.04);
    border-color: rgba(220, 38, 38, 0.15);
}
```

### Empty States

```css
.empty-state {
    padding: 48px 24px;
}

.empty-state-illustration {
    animation: float 3s ease-in-out infinite;
}

@keyframes float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-8px); }
}

.empty-state-text {
    font-size: 0.9rem;
    max-width: 280px;
    margin: 0 auto;
}
```

---

## Micro-interactions Catalog

| Element | Trigger | Animation | Duration |
|---------|---------|-----------|----------|
| Task checkbox | Click | Scale bounce (1→1.3→1) + checkmark draw | 200ms |
| Task row | Hover | Inner glow + meta columns fade in | 150ms |
| Task drag | Drag start | Lift (shadow + scale 1.02) | 150ms |
| Task drop | Drop | Ripple from drop point | 300ms |
| Energy mode | Change | Task list crossfade | 200ms |
| Thought add | Submit | Row slides in from top | 200ms |
| Thought delete | Click | Row collapses + fades | 250ms |
| Button | Press | TranslateY 1px | instant |
| Panel expand | Click | Height animate + fade content | 200ms |
| Toast | Show | Slide up + fade in | 250ms |
| Chart | Load | Values count up | 500ms |
| Stats | Load | Number count up | 400ms |
| Empty state | Load | Illustration bounce in | 400ms |
| Theme toggle | Click | Full-page crossfade | 300ms |
| Calendar event | Drag | Shadow + scale + opacity 0.9 | 150ms |

---

## Dark Mode Considerations

All changes must work in both light and dark modes:

- Shadows: increase opacity in dark mode (0.08 → 0.2)
- Glows: reduce intensity in dark mode (too bright)
- Gradients: adjust to use darker base colors
- Hover states: may need higher contrast in dark mode

Test each change in both modes before committing.

---

## Files to Modify

### CSS Files
- `static/css/tokens.css` — Add new animation keyframes
- `static/css/components/buttons.css` — Button enhancements
- `static/css/components/forms.css` — Input improvements
- `static/css/components/panels.css` — Panel refinements
- `static/css/dashboard.css` — Task list + calendar changes
- `static/css/pages/thoughts.css` — Thoughts page layout
- `static/css/pages/analytics.css` — Analytics visual hierarchy
- `static/css/pages/settings.css` — Settings layout overhaul
- `static/css/login.css` — Minor refinements
- `static/css/wizard.css` — Step transitions
- `static/css/dialog.css` — Modal improvements (if needed)

### Templates (minimal changes)
- `app/templates/dashboard.html` — Move energy selector location
- `app/templates/thoughts.html` — Merge capture card into panel
- `app/templates/settings.html` — Add section groupings
- `app/templates/analytics.html` — Add section labels

### JavaScript (for animations)
- `static/js/task-complete.js` — Checkbox animation
- `static/js/drag-drop.js` — Enhanced drag feedback
- `static/js/energy-selector.js` — Crossfade transition

---

## Testing Checklist

### Before Starting
- [ ] Screenshot all pages (light mode)
- [ ] Screenshot all pages (dark mode)
- [ ] Note current performance metrics

### After Each Section
- [ ] Visual comparison with baseline
- [ ] Dark mode check
- [ ] Mobile responsive check
- [ ] Reduced motion check (`prefers-reduced-motion`)

### Final
- [ ] Full accessibility audit (contrast, focus indicators)
- [ ] Performance check (no jank on animations)
- [ ] Cross-browser: Chrome, Safari, Firefox
- [ ] Mobile: iOS Safari, Android Chrome

---

## Success Metrics

After implementation, the app should feel:
- [ ] **Calmer** — Less visual noise, clearer hierarchy
- [ ] **More responsive** — Interactions feel snappy and intentional
- [ ] **More polished** — Details that reward close attention
- [ ] **Consistent** — Same patterns applied everywhere

---

## Implementation Order

Execute in this order to minimize broken states:

1. **Tokens & Keyframes** — Add all new CSS variables and animations
2. **Components** — Update buttons, inputs, panels, empty states
3. **Tasks Page** — Header, rows, calendar (most complex)
4. **Thoughts Page** — Layout merge, animations
5. **Analytics Page** — Visual hierarchy, chart sizing
6. **Settings Page** — Layout overhaul
7. **Login & Wizard** — Minor polish
8. **Final pass** — Dark mode audit, animation timing tweaks

---

*Plan created: 2024-01-21*
*Target: v1.0 release*
