# v0.39.7 Revised: Subview Header, Styling & Date Column

## Context
After the first v0.39.7 pass (grid-preserving subview headers, recurring icon fix), visual review reveals 5 remaining issues:
1. Header height still differs — energy pills (20px) make main view taller than subview (just text)
2. "Scheduled (13)" is off-center — needs to be left-aligned in 1fr (decided)
3. Completed/Scheduled/Deleted subviews grey out fields unnecessarily — should match main view active task styling
4. Gear position may have shifted due to height change — verify with Playwright
5. Completed subview lacks "Date" column label in header

**Already applied from first pass (keep these):**
- Grid layout preserved in subviews (no flex override)
- Back button absolutely positioned
- Sort buttons non-interactive in subviews (pointer-events: none, sort-icon hidden)
- `sorts.hidden` line removed from JS
- Recurring icon positioned absolutely in `.task-due`

---

## Fix 1: Header height consistency

**Cause:** Energy pills are 20px tall. Header padding is 6px top + 6px bottom = 32px total. In subview, `.header-view-count` text is ~16px tall → header is ~28px.

**Fix:** Add `min-height` to `.header-row1` so both views render at the same height.

### `static/css/dashboard.css` — add to `.header-row1` (line ~373):
```css
.header-row1 {
    ...existing...
    min-height: 32px;  /* Match energy-pill row height across all views */
}
```

---

## Fix 2: View-count left-aligned + Date label

**Decision:** Title left-aligned in 1fr column (like energy pills). "Date" label at right edge of same column.

**Approach:** Convert `.header-view-count` from a `<span>` to a `<div>` flex container with two children: title text and date label.

### `app/templates/dashboard.html` — change header-view-count structure:
```html
<!-- FROM: -->
<span class="header-view-count" id="header-view-count" hidden></span>

<!-- TO: -->
<div class="header-view-count" id="header-view-count" hidden>
    <span class="header-view-title" id="header-view-title"></span>
    <span class="header-date-label" id="header-date-label">Date</span>
</div>
```

### `static/css/dashboard.css` — update `.header-view-count`:
```css
.header-view-count {
    display: flex;
    align-items: center;
    padding-left: 24px;  /* Clear absolute back arrow */
}

.header-view-title {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-secondary);
}

.header-date-label {
    margin-left: auto;  /* Push to right edge of 1fr column */
    min-width: var(--col-date);
    text-align: center;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(15, 23, 42, 0.38);  /* Same as .header-sort default */
}
```

### JS updates — change `countEl.textContent` to target inner span:

**`_completed_tasks.html`** (line ~79):
```js
const titleEl = document.getElementById('header-view-title');
if (titleEl) titleEl.textContent = 'Completed (' + {{ total_count }} + ')';
```

**`_scheduled_tasks.html`** (line ~82):
```js
const titleEl = document.getElementById('header-view-title');
if (titleEl) titleEl.textContent = 'Scheduled (' + {{ total_count }} + ')';
```

**`_deleted_tasks.html`** (line ~68):
```js
const titleEl = document.getElementById('header-view-title');
if (titleEl) titleEl.textContent = 'Deleted (' + {{ total_count }} + ')';
// Hide date label — deleted tasks have no date column
const dateLabel = document.getElementById('header-date-label');
if (dateLabel) dateLabel.hidden = true;
```

Also need to un-hide the date label when returning to other views. In `setSpecialViewHeader(false)` path, or when showing completed/scheduled views. Actually — simpler: always reset `dateLabel.hidden = false` in setSpecialViewHeader, and let deleted template hide it after.

### `static/js/task-list-options.js` — reset date label visibility:
```js
function setSpecialViewHeader(isSpecialView) {
    ...existing...
    const dateLabel = document.getElementById('header-date-label');
    if (dateLabel) dateLabel.hidden = !isSpecialView;  // Show in subviews, hide in main
}
```
Then `_deleted_tasks.html` overrides with `dateLabel.hidden = true` after HTMX loads.

---

## Fix 3: Subview task styling matches main view

**Goal:** Tasks in subviews look like active tasks in the main view. No extra greying, dimming, or opacity changes.

### Completed subview (`completed-group`):

**Keep:** `opacity: 1 !important` on `.completed-group .task-item` (prevents completed dimming)
**Keep:** `text-decoration: none !important` on text (no strikethrough)
**Remove:** `color: var(--text-primary) !important` from `.task-due`, `.meta-*` — let them use their normal default colors

```css
/* FROM (lines 790-795): */
.completed-group .task-item .task-due,
.completed-group .task-item .meta-duration,
.completed-group .task-item .meta-impact,
.completed-group .task-item .meta-clarity {
    color: var(--text-primary) !important;
}

/* TO: remove this rule entirely — defaults apply */
```

Also reset impact rail opacity (`.completed-group .task-item::before` should have full opacity):
```css
.completed-group .task-item::before {
    opacity: 1 !important;
}
```

And the checkmark — in the completed subview, show as the default completed style (purple):
```css
/* Remove lines 797-803 that force grey checkmarks */
/* Let base .task-item[data-completed="1"] .complete-check styling apply */
```

**Dark mode:** Also remove the completed-group dark overrides that dim things (lines ~3570-3580).

### Deleted subview (`deleted-group`):

**Change:** Remove `opacity: 0.85` from `.deleted-group.project-group` — full opacity like main view.

```css
/* FROM: */
.deleted-group.project-group {
    opacity: 0.85;
}
/* TO: remove this rule */
```

### Scheduled subview:
No changes needed — scheduled tasks already use normal styling.

---

## Fix 4: Gear position verification

The gear sits in `--col-actions` grid column. With `min-height: 32px` the height matches. Gear position should be identical. **Verify with Playwright screenshot comparison.**

---

## Fix 5: Completed subview DATE header

Handled by Fix 2 — the "Date" label inside `.header-view-count` flex container.

---

## Files to modify

| File | Changes |
|------|---------|
| `static/css/dashboard.css` | Add `min-height: 32px` to `.header-row1`; restyle `.header-view-count` as flex container; add `.header-view-title` and `.header-date-label` styles; remove `.completed-group` grey overrides; remove `.deleted-group` opacity; add dark mode date-label color |
| `app/templates/dashboard.html` | Change `header-view-count` to div with two child spans |
| `app/templates/_completed_tasks.html` | Update JS to target `header-view-title` |
| `app/templates/_scheduled_tasks.html` | Update JS to target `header-view-title` |
| `app/templates/_deleted_tasks.html` | Update JS to target `header-view-title` + hide date label |
| `static/js/task-list-options.js` | Add date-label visibility toggle in `setSpecialViewHeader` |
| `CHANGELOG.md` | Update entry |

---

## Verification

### Automated
```bash
uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test
```

### Playwright visual verification
Write a quick Playwright script that:
1. Starts the dev server
2. Logs in
3. Screenshots main view header → `main-header.png`
4. Clicks "View all completed" → screenshots completed subview header → `completed-header.png`
5. Goes back, clicks "View all scheduled" → `scheduled-header.png`
6. Goes back, clicks "View deleted" → `deleted-header.png`
7. Compare header heights and gear positions across all screenshots

Check:
- Header height identical across all views
- Gear button at same position
- Clarity/Dur/Impact labels visible in subviews
- "Date" label visible in completed/scheduled headers, hidden in deleted
- Task styling in subviews matches main view (no extra grey)
