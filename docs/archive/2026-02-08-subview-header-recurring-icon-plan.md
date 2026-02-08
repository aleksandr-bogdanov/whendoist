# v0.39.7: Subview Header Consistency & Recurring Icon Fix

## Context
After v0.39.6 shipped, visual review shows 4 remaining bugs in subviews (scheduled, completed, deleted):
1. Header height differs from main view
2. Gear/cog button is at a different position from main view (again)
3. Recurring icon (↻) shifts date text off-center in both main task list and subviews
4. Column legend (Clarity, Dur, Impact) is hidden in subviews despite task rows still showing those columns

**Root cause for bugs 1, 2, 4:** The v0.39.6 fix switched subview headers from grid to flex layout with absolute-positioned elements. This inherently creates different sizing, gear positioning, and hides the sort column labels. **The fix: keep the grid layout in subviews.**

---

## User's Original Bug Report

> bugfix time. 1) in subviews the header is different sized from the main view 2) in subviews the cog button in a different position AGAIN. 3) both in scheduled subview and scheduled section the date fields centering must not be impacted by the recurrent icon. basically it should be just a sidepiece. always center just the date. 4) in subviews the header legend is gone. Why though? It should be there. see screenshot shows most of these bugs. please prepare the implementation plan on how to fix all these issues. don't act on it yet, just go to plan mode.

---

## Investigation & Root Cause Analysis

### Current CSS State (Before Fix)

**Header Row 1 - Main Grid Layout (lines 372-379):**
```css
.header-row1 {
    display: grid;
    grid-template-columns: 1fr var(--col-clarity) var(--col-duration) var(--col-impact) var(--col-actions);
    column-gap: var(--col-gap);
    align-items: center;
    padding: 6px 0 6px var(--rail-w);
}
```

**Header Row 1 - Flex Override for Special Views (lines 636-642) — THE PROBLEM:**
```css
.header-row1:has(> .header-back-btn:not([hidden])) {
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    padding: 6px 0 6px var(--rail-w);
}
```

The flex override changes from `grid` to `flex` with `justify-content: center`, which centers the title. This causes the layout shift. The padding is identical (6px) but the alignment context is completely different.

**Back Button Positioning (lines 644-648):**
```css
.header-row1:has(> .header-back-btn:not([hidden])) .header-back-btn {
    position: absolute;
    left: var(--rail-w);
}
```

**Gear Button Positioning in Subviews (lines 650-655):**
```css
.header-row1:has(> .header-back-btn:not([hidden])) .settings-anchor {
    position: absolute;
    right: 0;
    margin-left: 0;
}
```

The gear button switches from grid column-based (part of `--col-actions` grid) to `position: absolute; right: 0`, which places it at the far right edge without respecting the grid's `--col-actions` spacing.

### Header Legend (Sort Buttons) CSS

**Header Meta Container (lines 805-811):**
```css
.header-meta {
    display: contents;
}

.header-meta[hidden] {
    display: none;
}
```

The `[hidden]` attribute completely removes the legend. This is set by JavaScript.

**Header Sort Buttons (lines 824-850):**
```css
.header-sort {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    padding: 0;
    margin: 0;
    border: none;
    background: transparent;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(15, 23, 42, 0.38);
    cursor: pointer;
    text-align: center;
    white-space: nowrap;
    transition: color 0.15s ease;
}

.header-sort.active {
    color: var(--text-primary);
}
```

### Task Date & Recurring Icon CSS

**`--col-date` defined in `tokens.css` (line 156):**
```css
--col-date: 58px;
```

**Task Due Date Container (lines 1988-2000):**
```css
.task-due {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: var(--col-date);
    font-size: 0.65rem;
    font-weight: 500;
    color: var(--text-muted);
    white-space: nowrap;
    flex-shrink: 0;
    height: 22px;
    line-height: 22px;
}
```

**Recurring Icon (lines 2002-2008):**
```css
.recurring-icon {
    display: inline-flex;
    align-items: center;
    margin-right: 0.125rem;
    font-size: 0.65rem;
    line-height: 1;
}
```

The `.recurring-icon` is inside `.task-due` (an `inline-flex` container with `justify-content: center` and `min-width: 58px`). The icon takes up ~12px of horizontal space, shifting the date text off-center.

### JavaScript Toggle Logic

**task-list-options.js (lines 250-260):**
```javascript
function setSpecialViewHeader(isSpecialView) {
    const energy = document.getElementById('header-energy');
    const backBtn = document.getElementById('header-back-btn');
    const viewCount = document.getElementById('header-view-count');
    const sorts = document.getElementById('header-sorts');

    if (energy) energy.hidden = isSpecialView;
    if (backBtn) backBtn.hidden = !isSpecialView;
    if (viewCount) viewCount.hidden = !isSpecialView;
    if (sorts) sorts.hidden = isSpecialView;  // <-- HIDES LEGEND IN SUBVIEWS
}
```

### Bug Summary Table

| Bug | Root Cause | Location |
|-----|-----------|----------|
| #1: Height/Size Difference | Flex override with `justify-content: center` changes alignment context | `.header-row1:has(> .header-back-btn:not([hidden]))` (line 636) |
| #2: Gear Button Position | Switches from grid column to `position: absolute; right: 0` | Lines 650-655 |
| #3: Missing Legend | JavaScript sets `sorts.hidden = isSpecialView` | `setSpecialViewHeader()` line 259 |
| #4: Recurring Icon Centering | Icon inside inline-flex container shifts date off-center | Lines 2002-2008 for icon; 1988-2000 for parent |

---

## Implementation Plan

### Bug 1+2+4: Keep grid layout in subviews (single fix for all three)

**Strategy:** Instead of switching to `display: flex` in subview mode, keep the grid. Position the back-btn absolutely (out of grid flow) and let view-count occupy the `1fr` column where energy-wrapper was. Sorts stay visible as column labels.

#### File: `static/css/dashboard.css`

**Step 1 — Replace the flex override (lines ~636-655) with grid-preserving rules:**

```css
/* FROM (current — switches to flex, breaks everything): */
.header-row1:has(> .header-back-btn:not([hidden])) {
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    padding: 6px 0 6px var(--rail-w);
}
.header-row1:has(> .header-back-btn:not([hidden])) .header-back-btn {
    position: absolute;
    left: var(--rail-w);
}
.header-row1:has(> .header-back-btn:not([hidden])) .settings-anchor {
    position: absolute;
    right: 0;
    margin-left: 0;
}

/* TO (new — keeps grid, positions back-btn as overlay): */
.header-row1:has(> .header-back-btn:not([hidden])) {
    position: relative;
    /* Grid stays from base rule — same columns, same gap, same height */
}
.header-row1:has(> .header-back-btn:not([hidden])) .header-back-btn {
    position: absolute;
    left: 4px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 1;
}
```

This means:
- Grid stays → same height as main view (bug 1 fixed)
- Settings-anchor stays in its grid column → same gear position (bug 2 fixed)
- No absolute overrides for `.settings-anchor` needed (remove that rule entirely)

**Step 2 — Style view-count for the grid 1fr column:**

```css
.header-view-count {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-secondary);
    padding-left: 24px;  /* Space for absolute back arrow */
}
```

**Step 3 — Make sort buttons non-interactive in subviews (labels only):**

```css
.header-row1:has(> .header-back-btn:not([hidden])) .header-sort {
    pointer-events: none;
    cursor: default;
}
.header-row1:has(> .header-back-btn:not([hidden])) .header-sort .sort-icon {
    display: none;
}
.header-row1:has(> .header-back-btn:not([hidden])) .header-sort.active {
    color: rgba(15, 23, 42, 0.38);  /* Same as non-active — no highlight */
}
```

#### File: `static/js/task-list-options.js` (~line 259)

**Stop hiding sorts in subview mode:**

```js
// FROM:
if (sorts) sorts.hidden = isSpecialView;

// TO: remove this line (or comment it out)
```

This makes the Clarity/Dur/Impact column labels stay visible (bug 4 fixed).

---

### Bug 3: Recurring icon shifting date text off-center

**Root cause:** The `↻` icon is inside `.task-due` (an `inline-flex` container with `justify-content: center` and `min-width: 58px`). The icon takes up ~12px of horizontal space, shifting the date text off-center.

**Fix:** Position the icon absolutely within `.task-due` so it doesn't participate in the flex centering. The date text becomes the sole flex child and centers naturally.

#### File: `static/css/dashboard.css`

```css
/* FROM: */
.recurring-icon {
    display: inline-flex;
    align-items: center;
    margin-right: 0.125rem;
    font-size: 0.65rem;
    line-height: 1;
}

/* TO: */
.task-due {
    position: relative;  /* ADD to existing rule */
}
.recurring-icon {
    position: absolute;
    left: 2px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 0.65rem;
    line-height: 1;
    color: var(--text-muted);
}
```

The icon sits at `left: 2px` within the 58px-wide container. The date text ("Feb 08") centers in the remaining space.

**No HTML changes needed** — the icon stays inside `.task-due` in both `_task_list.html` and `_scheduled_tasks.html`.

---

## Files to Modify (Summary)

| File | Changes |
|------|---------|
| `static/css/dashboard.css` | Replace flex override with grid-preserving rules; add non-interactive sort styles for subviews; fix `.recurring-icon` positioning; add `position: relative` to `.task-due` |
| `static/js/task-list-options.js` | Remove `sorts.hidden = isSpecialView` line |
| `pyproject.toml` | 0.39.6 → 0.39.7 |
| `uv.lock` | `uv lock` |
| `CHANGELOG.md` | Add entry |

---

## Key Decisions & Reasoning

1. **Grid over Flex (rejected approach):** The v0.39.6 fix introduced `display: flex` for subview headers to center the back button and view count title. This was rejected because it inherently breaks 3 things: header height consistency, gear button positioning, and sort column visibility. The new approach keeps the grid and uses `position: absolute` only for the back button, which is a minimal overlay element.

2. **Sorts visible but non-interactive in subviews:** Rather than hiding the sort column labels (Clarity, Dur, Impact), they stay visible as column headers for visual alignment with task rows below. They get `pointer-events: none` and the sort-icon arrows are hidden so users don't try to sort in subviews. The active sort highlight is also removed (all labels show at the same muted opacity).

3. **Recurring icon as absolute positioned sidepiece:** Instead of trying to adjust margins/padding to compensate for the icon width, the icon is taken out of flow entirely with `position: absolute`. This ensures the date text is always centered regardless of whether the icon is present. The icon sits at `left: 2px` as a visual indicator without affecting layout.

4. **No HTML template changes needed:** All fixes are CSS-only (plus one JS line removal). The HTML structure from v0.39.6 is correct; only the styling approach was wrong.

---

## Verification

```bash
uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test
```

Visual checks:
1. Main view — header height and gear position (baseline)
2. Scheduled subview — same header height, gear in same spot, Clarity/Dur/Impact labels visible as non-interactive column headers
3. Completed/Deleted subviews — same behavior
4. Recurring tasks — ↻ icon to left, date text centered in column (compare with/without icon rows)
5. Non-recurring tasks — date still centers normally
6. Mobile responsive — verify header still looks good at narrow widths
