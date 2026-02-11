# Fix Plan: Smooth Zoom, Date-Aware Toasts, Calendar Kebab Menu

**Version**: `v0.42.32/fix`
**Why**: Three UX issues — trackpad zoom is too sensitive, recurring task toasts always say "today" even for other dates, and calendar cards have no actions menu (kebab/right-click).

---

## Issue 1: Smooth Calendar Zoom (trackpad pinch)

**File**: `static/js/drag-drop.js`

**Problem**: Wheel handler (L376-393) jumps a full discrete step on every ctrlKey wheel event. Trackpad pinch fires many small-deltaY events, each jumping 10px — way too fast.

**Fix**:

1. **Add accumulator state** (near L41):
   - `let zoomAccumulator = 0;` and `const ZOOM_ACCUMULATOR_THRESHOLD = 30;`
   - Also define `ZOOM_MIN = 30`, `ZOOM_MAX = 100`

2. **Replace wheel handler** (L376-393): Accumulate `deltaY`; only step when `|accumulated| >= threshold`. Consume threshold amount per step, keep remainder. Each step = 10px. Clamp to [30, 100] range. This means trackpad needs ~6-15 small events per step instead of 1, while mouse wheel (deltaY ~100) still fires immediately.

3. **Relax saved height validation** (L347): Change `ZOOM_STEPS.includes(savedHeight)` to `savedHeight >= ZOOM_MIN && savedHeight <= ZOOM_MAX` — accepts intermediate values that might be persisted mid-pinch.

4. **Snap-on-save in `applyZoom`** (L422-429): Before saving to server, snap `currentHourHeight` to nearest ZOOM_STEP value. This keeps the persisted value clean while allowing smooth intermediate values during active pinching.

5. **Reset accumulator on button click** (L358 area): Set `zoomAccumulator = 0` inside button handler to prevent residual accumulation.

6. **CSS transition for smooth visual** (`static/css/components/drag-drop.css` L163-164): Extend existing `.scheduled-task` transition to include `top 0.15s ease-out, height 0.15s ease-out`. Disable during drag (`body.is-dragging .scheduled-task { transition: none !important }`). This makes the position recalculation animate smoothly instead of jumping.

**Button behavior unchanged** — buttons still step through discrete ZOOM_STEPS values.

---

## Issue 2: Date-Aware Toast Messages

**File**: `static/js/task-complete.js`

**Problem**: Lines 192-197 always show "Done for today" / "Reopened for today" for recurring tasks. Line 718 always shows "Skipped for today". The `targetDate` is computed (L118-132) for the API call but never used for toast text.

**Fix**:

1. **Add `getDateLabel(taskEl)` helper** (near L775): Returns `"today"` if date matches today, otherwise `"Mon, Feb 10"` format. Priority chain for finding the date:
   - `taskEl.dataset.instanceDate` (most specific for recurring instances)
   - `hourRow.dataset.actualDate` or `calendarEl.dataset.day` (calendar context)
   - `taskEl.dataset.scheduledDate` (task list fallback)
   - `"today"` (default fallback)

2. **Update completion toast** (L192-197): `'Done for ' + getDateLabel(taskEl)` / `'Reopened for ' + getDateLabel(taskEl)`

3. **Update skip toast** (L718): `'Skipped for ' + getDateLabel(taskEl)`

---

## Issue 3: Unified Kebab/Context Menu on Calendar Cards

**Files**: `dashboard.html`, `task-complete.js`, `dashboard.css`

**Problem**: Calendar cards (`.scheduled-task`, `.date-only-task`) have no kebab button, right-click is explicitly blocked (L428), and they lack `data-is-recurring`/`data-scheduled-date` attributes that `buildMenuOpts` reads.

### A. Add missing data attributes to calendar card templates

**File**: `app/templates/dashboard.html`

- **Scheduled tasks** (L239-249): Add `data-is-recurring` and `data-scheduled-date`
- **Date-only tasks** (L169-177): Add `data-is-recurring` and `data-scheduled-date`
- `data-subtask-count` not needed — parent tasks don't appear on calendar

### B. Add kebab buttons to calendar cards

**File**: `app/templates/dashboard.html`

- **Scheduled tasks**: Add `<button class="kebab-btn calendar-kebab" ...>⋮</button>` after task text (before closing `</div>`)
- **Date-only tasks**: Same, after task text

### C. Enable right-click on calendar cards

**File**: `static/js/task-complete.js`

- **L428**: Change `if (!taskEl.classList.contains('task-item')) return;` to also accept `.calendar-item`

### D. Expand `buildMenuOpts` and `showActionsMenu`

**File**: `static/js/task-complete.js`

- **`buildMenuOpts`** (L390-398): Add `isCalendarCard: taskEl.classList.contains('calendar-item')` to return object. Fix `isScheduled` to also check calendar card class.

- **`showActionsMenu`** (L455-512): Add **Unschedule** option for non-recurring scheduled calendar cards:
  ```
  ⏭ Skip this one          (recurring instance only — already exists)
  📤 Unschedule             (NEW — non-recurring calendar cards only)
  ✏️ Edit task / Edit series
  ───
  🗑 Delete / Delete series
  ```
  For recurring instances, add a **non-clickable hint row** at the bottom:
  ```
  ───
  💡 Drag to reschedule     (muted, non-interactive)
  ```

- **Add `unscheduleTask()` function**: Optimistic DOM removal → `PUT /api/v1/tasks/{id}` with `{ scheduled_date: null, scheduled_time: null }` → toast "Task unscheduled" → recalculate overlaps. API already supports this (L530: `model_dump(exclude_unset=True)`). Revert on error.

### E. CSS for calendar card kebab

**File**: `static/css/dashboard.css`

- `.calendar-item .calendar-kebab`: absolute positioned, top-right, `opacity: 0`, visible on card hover
- `.calendar-item:hover .calendar-kebab`: `opacity: 0.6`
- Short tasks (`.duration-short .calendar-kebab`): `display: none` (too cramped)
- Date-only: position adjusted to not overlap checkbox
- Dark mode variant

### F. Propagation safety

Kebab `handleKebabClick` already calls `e.stopPropagation()` (L409), which prevents calendar card click-through to edit dialog. No additional changes needed.

---

## Files Modified

| File | Issues |
|------|--------|
| `static/js/drag-drop.js` | #1 |
| `static/css/components/drag-drop.css` | #1 |
| `static/js/task-complete.js` | #2, #3 |
| `app/templates/dashboard.html` | #3 |
| `static/css/dashboard.css` | #3 |
| `pyproject.toml` | version bump |
| `uv.lock` | lockfile sync |
| `CHANGELOG.md` | release notes |

## Verification

1. **Zoom**: Ctrl+trackpad pinch on calendar — should zoom smoothly, not jump. +/- buttons still step normally. Refresh → saved zoom level persists.
2. **Toast**: Complete a recurring instance on tomorrow's calendar → toast should say "Done for Tue, Feb 10" not "Done for today". Complete today's → "Done for today". Skip → same pattern.
3. **Kebab/right-click on calendar**: Hover scheduled task → kebab appears → click → menu with Edit/Delete (or Skip/Edit series/Delete series for recurring). Right-click also works. "Unschedule" on non-recurring cards removes from calendar. Recurring instances show "Drag to reschedule" hint.
4. Run `uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test`
