# Desktop Subtask UI Redesign — Prompt

**Purpose**: Hand this prompt to a fresh Claude Code session along with screenshots of the current state. The session will propose concrete CSS/HTML changes to make parent-child task rendering look modern and clean on desktop.

---

## Context

You are working on **Whendoist**, a task scheduling web app for neurodivergent people. It uses a strict three-level hierarchy:

```
Domain            (area of life — "Career", "Health", "Family")
  └── Parent Task (container — groups related work, NOT schedulable)
        └── Task  (the real actionable work — schedulable, draggable, has metadata)
```

**Parent tasks are containers only** — like folders. They cannot be scheduled, cannot recur, don't sync to Google Calendar. They just group subtasks. Subtasks are full tasks with impact, clarity (mode), duration, due dates, and recurrence.

The subtask feature was just implemented and the visual rendering is functional but ugly. The app currently looks like year-2000 enterprise software (think Lotus Notes). We need a modern, minimalistic redesign inspired by **Todoist** and **Telegram** — clean typography, generous whitespace, subtle visual hierarchy, no heavy borders or visual clutter.

## What you'll receive

The user will share screenshots showing:
1. The current desktop dashboard with parent tasks and their subtask containers
2. How the task list looks with expanded and collapsed containers
3. The overall layout (task list left panel + calendar right panel)

## Your job

Propose **concrete, implementable CSS/HTML changes** for the desktop task list. Not a mood board, not abstract design principles — actual code changes with before/after descriptions.

## Technical constraints

### File structure
- Templates: `app/templates/_task_list.html` (Jinja2 macro `render_task_item`)
- Styles: `static/css/dashboard.css` (3000+ lines), `static/css/tokens.css` (CSS custom properties)
- Mobile: `static/css/mobile.css` — **do not touch**, we'll adapt mobile later
- JS modules: `static/js/task-sort.js`, `static/js/drag-drop.js`, etc.
- All JS uses IIFE pattern with `window.ModuleName` exports

### Current DOM structure

Parent task and subtask container are **siblings** (not nested):

```html
<!-- Inside .task-list (which is inside details.project-group) -->
<div class="task-item impact-2" data-task-id="42" data-subtask-count="3">
    <button class="complete-gutter complete-gutter--hover">...</button>
    <div class="task-content">
        <span class="task-text">Research authentication options</span>
        <span class="subtask-badge">3</span>
    </div>
    <div class="task-meta">
        <span class="meta-clarity clarity-normal"></span>
        <span class="meta-duration">—</span>
        <span class="meta-impact impact-2">Mid</span>
    </div>
    <span class="task-actions"><button class="kebab-btn">...</button></span>
</div>
<div class="subtask-container" data-parent-id="42">
    <button class="expand-toggle" aria-expanded="true">
        <svg class="chevron-icon">...</svg>
        <span class="subtask-summary">3 subtasks</span>
    </button>
    <div class="subtask-list">
        <div class="task-item impact-1" data-task-id="43" data-parent-id="42">
            <!-- Same structure as parent, but is a real schedulable task -->
        </div>
        <!-- more subtasks... -->
        <div class="add-task-row add-subtask-row" data-parent-id="42">
            <span class="add-task-icon">+</span>
            <span class="add-task-text">Add subtask</span>
        </div>
    </div>
</div>
```

### Current CSS grid (task items)

```css
.task-item {
    display: grid;
    grid-template-columns: 1fr var(--col-clarity) var(--col-duration) var(--col-impact) var(--col-actions);
    /* 1fr  68px  60px  44px  28px */
    column-gap: var(--col-gap); /* 6px */
}
.task-meta { display: contents; } /* Meta spans become direct grid children */
```

The task list header uses the **same grid** so sort buttons align with metadata columns.

### Domain groups

Each domain is a `<details class="project-group" open>` with a `<summary class="project-header">` containing the domain name + task count + add button. The `.task-list` div inside contains all task items.

### Current subtask container CSS

```css
.subtask-container {
    border-left: 2px solid var(--border-subtle);
    margin-left: 16px;
    padding-left: 12px;
}
.subtask-container .task-item { font-size: 0.92em; }
.expand-toggle {
    display: inline-flex; gap: 4px; padding: 4px 8px;
    color: var(--text-muted); font-size: 0.75rem;
}
```

### What parent tasks should NOT show

Since parent tasks are containers (not schedulable work), their metadata row is mostly empty:
- Clarity: empty (or should it show something?)
- Duration: shows "—" (meaningless for a container)
- Impact: shows a value but it's vestigial

**This is a design decision to make**: should parent tasks show metadata columns at all? Should they look visually distinct from actionable tasks? Think Todoist's sections vs tasks.

### Energy filter

Tasks are filtered by `data-clarity` attribute via CSS. When a parent is hidden, its adjacent `.subtask-container` is hidden via `+` sibling selector. This must keep working.

### Expand/collapse

- `aria-expanded` on `.expand-toggle` drives visibility via CSS
- Collapsed: `.expand-toggle[aria-expanded="false"] + .subtask-list { display: none }`
- State persisted in localStorage

### Dark mode

Dark mode uses `[data-theme="dark"]` overrides. Any new CSS must have dark mode variants.

## Design direction

### Inspiration: Todoist
- Parent tasks could look more like Todoist's "sections" — a subtle header row, not a full task row
- Subtasks indented with a thin vertical line on the left
- Chevron toggle inline with the parent title
- No heavy borders, minimal visual weight for hierarchy indicators

### Inspiration: Telegram
- Clean, airy spacing
- Typography does the heavy lifting (weight, size, color) instead of borders and backgrounds
- Subtle separators, not box model decorations

### Key principles
1. **Parent tasks must look different from subtasks** — they're containers, not work. They should NOT have the same visual weight as actionable tasks.
2. **Subtasks should look like normal tasks** — because they ARE normal tasks, just grouped.
3. **The hierarchy should be obvious at a glance** — indentation + subtle vertical connector.
4. **Collapse/expand must feel lightweight** — no accordion animation, just show/hide.
5. **The metadata grid must not break** — subtasks need aligned clarity/duration/impact columns.
6. **Minimize vertical space** — parent containers shouldn't add excessive padding/margins.

### Specific questions to address
1. Should parent tasks still use the 5-column grid, or should they be a simpler single-row element (like a section header)?
2. Should the subtask badge move from the parent's `.task-content` to become part of the expand toggle?
3. Should the expand chevron be on the parent task row itself (left side, replacing the complete-gutter) or stay on the separate `.subtask-container` toggle below?
4. What visual treatment for the vertical connector line? (color, width, style)
5. How should an empty parent (0 subtasks) look vs a parent with children?
6. Should parent tasks have a complete-gutter at all? (Completing cascades to children, but is that discoverable?)

## Output format

For each proposed change, provide:
1. **What changes** (description)
2. **Why** (design rationale)
3. **CSS diff** or **HTML diff** (actual code)
4. **Dark mode** variant if applicable
5. **Side effects** to watch for (sorting, drag-drop, energy filter, HTMX refresh)

Group changes into a coherent proposal. If you see multiple valid approaches, present 2 options with trade-offs. Do NOT implement — just propose. The user will approve before any code is written.

## Files to read before proposing

Read these files to understand the current state before making any proposals:

1. `docs/SUBTASKS.md` — full architecture doc
2. `app/templates/_task_list.html` — template rendering (lines 1-100 for task macro, 82-99 for subtask container)
3. `static/css/dashboard.css` — search for `.subtask-`, `.expand-`, `.task-item`, `.project-header`, `.task-list-header`
4. `static/css/tokens.css` — CSS custom properties (colors, spacing, column widths)
5. `app/templates/dashboard.html` — overall layout (lines 85-140 for task list header)
6. `static/css/mobile.css` — to understand what NOT to break (lines 859-944 for task item overrides)
