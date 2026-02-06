# Task List Header Redesign

**Status:** Complete (v0.34.0)
**Scope:** Header restructure, options panel simplification, clarity naming revamp, task grouping changes

## Overview

The task list header is being redesigned from a single-row header with a bloated options dropdown (12 controls) into a **two-row command center** with always-visible filter chips and a minimal settings panel (2 controls).

Simultaneously, the clarity naming system is being revamped: `executable`/`defined`/`exploratory` → `clear`/`defined`/`open` throughout the entire stack (DB, Python, CSS, JS, templates).

### Design Principles

1. **Modes are not settings** — show/hide scheduled and completed are daily operations, not configuration. They become always-visible 1-click chips.
2. **Opinionated defaults** — "Group at bottom" and "Sort by date" are always on. These are what ~everyone wants, and removing the toggles eliminates 4 controls plus invalid state combinations.
3. **Flat bottom sections** — Scheduled and completed tasks at the bottom are shown as flat chronological lists without domain sub-grouping. The domain breakdown only matters for active tasks.
4. **No jargon** — "Executable" and "Exploratory" become "Clear" and "Open". Energy tooltips use everyday language: "no-brainers", "clear tasks", "deep work too".

### Before → After

```
BEFORE (single row + 12-control dropdown):
┌─────────────────────────────────────────────────────────────┐
│ [Energy 🧟☕🧠]               [Duration][Impact][Clarity][⋮]│
└─────────────────────────────────────────────────────────────┘
  ⋮ dropdown: 8 toggles + 1 segmented + 3 action buttons

AFTER (two rows + 2-control gear panel):
┌─────────────────────────────────────────────────────────────┐
│ Tasks                          [Duration][Impact][Clarity][⚙]│
│ Energy [🧟][☕][🧠]              [📅 Sched][✓ Done][🗑]    │
└─────────────────────────────────────────────────────────────┘
  ⚙ panel: 1 segmented + 1 toggle + 2 action links
```

### Interactive Demo

See `/scratchpad/redesign-demo.html` (created during design phase) for the interactive prototype.

---

## Phase 1: Clarity Naming Revamp (DB migration + full stack)

The clarity system uses three levels. The internal values and display labels are changing:

| Old DB value   | New DB value | Old display   | New display | Old tooltip         | New tooltip      |
|----------------|-------------|---------------|-------------|---------------------|------------------|
| `executable`   | `clear`     | "Executable"  | "Clear"     | "Can do tired"      | "No-brainer"     |
| `defined`      | `defined`   | "Defined"     | "Defined"   | "Needs focus"       | "Needs focus"    |
| `exploratory`  | `open`      | "Exploratory" | "Open"      | "Needs thinking"    | "Needs thinking" |

Energy tooltip updates:

| Level | Old tooltip                    | New tooltip                  |
|-------|--------------------------------|------------------------------|
| 🧟    | "Zombie: executable only"      | "Zombie — no-brainers"      |
| ☕    | "Normal: executable + defined" | "Normal — clear tasks"       |
| 🧠    | "Focus: all tasks"             | "Focus — deep work too"      |

### Files to change

#### 1.1 Database Migration

Create migration: `just migrate-new "rename clarity values executable to clear and exploratory to open"`

```sql
-- Forward
UPDATE tasks SET clarity = 'clear' WHERE clarity = 'executable';
UPDATE tasks SET clarity = 'open' WHERE clarity = 'exploratory';
-- defined stays as-is

-- Reverse
UPDATE tasks SET clarity = 'executable' WHERE clarity = 'clear';
UPDATE tasks SET clarity = 'exploratory' WHERE clarity = 'open';
```

#### 1.2 Python: `app/services/labels.py`

```python
# Old
class Clarity(Enum):
    EXECUTABLE = "executable"
    DEFINED = "defined"
    EXPLORATORY = "exploratory"

CLARITY_LABELS = {
    "executable": Clarity.EXECUTABLE,
    "defined": Clarity.DEFINED,
    "exploratory": Clarity.EXPLORATORY,
}

def clarity_display(clarity):
    return {
        Clarity.EXECUTABLE: "Executable",
        Clarity.DEFINED: "Defined",
        Clarity.EXPLORATORY: "Exploratory",
    }[clarity]

# New
class Clarity(Enum):
    CLEAR = "clear"
    DEFINED = "defined"
    OPEN = "open"

CLARITY_LABELS = {
    "clear": Clarity.CLEAR,
    "defined": Clarity.DEFINED,
    "open": Clarity.OPEN,
}

def clarity_display(clarity):
    return {
        Clarity.CLEAR: "Clear",
        Clarity.DEFINED: "Defined",
        Clarity.OPEN: "Open",
    }[clarity]
```

#### 1.3 Python: `app/models.py` (line 294 comment)

Update `Task.clarity` field comment from `"executable/defined/exploratory"` to `"clear/defined/open"`.

#### 1.4 JavaScript: `static/js/task-sort.js` (line 19)

```javascript
// Old
const CLARITY_ORDER = { exploratory: 1, defined: 2, executable: 3, none: 4 };

// New
const CLARITY_ORDER = { open: 1, defined: 2, clear: 3, none: 4 };
```

Also update comments on lines 6-7 that reference "exploratory→executable".

#### 1.5 JavaScript: `static/js/energy-selector.js` (lines 8-10 comments)

Update comments from `@executable`/`@defined`/`@exploratory` to `@clear`/`@defined`/`@open`.

#### 1.6 JavaScript: `static/js/plan-tasks.js` (lines ~1180-1241, ~1406)

Search for all references to `executable`/`exploratory` clarity values and update to `clear`/`open`.

#### 1.7 JavaScript: `static/js/wizard.js` (lines ~586-629)

Update onboarding wizard clarity references.

#### 1.8 JavaScript: `static/js/task-dialog.js` (lines ~23-25)

Update clarity pill data values.

#### 1.9 CSS: `static/css/dashboard.css` (lines 1665-1707)

Energy filtering CSS rules — update all selectors:

```css
/* Old */
body[data-energy-level="1"] .task-item[data-clarity="defined"],
body[data-energy-level="1"] .task-item[data-clarity="exploratory"] { display: none; }
body[data-energy-level="2"] .task-item[data-clarity="exploratory"] { display: none; }
body[data-energy-level="1"] .project-group:not(:has(.task-item[data-clarity="executable"])) { ... }
body[data-energy-level="2"] .project-group:not(:has(.task-item[data-clarity="executable"], .task-item[data-clarity="defined"])) { ... }

/* New */
body[data-energy-level="1"] .task-item[data-clarity="defined"],
body[data-energy-level="1"] .task-item[data-clarity="open"] { display: none; }
body[data-energy-level="2"] .task-item[data-clarity="open"] { display: none; }
body[data-energy-level="1"] .project-group:not(:has(.task-item[data-clarity="clear"])) { ... }
body[data-energy-level="2"] .project-group:not(:has(.task-item[data-clarity="clear"], .task-item[data-clarity="defined"])) { ... }
```

#### 1.10 CSS: `static/css/dialog.css` (lines 395-397)

```css
/* Old */
.seg-btn[data-clarity="executable"] { color: var(--executable-color, #167BFF); }
.seg-btn[data-clarity="exploratory"] { color: var(--exploratory-color, #A020C0); }

/* New */
.seg-btn[data-clarity="clear"] { color: var(--clear-color, #167BFF); }
.seg-btn[data-clarity="open"] { color: var(--open-color, #A020C0); }
```

#### 1.11 CSS: `static/css/components/forms.css` (lines 115-117)

```css
/* Old */
.seg-btn[data-clarity="executable"] { ... }
.seg-btn[data-clarity="exploratory"] { ... }

/* New */
.seg-btn[data-clarity="clear"] { ... }
.seg-btn[data-clarity="open"] { ... }
```

Also rename CSS custom properties: `--clarity-executable` → `--clear-color`, `--clarity-exploratory` → `--open-color`.

#### 1.12 CSS: `static/css/tokens.css`

Rename color token comments/names if they reference "Executable Blue" / "Exploratory Magenta" → "Clear Blue" / "Open Magenta".

#### 1.13 Templates: `app/templates/dashboard.html` (lines 62-63)

```html
<!-- Old -->
<button ... title="Zombie: executable only">🧟</button>
<button ... title="Normal: executable + defined">☕</button>

<!-- New -->
<button ... title="Zombie — no-brainers">🧟</button>
<button ... title="Normal — clear tasks">☕</button>
<button ... title="Focus — deep work too">🧠</button>
```

#### 1.14 Templates: `app/templates/tasks/_task_form_content.html` (lines 59-61)

```html
<!-- Old -->
<button ... data-clarity="executable" title="Can do tired">Executable</button>
<button ... data-clarity="defined" title="Needs focus">Defined</button>
<button ... data-clarity="exploratory" title="Needs thinking">Exploratory</button>

<!-- New -->
<button ... data-clarity="clear" title="No-brainer">Clear</button>
<button ... data-clarity="defined" title="Needs focus">Defined</button>
<button ... data-clarity="open" title="Needs thinking">Open</button>
```

#### 1.15 Templates: `app/templates/login.html` (lines 20-29)

Update CSS classes and titles from `clarity-exploratory`/`clarity-executable` to `clarity-open`/`clarity-clear`.

#### 1.16 Templates: `app/templates/settings.html` (lines ~1345-1347)

Update `setTaskClarity()` calls from `'executable'`/`'exploratory'` to `'clear'`/`'open'`.

#### 1.17 Templates: `app/templates/_svg_sprites.html` (lines ~506, ~522)

Update comments referencing "Executable clarity color" and "Exploratory clarity color".

#### 1.18 Brand docs: `docs/brand/*.html`

Update all references. Lower priority — these are reference docs, not user-facing. Can be a follow-up PR.

---

## Phase 2: Header Restructure (template + CSS)

### Current header structure (dashboard.html lines 47-200)

```
.task-list-header
  ├── .header-task
  │   ├── .header-task-label "Tasks"
  │   ├── #header-back-btn (hidden)
  │   ├── #header-view-count (hidden)
  │   └── .header-energy (Energy + 🧟☕🧠 pills)
  ├── .header-meta (Duration, Impact, Clarity sort buttons)
  └── .header-actions
      ├── #header-actions-btn (⋮ button)
      └── .task-list-options-menu (the entire 12-control dropdown)
```

### New header structure

```
.task-list-header
  ├── .header-row1
  │   ├── .header-task-label "Tasks" / #header-back-btn (mutually exclusive)
  │   ├── #header-view-count (shown in special views)
  │   ├── .header-sorts (Duration, Impact, Clarity buttons)
  │   └── .settings-anchor
  │       ├── .gear-btn (⚙ button, replaces ⋮)
  │       └── .settings-panel (tiny dropdown, 2 controls)
  └── .header-row2 (NEW — filter bar)
      ├── .energy-wrapper
      │   ├── .energy-label "Energy"
      │   └── .energy-group (🧟☕🧠 pills — same behavior)
      ├── spacer
      └── .view-chips
          ├── .view-chip#chip-sched "📅 Sched" (toggle: show_scheduled_in_list)
          ├── .view-chip#chip-done "✓ Done" (toggle: show_completed_in_list)
          └── .view-chip.chip-delete#chip-deleted "🗑" (view switch: deleted tasks)
```

### Files to change

#### 2.1 Template: `app/templates/dashboard.html`

**Remove** (lines 82-200): The entire `.header-actions` span including the `⋮` button and `.task-list-options-menu` dropdown.

**Restructure** (lines 47-81): Wrap existing elements into `.header-row1`:
- Move "Tasks" label and back button into row 1
- Keep sort buttons in row 1
- Add `.settings-anchor` with `⚙` button and new tiny `.settings-panel`

**Add** `.header-row2` after row 1:
- Move `.header-energy` here (from its current location inside `.header-task`)
- Add `.energy-label` "Energy" text
- Add `.view-chips` with three chip buttons

**New settings panel contents** (replaces the 12-control dropdown):
```html
<div class="settings-panel" id="settings-panel" hidden>
  <div class="sp-title">Completed tasks</div>
  <div class="sp-row">
    <span class="sp-label">Keep visible for</span>
    <!-- Segmented: 1d/3d/7d (same as current) -->
  </div>
  <div class="sp-row">
    <span class="sp-label">Hide recurring after done</span>
    <!-- Toggle (same as current) -->
  </div>
  <div class="sp-divider"></div>
  <button class="sp-action" id="show-scheduled-tasks-btn">📅 View all scheduled</button>
  <button class="sp-action" id="show-completed-tasks-btn">✓ View all completed</button>
</div>
```

#### 2.2 CSS: `static/css/dashboard.css`

**Remove** (lines ~428-618): All `.task-list-options-menu` styles, `.option-section`, `.option-row`, `.option-toggle`, `.option-segmented`, `.option-action-btn`, etc.

**Add** new styles:
- `.header-row1`, `.header-row2` — flex layout for two-row header
- `.energy-wrapper`, `.energy-label` — energy group with label
- `.view-chips`, `.view-chip` — chip buttons with active/inactive states, transitions
- `.chip-delete` — distinct styling for the 🗑 chip
- `.settings-anchor`, `.gear-btn` — gear button positioning
- `.settings-panel` — tiny dropdown (replaces `.task-list-options-menu`)
- `.sp-title`, `.sp-row`, `.sp-label`, `.sp-seg`, `.sp-action` — settings panel internals

**Modify** existing styles:
- `.task-list-header` — accommodate two rows (adjust height/padding)
- `.header-energy` — reposition for new location in row 2
- `.header-back-btn` — adjust for row 1 layout

#### 2.3 Special view behavior

When entering deleted/scheduled/completed special views:
- `.header-row2` (filter bar) is hidden
- `.header-sorts` is hidden
- `.header-back-btn` becomes visible in row 1
- `.header-task-label` changes to "Deleted Tasks" / etc.
- This matches current behavior, just adapted to the new two-row structure.

---

## Phase 3: Task Grouping Changes (backend)

### 3.1 Hardcode opinionated defaults: `app/services/task_grouping.py`

**Remove** preference lookups (lines 119-122):
```python
# DELETE these lines:
move_to_bottom = user_prefs.completed_move_to_bottom if user_prefs else True
completed_sort_by_date = user_prefs.completed_sort_by_date if user_prefs else True
scheduled_to_bottom = user_prefs.scheduled_move_to_bottom if user_prefs else True
scheduled_sort_by_date = user_prefs.scheduled_sort_by_date if user_prefs else True
```

**Replace** with hardcoded values:
```python
# Opinionated defaults — always separate at bottom, always sort by date
move_to_bottom = True
completed_sort_by_date = True
scheduled_to_bottom = True
scheduled_sort_by_date = True
```

This means the ordering logic (lines 201-222) will always take the first branch:
```python
# Both completed and scheduled at bottom: unscheduled -> scheduled -> completed
domain_tasks = unscheduled_pending + scheduled_pending + completed
```

The other three branches become dead code and should be removed.

### 3.2 Flatten scheduled/completed sections: `app/services/task_grouping.py`

Currently, scheduled and completed tasks are grouped within their parent domain. The redesign shows them as **flat lists** under section separators, without domain sub-grouping.

**Change the return structure.** Currently returns:
```python
[
  {"domain": Domain("Work"), "tasks": [active1, active2, scheduled1, completed1]},
  {"domain": Domain("Personal"), "tasks": [active3, scheduled2, completed2]},
]
```

New return structure:
```python
{
  "domain_groups": [
    {"domain": Domain("Work"), "tasks": [active1, active2]},
    {"domain": Domain("Personal"), "tasks": [active3]},
  ],
  "scheduled_tasks": [scheduled1, scheduled2],   # flat, sorted by date
  "completed_tasks": [completed1, completed2],    # flat, sorted by completion date
}
```

**Implementation approach:**
1. Collect scheduled and completed tasks separately across ALL domains into flat lists
2. Sort scheduled by `scheduled_task_sort_key` (date)
3. Sort completed by `completed_task_sort_key` (completion date)
4. Return them as separate keys in the result dict
5. Only active/unscheduled tasks remain in the `domain_groups` structure

**Callers to update:**
- `app/routers/pages.py` — where `group_tasks_by_domain()` result is passed to templates
- `app/templates/_task_list.html` — render the three sections separately

### 3.3 Template changes: `app/templates/_task_list.html`

Currently renders a single loop over `domains_with_tasks`. Needs to become three sections:

```html
{# Active tasks — grouped by domain #}
{% for domain_item in domain_groups %}
  <details class="project-group" ...>
    <summary class="project-header">{{ domain_item.domain.name }}</summary>
    {% for task_item in domain_item.tasks %}
      {# ... task row ... #}
    {% endfor %}
  </details>
{% endfor %}

{# Scheduled tasks — flat list with separator #}
{% if scheduled_tasks %}
  <div class="section-separator" id="section-sched">
    <span class="section-sep-label">Scheduled</span>
  </div>
  {% for task_item in scheduled_tasks %}
    {# ... task row (no domain grouping) ... #}
  {% endfor %}
{% endif %}

{# Completed tasks — flat list with separator #}
{% if completed_tasks %}
  <div class="section-separator" id="section-done">
    <span class="section-sep-label">Completed</span>
  </div>
  {% for task_item in completed_tasks %}
    {# ... task row (no domain grouping) ... #}
  {% endfor %}
{% endif %}
```

Section separators need CSS styling (the horizontal line with label, as shown in the demo).

### 3.4 Remove deprecated preferences from API schema

**`app/routers/preferences.py`:**
- Remove from `PreferencesUpdate`: `completed_move_to_bottom`, `completed_sort_by_date`, `scheduled_move_to_bottom`, `scheduled_sort_by_date`
- Keep in `PreferencesResponse` for backwards compatibility (existing clients may read them)

**`app/services/preferences_service.py`:**
- Stop accepting these in `update_preferences()` kwargs

**DB columns:** Keep in `app/models.py` — they're harmless and avoiding a column-drop migration reduces risk. The columns become unused but don't hurt.

---

## Phase 4: JavaScript Refactor (`static/js/task-list-options.js`)

### 4.1 Remove

- **Toggle handlers** for 6 removed controls: `show_scheduled_in_list` (moved to chip), `show_completed_in_list` (moved to chip), `scheduled_move_to_bottom`, `scheduled_sort_by_date`, `completed_move_to_bottom`, `completed_sort_by_date`
- **Cascading `data-controls` visibility logic** — no more nested show/hide for sub-options
- **`showScheduledTasks()` and `showCompletedTasks()` button handlers** — these move to settings panel action links (simpler)
- All old `.option-toggle` event listener setup

### 4.2 Add

- **Chip toggle handlers**: Click `#chip-sched` → toggle `show_scheduled_in_list` preference → animate `#section-sched` section → refresh task list
- **Chip toggle handlers**: Click `#chip-done` → toggle `show_completed_in_list` preference → animate `#section-done` section → refresh task list
- **Deleted view chip**: Click `#chip-deleted` → enter deleted tasks view (same logic as current `showDeletedTasks()`, adapted for chip active state)
- **Gear panel**: Toggle `#settings-panel` visibility on `⚙` click (simpler than current menu toggle)
- **Section animation**: CSS `max-height` transition for collapsing/expanding scheduled and completed sections when chips are toggled

### 4.3 Keep unchanged

- `refreshTaskList()` — same HTMX refresh mechanism
- `restoreTask()` — same restore logic for deleted tasks
- `showToast()` — same toast notifications
- `savePreference()` — same API call mechanism
- `showNormalTasks()` / `setSpecialViewHeader()` — adapted for new header structure
- Delegated click handlers for restore/back buttons

### 4.4 `static/js/task-sort.js`

**Hardcode preferences** (lines 29-34):
```javascript
// Old — loaded from API
let userPrefs = {
    completed_move_to_bottom: true,
    completed_sort_by_date: true,
    scheduled_move_to_bottom: true,
    scheduled_sort_by_date: true,
};

// New — hardcoded (always true now)
const SECTION_PREFS = {
    completed_move_to_bottom: true,
    completed_sort_by_date: true,
    scheduled_move_to_bottom: true,
    scheduled_sort_by_date: true,
};
```

Remove `loadUserPreferences()` API call (lines 60-74) and `updatePreference()` function — these are no longer needed since values are constant.

---

## Phase 5: CSS Energy Filtering Adjustment

After the clarity rename, the energy filtering CSS (dashboard.css lines 1665-1707) needs updating to use new `data-clarity` values. This is covered in Phase 1 (section 1.9) but noting here for completeness since it interacts with the header redesign.

The `data-clarity` attribute on task items in `_task_list.html` (line 20) will automatically use new values since it reads `task.clarity` from the DB (which is migrated in Phase 1).

---

## Implementation Order

Recommended execution order to minimize risk:

1. **Phase 1 (Clarity Naming)** — standalone, can be its own PR
   - DB migration + Python enum + all CSS/JS/template label updates
   - Fully testable in isolation
   - `v0.33.0/refactor: Rename clarity levels — executable→clear, exploratory→open`

2. **Phase 3.1-3.2 (Task Grouping Backend)** — backend prep for new UI
   - Hardcode sort/group preferences
   - Restructure `group_tasks_by_domain()` return value
   - Update `_task_list.html` to render flat sections
   - Can land before header UI changes (visually adds section separators)
   - `v0.33.1/refactor: Flatten scheduled/completed sections, hardcode group-at-bottom`

3. **Phase 2 + 3.3 + 3.4 + 4 (Header + Panel + JS)** — the main UI change
   - Header restructure with two rows
   - Options dropdown → filter chips + gear panel
   - JavaScript refactor
   - Remove deprecated preference fields from API
   - `v0.34.0/feat: Redesign task list header with filter chips and minimal settings`

Alternative: ship all 3 phases as a single PR if you prefer one atomic change.

---

## Files Changed (Complete List)

| File | Phase | Change |
|------|-------|--------|
| `app/services/labels.py` | 1 | Clarity enum values + display labels |
| `app/models.py` | 1 | Comment update on Task.clarity |
| `app/services/task_grouping.py` | 1, 3 | Clarity refs + hardcode prefs + flatten sections |
| `app/routers/preferences.py` | 3 | Remove deprecated fields from PreferencesUpdate |
| `app/services/preferences_service.py` | 3 | Stop accepting removed preference kwargs |
| `app/routers/pages.py` | 3 | Pass new return structure to templates |
| `app/templates/dashboard.html` | 1, 2 | Energy tooltips + full header restructure |
| `app/templates/_task_list.html` | 3 | Three-section rendering with separators |
| `app/templates/tasks/_task_form_content.html` | 1 | Clarity pill labels + data values |
| `app/templates/settings.html` | 1 | Clarity button labels |
| `app/templates/login.html` | 1 | Clarity CSS class names |
| `app/templates/_svg_sprites.html` | 1 | Comment updates |
| `static/css/dashboard.css` | 1, 2 | Energy CSS selectors + header styles + remove old options styles |
| `static/css/dialog.css` | 1 | Clarity color selectors |
| `static/css/components/forms.css` | 1 | Clarity color selectors |
| `static/css/tokens.css` | 1 | Color token name comments |
| `static/js/task-list-options.js` | 4 | Major refactor: chips + gear panel |
| `static/js/task-sort.js` | 1, 4 | Clarity order + hardcode prefs |
| `static/js/energy-selector.js` | 1 | Comment updates |
| `static/js/task-dialog.js` | 1 | Clarity data values |
| `static/js/plan-tasks.js` | 1 | Clarity references in plan view |
| `static/js/wizard.js` | 1 | Clarity references in onboarding |
| Migration file (new) | 1 | Rename clarity values in tasks table |
| `docs/brand/*.html` | 1 | Color/clarity naming (follow-up) |
