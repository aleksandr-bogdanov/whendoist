---
version:
pr:
created: 2026-02-20
---

# Rename Inbox → Thoughts & Hide from Tasks Page

## Context

Thoughts are fundamentally different from tasks — they only have a body/name and are meant for quick capture. The "Inbox" concept (tasks with `domain_id = NULL`) should be renamed to "Thoughts" throughout the codebase, and hidden from the Tasks/Dashboard page since thoughts belong on the Thoughts page.

The legacy (Python/Jinja2) dashboard already filters inbox tasks via `has_domain=True`, but the React frontend shows them. Several UI labels still say "Inbox" despite a partial rename effort.

## Changes

### 1. React Frontend — Exclude thoughts from dashboard

**`frontend/src/components/dashboard/task-panel.tsx`** (line ~98-99)
- Filter out `domain_id === null` tasks before `categorizeTasks()` so they don't appear in pending, scheduled, or completed sections on the dashboard:
```ts
const dashboardTasks = decryptedTasks.filter(t => t.domain_id !== null);
const { pending, scheduled, completed } = categorizeTasks(dashboardTasks);
```

**`frontend/src/lib/task-utils.ts`** (lines 100, 123, 128-134)
- Remove the inbox/thoughts group from `groupByDomain()` — null-domain tasks should never form a domain group since they're excluded upstream. Remove the `inboxTasks` block entirely and update comments.

**`frontend/src/components/task/domain-group.tsx`** (lines 2, 175, 210-214)
- Remove `Inbox` import from lucide (no longer needed)
- Remove the null-domain rendering branch (lines 210-214) — dead code since null-domain tasks won't reach this component
- Update `data-domain-name` fallback: `domain?.name ?? "Thoughts"` (defensive, shouldn't trigger)

**`frontend/src/components/task/task-list.tsx`** (line 35)
- Key fallback: `"inbox"` → `"thoughts"` (defensive)

### 2. React Frontend — Rename "Inbox" in domain pickers

**`frontend/src/components/task/task-editor.tsx`** (line 415)
- `"No domain (Inbox)"` → `"Thought (no domain)"`

**`frontend/src/components/task/task-quick-add.tsx`** (line 120)
- `"No domain (Inbox)"` → `"Thought (no domain)"`

**`frontend/src/routes/_authenticated/thoughts.tsx`** (line 77)
- Comment: `"thoughts/inbox"` → `"thoughts"`

### 3. Legacy Templates — Rename data attributes

**`app/templates/_task_list.html`** (line 117)
- `data-domain-id="inbox"` → `data-domain-id="thoughts"`

**`app/templates/_scheduled_tasks.html`** (line 5)
- Same rename

**`app/templates/_completed_tasks.html`** (line 5)
- Same rename

**`app/templates/_deleted_tasks.html`** (line 5)
- Same rename

### 4. Legacy JS — Update selectors

**`static/js/task-mutations.js`** (lines 177, 378, 598, 641, 776)
- All `'inbox'` string references in DOM selectors → `'thoughts'`

### 5. Legacy CSS — Update selectors

**`static/css/dashboard.css`** (line ~792)
- `.project-group[data-domain-id="inbox"]` → `.project-group[data-domain-id="thoughts"]`

### 6. Backend Comments — Rename terminology

**`app/services/task_service.py`** (~lines 140-148, 564)
- Rename "inbox" in comments/docstrings to "thoughts"

**`app/services/task_grouping.py`** (line 184)
- Comment: `"Inbox (None) last"` → `"Thoughts (None) last"`

**`app/services/demo_service.py`** (line 141)
- Comment: `"Inbox/Thoughts"` → `"Thoughts"`

**`app/services/todoist_import.py`** (lines 177-179, 257)
- Comment: `"Skip 'Inbox' project"` → `"Skip 'Inbox' project from Todoist — maps to thoughts (domain_id=None)"`

**`app/services/analytics_service.py`** (line 239)
- Comment: `"Skip Inbox"` → `"Skip thoughts"`

### 7. Tests — Update terminology

**`tests/test_task_filtering.py`** (lines 60-61)
- Method name: `test_has_domain_false_returns_inbox_tasks` → `test_has_domain_false_returns_thoughts`
- Docstring: "inbox" → "thoughts"

**`tests/test_task_service.py`** (lines 217, 224-226)
- `"Inbox Task"` → `"Thought Task"`
- `inbox_tasks` → `thought_tasks`

### 8. SVG icons (keep as-is)
- `_svg_sprites.html` symbol `id="inbox"` and `static/img/icons/ui-icons.svg` — keep since these are generic icon IDs not user-facing
- `static/img/illustrations/empty-inbox.svg` — keep filename (illustration asset)

## NOT changed (intentionally)
- **Database schema**: No "inbox" exists in the DB schema — it's just `domain_id = NULL`
- **API parameters**: `has_domain` filter name is descriptive and correct, no rename needed
- **Todoist import**: Still skips Todoist's "Inbox" project (that's Todoist's name, not ours)

## Verification

1. `cd frontend && npx tsc --noEmit && npx biome check .` — frontend compiles
2. `uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test` — backend passes
3. Manual: Dashboard/Tasks page no longer shows domain_id=null tasks
4. Manual: Thoughts page still works and shows domain_id=null tasks
5. Manual: Quick Add and Task Editor dropdowns say "No domain (Thoughts)"
6. Manual: Legacy dashboard (Python) still works (already hides inbox via has_domain=True)
