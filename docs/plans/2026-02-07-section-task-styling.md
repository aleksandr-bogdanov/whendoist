# Section Task Styling — Completed & Scheduled Sections

## Problem

Tasks inside `#section-done` (Completed) and `#section-sched` (Scheduled) inherit
the same heavy muting applied to completed tasks in the main domain groups:
- `opacity: 0.65` on the entire row
- `text-decoration: line-through` on `.task-text`
- `color: rgba(15, 23, 42, 0.5)` on text and meta

This makes section tasks nearly unreadable. Since these tasks are already in a
contextually labeled section ("Completed", "Scheduled"), the aggressive muting is
redundant — the section header already communicates their state.

## Design Approach (Brand-Aligned)

Use the brand's text token hierarchy (from `COLOR-SYSTEM.md`):

| Token | Light | Dark | Purpose |
|-------|-------|------|---------|
| `--text-primary` | `#0B1220` | `#F8FAFC` | Active task text |
| `--text-secondary` | `rgba(15,23,42, 0.64)` | `rgba(248,250,252, 0.72)` | Section completed text |
| `--text-muted` | `rgba(15,23,42, 0.46)` | `rgba(248,250,252, 0.48)` | Meta labels, timestamps |

### Visual Hierarchy

```
Active task:     text-primary  + full opacity  + no decoration
Section task:    text-secondary + 0.85 opacity + no strikethrough
Main completed:  rgba(0.5)     + 0.65 opacity + line-through  (unchanged)
```

Section completed tasks should look **"settled but scannable"** — clearly distinct
from active tasks via the secondary text color and slight opacity reduction, but
not the harsh strikethrough + ghost combo.

## Implementation

### File: `static/css/dashboard.css`

Add after the `.task-item.completed` block (~line 1512):

```css
/* =============================================================================
   Section Tasks — Completed/Scheduled visibility overrides
   ============================================================================= */

/* No strikethrough — the section header already says "Completed" */
#section-done .task-item[data-completed="1"] .task-text,
#section-done .task-item.completed .task-text,
#section-done .task-item.completed.scheduled .task-text {
    text-decoration: none;
    color: var(--text-secondary);
}

/* Softer but not ghostly — 0.85 instead of default 0.65 */
#section-done .task-item[data-completed="1"],
#section-done .task-item.completed,
#section-sched .task-item.completed {
    opacity: 0.85;
}

/* Completed tasks in scheduled section — also secondary text, no strikethrough */
#section-sched .task-item.completed .task-text {
    text-decoration: none;
    color: var(--text-secondary);
}

/* Meta stays at standard muted level (not double-dimmed) */
#section-done .task-item[data-completed="1"] .task-due,
#section-done .task-item[data-completed="1"] .meta-duration,
#section-done .task-item[data-completed="1"] .meta-impact,
#section-done .task-item[data-completed="1"] .meta-clarity,
#section-done .task-item.completed .task-due,
#section-done .task-item.completed .meta-duration,
#section-done .task-item.completed .meta-impact,
#section-done .task-item.completed .meta-clarity,
#section-sched .task-item.completed .task-due,
#section-sched .task-item.completed .meta-duration,
#section-sched .task-item.completed .meta-impact,
#section-sched .task-item.completed .meta-clarity {
    color: var(--text-muted);
}

/* Impact rail — present but softer */
#section-done .task-item[data-completed="1"]::before,
#section-done .task-item.completed::before,
#section-sched .task-item.completed::before {
    opacity: 0.7;
}
```

### Dark Mode Overrides

Add before the Skipped Instance Styling section (~line 3540):

```css
/* Section tasks — dark mode */
[data-theme="dark"] #section-done .task-item[data-completed="1"],
[data-theme="dark"] #section-done .task-item.completed,
[data-theme="dark"] #section-sched .task-item.completed {
    opacity: 0.85 !important;
}

[data-theme="dark"] #section-done .task-item[data-completed="1"] .task-text,
[data-theme="dark"] #section-done .task-item.completed .task-text,
[data-theme="dark"] #section-sched .task-item.completed .task-text {
    color: var(--text-secondary) !important;
    text-decoration: none !important;
}
```

## Key Decisions

1. **`--text-secondary` not `--text-primary`**: Primary is too bright (identical to
   active tasks). Secondary at 64% opacity provides a clear "this is done" signal
   while remaining readable.

2. **`opacity: 0.85` not `1.0`**: A subtle overall dimming reinforces the "settled"
   state. Combined with secondary text color, this creates a two-layer hierarchy:
   the text is softer AND the row is slightly dimmed.

3. **No strikethrough**: The section header ("COMPLETED 2") already communicates
   state. Strikethrough inside that context is visual noise that hurts readability.

4. **Meta at `--text-muted`**: Consistent with active task meta. Since meta was
   already muted, no need to double-dim it. This avoids the "mixed signals" of
   bright text + invisible metadata.

5. **Impact rail at 0.7**: Keeps the color-coded rail visible for scanning but
   softer than active tasks (1.0) and more visible than the current 0.5.

## Prompt for Implementation

```
Implement the section task styling changes described in docs/SECTION-TASK-STYLING.md.

In static/css/dashboard.css:
1. Add the CSS block from the "Implementation" section after the
   `.task-item.completed::before` rule block (~line 1512), before the
   "Calendar Checkbox" section comment.
2. Add the dark mode overrides before the "Skipped Instance Styling" section.

Do NOT modify any other completed task styles — only add #section-done and
#section-sched scoped overrides. Run the full check suite after:
uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test
```
