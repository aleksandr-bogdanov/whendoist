# Mobile UX Redesign: Task List (Feb 2026)

> Audit and concrete recommendations for the Whendoist task list on mobile (366×792 iPhone Pro Max).
> Based on screenshots, code analysis, and user feedback.

**Status:** Proposal — not yet implemented
**Affects:** `mobile.css`, `dashboard.css`, `app.css`, `_task_list.html`, `task-swipe.js`, `mobile-sheet.js`, `BRAND.md`

---

## Table of Contents

1. [Two-Line Task Rows](#1-two-line-task-rows)
2. [Container Margins](#2-container-margins)
3. [Touch Targets](#3-touch-targets)
4. [Filter Bar Layout](#4-filter-bar-layout)
5. [Plan Banner Dismiss + Auto-Collapse](#5-plan-banner-dismiss--auto-collapse)
6. [Gesture Discovery](#6-gesture-discovery)
7. [Swipe-Left → Schedule](#7-swipe-left--schedule)
8. [Flatten Domain Cards](#8-flatten-domain-cards)
9. [Tab Bar: Embedded FAB + Badge Fix](#9-tab-bar-embedded-fab--badge-fix)
10. [Brand Document Update](#10-brand-document-update)

---

## 1. Two-Line Task Rows

### Problem

On 366px, task names truncate aggressively: "Parent tas...", "Пе...", "Сделать PoC ...".
Root causes:
- `.task-breadcrumb` has `flex-shrink: 0` — the parent name ("Whendoist →") never shrinks, consuming 80-140px
- Metadata columns (clarity 56px + duration 32px + impact 24px + gaps) consume ~128px
- Only ~198px remain for task-content, and breadcrumbs eat most of that

### Solution

**Two-line layout for tasks with parent names.** Line 1: parent name (muted, small). Line 2: task name (full width).

```
  ┌─ impact rail
  │  Whendoist →              Autopilot  30m  Low
  │  Parent task name here
  └────────────────────────────────────────────
```

For tasks WITHOUT a parent, keep single-line:

```
  │  Почистить вкладки на телефо...  2h  Low
```

### Implementation

**Template** (`_task_list.html`): No HTML changes needed — `.task-breadcrumb` and `.task-text` are already separate `<span>` elements inside `.task-content`.

**CSS** (`mobile.css`): Switch `.task-content` from `flex-direction: row` to `column` when a breadcrumb is present, and let `.task-text` take the full second line:

```css
/* Two-line layout for child tasks (with breadcrumb) */
@media (max-width: 900px) {
    .task-item:has(.task-breadcrumb) .task-content {
        flex-direction: column;
        gap: 1px;
    }

    .task-item:has(.task-breadcrumb) .task-breadcrumb {
        font-size: 0.65rem;
        color: var(--text-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex-shrink: 1;  /* NOW it can shrink */
        max-width: 100%;
    }
}
```

**Row height**: Tasks with breadcrumbs will be taller (~56px vs 44px). This is acceptable — the information density improves because names are actually readable.

**Note on `:has()`**: Supported in all modern browsers (Safari 15.4+, Chrome 105+, Firefox 121+). Our PWA target audience is well within this range.

**Effort**: CSS-only (mobile.css).

---

## 2. Container Margins

### Problem

The user identified massive wasted space around the main content block — not the tab bar overlap but the borders/margins of the content area itself.

Current padding stack on mobile (366px):
- `.container-fluid`: 8px left + 8px right (from `app.css` @900px)
- `.tasks-layout`: 2px left + 2px right (from `dashboard.css` @900px)
- `.task-list-container`: 4px all sides (from `dashboard.css` @900px)
- `.project-group`: 1px border each side + internal padding

**Total: ~28-40px of horizontal space wasted** on a 366px screen = 8-11% of viewport width.

### Solution

Go edge-to-edge on mobile. Remove nested padding, let task rows bleed to the screen edge:

```css
@media (max-width: 580px) {
    .container-fluid {
        padding-left: 0 !important;
        padding-right: 0 !important;
    }

    .tasks-layout {
        padding: 0 !important;
    }

    .task-list-container {
        padding: 0 !important;
    }
}
```

Keep small padding (4px) at the 580-900px tablet range. Reclaims ~28-40px for task names.

**Effort**: CSS-only (mobile.css overrides).

---

## 3. Touch Targets

### Problem

Multiple interactive elements are below Apple's 44×44px minimum:

| Element | Current Size | Issue |
|---------|-------------|-------|
| Energy pills | 20px tall | Far too small for thumbs |
| Sort buttons (CLR, DUR, IMP) | ~20px hit area | Difficult to tap accurately |
| Nav items (THOUGHTS, TASKS...) | 24px tall | Below minimum |
| Task rows (768-900px) | 36px | Below minimum (already 44px below 767px) |

### Solution

Expand **tap areas** without changing visual size, using padding + negative margin:

```css
@media (max-width: 900px) {
    /* Energy pills: visual 20px, tap area 44px */
    .energy-pill {
        position: relative;
        /* keep existing visual styles */
    }
    .energy-pill::before {
        content: '';
        position: absolute;
        top: -12px;
        bottom: -12px;
        left: -4px;
        right: -4px;
        /* invisible but tappable */
    }

    /* Sort buttons: same technique */
    .header-sort {
        min-height: 44px;
        display: inline-flex;
        align-items: center;
    }

    /* Nav items */
    .nav-item {
        min-height: 44px;
        display: inline-flex;
        align-items: center;
    }

    /* Task rows at ALL mobile widths */
    .task-item {
        min-height: 44px;
    }
}
```

This keeps the visual design compact while making touch reliable.

**Effort**: CSS-only (mobile.css).

---

## 4. Filter Bar Layout

### Problem

The filter bar (`header-row1`) is broken on mobile:
1. **Layout conflict**: `mobile.css` sets `.task-list-header` to `display: flex`, but `.header-row1` inside it still uses the desktop `display: grid` with 5-column template — grid-inside-flex creates unpredictable sizing
2. **Class mismatch**: mobile.css targets `.header-energy` but the HTML element is `.energy-wrapper` (ID `header-energy`)
3. **Excessive vertical whitespace**: The grid's `min-height: 36px` + padding + the flex wrapper's own padding double up
4. **Intended layout**: energy pills flush-left, sort buttons flush-right, gear button in the far corner — instead it's a jumbled mess

### Solution

Override `header-row1` to flex on mobile. Fix the class targeting. Remove double padding:

```css
@media (max-width: 900px) {
    .task-list-header {
        display: block !important;  /* just a wrapper */
        padding: 4px 8px !important;
    }

    .header-row1 {
        display: flex !important;
        align-items: center;
        gap: 6px;
        min-height: auto;
        padding: 0 !important;
    }

    /* Energy: left-aligned, keep label */
    .energy-wrapper {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
    }

    /* Sort buttons: pushed right */
    .header-meta {
        display: flex !important;
        margin-left: auto;
        gap: 4px;
        flex-shrink: 0;
    }

    /* Gear: far right */
    .settings-anchor {
        flex-shrink: 0;
    }
}
```

This gives a clean single-row layout: `[ENERGY 🧟☕🧠 ●●] ........... [CLR DUR IMP ⚙]`

**Vertical space savings**: Removes double-padding (was ~12px wasted). Combined with the grid→flex fix, the filter bar drops from ~50px to ~36px effective height.

**Effort**: CSS-only (mobile.css). Fix the `.header-energy` → `.energy-wrapper` selector.

---

## 5. Plan Banner Dismiss + Auto-Collapse

### Problem

The "Plan your day · 71 tasks to fill your time" banner takes ~50px and has no way to dismiss it. It shows every morning until 11 AM regardless of whether the user has already planned.

### Solution

**a) Add dismiss button (×):**

Template change in `_task_list.html`:

```html
<div class="pmd-banner" id="pmd-banner" hidden>
    <div class="pmd-banner-text">
        <span class="pmd-banner-title" id="pmd-banner-title">Plan tomorrow?</span>
        <span class="pmd-banner-sub" id="pmd-banner-sub"></span>
    </div>
    <div class="pmd-banner-actions">
        <button type="button" class="pmd-banner-btn" id="pmd-banner-btn">Plan</button>
        <button type="button" class="pmd-banner-dismiss" id="pmd-banner-dismiss" aria-label="Dismiss">×</button>
    </div>
</div>
```

JS: On dismiss click, hide the banner and set `localStorage.setItem('pmd-banner-dismissed-' + todayISO, '1')`. This makes it dismissible per-day (comes back tomorrow, which is appropriate since planning is daily).

**b) Auto-collapse after planning:**

After the user clicks "Plan" and completes planning, the banner stays hidden for the rest of the session. Already partially implemented since the banner is `hidden` by default and JS shows it conditionally.

**c) Compact mobile variant:**

On mobile, reduce padding to `6px 10px`, font sizes down 0.05rem, bringing height from ~50px to ~36px.

```css
@media (max-width: 900px) {
    .pmd-banner {
        padding: 6px 10px;
        margin: 4px 0;
        border-radius: 6px;
    }
    .pmd-banner-title { font-size: 0.72rem; }
    .pmd-banner-sub { font-size: 0.62rem; }
    .pmd-banner-btn { padding: 4px 10px; font-size: 0.65rem; }
    .pmd-banner-dismiss {
        all: unset;
        cursor: pointer;
        padding: 4px 8px;
        color: var(--text-muted);
        font-size: 1.1rem;
        line-height: 1;
        opacity: 0.6;
    }
}
```

**Effort**: Template + CSS + small JS addition.

---

## 6. Gesture Discovery

### Problem

With the kebab menu removed (intentionally — long-press is the right pattern), there are zero visible affordances for swipe or long-press. Task rows look inert.

### Solution: Three-layer progressive disclosure

**a) First-visit animated swipe hint**

On first mobile visit (check `localStorage` key `gesture-hint-shown`), after a 1.5s delay, animate the FIRST task row:
1. Slide it 60px right over 0.4s (revealing green checkmark background)
2. Hold 0.6s
3. Snap back over 0.3s

Then show a small tooltip below: "Swipe right to complete, left to schedule. Long-press for more."

Dismiss after 4s or on any tap. Set `localStorage` to not show again.

**Animation CSS:**

```css
@keyframes gesture-hint-swipe {
    0%   { transform: translateX(0); }
    25%  { transform: translateX(60px); }
    55%  { transform: translateX(60px); }
    80%  { transform: translateX(-40px); }
    95%  { transform: translateX(-40px); }
    100% { transform: translateX(0); }
}

.gesture-hint-active {
    animation: gesture-hint-swipe 2.4s var(--ease-spring) forwards;
}
```

This shows both swipe-right (complete) and swipe-left (schedule) in one animation.

**b) Permanent swipe peek affordance**

Add a subtle 2px colored edge on each side of task rows, visible at rest:

```css
@media (hover: none) and (pointer: coarse) {
    .task-item::before {
        /* Already exists as impact rail — keep it */
    }
    .task-item::after {
        content: '';
        position: absolute;
        right: 0;
        top: 0;
        bottom: 0;
        width: 2px;
        background: var(--primary);  /* purple = schedule color */
        opacity: 0.15;
        border-radius: 0 4px 4px 0;
    }
}
```

The left side already has the impact color rail. The right side gets a subtle purple edge hinting "something is here." This is the Apple Mail pattern — constant, non-intrusive.

**c) Long-press tooltip after first tap**

After a user's first tap (which opens the edit dialog), on dialog close, show a brief toast:

> "Tip: long-press any task for quick actions"

Show once, track via `localStorage` key `longpress-hint-shown`.

Use the existing toast system (`window.Toast.show()`).

**Effort**: JS (gesture animation + localStorage checks) + CSS (keyframes + peek edge).

---

## 7. Swipe-Left → Schedule

### Problem

Current swipe-left triggers task **deletion** — a destructive, rare action. The 2s undo window is short and easy to miss. Task deletion is better suited to the long-press context menu where the red "Delete" button provides clear visual danger signaling.

Additionally, the current swipe threshold is **100px** with a max of **120px**. The user reports overshooting — accidental triggers from small hand movements.

### Solution

**a) Change swipe-left action from Delete to Schedule:**

In `task-swipe.js`, the `TaskSwipeManager` constructor (line ~116) currently maps swipe-left to delete. Change to:
- Swipe-left → Open schedule date picker (or quick-schedule to "tomorrow" with a toast showing the date)
- Swipe reveal color: `var(--primary)` (purple) instead of `var(--danger)` (red)
- Swipe reveal icon: calendar icon instead of trash

Delete moves exclusively to the long-press bottom sheet (where it already exists).

**b) Increase swipe threshold for activation:**

Current values in `task-swipe.js`:
```js
threshold: 100,     // pixels to trigger
maxSwipe: 120,      // max visual displacement
velocityThreshold: 0.5
```

New values:
```js
threshold: 130,     // more deliberate drag required
maxSwipe: 150,      // wider visual travel range
velocityThreshold: 0.4  // slightly less velocity-sensitive
```

The **peek zone** (0-60px) shows what action is behind the row without triggering it. The **commit zone** (130px+) triggers the action. This two-phase feedback makes swipe feel intentional, not accidental.

**c) Visual feedback phases:**

```
0-40px:    Subtle color appears, icon fades in at 20% opacity
40-100px:  Icon at full opacity, color intensifies, haptic peek (if available)
100-130px: "Almost there" — icon scales up slightly
130px+:    TRIGGER — icon pulses, row slides away
```

**Effort**: JS changes in `task-swipe.js` + CSS for swipe reveal colors.

---

## 8. Flatten Domain Cards

### Problem

Each domain is a bordered card (`.project-group`) with `border: 1px`, `border-radius: 6px`, `overflow: hidden`. This nesting eats ~24px of horizontal space from padding and borders. With many domains, the stacked cards create visual heaviness.

### BRAND.md Consultation

The brand document specifies:
- `--radius-sm: 6px` for "Inputs, standard buttons, panels"
- `--radius-lg: 12px` for "Settings panels, modals"
- Principle: "Information density without noise — dense layouts with clear visual breathing room using borders and dividers"

On desktop, bordered cards match this principle. On mobile (366px), the borders/padding consume too much of the scarce horizontal space. The brand principle of "information density without noise" actually **supports** removing card chrome on mobile — the cards ARE noise when they eat 7% of screen width.

The brand document has **no mobile-specific layout guidelines** (see Section 10 below).

### Solution

On mobile only, flatten domain groups to borderless sections with sticky headers:

```css
@media (max-width: 580px) {
    .project-group {
        border: none;
        border-radius: 0;
        background: transparent;
        margin-bottom: 0;
    }

    .project-header {
        position: sticky;
        top: 36px; /* below filter bar */
        z-index: 5;
        background: var(--bg-surface);
        border-bottom: 1px solid var(--border-subtle);
        border-radius: 0;
        padding: 8px 12px;
    }

    /* Thin divider between groups instead of card borders */
    .project-group + .project-group {
        border-top: 1px solid var(--border-default);
        margin-top: 4px;
        padding-top: 4px;
    }
}
```

This recovers ~24px horizontal space. Domain headers stick below the filter bar as the user scrolls through long lists, providing constant context.

**Desktop stays unchanged** — cards remain at 580px+.

**Effort**: CSS-only (mobile.css).

---

## 9. Tab Bar: Embedded FAB + Badge Fix

### Problem

**Badge layout broken**: The task count badge ("78") is positioned inline in the tab's flex column (`flex-direction: column` → icon → label → badge). With 2+ digit numbers, it pushes the layout apart. The badge sits below the label instead of overlaying the icon.

**Tab bar underutilized**: Two tabs (Tasks, Schedule) occupy 72px of prime viewport for only two choices.

### Solution

**a) Fix badge positioning — overlay on icon:**

```css
.mobile-tab {
    position: relative; /* anchor for badge */
}

.tab-badge {
    position: absolute;
    top: 4px;
    right: calc(50% - 24px); /* offset from center toward icon */
    font-size: 0.55rem;
    padding: 1px 5px;
    min-width: 16px;
    max-width: 32px;
    overflow: hidden;
    text-overflow: ellipsis;
}
```

For numbers > 99, display "99+". This prevents layout breakage at any count.

**b) Embed FAB in center of tab bar:**

Replace the 2-tab layout with 3 elements:

```
 ┌───────────────────────────────────────────┐
 │  📋 Tasks      [ + ]       📅 Schedule    │
 └───────────────────────────────────────────┘
```

The center `[+]` button is a 48px circle, slightly raised (-8px) above the tab bar edge, creating the classic "center FAB" pattern used by many mobile apps.

```css
.mobile-tab-add {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--primary);
    color: white;
    font-size: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(109, 94, 246, 0.3);
    margin-top: -8px; /* float above bar */
    flex-shrink: 0;
}
```

This eliminates the separate floating FAB (which had z-index conflicts with the tab bar) and gives "add task" the prominence it deserves.

**c) Reduce tab bar height:**

With the embedded FAB, each tab can be smaller. Reduce from 56px to 44px (still meets touch minimum):

```css
.mobile-tab {
    height: 44px;
    gap: 2px;
}
```

Total tab bar savings: from 72px to ~56px (44px tabs + 12px padding). The FAB protrudes 8px above but doesn't add to the fixed bottom reservation.

**Effort**: HTML + CSS + JS (move add-task handler from FAB to tab bar button).

---

## 10. Brand Document Update

### Problem

`BRAND.md` (v1.7) has **zero mobile-specific guidelines**. No mention of:
- Touch target sizing
- Gesture patterns
- Mobile layout principles
- Responsive breakpoints
- Swipe behavior
- Bottom sheet design

This means every mobile decision is ad-hoc with no design system backing.

### Proposed Addition

Add a new section **"12. Mobile & Touch"** to BRAND.md after section 11:

```markdown
## Mobile & Touch

### Principles

Whendoist mobile follows the same four brand values with mobile-specific interpretations:
- **Clarity**: One action per gesture. No hidden multi-gesture combos.
- **Intentionality**: Every tap area ≥ 44×44px (Apple HIG). Swipe thresholds require deliberate motion.
- **Calm**: Animations at `--duration-fast` or less for gestures. No bounce or overshoot.
- **Trust**: Destructive actions (delete) require explicit confirmation (long-press menu). Non-destructive actions (complete, schedule) use swipe.

### Gesture Model

| Gesture | Action | Reversibility |
|---------|--------|---------------|
| Tap | Open edit dialog | N/A (read action) |
| Swipe right | Complete task | Undo toast (5s) |
| Swipe left | Schedule task | Re-enter task list |
| Long press | Context menu (edit, complete, schedule, skip, delete) | Varies |

Gestures are progressive-disclosed: first visit shows animated hint, permanent subtle edge affordances hint at swipe.

### Touch Targets

All interactive elements on mobile must have a **minimum 44×44px tap area**. If the visual element is smaller (e.g., 20px energy pill), use invisible padding expansion via `::before` pseudo-elements.

### Layout

- **Edge-to-edge content** below 580px — no container padding
- **Flat domain groups** (no card borders) below 580px — sticky headers instead
- **Two-line task rows** for child tasks: parent name on line 1 (muted), task name on line 2
- **Single-line task rows** for root tasks

### Breakpoints

| Width | Name | Layout |
|-------|------|--------|
| >900px | Desktop | Grid layout, hover states, keyboard shortcuts |
| 580-900px | Tablet | Flex layout, touch targets, tab navigation |
| <580px | Phone | Edge-to-edge, flat groups, compact chrome |

### Bottom Sheet

Long-press context menu uses a bottom sheet (not native context menu). Design:
- Rounded top corners (`--radius-xl: 14px`)
- Sheet handle bar (36×4px, `--border-default`)
- Action grid: 4 columns of icon + label buttons
- Cancel button: full width, 48px height
- Backdrop: black at 40% opacity with 2px blur
```

**Effort**: Text edit to BRAND.md. Bump version to 1.8.

---

## Implementation Priority

These are ordered by impact-to-effort ratio and dependency chain:

| # | Change | Type | Dependencies |
|---|--------|------|-------------|
| 1 | Container margins → edge-to-edge | CSS | None |
| 2 | Filter bar layout fix | CSS | None |
| 3 | Touch target expansion | CSS | None |
| 4 | Flatten domain cards | CSS | #1 (margins) |
| 5 | Two-line task rows (parent→child) | CSS | #1 (needs horizontal space) |
| 6 | Plan banner dismiss + compact | HTML+CSS+JS | None |
| 7 | Swipe-left → Schedule + longer threshold | JS+CSS | None |
| 8 | Tab bar: badge fix + embedded FAB | HTML+CSS+JS | None |
| 9 | Gesture discovery (animation + peek + tooltip) | JS+CSS | #7 (swipe behavior must be final first) |
| 10 | Brand document update | Docs | #9 (document final patterns) |

Items 1-5 are CSS-only or CSS-dominant and could ship as a single "mobile layout overhaul" PR.
Items 6-8 each involve JS and can be separate PRs.
Item 9 depends on #7 (gesture behavior must be finalized before teaching it to users).
Item 10 should be last (documents what was actually built).

---

## Appendix: Space Budget (366px)

### Current state

```
Container padding:     28px (14px each side)
Domain card chrome:    24px (border + padding each side)
Metadata columns:     128px (clarity 56 + duration 32 + impact 24 + gaps 16)
Impact rail:           12px (left padding for 4px rail)
─────────────────────────────────
Overhead:             192px
Available for name:   174px  ← THIS IS WHY NAMES TRUNCATE
```

### After recommendations

```
Container padding:      0px (edge-to-edge)
Domain card chrome:     0px (flat sections)
Metadata columns:     128px (unchanged — clarity stays)
Impact rail:           12px (unchanged)
─────────────────────────────────
Overhead:             140px
Available for name:   226px  (+30% more space)
Two-line rows:        226px × 2 lines for child tasks
```

Plus: parent name moves to its own line, so the full 226px is available for the task name alone.
