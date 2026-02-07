# Design Audit Implementation Plan

**Status:** Planned
**Base version:** 0.36.0
**Target version:** 0.37.0
**PR title:** `v0.37.0/feat: Design audit — clarity labels, ghost checkbox, header merge, Plan My Day banner`

## Overview

Ten changes from a comprehensive design audit of the task list view. Grouped into 9 stages ordered by risk (CSS-only first, structural changes last).

**Mock:** `docs/archive/scratchpad/design-audit-options.html`

| # | Change | What | Complexity | Files |
|---|--------|------|-----------|-------|
| **1** | Meta column opacity | 0.65 → 0.85, remove hover→1 transition | CSS only | `dashboard.css` |
| **2** | Remove domain chevron | Kill right ">" on domain headers | CSS only | `dashboard.css` |
| **3** | Clarity text labels | Dot → "Clear"/"Def"/"Open" in color | HTML + CSS | `_task_list.html`, `dashboard.css`, `tokens.css` |
| **4** | Ghost checkbox | Always-visible check circle at 30% | CSS only | `dashboard.css` |
| **5** | Add task affordance | Dashed row + "+" in domain header | HTML + CSS | `_task_list.html`, `dashboard.css` |
| **6** | Domain task counts | Show count on all domains | HTML + CSS | `_task_list.html`, `dashboard.css` |
| **7** | Header merge | Remove TASKS label, move energy to row 1 | HTML + CSS + JS | `dashboard.html`, `dashboard.css`, `task-list-options.js` |
| **8** | Plan My Day banner | Contextual CTA at top of task list | HTML + CSS + JS | `dashboard.html`, `_task_list.html`, `dashboard.css` |
| **9** | Calendar auto-advance + hero | Tomorrow after 8pm, hero card in dead space | HTML + CSS + JS | `dashboard.html`, `dashboard.css` |

## Implementation Order

```
Stage 1: CSS micro-fixes (#1, #2, #4)        — zero risk, no HTML
Stage 2: Clarity text labels (#3)             — HTML + CSS, independent
Stage 3: Add task affordance (#5)             — HTML + CSS, independent
Stage 4: Domain task counts (#6)              — HTML + CSS, independent
Stage 5: Header merge (#7)                    — structural, touches JS
Stage 6: Plan My Day banner (#8)              — HTML + CSS + JS
Stage 7: Calendar auto-advance + hero (#9)    — JS + HTML + CSS
Stage 8: PR cleanup                           — version, changelog, tests
```

Stages 1–4 are independent (no shared changes). Stage 5 restructures the header which Stage 6's banner sits below. Stage 7 is calendar-only. Stage 8 is always last.

---

## Stage 1: CSS Micro-Fixes

**Goal:** Three CSS-only changes. Meta opacity bump, remove domain chevron, ghost checkbox.

### What changes

**`static/css/dashboard.css`**

**Fix #1 — Meta column opacity (lines ~1053-1064):**

Find:
```css
.task-item .meta-duration,
.task-item .meta-impact,
.task-item .meta-clarity {
    opacity: 0.65;
    transition: opacity var(--duration-fast) var(--ease-default);
}

.task-item:hover .meta-duration,
.task-item:hover .meta-impact,
.task-item:hover .meta-clarity {
    opacity: 1;
}
```

Replace with:
```css
.task-item .meta-duration,
.task-item .meta-impact,
.task-item .meta-clarity {
    opacity: 0.85;
}
```

Remove the hover→1 transition entirely. At 0.85, the difference between rest and hover is negligible — removing it eliminates a visual distraction.

**Fix #2 — Remove domain right chevron:**

Search for ANY `::after` on `.project-header`, `.project-name`, or `.project-group > summary`. Also search for any `content:` rule generating a `>` or chevron character. If found, remove it.

If no CSS `::after` is found, the chevron may be a browser default `<details>` marker that wasn't fully suppressed. In that case, add to the existing `.project-group > summary` rule (line ~830):
```css
.project-group > summary {
    list-style: none;
}

.project-group > summary::marker {
    display: none;
    content: "";
}
```

**Fix #4 — Ghost checkbox (lines ~1169-1179):**

The `.complete-check` element is currently `opacity: 0` at rest and `opacity: 1` on hover. Change to always-visible ghost at 30%:

Find (lines ~1169-1173):
```css
.complete-gutter--hover .complete-check {
    opacity: 0;
    transform: scale(0.9);
    transition: opacity 0.15s ease, transform 0.15s ease, background 0.15s ease, color 0.15s ease;
}
```

Replace with:
```css
.complete-gutter--hover .complete-check {
    opacity: 0.3;
    transform: scale(1);
    transition: opacity 0.15s ease, background 0.15s ease, color 0.15s ease;
}
```

Also update the hover state (lines ~1175-1179) — keep `opacity: 1` and `transform: scale(1)` as-is. The ghost→full transition on hover provides satisfying feedback.

Also add a border to make the check circle visible as a circle at low opacity. Find `.complete-check` (line ~1130):
```css
.complete-check {
    width: 16px;
    height: 16px;
    border-radius: 8px;
    display: grid;
    place-items: center;
    font-size: 10px;
    font-weight: 800;
    opacity: 0;
    transform: scale(0.9);
    transition: opacity 120ms ease, transform 120ms ease;
    background: rgba(15, 23, 42, 0.06);
    color: var(--text-primary);
    position: relative;
    z-index: 1;
}
```

Add a subtle border:
```css
.complete-check {
    width: 16px;
    height: 16px;
    border-radius: 8px;
    border: 1.5px solid var(--border-default);
    display: grid;
    place-items: center;
    font-size: 10px;
    font-weight: 800;
    opacity: 0;
    transform: scale(0.9);
    transition: opacity 120ms ease, transform 120ms ease;
    background: transparent;
    color: transparent;
    position: relative;
    z-index: 1;
}
```

Note: The `opacity: 0` in the base class is overridden by `.complete-gutter--hover .complete-check` (which is the task list context). The base class `opacity: 0` is correct — it's used by the calendar's `complete-gutter--always` variant which has its own opacity rules.

Update the purple hover effect (line ~1182):
```css
.complete-gutter--hover:hover .complete-check {
    background: rgba(109, 94, 246, 0.08);
    border-color: rgba(109, 94, 246, 0.35);
    color: var(--primary);
}
```

Update completed state (line ~1188):
```css
.task-item[data-completed="1"] .complete-check {
    opacity: 1;
    transform: scale(1);
    background: rgba(109, 94, 246, 0.12);
    border-color: rgba(109, 94, 246, 0.35);
    color: var(--primary);
}
```

### Prompt

```
Read static/css/dashboard.css and make these CSS-only changes:

1. Lines ~1053-1064: Meta column opacity — change 0.65 to 0.85, DELETE the
   hover-to-1 rule (the 6 lines starting with .task-item:hover .meta-duration).
   At 0.85 there's no need for a hover reveal.

2. Search for ANY ::after on .project-header, .project-name, or
   .project-group > summary that could create a right-side chevron ">".
   If found, remove it.
   Also add to .project-group > summary (line ~830):
     .project-group > summary::marker { display: none; content: ""; }

3. Ghost checkbox — four changes:
   a. Line ~1130 (.complete-check base): Change background to transparent,
      color to transparent, add border: 1.5px solid var(--border-default)
   b. Line ~1169 (.complete-gutter--hover .complete-check): Change opacity
      from 0 to 0.3, transform from scale(0.9) to scale(1)
   c. Line ~1182 (.complete-gutter--hover:hover .complete-check): Add
      border-color: rgba(109, 94, 246, 0.35)
   d. Line ~1188 (.task-item[data-completed="1"] .complete-check): Add
      border-color: rgba(109, 94, 246, 0.35)

Do NOT change .complete-gutter--always styles (calendar panel).
Do NOT change the hover opacity: 1 rule for task-item:hover .complete-check.
Do NOT touch any dark mode overrides yet — they'll be updated if needed.
```

**Model:** Sonnet

---

## Stage 2: Clarity Text Labels

**Goal:** Replace the 7px clarity dot with colored text labels: "Clear"/"Def"/"Open". This mirrors the impact column pattern (High/Mid/Low/Min in color) and makes clarity immediately readable without learning color codes.

### What changes

**`static/css/tokens.css`** (line 158):
```css
--col-clarity: 42px;  /* Was 32px — text label needs more width */
```

**`app/templates/_task_list.html`** (lines ~71-73 in render_task_item macro):

Replace:
```html
<span class="meta-clarity clarity-{{ task.clarity or 'none' }}">
    <span class="clarity-dot"></span>
</span>
```

With:
```html
<span class="meta-clarity clarity-{{ task.clarity or 'none' }}">
    {% if task.clarity == 'clear' %}Clear
    {% elif task.clarity == 'defined' %}Def
    {% elif task.clarity == 'open' %}Open
    {% else %}—{% endif %}
</span>
```

**`static/css/dashboard.css`** — Replace `.meta-clarity` styles (lines ~1703-1719):

Remove the `.clarity-dot` rules entirely. Replace with:
```css
.meta-clarity {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.02em;
}

.meta-clarity.clarity-clear { color: var(--clear-color); }
.meta-clarity.clarity-defined { color: var(--clarity-defined); }
.meta-clarity.clarity-open { color: var(--open-color); }
.meta-clarity.clarity-none { color: var(--text-muted); opacity: 0.5; }
```

Also update:
- **Completed task overrides** (line ~1212-1215): Change `.meta-clarity .clarity-dot { opacity: 0.4; }` to just rely on the existing `.task-item[data-completed="1"] .meta-clarity { color: rgba(15, 23, 42, 0.5); }` rule at line ~1208. Remove the `.clarity-dot` reference.
- **Dark mode overrides**: Search for ALL `.clarity-dot` references and remove/update them.
- **Responsive breakpoints** (lines ~2668, ~2766): The `--col-clarity` token is used via `var()` in the grid template, so the column width update propagates automatically. BUT the hardcoded breakpoint grid templates (lines 2668 and 2766) need the clarity column bumped:
  - Line 2668: `grid-template-columns: 1fr 44px 40px 56px 24px;` — the 4th value (56px) was for the old impact+clarity layout. This is actually `impact(40px) clarity(old)`. Wait — this grid has 5 columns: `1fr duration impact clarity actions`. At 900px: `1fr 44px 40px 56px 24px`. The 56px was for the old wider clarity. Since we're going back to 42px, leave this as-is or adjust to `1fr 44px 40px 42px 24px`.
  - Line 2766: `1fr 32px 28px 44px 20px`. The clarity column (44px) is fine for the text.

### Thinking needed

Search dashboard.css for ALL references to `.clarity-dot` and `.meta-clarity .cdot`. There are overrides in completed states, dark mode, and responsive sections. List every line number before changing.

### Prompt

```
Replace clarity dot with text labels.

READ FIRST (understand all references before changing):
- static/css/tokens.css line 158 (--col-clarity)
- app/templates/_task_list.html lines 71-73 (clarity markup in render_task_item)
- static/css/dashboard.css — search for ALL occurrences of:
  ".clarity-dot", ".meta-clarity", "clarity-clear", "clarity-defined",
  "clarity-open", "clarity-none"
  List every line number before making changes.

CHANGES:

1. tokens.css: Change --col-clarity from 32px to 42px

2. _task_list.html: In the render_task_item macro, replace:
   <span class="meta-clarity clarity-{{ task.clarity or 'none' }}">
       <span class="clarity-dot"></span>
   </span>
   With:
   <span class="meta-clarity clarity-{{ task.clarity or 'none' }}">
       {% if task.clarity == 'clear' %}Clear
       {% elif task.clarity == 'defined' %}Def
       {% elif task.clarity == 'open' %}Open
       {% else %}—{% endif %}
   </span>

3. dashboard.css: Replace .meta-clarity + .clarity-dot rules with:
   .meta-clarity {
       display: inline-flex;
       align-items: center;
       justify-content: center;
       font-size: 0.65rem;
       font-weight: 600;
       letter-spacing: 0.02em;
   }
   .meta-clarity.clarity-clear { color: var(--clear-color); }
   .meta-clarity.clarity-defined { color: var(--clarity-defined); }
   .meta-clarity.clarity-open { color: var(--open-color); }
   .meta-clarity.clarity-none { color: var(--text-muted); opacity: 0.5; }

4. Remove ALL .clarity-dot references throughout the file:
   - Completed state overrides referencing .clarity-dot
   - Dark mode overrides referencing .clarity-dot
   - Responsive breakpoints referencing .clarity-dot

5. Responsive grid columns:
   - Line ~2668 (max-width: 900px): Change 4th column from 56px to 42px
   - Line ~2766 (max-width: 580px): Leave 44px as-is (close enough to 42px)

IMPORTANT: Do NOT change the header clarity dots (.clarity-dots .cdot in
header row 2). Those are a DIFFERENT component for the energy indicator
and stay as three dots.
```

**Model:** Sonnet

---

## Stage 3: Add Task Affordance

**Goal:** Replace the barely-visible "+ Add task" text with (A) a dashed placeholder row at the bottom of each domain, and (B) a "+" button in each domain header.

### What changes

**`app/templates/_task_list.html`** (lines ~96-98):

Replace:
```html
<div class="add-task-row" data-domain-id="{{ domain_item.domain.id if domain_item.domain else '' }}">
    <span class="add-task-text">+ Add task</span>
</div>
```

With:
```html
<div class="add-task-row" data-domain-id="{{ domain_item.domain.id if domain_item.domain else '' }}">
    <span class="add-task-icon">+</span>
    <span class="add-task-text">Add task</span>
</div>
```

Also add a "+" button in the domain header (line ~83-91). After `</span>` (closing `.project-name`), add:
```html
<button type="button" class="domain-add-btn" data-domain-id="{{ domain_item.domain.id if domain_item.domain else '' }}" aria-label="Add task">+</button>
```

So the full summary becomes:
```html
<summary class="project-header">
    <span class="project-name">
        {% if domain_item.domain %}
            {% if domain_item.domain.icon %}{{ domain_item.domain.icon }} {% endif %}<span class="domain-name-text">{% if encryption_enabled %}🔒{% else %}{{ domain_item.domain.name }}{% endif %}</span>
        {% else %}
            Inbox
        {% endif %}
    </span>
    <button type="button" class="domain-add-btn" data-domain-id="{{ domain_item.domain.id if domain_item.domain else '' }}" aria-label="Add task">+</button>
</summary>
```

**`static/css/dashboard.css`** — Replace `.add-task-row` and `.add-task-text` styles (lines ~1531-1556):

```css
/* Dashed add-task row */
.add-task-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px 6px 18px;
    margin: 4px 8px 6px;
    border: 1px dashed var(--border-default);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
}

.add-task-row:hover {
    border-color: var(--primary);
    background: rgba(109, 94, 246, 0.03);
}

.add-task-icon {
    font-size: 0.9rem;
    font-weight: 300;
    color: var(--text-muted);
    opacity: 0.6;
    transition: all 0.15s ease;
    line-height: 1;
}

.add-task-text {
    font-size: 0.7rem;
    font-weight: 500;
    color: var(--text-muted);
    opacity: 0.6;
    transition: all 0.15s ease;
}

.add-task-row:hover .add-task-icon,
.add-task-row:hover .add-task-text {
    opacity: 1;
    color: var(--primary);
}
```

Add domain header "+" button styles (after `.project-name` at line ~872):
```css
/* "+" button in domain header — hover-reveal */
.domain-add-btn {
    all: unset;
    box-sizing: border-box;
    width: 22px;
    height: 22px;
    border-radius: 5px;
    border: 1px solid var(--border-default);
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.85rem;
    font-weight: 300;
    opacity: 0;
    transition: all 0.15s ease;
}

.project-header:hover .domain-add-btn {
    opacity: 0.7;
}

.domain-add-btn:hover {
    opacity: 1 !important;
    border-color: rgba(109, 94, 246, 0.35);
    color: var(--primary);
    background: rgba(109, 94, 246, 0.06);
}
```

**Important:** The `.domain-add-btn` is inside a `<summary>` element. Clicking it would normally toggle the `<details>`. The button needs `event.stopPropagation()`. This is handled in the existing task capture JS — search for `add-task-row` click handler and add a parallel handler for `.domain-add-btn` that calls the same task creation logic.

If the JS handler for `.add-task-row` uses event delegation (likely on `#task-list-scroll`), add `.domain-add-btn` to the same delegation check. If not, add:
```javascript
// In the click delegation handler:
const addBtn = target.closest('.domain-add-btn');
if (addBtn) {
    e.stopPropagation(); // Prevent <details> toggle
    e.preventDefault();
    const domainId = addBtn.dataset.domainId;
    // Call the same add-task logic as .add-task-row
}
```

### Prompt

```
Restyle the add-task affordance with dashed row + domain header button.

READ FIRST:
- app/templates/_task_list.html lines 82-100 (domain group + add-task-row)
- static/css/dashboard.css lines 1531-1556 (add-task-row styles)
- Search all JS files for "add-task-row" or "add-task" click handlers.
  Report which file and how the handler works before making changes.

TEMPLATE CHANGES (_task_list.html):
1. In the add-task-row div (~line 97), add a span.add-task-icon with "+"
   before the .add-task-text span. Remove the "+" from the text itself.
2. In the project-header summary (~line 91), add a button.domain-add-btn
   with "+" text after the .project-name span. Include
   data-domain-id="{{ domain_item.domain.id if domain_item.domain else '' }}"
   and aria-label="Add task".

CSS CHANGES (dashboard.css):
1. Replace .add-task-row styles (lines 1531-1556) with the dashed row
   pattern from the plan.
2. Add .domain-add-btn styles after .project-name (~line 872):
   hover-reveal (opacity 0→0.7 on parent hover), purple on own hover.

JS CHANGES:
- Find the add-task click handler. Add .domain-add-btn to the same handler.
- CRITICAL: The .domain-add-btn is inside a <summary>. Its click handler
  MUST call e.stopPropagation() and e.preventDefault() to prevent toggling
  the <details> element. The add-task logic itself should be the same as
  clicking the .add-task-row (same domain ID, same behavior).

Do NOT change the calendar panel's add-task behavior (the floating "+").
```

**Model:** Sonnet

---

## Stage 4: Domain Task Counts

**Goal:** Show a muted task count on every domain header (expanded or collapsed). Fix the vertical alignment of section counts.

### What changes

**`app/templates/_task_list.html`** (line ~90, after `.project-name` span, before `.domain-add-btn`):

Add a task count span:
```html
<span class="task-count">{{ domain_item.tasks|length }}</span>
```

So the full domain header becomes:
```html
<summary class="project-header">
    <span class="project-name">...</span>
    <span class="task-count">{{ domain_item.tasks|length }}</span>
    <button type="button" class="domain-add-btn" ...>+</button>
</summary>
```

Note: `.task-count` CSS already exists (lines 874-888 of dashboard.css) with styling: `font-size: 0.65rem; font-weight: 500; background: var(--bg-surface); color: var(--text-muted); padding: 0.125rem 0.4rem; border-radius: 8px; border: 1px solid var(--border-subtle)`. This is a pill-badge style. We want something subtler for domain counts — just a plain number.

**`static/css/dashboard.css`** — Replace `.task-count` styling for domain context:

The existing `.task-count` is a pill badge with background/border. For domain headers, we want just a plain muted number. Two approaches:
1. Restyle `.task-count` to be plain (affects the `.task-count.filtered` variant too)
2. Add a new `.domain-count` class instead

**Option: Plain number approach.** Change `.task-count` to match section count style:
```css
.task-count {
    font-size: 0.6rem;
    font-weight: 500;
    color: var(--text-muted);
    opacity: 0.7;
}
```

But this may break the `.task-count.filtered` variant (lines 885-888) which uses background/border. Check if `.task-count.filtered` is used anywhere. If it's only used in the domain context, the plain style is fine and `.filtered` just adds color.

If `.task-count` is used elsewhere with the pill style, use a different class: rename to `.domain-task-count` in the template and add new CSS.

**Section count alignment fix (lines ~955-960):**

The `.section-count` may have vertical misalignment with `.section-sep-label`. Ensure both share the same `line-height`. Update:
```css
.section-sep-label {
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    white-space: nowrap;
    line-height: 1;  /* ADD: explicit line-height */
}

.section-count {
    font-size: 0.6rem;
    font-weight: 500;
    color: var(--text-muted);
    opacity: 0.7;
    line-height: 1;  /* ADD: matches label */
}
```

### Prompt

```
Add task counts to domain headers and fix section count alignment.

READ FIRST:
- app/templates/_task_list.html lines 82-100 (domain group headers)
- static/css/dashboard.css lines 874-888 (.task-count styles)
- static/css/dashboard.css lines 945-960 (.section-sep-label, .section-count)
- Search for ".task-count" usage in ALL template files to understand
  if the pill-badge style is used elsewhere.

TEMPLATE CHANGE (_task_list.html):
Add <span class="task-count">{{ domain_item.tasks|length }}</span>
inside the <summary class="project-header">, between .project-name
and .domain-add-btn (if stage 3 was already applied) or at the end.

CSS CHANGES (dashboard.css):
1. Restyle .task-count (lines 874-888) to be a plain muted number:
   font-size: 0.6rem; font-weight: 500; color: var(--text-muted);
   opacity: 0.7; Remove background, border, padding, border-radius.
   If .task-count.filtered still needs the pill style, keep .filtered
   rules but change the base class.

2. Fix section count vertical alignment (lines 945-960):
   Add line-height: 1 to both .section-sep-label and .section-count
   to ensure they sit on the same baseline.

Do NOT change the .task-count responsive overrides at line ~2695
unless they reference removed properties.
```

**Model:** Sonnet

---

## Stage 5: Header Merge — Single Row

**Goal:** Remove the TASKS label and header-row2. Move energy pills + clarity dots into header-row1 (in the first `1fr` column where TASKS label was). Result: single-row header, ~30px shorter.

### What changes

**`app/templates/dashboard.html`** (lines ~49-116):

Current structure:
```
.task-list-header
  .header-row1 (grid)
    .header-task-label "Tasks"
    .header-back-btn (hidden)
    .header-view-count (hidden)
    .header-meta (display: contents) → sort buttons
    .settings-anchor → gear
  .header-row2 (flex)
    .energy-wrapper → energy label + pills + clarity dots
  ::after (spectrum bar)
```

New structure:
```
.task-list-header
  .header-row1 (grid)
    .energy-wrapper → energy label + pills + clarity dots
    .header-back-btn (hidden)
    .header-view-count (hidden)
    .header-meta (display: contents) → sort buttons
    .settings-anchor → gear
  ::after (spectrum bar)
```

Changes to `dashboard.html`:
1. **Move** the `.energy-wrapper` div (and its contents: `.energy-label`, `.header-energy__pills`, `.clarity-dots`) from inside `.header-row2` to inside `.header-row1`, replacing the `.header-task-label` span.
2. **Delete** the `.header-task-label` span entirely.
3. **Delete** the `.header-row2` div entirely (it will be empty).
4. Keep `.header-back-btn` and `.header-view-count` where they are (they're shown in special views when energy is hidden).

**`static/css/dashboard.css`**:

1. **Delete** `.header-task-label` styles (lines ~372-380).
2. **Delete** `.header-row2` styles (lines ~335-345).
3. **Update** `.header-row1` (lines ~326-332):
   ```css
   .header-row1 {
       display: grid;
       grid-template-columns: 1fr var(--col-duration) var(--col-impact) var(--col-clarity) var(--col-actions);
       column-gap: var(--col-gap);
       align-items: center;
       padding: 6px 0 6px var(--rail-w);  /* Slightly reduced from 8px/4px */
   }
   ```
   No grid-template change needed — the energy-wrapper naturally sits in the `1fr` column.

4. **Update** `.energy-wrapper` (line ~10) — remove the `margin-left: 36px` that was inherited from `.header-row2`:
   The `.energy-wrapper` already has `display: flex; align-items: center; gap: 6px` which is correct. It now sits in the grid's first column. Add `margin-left` to align with task content:
   ```css
   .energy-wrapper {
       display: flex;
       align-items: center;
       gap: 6px;
       margin-left: 34px;  /* Align with task-content (matches 38px padding - rail) */
   }
   ```

5. **Delete** dark mode `.header-task-label` override (lines ~2890-2892).

6. **Update** responsive breakpoints:
   - Line ~2672-2674: Remove `.header-row2 { margin-left: 4px; }` (row2 is gone).

**`static/js/task-list-options.js`** — Update `setSpecialViewHeader()` (lines ~250-262):

Remove references to `#header-task-label` and `#header-row2`. Add `#header-energy`:

```javascript
function setSpecialViewHeader(isSpecialView) {
    const energy = document.getElementById('header-energy');
    const backBtn = document.getElementById('header-back-btn');
    const viewCount = document.getElementById('header-view-count');
    const sorts = document.getElementById('header-sorts');

    if (energy) energy.hidden = isSpecialView;
    if (backBtn) backBtn.hidden = !isSpecialView;
    if (viewCount) viewCount.hidden = !isSpecialView;
    if (sorts) sorts.hidden = isSpecialView;
}
```

Also search `task-list-options.js` for any other references to `header-task-label` or `header-row2` and update.

### Prompt

```
Merge header rows — move energy to row 1, delete TASKS label and row 2.

READ FIRST (understand all interactions before changing):
- app/templates/dashboard.html lines 49-116 (both header rows)
- static/css/dashboard.css — search for ALL:
  "header-task-label", "header-row2", "header-row1"
  List every line number.
- static/js/task-list-options.js — search for ALL:
  "header-task-label", "header-row2", "header-energy",
  "setSpecialViewHeader"

TEMPLATE CHANGES (dashboard.html):
1. Move the .energy-wrapper div (with .energy-label, .header-energy__pills,
   .clarity-dots inside) from .header-row2 into .header-row1, placing it
   where .header-task-label currently is.
2. Delete the .header-task-label span entirely.
3. Delete the .header-row2 div entirely.
4. Keep .header-back-btn and .header-view-count in .header-row1
   (they alternate with energy-wrapper visibility in special views).

CSS CHANGES (dashboard.css):
1. Delete .header-task-label rule (lines ~372-380)
2. Delete .header-row2 rule (lines ~335-345)
3. Update .header-row1 padding to "6px 0 6px var(--rail-w)"
4. Add margin-left: 34px to .energy-wrapper to align with task content
5. Delete dark mode .header-task-label override (lines ~2890-2892)
6. Delete responsive .header-row2 rules

JS CHANGES (task-list-options.js):
Update setSpecialViewHeader() (lines ~250-262):
- Remove lines referencing #header-task-label and #header-row2
- Add: const energy = document.getElementById('header-energy');
       if (energy) energy.hidden = isSpecialView;
- Search for ANY other references to header-task-label or header-row2
  in this file and remove them.

CRITICAL: Keep the spectrum bar (.task-list-header::after) — it should
still appear at the bottom of the (now single-row) header.
```

**Model:** Sonnet

---

## Stage 6: Plan My Day — Contextual Banner

**Goal:** Add a contextual banner at the top of the task list that appears in the evening (for planning tomorrow) or morning (for planning today). Shows task count and links to Plan My Day.

### What changes

**`app/templates/_task_list.html`** — Add banner before domain groups (before line ~80):

```html
{# ── Plan My Day contextual banner ── #}
<div class="pmd-banner" id="pmd-banner" hidden>
    <div class="pmd-banner-text">
        <span class="pmd-banner-title" id="pmd-banner-title">Plan tomorrow?</span>
        <span class="pmd-banner-sub" id="pmd-banner-sub"></span>
    </div>
    <button type="button" class="pmd-banner-btn" id="pmd-banner-btn">
        <span class="action-emoji">✨</span> Plan
    </button>
</div>
```

**`static/css/dashboard.css`** — Add banner styles (near section separators, ~line 960):

```css
/* Plan My Day contextual banner */
.pmd-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    margin: 6px 8px 4px;
    background: linear-gradient(135deg,
        rgba(22, 123, 255, 0.04),
        rgba(109, 94, 246, 0.05),
        rgba(160, 32, 192, 0.03));
    border: 1px solid rgba(109, 94, 246, 0.12);
    border-radius: 10px;
}

.pmd-banner[hidden] { display: none; }

.pmd-banner-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.pmd-banner-title {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--text-primary);
}

.pmd-banner-sub {
    font-size: 0.68rem;
    color: var(--text-secondary);
}

.pmd-banner-btn {
    all: unset;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 14px;
    border-radius: 8px;
    background: var(--primary);
    color: white;
    font-size: 0.7rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    box-shadow: 0 2px 8px rgba(109, 94, 246, 0.2);
    transition: all 0.15s ease;
}

.pmd-banner-btn:hover {
    background: var(--primary-hover);
    box-shadow: 0 4px 12px rgba(109, 94, 246, 0.3);
}
```

**JS logic** — Add to the inline `<script>` in `dashboard.html` (at the end, after the existing calendar init code around line ~535):

```javascript
// Plan My Day banner — show in evening (for tomorrow) or morning (for today)
(function() {
    const banner = document.getElementById('pmd-banner');
    if (!banner) return;

    const hour = new Date().getHours();
    const title = document.getElementById('pmd-banner-title');
    const sub = document.getElementById('pmd-banner-sub');
    const btn = document.getElementById('pmd-banner-btn');

    // Count unscheduled active tasks
    const taskItems = document.querySelectorAll('#task-list-scroll .task-item:not(.scheduled):not([data-completed="1"])');
    const taskCount = taskItems.length;

    if (taskCount === 0) return; // No tasks to plan

    // Evening (after 18:00): plan tomorrow
    // Morning (before 11:00): plan today
    if (hour >= 18) {
        title.textContent = 'Plan tomorrow?';
        sub.textContent = taskCount + ' tasks ready to schedule';
        banner.hidden = false;
    } else if (hour < 11) {
        title.textContent = 'Plan your day';
        sub.textContent = taskCount + ' tasks ready to schedule';
        banner.hidden = false;
    }

    // Click: scroll to calendar and trigger Plan My Day
    btn.addEventListener('click', function() {
        const carousel = document.getElementById('calendar-carousel');
        if (!carousel) return;

        // If evening, advance to tomorrow first
        if (hour >= 18) {
            const todayEl = document.getElementById('today-calendar');
            if (todayEl && todayEl.nextElementSibling) {
                todayEl.nextElementSibling.scrollIntoView({ behavior: 'smooth', inline: 'start' });
                // Wait for scroll, then click Plan My Day on that calendar
                setTimeout(function() {
                    const visibleCal = todayEl.nextElementSibling;
                    const planBtn = visibleCal.querySelector('.plan-day-btn');
                    if (planBtn) planBtn.click();
                }, 400);
            }
        } else {
            // Morning: plan today
            const todayEl = document.getElementById('today-calendar');
            if (todayEl) {
                const planBtn = todayEl.querySelector('.plan-day-btn');
                if (planBtn) planBtn.click();
            }
        }
    });
})();
```

### Prompt

```
Add Plan My Day contextual banner to task list.

READ FIRST:
- app/templates/_task_list.html (beginning — before domain groups)
- app/templates/dashboard.html lines 390-540 (inline script section)
- static/js/plan-tasks.js lines 267-300 (plan button handler)
- static/css/dashboard.css lines 890-960 (section area)

TEMPLATE CHANGES:
1. _task_list.html: Add the .pmd-banner div BEFORE the domain_groups
   loop (before line ~80). It starts hidden. Contains:
   .pmd-banner-text > .pmd-banner-title + .pmd-banner-sub
   .pmd-banner-btn with sparkle emoji + "Plan"

CSS CHANGES (dashboard.css):
Add .pmd-banner styles near the section separator area (~line 960).
Gradient background using three clarity colors at very low opacity.
Subtle purple border. The button uses var(--primary) solid background.

JS CHANGES (dashboard.html inline script):
Add an IIFE at the end of the inline script that:
1. Checks current hour
2. If >= 18 (evening): shows banner with "Plan tomorrow?", count of
   unscheduled tasks
3. If < 11 (morning): shows banner with "Plan your day", same count
4. On click: scrolls calendar to tomorrow (evening) or today (morning),
   then triggers the .plan-day-btn click on that calendar
5. Uses setTimeout(400ms) to wait for scroll animation before clicking

Do NOT modify plan-tasks.js — the banner just clicks the existing
.plan-day-btn which triggers the existing plan mode logic.
```

**Model:** Sonnet

---

## Stage 7: Calendar Auto-Advance + Hero Card

**Goal:** (A) When it's after 8pm, auto-advance the calendar carousel to tomorrow instead of today. (B) When the visible calendar has an empty timeline (no events or tasks in the visible hours), show a hero planning card replacing the dead space.

### What changes

**7A: Auto-advance logic**

In `app/templates/dashboard.html` inline `<script>`, the initial scroll logic is at lines ~396-399:
```javascript
const todayCalendar = document.getElementById('today-calendar');
if (todayCalendar) {
    todayCalendar.scrollIntoView({ behavior: 'instant', inline: 'center' });
}
```

Change to:
```javascript
const todayCalendar = document.getElementById('today-calendar');
if (todayCalendar) {
    const currentHour = new Date().getHours();
    // After 8pm with no upcoming events: show tomorrow instead
    if (currentHour >= 20 && todayCalendar.nextElementSibling) {
        todayCalendar.nextElementSibling.scrollIntoView({ behavior: 'instant', inline: 'start' });
    } else {
        todayCalendar.scrollIntoView({ behavior: 'instant', inline: 'center' });
    }
}
```

**7B: Hero card in empty calendar**

Add a hero card element inside each `.day-calendar` in `dashboard.html` (after the `.day-header` div, around line ~153):

```html
<div class="pmd-hero" data-pmd-hero hidden>
    <div class="pmd-hero-label">Plan this day</div>
    <div class="pmd-hero-stat" data-pmd-hero-stat></div>
    <div class="pmd-hero-sub" data-pmd-hero-sub></div>
    <button type="button" class="pmd-hero-btn plan-day-btn" title="Plan My Day">
        <span class="action-emoji">✨</span> Plan My Day
    </button>
</div>
```

Note: The button has class `plan-day-btn` so it triggers the existing Plan My Day handler from `plan-tasks.js`.

**CSS for hero card** (add to `dashboard.css`):
```css
.pmd-hero {
    padding: 20px 16px;
    margin: 8px;
    background: linear-gradient(135deg,
        rgba(22, 123, 255, 0.05),
        rgba(109, 94, 246, 0.07),
        rgba(160, 32, 192, 0.04));
    border: 1px solid rgba(109, 94, 246, 0.1);
    border-radius: 10px;
    text-align: center;
}

.pmd-hero[hidden] { display: none; }

.pmd-hero-label {
    font-size: 0.6rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-muted);
    margin-bottom: 6px;
}

.pmd-hero-stat {
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 2px;
}

.pmd-hero-sub {
    font-size: 0.68rem;
    color: var(--text-secondary);
    margin-bottom: 12px;
}

.pmd-hero-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 8px 20px;
    border-radius: 8px;
    border: none;
    background: var(--primary);
    color: white;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(109, 94, 246, 0.2);
    transition: all 0.15s ease;
}

.pmd-hero-btn:hover {
    background: var(--primary-hover);
    box-shadow: 0 4px 12px rgba(109, 94, 246, 0.3);
}
```

**JS logic** — In the inline script, after the carousel initialization, add hero card visibility logic:

```javascript
// Hero card: show when visible calendar has no events in next few hours
function updateHeroCards() {
    document.querySelectorAll('.day-calendar').forEach(function(cal) {
        const hero = cal.querySelector('[data-pmd-hero]');
        if (!hero) return;

        const hourGrid = cal.querySelector('.hour-grid');
        if (!hourGrid) return;

        // Count visible events and scheduled tasks
        const events = cal.querySelectorAll('.calendar-event, .scheduled-task');
        const dateOnlyTasks = cal.querySelectorAll('.date-only-task');
        const totalItems = events.length + dateOnlyTasks.length;

        // Also check the existing .plan-day-btn (not the hero one)
        // Only show hero if the day has few or no items
        if (totalItems <= 1) {
            const taskCount = document.querySelectorAll('#task-list-scroll .task-item:not([data-completed="1"])').length;
            const stat = hero.querySelector('[data-pmd-hero-stat]');
            const sub = hero.querySelector('[data-pmd-hero-sub]');
            if (stat) stat.textContent = taskCount + ' tasks ready';
            if (sub) sub.textContent = 'Fill your free time with what matters';
            hero.hidden = false;

            // Hide the regular plan-day-btn in the header (avoid duplicate)
            const headerPlanBtn = cal.querySelector('.day-header .plan-day-btn');
            if (headerPlanBtn) headerPlanBtn.style.display = 'none';
        }
    });
}

updateHeroCards();
```

### Prompt

```
Auto-advance calendar to tomorrow at night + hero card in empty calendars.

READ FIRST:
- app/templates/dashboard.html lines 393-445 (inline script, carousel init)
- app/templates/dashboard.html lines 128-155 (day-calendar structure)
- static/js/plan-tasks.js lines 267-300 (plan-day-btn handler)

CHANGES:

1. Auto-advance (dashboard.html inline script, lines ~396-399):
   Change the initial scroll logic: if current hour >= 20 and
   todayCalendar.nextElementSibling exists, scroll to tomorrow instead.
   Otherwise scroll to today as before.

2. Hero card HTML (dashboard.html, after .day-header around line ~153):
   Add a .pmd-hero div (initially hidden) with:
   - .pmd-hero-label: "Plan this day"
   - .pmd-hero-stat[data-pmd-hero-stat]: filled by JS
   - .pmd-hero-sub[data-pmd-hero-sub]: filled by JS
   - .pmd-hero-btn.plan-day-btn: "✨ Plan My Day"
   The button MUST have class plan-day-btn so existing plan-tasks.js
   handler picks it up.

3. Hero card CSS (dashboard.css):
   Add .pmd-hero, .pmd-hero-label, .pmd-hero-stat, .pmd-hero-sub,
   .pmd-hero-btn styles. Gradient background with clarity colors.

4. Hero card JS (dashboard.html inline script, after carousel init):
   Add updateHeroCards() function that:
   - For each .day-calendar, counts .calendar-event + .scheduled-task elements
   - If total <= 1 (empty or nearly empty day), shows the hero card
   - Sets stat text to unscheduled task count
   - Hides the regular .plan-day-btn in the header to avoid duplication

Do NOT modify plan-tasks.js — the hero button uses the same .plan-day-btn
class and will be automatically handled by existing event delegation.
```

**Model:** Sonnet

---

## Stage 8: PR Cleanup

**Goal:** Bump version, sync lockfile, update changelog, run full checks, create PR.

### What changes

1. **`pyproject.toml`** — Bump version to `0.37.0`
2. **`uv lock`** — Sync lockfile
3. **`CHANGELOG.md`** — Add entry:

```markdown
## [0.37.0] - 2026-02-XX — Design Audit

### Changed
- **Meta column readability** — resting opacity raised from 0.65 to 0.85; hover fade-in removed (always readable)
- **Ghost checkbox** — completion circle always visible at 30% opacity; full opacity on hover; communicates completability without requiring hover discovery
- **Clarity text labels** — single colored dot replaced with "Clear"/"Def"/"Open" in clarity colors; mirrors the impact column pattern; immediately readable without learning color codes
- **Add task affordance** — dashed placeholder row replaces invisible text; "+" button appears in domain headers on hover for quick capture
- **Domain task counts** — muted count shown on all domain headers (expanded and collapsed)
- **Single-row header** — "TASKS" label removed (redundant with nav), energy pills merged into sort row; header ~30px shorter
- **Plan My Day banner** — contextual banner at top of task list: "Plan tomorrow?" in evening, "Plan your day" in morning; shows unscheduled task count
- **Calendar auto-advance** — after 8pm, calendar shows tomorrow instead of empty evening; hero planning card replaces dead timeline space
- **Domain chevron** — removed redundant right chevron from domain headers; disclosure triangle alone is sufficient
```

4. **Run full checks:**
   ```bash
   uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test
   ```

5. **Update `tests/test_js_module_contract.py`** if any JS module exports changed

6. **Create PR** with title:
   `v0.37.0/feat: Design audit — clarity labels, ghost checkbox, header merge, Plan My Day banner`

### Prompt

```
Final PR cleanup for the design audit implementation.

1. Bump version in pyproject.toml to 0.37.0
2. Run: uv lock
3. Update CHANGELOG.md with a [0.37.0] entry at the top following the
   existing format. See the plan document for the full changelog text.
4. Run: uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test
5. Fix any lint/format/type/test errors.
6. If test_js_module_contract.py fails due to changed exports or
   removed elements, update test expectations.
7. Create a PR branch and push. PR title:
   v0.37.0/feat: Design audit — clarity labels, ghost checkbox, header merge, Plan My Day banner
```

**Model:** Sonnet

---

## Files Changed (Complete List)

| File | Stage | Change |
|------|-------|--------|
| `static/css/tokens.css` | 2 | `--col-clarity: 42px` |
| `static/css/dashboard.css` | 1, 2, 3, 4, 5, 6, 7 | Meta opacity, chevron, ghost check, clarity text, add-task, domain count, header merge, PMD banner, hero card |
| `app/templates/_task_list.html` | 2, 3, 4, 6 | Clarity labels, add-task dashed row + header btn, domain counts, PMD banner |
| `app/templates/dashboard.html` | 5, 6, 7 | Header merge (delete row2, move energy), PMD banner JS, auto-advance + hero card |
| `static/js/task-list-options.js` | 5 | Update `setSpecialViewHeader()` refs |
| `tests/test_js_module_contract.py` | 8 | Update if exports changed |
| `pyproject.toml` | 8 | Version bump |
| `uv.lock` | 8 | Lockfile sync |
| `CHANGELOG.md` | 8 | New entry |

## Risk Assessment

| Change | Risk | Mitigation |
|--------|------|------------|
| Meta opacity (#1) | Very low | Single value change |
| Remove chevron (#2) | Very low | CSS only, may be a no-op |
| Ghost checkbox (#4) | Low | CSS only, doesn't affect calendar checks |
| Clarity text labels (#3) | Low | HTML simplification + CSS; must update all `.clarity-dot` refs |
| Add task affordance (#5) | Low | Additive HTML/CSS; JS handler needs stopPropagation for summary btn |
| Domain task counts (#6) | Low | Template uses `|length` filter, no backend changes |
| Header merge (#7) | Medium | Structural; JS refs must be updated; responsive grids affected |
| PMD banner (#8) | Low | Self-contained; clicks existing plan-day-btn |
| Calendar auto-advance (#9) | Medium | Scroll timing; hero card visibility logic; plan-day-btn delegation |

## Design Reference

- **Mock (comparison):** `docs/archive/scratchpad/design-audit-options.html`
- **Brand system:** `docs/brand/COLOR-SYSTEM.md`, `docs/brand/UI-KIT.md`
- **Tokens:** `static/css/tokens.css`
- **Previous refinements:** `docs/TASK-LIST-REFINEMENTS.md`
