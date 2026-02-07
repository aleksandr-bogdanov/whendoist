# UI Polish: Labels, Column Order & Styling (v0.39.4)

## Context
UI review identified several inconsistencies: impact labels (P1/P2 in some views, High/Mid in others), wasted space from a mostly-empty mode column, strikethrough on completed tasks, and missing gradient line in sub-views. This PR unifies labels, reorders columns for better information hierarchy, and tightens the layout.

## Decisions
- **Impact labels**: High / Mid / Low / Min everywhere (matches current main view)
- **Column label**: "Clarity" (not "Mode")
- **Column order**: `[rail] [1fr content+date] [CLARITY] [DUR] [IMPACT] [actions]`
- **Normal clarity**: blank (no "—")
- **DUR label**: "Dur" consistently
- **Domain count**: Gray micro pill
- **Strikethrough**: Remove for completed tasks (keep for skipped)
- **Gradient line**: Verify it shows in all views

---

## Phase 1: Python Constants + Tests

### `app/constants.py`
- `IMPACT_LABELS`: Critical/High/Medium/Low → **High/Mid/Low/Min**
- Update enum comments to match

### `tests/test_constants.py`
- Update 4 label assertions to match new values

---

## Phase 2: CSS Column Widths

### `static/css/tokens.css`
- `--col-duration`: 68px → **48px**
- `--col-impact`: 56px → **44px**
- `--col-clarity`: stays 68px

### `static/css/app.css`
- Match token values: duration=48px, impact=44px, clarity=68px (was 80px override)

---

## Phase 3: Grid Column Reorder (CSS)

### `static/css/dashboard.css` — 5 grid declarations

Current: `1fr | duration | impact | clarity | actions`
New: `1fr | **clarity** | duration | impact | actions`

1. `.header-row1` (~line 375)
2. `.section-separator--sched` (~line 1079)
3. `.task-item` (~line 1285)
4. `@media max-width: 900px` (~line 3016) — reorder hardcoded px values
5. `@media max-width: 580px` (~line 3110) — reorder hardcoded px values

---

## Phase 4: Template Column Reorder + Content

### `app/templates/dashboard.html`
- Reorder sort buttons: **Clarity** first, then Dur, then Impact
- Rename "Mode" → "Clarity", "Duration" → "Dur"

### `app/templates/_task_list.html`
- Task macro: reorder `.task-meta` children (clarity first, then duration, then impact)
- Normal clarity: remove "—", show blank
- Scheduled section separator: reorder column labels, "Mode" → "Clarity"

### `app/templates/_scheduled_tasks.html`
- Reorder `.task-meta` children (clarity first)
- P1/P2/P3/P4 → High/Mid/Low/Min
- Normal clarity: blank

### `app/templates/_completed_tasks.html`
- Same changes as scheduled

### `app/templates/_deleted_tasks.html`
- Same changes as scheduled

### `app/templates/tasks/_task_form_content.html`
- Impact pill buttons: P1/P2/P3/P4 → High/Mid/Low/Min

---

## Phase 5: JavaScript

### `static/js/task-dialog.js`
- `IMPACT_OPTIONS` labels: P1/P2/P3/P4 → High/Mid/Low/Min

No changes needed to `task-sort.js` (uses `data-sort` attributes, not column positions).

---

## Phase 6: Strikethrough Removal

### `static/css/dashboard.css`
- `.task-item[data-completed="1"] .task-text`: line-through → **none**
- `.task-item.completed .task-text`: line-through → **none**
- `.calendar-item[data-completed="1"]` text: line-through → **none**
- `.calendar-item.completed` text: line-through → **none**
- **KEEP** `.task-item.skipped .task-text` strikethrough
- **KEEP** `.calendar-item.skipped` text strikethrough

### `static/css/components/drag-drop.css`
- `.task-item.completed.scheduled .task-text`: line-through !important → **none !important**

**DO NOT** change `thoughts.css` `.is-processed` (different feature).

---

## Phase 7: Domain Count Micro Pill

### `static/css/dashboard.css`
Restyle `.task-count`:
```css
.task-count {
    font-size: 0.6rem;
    font-weight: 500;
    color: var(--text-muted);
    background: rgba(15, 23, 42, 0.05);
    padding: 1px 6px;
    border-radius: 9999px;
    line-height: 1.4;
}
```
Add dark mode override with `rgba(248, 250, 252, 0.08)` background.

---

## Phase 8: Gradient Line Verification

The gradient is on `.task-list-header::after` which persists across views (HTMX only replaces content below). **Visually verify** it appears in scheduled/completed/deleted views. If not, add explicit fix.

---

## Phase 9: Version Bump

- `pyproject.toml`: bump to 0.39.4
- `uv lock`
- `CHANGELOG.md`: add version entry

---

## Verification

```bash
uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test
```

Then visually check:
1. Main task list — column order, impact labels, blank clarity for normal
2. Scheduled view — same + date alignment
3. Completed view — no strikethrough, impact labels
4. Deleted view — impact labels, gradient line
5. Task form dialog — impact pill labels
6. Domain headers — gray micro pill counts
7. Mobile breakpoints — columns still fit

## Files Changed (15 total)

| File | Changes |
|------|---------|
| `app/constants.py` | IMPACT_LABELS + comments |
| `tests/test_constants.py` | Label assertions |
| `static/css/tokens.css` | Column widths |
| `static/css/app.css` | Column width overrides |
| `static/css/dashboard.css` | Grid reorder, strikethrough, task-count, responsive |
| `static/css/components/drag-drop.css` | Strikethrough removal |
| `app/templates/dashboard.html` | Sort button order + labels |
| `app/templates/_task_list.html` | Task-meta order, clarity blank, section labels |
| `app/templates/_scheduled_tasks.html` | Task-meta order, impact labels, clarity blank |
| `app/templates/_completed_tasks.html` | Same |
| `app/templates/_deleted_tasks.html` | Same |
| `app/templates/tasks/_task_form_content.html` | Impact pill labels |
| `static/js/task-dialog.js` | IMPACT_OPTIONS labels |
| `pyproject.toml` | Version 0.39.4 |
| `CHANGELOG.md` | Version entry |
