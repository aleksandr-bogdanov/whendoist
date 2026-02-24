# Mobile UX Round 2: Post-Screenshot Fixes (Feb 10, 2026)

> Fixes based on real-device screenshot review after v0.42.44 shipped.
> All issues observed on iPhone Pro Max 366×792.

**Predecessor:** `docs/2026-02-10-mobile-ux-redesign.md` (items 1-10, all shipped)

---

## Issues

### P1. Filter bar: excessive height + misaligned with content

**Screenshot:** The filter bar (ENERGY + pills + CLR ↑ DUR IMP + ⚙) is ~50px tall with whitespace above and below. Task content below starts at a different left offset.

**Root cause:**
- `.header-meta .header-sort` has `min-height: 44px` — this was intended for touch target expansion but makes the *visible* row 44px tall instead of just the *tap area*
- `.task-list-header` has `padding: 4px 8px` but task items have `padding-left: 12px` (for the impact rail) — 4px left misalignment
- The `::after` spectrum bar (2px gradient) adds visual separation that wastes space

**Fix (mobile.css, 900px block):**
- Sort buttons: remove `min-height: 44px`, use `::before` pseudo-element for invisible 44px tap area (same pattern as energy pills)
- Align header left padding with task content: `padding: 2px 8px 2px 12px !important`
- Hide the spectrum bar on mobile: `.task-list-header::after { display: none; }`

### P2. Two-liner child task text doesn't truncate

**Screenshot:** "Parent tasks - do we support it or not? Again, look at the bigger..." overflows behind metadata columns instead of truncating with ellipsis.

**Root cause:** The two-line override sets `align-items: flex-start !important` on `.task-content` in column mode. In a column flexbox, `align-items` controls the *cross-axis* (horizontal). `flex-start` makes children shrink to content width — so `.task-text` expands to its full text width, ignoring the parent's constrained width. The text then overflows behind `.task-meta`.

**Fix (mobile.css, 900px block):**
- Change `align-items: flex-start !important` to `align-items: stretch !important` on `.task-item:has(.task-breadcrumb) .task-content`
- This makes children fill the parent's width, so `overflow: hidden; text-overflow: ellipsis` works correctly
- Breadcrumb already has its own `overflow: hidden; text-overflow: ellipsis` so it's fine with stretch

### P3. Domain cards: excessive vertical spacing

**Screenshot:** Huge gaps between Career, Leisure, and Music Hustle sections. The "+ Add task" row adds whitespace at the bottom of each group.

**Root causes (cumulative):**
1. `dashboard.css:3251` sets `.project-group { margin-bottom: 0.25rem }` at 900px — mobile.css `margin-bottom: 0` loses specificity battle (no `!important`)
2. `.add-task-row` has `margin: 4px 8px 6px` (dashboard.css:2048) and `padding: 12px` (mobile.css:670) — too much for mobile
3. `.project-header` at 580px has `min-height: 44px` — too tall for a section header, makes headers look isolated
4. `.project-group + .project-group` at 580px adds `margin-top: 4px + padding-top: 4px` — 8px between groups

**Fix (mobile.css):**
- 900px block: `.project-group { margin-bottom: 0 !important; }` (add `!important`)
- 900px block: `.add-task-row { padding: 6px 8px !important; margin: 2px 4px !important; }` — compact
- 580px block: `.project-header { min-height: 36px !important; }` (was 44px — headers aren't tap targets, they're `<summary>` elements)
- 580px block: `.project-group + .project-group { margin-top: 2px; padding-top: 0; }` — reduce 8px to 2px
- 580px block: `.add-task-row { margin: 2px 0 !important; border: none; border-top: 1px dashed var(--border-subtle); border-radius: 0; }` — flat, edge-to-edge

### P4. Swipe-left auto-schedules to tomorrow (should be manual)

**Current:** `scheduleTask()` in task-swipe.js (line 298) calls `PUT /api/v1/tasks/{id}` with `scheduled_date` set to tomorrow. Task vanishes from list.

**Desired:** Swipe-left should switch to calendar view and trigger manual scheduling for that specific task. No auto-planning.

**Fix (task-swipe.js):**
- Replace the `scheduleTask()` body: instead of API call + optimistic removal, do:
  1. `window.MobileTabs.switchTo('schedule')` — switch to calendar tab
  2. Find today's calendar: `document.getElementById('today-calendar')`
  3. After tab switch settles (~300ms), call `window.PlanTasks.enterPlanMode(todayCal)` to enter manual scheduling
  4. Optionally highlight the swiped task for context
- Remove the undo toast (no longer needed — no auto-action to undo)
- Keep the swipe animation and haptic feedback

### P5. Tab bar: remove Tasks badge + SVG FAB icon

**Screenshot:** "77" badge on Tasks tab is noisy — user never needs to see it. The "+" FAB uses a plain text character that isn't centered.

**Fix (dashboard.html + mobile.css):**
- Remove `<span class="tab-badge" hidden>0</span>` from the Tasks tab HTML
- Remove any JS that updates the badge count (search for `tab-badge`)
- Replace FAB text `+` with SVG: `<svg width="24" height="24"><use href="/static/img/icons/ui-icons.svg#plus"/></svg>`
- The `#plus` symbol already exists in the sprite (24×24, stroke-based)

### P6. Gesture discovery: mark as TODO for pre-1.0 redesign

**Current:** The animated swipe hint works but feels clunky. Needs a nicer implementation before 1.0.

**Fix:** Add a TODO entry to CHANGELOG.md noting this as a pre-1.0 polish item.

---

## Parallel Implementation Groups

These groups have **zero file overlap** and can run simultaneously:

| Group | Fixes | Files | Estimated |
|-------|-------|-------|-----------|
| **A** | P1 + P2 + P3 (CSS polish) | `static/css/mobile.css` | Medium |
| **B** | P4 (swipe → manual schedule) | `static/js/task-swipe.js` | Medium |
| **C** | P5 + P6 (tab bar + docs) | `app/templates/dashboard.html`, `CHANGELOG.md` | Small |

---

## Group A: CSS Polish (mobile.css)

### P1 changes — Filter bar

In the `@media (max-width: 900px)` block (section 4b):

1. Change `.task-list-header` padding from `4px 8px` to `2px 8px 0 12px` (align left with task content's 12px rail padding)

2. Add after `.task-list-header`:
```css
.task-list-header::after {
    display: none;
}
```

3. Change `.header-meta .header-sort`:
```css
.header-meta .header-sort {
    font-size: 0.5rem !important;
    padding: 2px 4px !important;
    min-height: auto;
    text-align: center;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
}
.header-meta .header-sort::before {
    content: '';
    position: absolute;
    top: -16px;
    bottom: -16px;
    left: -4px;
    right: -4px;
}
```

### P2 changes — Two-liner truncation

Change the existing rule:
```css
/* Before */
.task-item:has(.task-breadcrumb) .task-content {
    flex-direction: column !important;
    align-items: flex-start !important;
    gap: 1px !important;
}

/* After */
.task-item:has(.task-breadcrumb) .task-content {
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 1px !important;
}
```

### P3 changes — Domain card spacing

In 900px block:
```css
.project-group {
    margin-bottom: 0 !important;
}

.add-task-row {
    padding: 6px 8px !important;
    margin: 2px 4px !important;
}
```

In 580px block, modify existing rules:
```css
.project-header {
    /* ... keep existing ... */
    min-height: 36px !important;  /* was 44px */
}

.project-group + .project-group {
    border-top: 1px solid var(--border-default);
    margin-top: 2px;   /* was 4px */
    padding-top: 0;    /* was 4px */
}

.add-task-row {
    margin: 2px 0 !important;
    border: none !important;
    border-top: 1px dashed var(--border-subtle) !important;
    border-radius: 0 !important;
}
```

---

## Group B: Swipe-Left → Manual Schedule (task-swipe.js)

Replace the body of `async scheduleTask(task)` (lines 298-365):

```javascript
async scheduleTask(task) {
    // Haptic feedback
    if (window.HapticEngine) {
        window.HapticEngine.trigger('light');
    }

    // Animate task back to resting position
    task.style.transform = '';
    task.classList.remove('swiping-left', 'swipe-almost', 'swipe-schedule');

    // Switch to calendar view
    if (window.MobileTabs && typeof window.MobileTabs.switchTo === 'function') {
        window.MobileTabs.switchTo('schedule');
    }

    // After tab switch animation settles, enter plan mode
    setTimeout(function() {
        var todayCal = document.getElementById('today-calendar');
        if (todayCal && window.PlanTasks && typeof window.PlanTasks.enterPlanMode === 'function') {
            window.PlanTasks.enterPlanMode(todayCal);
        }
    }, 400);
}
```

Also remove or simplify `undoSchedule()` since it's no longer needed for swipe-left (keep it if called elsewhere).

---

## Group C: Tab Bar + Docs (dashboard.html, CHANGELOG.md)

### Tab bar HTML (dashboard.html ~line 21-23)

Remove the badge span:
```html
<!-- Before -->
<button type="button" class="mobile-tab active" data-view="tasks" aria-selected="true">
    <span class="tab-icon">📋</span>
    <span class="tab-label">Tasks</span>
    <span class="tab-badge" hidden>0</span>
</button>

<!-- After -->
<button type="button" class="mobile-tab active" data-view="tasks" aria-selected="true">
    <span class="tab-icon">📋</span>
    <span class="tab-label">Tasks</span>
</button>
```

Remove any JS that sets `.tab-badge` text content (search the file for `tab-badge`).

### FAB SVG (dashboard.html ~line 25)

```html
<!-- Before -->
<button type="button" class="mobile-tab-add" aria-label="Add Task" title="Quick add task">+</button>

<!-- After -->
<button type="button" class="mobile-tab-add" aria-label="Add Task" title="Quick add task">
    <svg width="24" height="24"><use href="/static/img/icons/ui-icons.svg#plus"/></svg>
</button>
```

Ensure the SVG inherits `color: white` from the button (stroke="currentColor" in the sprite).

### CHANGELOG TODO

Add under v0.42.45 or as a standalone note:
```markdown
### TODO (pre-1.0)
- **Gesture discovery redesign** — Current swipe hint animation is functional but rough; needs a polished, branded onboarding flow before v1.0
```

---

## Verification

After all three groups merge:
1. `uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test`
2. Mobile 366px:
   - Filter bar: thin single row, left-aligned with task content
   - Two-liner child tasks: text truncates with ellipsis, doesn't overflow behind metadata
   - Domain groups: tight spacing, minimal gaps between sections
   - Swipe-left: switches to calendar view and enters plan mode (no auto-scheduling)
   - Tab bar: no badge on Tasks, centered SVG + icon in FAB
3. Desktop: no changes
