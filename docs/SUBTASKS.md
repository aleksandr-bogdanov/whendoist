# Subtasks: Architecture & Philosophy

Whendoist enforces a strict three-level hierarchy for task organization.
This is a deliberate design constraint, not a limitation.

## The Mental Model

```
Domain            (area of life)
  └── Parent Task (container — groups related work)
        └── Task  (actionable, schedulable piece of work)
```

**Domains** are areas of life: Family, Career, Health, Side Projects.

**Parent tasks** are containers — folders that group related actionable work.
They have a title and belong to a domain, but they are not work themselves.
A parent task cannot be scheduled, cannot recur, and does not sync to Google Calendar.

**Tasks** (subtasks) are the real work. They are schedulable, have impact/mode/duration,
can recur, and sync to the calendar. This is what the user drags into a time slot
and marks as done.

### Why Not Infinite Nesting?

Tools like Workflowy give infinite nesting. Todoist allows unlimited depth.
This freedom is a trap for the target audience — neurodivergent people who need
clarity, not options.

Infinite nesting creates decision paralysis: *Should this be a sub-task or a
sub-sub-task? Do I need another level?* Every level of hierarchy is a decision
point that produces no value. The user came here to schedule work, not to
organize an org chart.

Three levels (domain / container / task) is the minimum structure that supports
real planning without becoming project management software. If something doesn't
fit in three levels, the problem is scope — not nesting depth.

### Why Not Sprint Planning?

Recurring containers with child-reset mechanics ("Weekly Review" that resets
subtasks every Monday) turns a personal planning app into a sprint tool.
Linear, Jira, and even Notion do that better. Whendoist stays in its lane:
*when do I do this specific piece of work?*

---

## Constraints (Enforced)

| Rule | Rationale |
|------|-----------|
| Max depth = 1 | Tasks can be children of a parent. Children cannot have children. |
| Parent = container only | No scheduling, no recurrence, no calendar sync. |
| Subtask = full task | Has all properties: impact, mode, duration, dates, recurrence. |
| Recurring tasks cannot have children | A recurring task is atomic schedulable work. |
| Tasks with children cannot be recurring | A container doesn't repeat — the work inside it does. |
| Subtasks inherit parent's domain | Cannot override to a different domain. |
| Domain inheritance is automatic | Setting `parent_id` sets `domain_id` implicitly. |

## Behavior

### Completion

- **Completing a parent** cascades down: all children are marked completed.
  Closing the folder closes everything inside.
- **Completing all children** does NOT auto-complete the parent.
  The user decides when the project is done — maybe they plan to add more tasks later.
- **Completing a subtask** has no effect on the parent.

### Archive & Delete

- **Archiving a parent** recursively archives all children (with cycle detection).
- **Restoring a parent** recursively restores all archived children.
- **Deleting a parent** cascades via FK constraint — all children are deleted.
  UI shows a confirmation dialog with the subtask count.

### Scheduling & Calendar

- **Parent tasks** cannot be dragged to the calendar. They have no scheduled date.
- **Subtasks** are independently schedulable — drag to calendar, set dates, recur.
- **Google Calendar sync** operates on subtasks only. Parents are invisible to the calendar.

### Expand / Collapse

Parent tasks render as collapsible containers in the task list.
Collapsed: shows the parent title with a subtask count badge.
Expanded: shows indented children below.

### Sorting & Filtering

- Energy/mode filters apply to subtasks. If a parent has no visible children
  after filtering, the parent is hidden too.
- Sort order applies to subtasks within their parent group.
  Parents are sorted by their own position within the domain.

### Todoist Import

Todoist supports unlimited nesting. On import:
- Depth-1 children map directly to subtasks.
- Deeper nesting is flattened: grandchildren become direct children of the
  top-level parent.
- Recurrence is stripped from imported parents that have children.
  Subtask recurrence is preserved.

---

## What a Parent Task Is NOT

A parent task is not a milestone, a goal, an epic, or a sprint.
It has no due date that gates its children. It has no progress bar.
It has no recurrence rule.

It is a label on a folder. Nothing more.

This simplicity is the point. The user opens the folder, sees what needs doing,
drags a task to a time slot, and gets to work. The folder doesn't participate
in scheduling — it just keeps things tidy.

---

## Data Model

The `Task` model supports hierarchy via self-referential FK:

```
Task.parent_id  → Task.id  (nullable, CASCADE delete)
Task.subtasks   → list[Task]  (one-to-many relationship)
Task.parent     → Task | None (many-to-one back-reference)
```

Position is scoped per `(domain_id, parent_id)` — siblings within the same
container have independent ordering.

No separate model is needed. Parent tasks and subtasks are the same entity;
the distinction is behavioral, enforced by the application layer based on
whether a task has children or a `parent_id`.
