# Mobile UX Round 3: Real-Device Feedback (Feb 10, 2026)

> Fixes based on hands-on iPhone testing after v0.42.50 shipped.
> Predecessor: `docs/archive/2026-02-10-mobile-ux-round2.md`

---

## Issues

### P1. Filter bar: full sort names, remove gear, fix arrow, keep gradient + sticky

**Current state:** Sort buttons show "CLR/DUR/IMP" (compact labels). Gear icon is oversized. Sort arrow animates `width: 0 → auto` causing position shift. Gradient bar was removed. Left edge misaligned with task content.

**Root causes:**
- `dashboard.css:3386` swaps `.label-full` → `.label-compact` at 767px. Need to override back to `.label-full` on mobile.
- HTML has `<span class="label-full">Dur</span>` — should be "Duration" for clarity.
- `.sort-icon` uses `width: 0 → width: auto` transition (dashboard.css:944-957) — causes reflow.
- `.settings-anchor` gear button wastes space on mobile.
- Spectrum gradient bar `::after` was hidden in round 2 — user wants it back.

**Fixes:**

a) **Show full labels on mobile** (mobile.css, 900px block):
```css
.header-sort .label-compact { display: none !important; }
.header-sort .label-full { display: inline !important; }
```

b) **Change "Dur" → "Duration"** (dashboard.html line 68):
```html
<span class="label-full">Duration</span><span class="label-compact">DUR</span>
```

c) **Fix sort arrow — no position shift** (mobile.css, 900px block):
```css
.header-sort .sort-icon {
    width: auto !important;
    display: inline;
    margin-left: 2px;
    opacity: 0;
    transition: opacity 0.15s ease !important;
}
.header-sort.active .sort-icon {
    opacity: 1;
}
```
Arrow always occupies space (`width: auto`), just fades in/out via opacity. No reflow.

d) **Hide gear on mobile** (mobile.css, 900px block):
```css
.settings-anchor { display: none !important; }
```

e) **Restore gradient bar** (mobile.css, 900px block):
Remove the `.task-list-header::after { display: none; }` rule added in round 2. The gradient bar should render as-is on mobile.

f) **Align left edge** (mobile.css, 900px block):
The task items have `padding-left: 12px` (for the 4px impact rail + 8px inner padding). The header should match:
```css
.task-list-header {
    padding: 2px 8px 0 12px !important;
}
```

g) **Sort buttons: invisible 44px tap area** (already done in round 2 — verify the `::before` pseudo-element is present).

### P2. Two-line wrap for ALL task names

**Current:** Single-line tasks truncate aggressively with `white-space: nowrap; text-overflow: ellipsis`. User wants 2-line wrap.

**Fix (mobile.css, 900px block):**
```css
.task-item .task-text {
    white-space: normal !important;
    display: -webkit-box !important;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 0.8rem;
    flex: 1;
    min-width: 0;
    line-height: 1.3;
}
```

Remove the previous `display: block; white-space: nowrap` rule. The `-webkit-line-clamp: 2` limits to exactly 2 lines, then ellipsis.

Task items already have `min-height: 44px` so taller rows expand naturally.

### P3. Domain header alignment with task content

**Current:** `.project-header` has `padding: 8px 12px` but task items have `padding-left: 12px` (starting after the 4px impact rail). The domain name text doesn't align with task text.

**Fix (mobile.css, 580px block):**
The project header needs left padding that accounts for the rail space (4px rail + 8px gap = 12px from edge to text). But the chevron `::before` pseudo-element adds visual offset.

```css
.project-header {
    padding: 8px 12px 8px 16px !important;
}
```
The 16px left padding aligns the domain name text with the task text (which starts at 12px padding but has the 4px rail inset).

### P4. Swipe-right "Failed to complete task" — broken export

**Root cause:** `task-swipe.js:267` calls `window.TaskComplete.toggle(taskId, task)` but:
1. `TaskComplete` has no `toggle` method — only `init` and `refreshTaskList` are exported.
2. Even if exported, the call signature is wrong: `toggleCompletion(taskEl, taskId, instanceId, shouldComplete, isRecurring)` takes 5 params with taskEl first, but swipe passes `(taskId, task)`.

**Fix (task-complete.js + task-swipe.js):**

a) Export `toggleCompletion` from task-complete.js (line 914-917):
```javascript
window.TaskComplete = {
    init: init,
    refreshTaskList: refreshTaskListFromServer,
    toggle: toggleCompletion,
};
```

b) Fix the call in task-swipe.js `completeTask()` method (line 266-268). The internal function signature is:
`toggleCompletion(taskEl, taskId, instanceId, shouldComplete, isRecurring)`

Replace:
```javascript
if (window.TaskComplete) {
    await window.TaskComplete.toggle(taskId, task);
}
```
With:
```javascript
if (window.TaskComplete && window.TaskComplete.toggle) {
    var instanceId = task.dataset.instanceId || null;
    var isCompleted = task.dataset.completed === '1';
    var isRecurring = task.dataset.isRecurring === 'true';
    await window.TaskComplete.toggle(task, taskId, instanceId, !isCompleted, isRecurring);
}
```

c) Also check `mobile-sheet.js:351` for the same broken call and fix it identically.

### P4b. Swipe-left does nothing

**Likely cause:** `scheduleTask()` calls `MobileTabs.switchTo('schedule')` which should work (MobileTabs is exported). But the tab may already visually switch with no user-visible feedback that "plan mode" started.

**Verify:** Test after P4 fix. If swipe-left still appears to do nothing, it may be because:
- `PlanTasks.enterPlanMode()` requires the calendar panel to be visible (it's hidden when tasks tab is active)
- The 400ms timeout may not be enough for the tab switch + render

**Potential fix:** Increase timeout to 600ms, or use a MutationObserver to wait for the calendar panel to become visible before calling `enterPlanMode`.

### P5. Tab bar: horizontal layout (icon left, label right)

**Current:** `.mobile-tab { flex-direction: column }` — icon on top, label below.

**Fix (mobile.css, tab section):**
```css
.mobile-tab {
    flex-direction: row !important;
    gap: 6px !important;
}

.tab-icon {
    font-size: 1.1rem;
}

.tab-label {
    font-size: 0.75rem;
}
```

The center FAB and overall tab bar layout stay unchanged — only the individual tab button orientation changes from vertical to horizontal.

### P6. Docs: post-1.0 TODOs

Add to CHANGELOG.md:
```markdown
### TODO (pre-1.0)
- **Gesture discovery redesign** — Current swipe hint animation works but needs polished onboarding
- **Settings/gear redesign** — Hidden on mobile in v0.42.x; needs a mobile-friendly settings surface
```

---

## Parallel Implementation Groups

| Group | Fixes | Files | Overlap |
|-------|-------|-------|---------|
| **A** | P1 + P2 + P3 + P5 (CSS + HTML) | `mobile.css`, `dashboard.html` | None with B/C |
| **B** | P4 + P4b (swipe fixes) | `task-complete.js`, `task-swipe.js`, `mobile-sheet.js` | None with A/C |
| **C** | P6 (docs) | `CHANGELOG.md` | None with A/B |

---

## Group A Detail: CSS + HTML (mobile.css, dashboard.html)

### mobile.css changes (900px block):

1. **Filter bar alignment** — `.task-list-header` padding: `2px 8px 0 12px !important`
2. **Remove** the `.task-list-header::after { display: none; }` rule from round 2
3. **Show full sort labels**: `.header-sort .label-compact { display: none !important; }` and `.header-sort .label-full { display: inline !important; }`
4. **Fix sort arrow**: override `.header-sort .sort-icon` to use `width: auto !important; opacity: 0` with fade-only transition, and `.header-sort.active .sort-icon { opacity: 1; }`
5. **Hide gear**: `.settings-anchor { display: none !important; }`
6. **2-line task text**: replace existing `.task-item .task-text` rules with `white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.3`
7. **Tab bar horizontal**: `.mobile-tab { flex-direction: row !important; gap: 6px !important; }` and `.tab-icon { font-size: 1.1rem; }`

### mobile.css changes (580px block):

8. **Domain header alignment**: `.project-header` left padding to `16px`

### dashboard.html changes:

9. **Fix "Dur" → "Duration"** (line 68): `<span class="label-full">Duration</span>`

## Group B Detail: Swipe Fixes (JS)

### task-complete.js:
1. Export `toggle: toggleCompletion` in the public API object (line 914-917)

### task-swipe.js:
2. Fix `completeTask()` call (line 266-268): pass correct params `(task, taskId, instanceId, !isCompleted, isRecurring)` to `TaskComplete.toggle`
3. Remove the fallback direct API call block (lines 269-283) — with the proper export, it's dead code

### mobile-sheet.js:
4. Fix the same `TaskComplete.toggle()` call (~line 351) with correct parameter order

## Group C Detail: Docs

### CHANGELOG.md:
1. Add TODO section with gesture discovery and settings/gear redesign items

---

## Verification

After all groups merge:
1. `uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test`
2. Mobile 366px:
   - Filter bar: thin, energy left-aligned, "Clarity ↑ Duration Impact", no gear, gradient bar visible
   - Sort tap: arrow fades in without shifting text
   - Task names: up to 2 lines, then ellipsis
   - Child tasks: breadcrumb above, name below (up to 2 lines)
   - Swipe right: completes task with proper animation + undo toast
   - Swipe left: switches to calendar tab and enters plan mode
   - Tab bar: icon + label side by side, center FAB
   - Domain headers: text aligned with task text below
3. Desktop: no changes (full labels already shown, gear visible)
