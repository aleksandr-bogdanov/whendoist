# Task List Visual Refinements

**Status:** Planned
**Base version:** 0.35.0
**Target version:** 0.36.0
**PR title:** `v0.36.0/feat: Task list refinements — semantic impact labels, single-dot clarity, collapsible sections`

## Overview

Eight targeted visual fixes from a design audit of the task list view. The changes reduce visual noise, improve scannability, and remove header controls that belong closer to the content they affect.

**Mock:** `docs/archive/scratchpad/design-fixes-mock.html`

| # | Change | What | Complexity | Files |
|---|--------|------|-----------|-------|
| **1** | Subtask badges muted | Purple tint → grey with subtle border | CSS only | `dashboard.css` |
| **2** | Impact labels semantic | P1/P2/P3/P4 → High/Mid/Low/Min, colored text, no dot | HTML + CSS | `_task_list.html`, `dashboard.css` |
| **3** | Meta column opacity | 0.5 → 0.65 (readable without hovering) | CSS only | `dashboard.css` |
| **4** | Collapsible sections | Remove header view toggle; sections toggle in-place | HTML + CSS + JS | `dashboard.html`, `_task_list.html`, `dashboard.css`, `task-list-options.js` |
| **5** | Single-dot clarity | Three dots per row → one colored dot | HTML + CSS | `_task_list.html`, `dashboard.css`, `tokens.css` |
| **6** | TASKS label opacity | 0.38 → 0.50 | CSS only | `dashboard.css` |
| **7** | Section separator style | Centered hr+label → left-aligned label + trailing line | CSS only | `dashboard.css` |
| **8** | Trash to settings panel | 🗑 button moves from header to gear panel | HTML + JS | `dashboard.html`, `task-list-options.js` |

## Implementation Order

```
Stage 1: CSS micro-fixes (#1, #3, #6)         — independent, zero risk
Stage 2: Section separator style (#7)          — CSS only, independent
Stage 3: Single-dot clarity (#5)               — HTML + CSS, independent
Stage 4: Impact labels (#2)                    — HTML + CSS, independent
Stage 5: Collapsible sections + header (#4, #8) — the main structural change
Stage 6: PR cleanup                            — version, changelog, tests
```

Stages 1–4 are independent and can run in any order. Stage 5 depends on Stage 2 (section separator style is used by the collapsible sections). Stage 6 is always last.

---

## Stage 1: CSS Micro-Fixes

**Goal:** Three single-value CSS changes. Zero risk, no HTML changes.

### What changes

**`static/css/dashboard.css`**

Fix #1 — Subtask badges (line ~1611):
```css
/* Before */
.subtask-badge {
    color: var(--text-muted);
    background: rgba(109, 94, 246, 0.1);  /* purple tint */
    padding: 1px 6px;
    border-radius: 8px;
}

/* After */
.subtask-badge {
    color: var(--text-muted);
    background: var(--bg-inset);           /* neutral grey */
    border: 1px solid var(--border-subtle);
    padding: 1px 6px;
    border-radius: 8px;
}
```

Fix #3 — Meta column opacity (line ~1077):
```css
/* Before */
.task-item .meta-duration,
.task-item .meta-impact,
.task-item .meta-clarity {
    opacity: 0.5;
}

/* After */
.task-item .meta-duration,
.task-item .meta-impact,
.task-item .meta-clarity {
    opacity: 0.65;
}
```

Fix #6 — TASKS label (line ~382):
```css
/* Before */
.header-task-label {
    color: rgba(15, 23, 42, 0.38);
}

/* After */
.header-task-label {
    color: rgba(15, 23, 42, 0.50);
}
```

### Prompt

```
Read static/css/dashboard.css and make three single-value CSS changes:

1. Line ~1615: .subtask-badge — change background from rgba(109, 94, 246, 0.1)
   to var(--bg-inset). Add: border: 1px solid var(--border-subtle);

2. Line ~1080: .task-item .meta-duration/impact/clarity opacity —
   change 0.5 to 0.65

3. Line ~382: .header-task-label color — change rgba(15, 23, 42, 0.38)
   to rgba(15, 23, 42, 0.50)

Do NOT change any other CSS. Three surgical edits.
```

**Model:** Sonnet

---

## Stage 2: Section Separator Style

**Goal:** Change section separators from centered-between-two-rules to left-aligned label with trailing line.

### What changes

**`static/css/dashboard.css`** (lines ~965-988):

```css
/* Before — centered text between two rules */
.section-separator {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 12px 0 6px;
    padding: 0 12px;
}

.section-separator::before,
.section-separator::after {
    content: "";
    flex: 1;
    height: 1px;
    background: var(--border-default);
}

/* After — left-aligned label + trailing line only */
.section-separator {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 16px 0 6px;
    padding: 0 12px;
}

/* Remove ::before entirely */
.section-separator::after {
    content: "";
    flex: 1;
    height: 1px;
    background: var(--border-default);
}
```

Also update `.section-sep-label`:
```css
.section-sep-label {
    font-size: 0.65rem;
    font-weight: 700;          /* was 600 */
    text-transform: uppercase;
    letter-spacing: 0.08em;    /* was 0.05em */
    color: var(--text-muted);
    white-space: nowrap;
}
```

### Prompt

```
Read static/css/dashboard.css lines 965-988 (section separator styles).

Change the section separator from centered-between-two-rules to left-aligned:
1. Remove the .section-separator::before rule entirely (delete the combined
   ::before, ::after selector — keep ::after only as a separate rule)
2. Change margin from "12px 0 6px" to "16px 0 6px"
3. Change gap from 10px to 8px
4. Update .section-sep-label: font-weight 600→700, letter-spacing 0.05em→0.08em

Result: label appears on the left, line extends to the right.
Do NOT touch any dark mode overrides for this component.
```

**Model:** Sonnet

---

## Stage 3: Single-Dot Clarity in Task Rows

**Goal:** Replace the three-dot clarity indicator (one lit, two dim at 0.15) with a single colored dot per task row. This is the original Stage D spec from the V2 redesign, which the implementation diverged from.

### Rationale

Three dots per row means parsing 24+ dots for 8 visible tasks. A single dot per row means 8 dots — 3× more efficient to scan. The color alone tells you the clarity level. The header clarity dots (which show aggregate energy→clarity mapping) still use three dots — that's correct there because they show a different concept (which levels are visible).

### What changes

**`static/css/tokens.css`** (line ~158):
```css
--col-clarity: 32px;  /* Was 42px — single dot needs less */
```

**`app/templates/_task_list.html`** (lines ~71-75 in render_task_item macro):

```html
<!-- Before: three cdot spans -->
<span class="meta-clarity clarity-{{ task.clarity or 'none' }}">
    <span class="cdot cdot-clear"></span>
    <span class="cdot cdot-defined"></span>
    <span class="cdot cdot-open"></span>
</span>

<!-- After: single dot span -->
<span class="meta-clarity clarity-{{ task.clarity or 'none' }}">
    <span class="clarity-dot"></span>
</span>
```

**`static/css/dashboard.css`** — Replace `.meta-clarity` styles (lines ~1731-1742):

```css
/* Before */
.meta-clarity {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
}
.meta-clarity .cdot { opacity: 0.15; }
.meta-clarity.clarity-clear .cdot-clear { opacity: 1; }
.meta-clarity.clarity-defined .cdot-defined { opacity: 1; }
.meta-clarity.clarity-open .cdot-open { opacity: 1; }

/* After */
.meta-clarity {
    display: inline-flex;
    align-items: center;
    justify-content: center;
}

.meta-clarity .clarity-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--border-default);  /* fallback for clarity-none */
}

.meta-clarity.clarity-clear .clarity-dot { background: var(--clear-color); }
.meta-clarity.clarity-defined .clarity-dot { background: var(--clarity-defined); }
.meta-clarity.clarity-open .clarity-dot { background: var(--open-color); }
.meta-clarity.clarity-none .clarity-dot { opacity: 0.35; }
```

Also remove/update these related rules:
- Completed task muted dots (line ~1237): update from `.cdot` to `.clarity-dot`
- Dark mode dot overrides: update selectors accordingly
- Any responsive breakpoint code referencing `.meta-clarity .cdot`

### Thinking needed

Search dashboard.css for ALL references to `.meta-clarity .cdot` and `.meta-clarity.clarity-` to find every selector that needs updating. There are overrides in completed states, dark mode, and responsive sections.

### Prompt

```
Implement single-dot clarity in task rows.

READ FIRST (understand all selectors before changing):
- static/css/tokens.css line 158 (--col-clarity)
- app/templates/_task_list.html lines 71-75 (meta-clarity markup)
- static/css/dashboard.css — search for ALL occurrences of:
  ".meta-clarity", ".cdot", "clarity-clear", "clarity-defined", "clarity-open"
  List every line number before making changes.

CHANGES:

1. tokens.css: Change --col-clarity from 42px to 32px

2. _task_list.html: In the render_task_item macro, replace the three cdot
   spans with a single span:
   <span class="meta-clarity clarity-{{ task.clarity or 'none' }}">
       <span class="clarity-dot"></span>
   </span>

3. dashboard.css: Replace all .meta-clarity .cdot rules with .clarity-dot rules:
   - .clarity-dot: 7px circle, default bg var(--border-default)
   - .clarity-clear .clarity-dot: bg var(--clear-color)
   - .clarity-defined .clarity-dot: bg var(--clarity-defined)
   - .clarity-open .clarity-dot: bg var(--open-color)
   - .clarity-none .clarity-dot: opacity 0.35

4. Update ALL related selectors (completed states, dark mode, responsive)
   from .cdot to .clarity-dot. Search comprehensively — there are references
   in completed task styles, dark mode overrides, and responsive breakpoints.

IMPORTANT: Do NOT change the header clarity dots (.clarity-dots .cdot in the
header row 2). Those are a DIFFERENT component and stay as three dots.
```

**Model:** Sonnet

---

## Stage 4: Impact Labels — P-notation → Semantic Labels

**Goal:** Replace "P1/P2/P3/P4" with "High/Mid/Low/Min" in the impact color. Remove the redundant `::before` dot — the left rail already encodes impact visually, so the column provides precision via colored text.

### Rationale

"P" stands for "Priority" — a Todoist heritage. The Whendoist system calls this dimension "Impact." The labels should match. "High/Mid/Low/Min" is self-explanatory and the existing responsive breakpoint code (dashboard.css lines ~2839-2842) already uses this exact pattern.

### What changes

**`app/templates/_task_list.html`** (lines ~66-69):

```html
<!-- Before -->
<span class="meta-impact impact-{{ task.impact }}">
    {% if task.impact == 1 %}P1
    {% elif task.impact == 2 %}P2
    {% elif task.impact == 3 %}P3
    {% else %}P4{% endif %}
</span>

<!-- After -->
<span class="meta-impact impact-{{ task.impact }}">
    {% if task.impact == 1 %}High
    {% elif task.impact == 2 %}Mid
    {% elif task.impact == 3 %}Low
    {% else %}Min{% endif %}
</span>
```

**`static/css/dashboard.css`** — Modify `.meta-impact` styles (lines ~1712-1728):

```css
/* Before: dot via ::before + neutral text */
.meta-impact { color: var(--text-primary); justify-content: center; }
.meta-impact::before {
    content: "";
    width: 7px;
    height: 7px;
    border-radius: 999px;
    display: inline-block;
    margin-right: 5px;
}
.meta-impact.impact-1::before { background: var(--impact-high); }
.meta-impact.impact-2::before { background: var(--impact-medium); }
.meta-impact.impact-3::before { background: var(--impact-low); }
.meta-impact.impact-4::before { background: var(--impact-min); }

/* After: no dot, colored text directly */
.meta-impact {
    justify-content: center;
    font-weight: 600;
    letter-spacing: 0.02em;
}
.meta-impact::before { display: none; }  /* Remove dot */
.meta-impact.impact-1 { color: var(--impact-p1); }
.meta-impact.impact-2 { color: var(--impact-p2); }
.meta-impact.impact-3 { color: var(--impact-p3); }
.meta-impact.impact-4 { color: var(--impact-p4); }
```

Also **remove** the responsive breakpoint code (lines ~2824-2842) that adds `::after` text labels — they're now the default and no longer needed as a responsive-only behavior.

### Thinking needed

Search for ALL `.meta-impact` selectors in dashboard.css — there are overrides in completed states, dark mode, etc. that reference `::before`. These need updating to remove the dot references.

### Prompt

```
Replace P1/P2/P3/P4 with semantic impact labels.

READ FIRST:
- app/templates/_task_list.html lines 65-70 (impact label text)
- static/css/dashboard.css — search for ALL ".meta-impact" occurrences.
  List every line number before making changes.

TEMPLATE CHANGE (_task_list.html):
Change the impact text from P1→High, P2→Mid, P3→Low, P4→Min

CSS CHANGES (dashboard.css):
1. .meta-impact: add font-weight: 600, letter-spacing: 0.02em
2. .meta-impact::before: set display: none (removes the colored dot)
3. Add colored text rules:
   .meta-impact.impact-1 { color: var(--impact-p1); }
   .meta-impact.impact-2 { color: var(--impact-p2); }
   .meta-impact.impact-3 { color: var(--impact-p3); }
   .meta-impact.impact-4 { color: var(--impact-p4); }
4. Remove the responsive @media block (~lines 2824-2842) that adds ::after
   text labels — this is now the default behavior.
5. Update completed state overrides that reference .meta-impact::before —
   change them to reference the text color instead.
6. Check dark mode overrides for .meta-impact.

Do NOT change .meta-impact::after rules in rows where it serves a different
purpose (like mobile responsive labels that may still be needed).
```

**Model:** Sonnet

---

## Stage 5: Collapsible Sections + Header Simplification

**Goal:** Remove the view toggle (📅 ◆ 🗑) from header row 2. Make scheduled/completed sections always render and be collapsible in-place via `<details>`. Move trash to settings panel. Header row 2 becomes energy-only.

### Design rationale

The view toggle occupies prime header real estate for controls most users set once and forget. The scheduled and completed sections are structural parts of the task list — they should just be there, discoverable by scrolling, and collapsible in-place. This follows the existing `<details>` pattern used by domain groups.

### What changes

#### 5.1 Template: `app/templates/dashboard.html`

**Remove** from header-row2 (lines ~115-121):
- The `.header-row2-spacer` span
- The entire `.view-toggle` div (📅, ◆, 🗑 buttons)

Row 2 becomes:
```html
<div class="header-row2" id="header-row2">
    <div class="energy-wrapper" id="header-energy">
        <span class="energy-label">Energy</span>
        <div class="header-energy__pills">
            <!-- pills unchanged -->
        </div>
        <div class="clarity-dots" id="clarity-dots">
            <!-- dots unchanged -->
        </div>
    </div>
</div>
```

**Add** trash button to settings panel (line ~96, after the sp-divider):
```html
<div class="sp-divider"></div>
<button class="sp-action" id="show-scheduled-tasks-btn">📅 View all scheduled</button>
<button class="sp-action" id="show-completed-tasks-btn">✓ View all completed</button>
<button class="sp-action sp-action--danger" id="show-deleted-tasks-btn">🗑 View deleted</button>
```

#### 5.2 Template: `app/templates/_task_list.html`

Wrap sections in `<details>` with the separator as `<summary>`:

```html
{# ── Scheduled tasks — collapsible section ── #}
{% if scheduled_tasks %}
<details class="section-group" id="section-sched"
    {% if user_prefs.show_scheduled_in_list %}open{% endif %}>
    <summary class="section-separator">
        <span class="section-sep-label">Scheduled</span>
        <span class="section-count">{{ scheduled_tasks|length }}</span>
    </summary>
    <div class="section-tasks">
        {% for task_item in scheduled_tasks %}
        {{ render_task_item(task_item, today, encryption_enabled) }}
        {% endfor %}
    </div>
</details>
{% endif %}

{# ── Completed tasks — collapsible section ── #}
{% if completed_tasks %}
<details class="section-group" id="section-done"
    {% if user_prefs.show_completed_in_list %}open{% endif %}>
    <summary class="section-separator">
        <span class="section-sep-label">Completed</span>
        <span class="section-count">{{ completed_tasks|length }}</span>
    </summary>
    <div class="section-tasks">
        {% for task_item in completed_tasks %}
        {{ render_task_item(task_item, today, encryption_enabled) }}
        {% endfor %}
    </div>
</details>
{% endif %}
```

#### 5.3 CSS: `static/css/dashboard.css`

**Remove:**
- All `.view-toggle`, `.view-icon-btn`, `.view-icon-btn--delete` styles (lines ~520-586)
- `.header-row2-spacer` rule (line ~347)

**Add** section group styles:
```css
/* Collapsible section group */
.section-group {
    margin-top: 4px;
}

.section-group > summary {
    list-style: none;
    cursor: pointer;
}
.section-group > summary::-webkit-details-marker {
    display: none;
}

/* Disclosure triangle on section separator */
.section-separator {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 16px 0 0;
    padding: 6px 12px;
    cursor: pointer;
    border-radius: 6px;
    transition: background 0.15s ease;
}

.section-separator:hover {
    background: var(--row-hover);
}

/* Left disclosure triangle (matches domain group pattern) */
.section-separator::before {
    content: "\25B6";
    font-size: 0.5rem;
    color: var(--text-muted);
    transition: transform 0.15s ease;
    opacity: 0.5;
}

.section-group[open] .section-separator::before {
    transform: rotate(90deg);
}

/* Trailing line */
.section-separator::after {
    content: "";
    flex: 1;
    height: 1px;
    background: var(--border-default);
}

.section-sep-label {
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    white-space: nowrap;
}

/* Task count badge */
.section-count {
    font-size: 0.6rem;
    font-weight: 500;
    color: var(--text-muted);
    opacity: 0.7;
}

.section-tasks {
    /* Tasks inside the collapsible section */
}

/* Settings panel danger action (for trash) */
.sp-action--danger:hover {
    color: var(--danger, #DC2626);
}
```

#### 5.4 JS: `static/js/task-list-options.js`

**Remove:**
- `chip-sched` event listener setup (lines ~36-38)
- `chip-done` event listener setup (lines ~41-43)
- `chip-deleted` event listener setup (lines ~46-48)
- `handleChipToggle()` function (line ~130+) — no longer needed

**Add** section toggle handlers:
```javascript
// Section collapse/expand handlers
const sectionSched = document.getElementById('section-sched');
if (sectionSched) {
    sectionSched.addEventListener('toggle', () => {
        savePreference('show_scheduled_in_list', sectionSched.open);
    });
}

const sectionDone = document.getElementById('section-done');
if (sectionDone) {
    sectionDone.addEventListener('toggle', () => {
        savePreference('show_completed_in_list', sectionDone.open);
    });
}
```

**Update** trash button handler — change element ID:
```javascript
// Trash moved to settings panel
const showDeletedBtn = document.getElementById('show-deleted-tasks-btn');
if (showDeletedBtn) {
    showDeletedBtn.addEventListener('click', showDeletedTasks);
}
```

**Update** `showDeletedTasks()` — remove reference to `#chip-deleted`:
```javascript
function showDeletedTasks() {
    closePanel();
    currentView = 'deleted';
    // Remove: chipDeleted active state (no longer in header)
    setSpecialViewHeader(true);
    // ... rest unchanged
}
```

**Update** `showNormalTasks()` — remove reference to `#chip-deleted`:
```javascript
function showNormalTasks() {
    currentView = 'normal';
    // Remove: chipDeleted active state clear
    setSpecialViewHeader(false);
    // ... rest unchanged
}
```

#### 5.5 Backend: No changes needed

The backend already passes `scheduled_tasks` and `completed_tasks` to the template unconditionally (verified in `app/routers/pages.py` lines 378-379). The `show_scheduled_in_list` and `show_completed_in_list` preferences are read by the template for initial `<details open>` state and saved by JS on toggle. No backend logic changes required.

### Thinking needed

Moderate. The main risks are:
1. JS references to removed elements (`chip-sched`, `chip-done`, `chip-deleted`) — search comprehensively
2. The `handleChipToggle` function may be referenced elsewhere — verify before removing
3. CSS selectors referencing `.view-icon-btn` or `.view-chip` — search and remove
4. The `setSpecialViewHeader()` function hides header-row2 in special views — verify it still works after removing the spacer and view toggle
5. HTMX refresh (`refreshTaskList()`) re-renders `_task_list.html` — the new `<details>` structure must survive re-renders (JS should re-attach toggle listeners or use event delegation)

### Prompt

```
Remove header view toggle. Make sections collapsible in-place.

READ FIRST (understand all interactions before changing):
- app/templates/dashboard.html lines 100-121 (header row 2)
- app/templates/_task_list.html lines 112-130 (section rendering)
- static/css/dashboard.css — search for ALL: "view-toggle", "view-icon",
  "view-chip", "view-seg", "header-row2-spacer"
- static/js/task-list-options.js — search for ALL: "chip-sched", "chip-done",
  "chip-deleted", "handleChipToggle", "view-chip", "view-icon"
- app/routers/pages.py lines 376-379 (template data — verify both sections
  are always passed)

TEMPLATE CHANGES:

1. dashboard.html: Remove .header-row2-spacer and .view-toggle from row 2.
   Add trash button to settings panel: <button class="sp-action sp-action--danger"
   id="show-deleted-tasks-btn">🗑 View deleted</button>

2. _task_list.html: Wrap scheduled section in <details class="section-group"
   id="section-sched" {% if user_prefs.show_scheduled_in_list %}open{% endif %}>
   with the separator as <summary>. Add section-count span showing task count.
   Same for completed section with id="section-done".

CSS CHANGES:
- Remove ALL .view-toggle, .view-icon-btn, .view-icon-btn--delete rules
  (including dark mode)
- Remove .header-row2-spacer
- Add .section-group, .section-separator (updated for <summary>),
  .section-count styles
- Add .sp-action--danger hover style

JS CHANGES:
- Remove chip-sched, chip-done, chip-deleted event listeners
- Remove handleChipToggle() function
- Add <details> toggle event listeners for section-sched and section-done
  that call savePreference()
- Update showDeletedTasks() to use #show-deleted-tasks-btn, remove #chip-deleted refs
- Update showNormalTasks() to remove #chip-deleted refs
- IMPORTANT: Use event delegation on #task-list-scroll for the section toggle
  events, since HTMX re-renders may replace the <details> elements

CRITICAL: Keep the same preference keys (show_scheduled_in_list,
show_completed_in_list) — just change from header chip toggle to in-place
<details> toggle. The API contract doesn't change.
```

**Model:** Sonnet

---

## Stage 6: PR Cleanup

**Goal:** Bump version, sync lockfile, update changelog, run full checks, create PR.

### What changes

1. **`pyproject.toml`** — Bump version to `0.36.0`
2. **`uv lock`** — Sync lockfile
3. **`CHANGELOG.md`** — Add entry:

```markdown
## [0.36.0] - 2026-02-XX — Task List Visual Refinements

### Changed
- **Subtask badges** — neutral grey background replaces purple tint; badges no longer compete with task titles
- **Impact labels** — "P1/P2/P3/P4" (Todoist heritage) replaced with "High/Mid/Low/Min" in impact color; redundant dot indicator removed
- **Meta column readability** — resting opacity raised from 0.5 to 0.65; metadata readable without hovering
- **Single-dot clarity** — task row clarity column shows one colored dot instead of three (8 dots per screen instead of 24)
- **Collapsible sections** — Scheduled and Completed sections always render at bottom of task list; collapsible in-place via click (replaces header view toggle buttons)
- **Section separators** — left-aligned label with trailing line replaces centered label between two rules
- **TASKS label** — opacity increased from 0.38 to 0.50 for readability
- **Trash view** — moved from header toggle to settings panel action
```

4. **Run full checks:**
   ```bash
   uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test
   ```

5. **Update `tests/test_js_module_contract.py`** if any JS module exports changed

6. **Create PR** with title:
   `v0.36.0/feat: Task list refinements — semantic impact labels, single-dot clarity, collapsible sections`

### Prompt

```
Final PR cleanup for task list visual refinements.

1. Bump version in pyproject.toml to 0.36.0
2. Run: uv lock
3. Update CHANGELOG.md with a [0.36.0] entry. Describe all changes:
   subtask badges, impact labels, meta opacity, single-dot clarity,
   collapsible sections, section separators, TASKS label, trash to settings.
4. Run: uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test
5. Fix any lint/format/type/test errors.
6. If test_js_module_contract.py fails due to changed exports or removed
   elements, update test expectations.
7. Create PR branch and push. PR title:
   v0.36.0/feat: Task list refinements — semantic impact labels, single-dot clarity, collapsible sections
```

**Model:** Sonnet

---

## Files Changed (Complete List)

| File | Stage | Change |
|------|-------|--------|
| `static/css/tokens.css` | 3 | `--col-clarity: 32px` |
| `static/css/dashboard.css` | 1, 2, 3, 4, 5 | Subtask badge, meta opacity, label opacity, separator style, clarity dot, impact labels, section group, remove view toggle |
| `app/templates/dashboard.html` | 5 | Remove view toggle from header, add trash to settings panel |
| `app/templates/_task_list.html` | 3, 4, 5 | Single clarity dot, impact labels, collapsible section `<details>` |
| `static/js/task-list-options.js` | 5 | Remove chip handlers, add section toggle, update trash refs |
| `tests/test_js_module_contract.py` | 6 | Update if exports changed |
| `pyproject.toml` | 6 | Version bump |
| `uv.lock` | 6 | Lockfile sync |
| `CHANGELOG.md` | 6 | New entry |

## Risk Assessment

| Change | Risk | Mitigation |
|--------|------|------------|
| CSS micro-fixes (#1, #3, #6) | Very low | Single-value changes, no logic |
| Section separator style (#7) | Low | CSS-only, visual change |
| Single-dot clarity (#5) | Low | HTML simplification + CSS; many selectors to update but straightforward |
| Impact labels (#2) | Low | Template text + CSS; removes code (responsive ::after) |
| Collapsible sections (#4, #8) | Medium | Touches JS handlers, event delegation needed for HTMX compatibility |

## Design Reference

- **Mock (archived):** `docs/archive/scratchpad/design-fixes-mock.html`
- **Brand system:** `docs/brand/COLOR-SYSTEM.md`, `docs/brand/UI-KIT.md`
- **Tokens:** `static/css/tokens.css`
- **Previous redesigns:** `docs/archive/2026-01-TASK-LIST-HEADER-REDESIGN.md`, `docs/archive/2026-02-HEADER-REDESIGN-V2.md`
