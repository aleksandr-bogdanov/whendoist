---
version: v0.54.95
pr: 488
created: 2026-02-24
---

# Task Panel Header Cleanup

## Context

The task panel header has accumulated controls that are either redundant or misplaced:
- **SCHEDULED / COMPLETED buttons** duplicate the section chevron toggles
- **Gear menu** has two settings — one unused by the React SPA (`hide_recurring_after_completion`), the other (`completed_retention_days`) buried behind a gear icon far from where it's relevant
- **Completed tasks** don't actually persist across page refreshes (dashboard fetches `status=pending`, so completed tasks only exist via optimistic cache updates within a session)
- **Deleted tasks** fetch ALL archived tasks with no limit, which will cause performance issues over time
- **Completed subtasks** cannot be hidden — a parent with 10/12 done shows all 12 expanded

## Changes Overview

| # | Change | Type |
|---|--------|------|
| 1 | Remove FilterBar (SCHEDULED + COMPLETED buttons) | Delete |
| 2 | Remove SettingsPanel (gear icon) | Delete |
| 3 | Move SortControls to Row 1 | Layout |
| 4 | Fix completed tasks — fetch `status=all`, add retention control to CompletedSection header | Feature fix |
| 5 | Per-parent "hide completed subtasks" toggle | Feature |
| 6 | DeletedSection: limit=15 + "Show all" link | Feature |

---

## Phase 1: Backend — Add `limit`/`offset` + `X-Total-Count` to tasks endpoint

### 1A. `app/services/task_service.py`

Add `limit: int | None = None` and `offset: int | None = None` params to `get_tasks()`. Apply them before executing the query:

```python
if offset is not None:
    query = query.offset(offset)
if limit is not None:
    query = query.limit(limit)
```

Add a `count_tasks()` method that builds the same WHERE clause but returns `SELECT COUNT(*)`. To avoid duplicating filter logic, extract a private `_build_task_filters(query, ...)` helper that both methods share.

### 1B. `app/routers/tasks.py`

Add to `list_tasks` endpoint:
```python
limit: int | None = Query(None, ge=1, le=200, description="Max tasks to return"),
offset: int | None = Query(None, ge=0, description="Number of tasks to skip"),
```

Accept `response: Response` param. When `limit` is set, also call `service.count_tasks(...)` and set:
```python
response.headers["X-Total-Count"] = str(total)
```

### 1C. Regenerate orval types

```bash
cd frontend && npx orval
```

---

## Phase 2: Frontend — Remove FilterBar, SettingsPanel, restructure header

### 2A. Delete files
- `frontend/src/components/dashboard/filter-bar.tsx`
- `frontend/src/components/dashboard/settings-panel.tsx`

### 2B. `frontend/src/components/dashboard/task-panel.tsx`

Remove imports of FilterBar and SettingsPanel. Collapse header from 2 rows to 1:

**Current:**
```
Row 1: [EnergySelector]        [Quick] [New Task] [Gear]
Row 2: [SCHEDULED] [COMPLETED]              [Sort Controls]
```

**New:**
```
Row 1: [EnergySelector]  [Sort Controls]  [Quick] [New Task]
```

SortControls moves to Row 1, right-aligned before the action buttons. It's already `hidden sm:flex` (desktop-only).

### 2C. `frontend/src/stores/ui-store.ts` — No changes

`showScheduled`/`showCompleted` stay — ScheduledSection and CompletedSection still use them for their own chevron toggles.

---

## Phase 3: Fix completed tasks + retention + subtask toggle + deleted limit

### 3A. Dashboard fetches `status=all`

**`frontend/src/routes/_authenticated/dashboard.tsx`** line 32:
```typescript
// Before:
const { data: tasks } = useListTasksApiV1TasksGet();
// After:
const { data: tasks } = useListTasksApiV1TasksGet({ status: "all" });
```

This returns pending + completed tasks (excluding archived). `categorizeTasks()` already splits them correctly. Completed tasks now persist across page refreshes.

**Query key update**: All optimistic updates in `task-item.tsx` use `getListTasksApiV1TasksGetQueryKey()` (no params). Since the dashboard now uses `{ status: "all" }`, the key is different. Create a shared constant and update all `setQueryData` calls:

```typescript
// frontend/src/lib/query-keys.ts (new file)
import { getListTasksApiV1TasksGetQueryKey } from "@/api/queries/tasks/tasks";
export const DASHBOARD_TASKS_PARAMS = { status: "all" } as const;
export const dashboardTasksKey = () => getListTasksApiV1TasksGetQueryKey(DASHBOARD_TASKS_PARAMS);
```

Update all `getListTasksApiV1TasksGetQueryKey()` calls in these files:
- `frontend/src/components/task/task-item.tsx` (~7 `setQueryData` calls)
- `frontend/src/routes/_authenticated/dashboard.tsx` (~3 `invalidateQueries` calls)
- `frontend/src/components/task/task-editor.tsx` (1 `useListTasksApiV1TasksGet` call + invalidations)

Note: `invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() })` uses prefix matching and already works for both the old and new keys. But `setQueryData` does exact matching — those MUST be updated.

**Note**: CalendarPanel already uses `useListTasksApiV1TasksGet({ status: "all" })` (line 107), confirming this pattern is established.

### 3B. `frontend/src/components/task/completed-section.tsx` — Add retention control

Add preferences hooks (from the deleted SettingsPanel):
```typescript
const { data: preferences } = useGetPreferencesApiV1PreferencesGet();
const updatePrefs = useUpdatePreferencesApiV1PreferencesPut();
const retentionDays = preferences?.completed_retention_days ?? 7;
```

**Client-side retention filtering** — filter before rendering:
```typescript
const cutoff = new Date();
cutoff.setDate(cutoff.getDate() - retentionDays);
const filtered = sorted.filter(t =>
  t.completed_at && new Date(t.completed_at) >= cutoff
);
```

**Retention segmented control in header** — between count and chevron:
```
[CheckCircle2] Completed (5)  [1d] [3d] [7d]  [ChevronDown]
```

Three small buttons: `h-5 text-[10px] px-1.5`. Active = `variant="default"`, inactive = `variant="outline"`. Use `onPointerDown={(e) => e.stopPropagation()}` to prevent collapsible toggle. Use `onClick` with `e.stopPropagation()` and call `updatePrefs.mutate(...)`.

### 3C. `frontend/src/components/task/deleted-section.tsx` — Limit + "Show all"

Add local state:
```typescript
const [showAll, setShowAll] = useState(false);
```

Create a custom fetch that reads `X-Total-Count` header (orval's `apiClient` discards headers):
```typescript
const fetchArchivedWithCount = async (limit?: number) => {
  const params: Record<string, unknown> = { status: "archived" };
  if (limit) params.limit = limit;
  const response = await axios.get<TaskResponse[]>("/api/v1/tasks", { params });
  return {
    tasks: response.data,
    totalCount: Number(response.headers["x-total-count"]) || response.data.length,
  };
};
```

Replace the orval hook with `useQuery` directly:
```typescript
const { data } = useQuery({
  queryKey: ["/api/v1/tasks", { status: "archived", limit: showAll ? undefined : 15 }],
  queryFn: () => fetchArchivedWithCount(showAll ? undefined : 15),
  enabled: isOpen,
});
const tasks = data?.tasks ?? [];
const totalCount = data?.totalCount ?? 0;
```

Update header count: `"Deleted (15 of 47)"` when `totalCount > tasks.length`.

Add "Show all deleted" button at bottom of list:
```typescript
{totalCount > tasks.length && (
  <button onClick={() => setShowAll(true)} className="...">
    Show all {totalCount} deleted →
  </button>
)}
```

Query invalidation: `invalidateQueries({ queryKey: ["/api/v1/tasks"] })` prefix-matches this key, so restore still works.

### 3D. `frontend/src/stores/ui-store.ts` — Add `hideCompletedSubtasks`

Add to state interface:
```typescript
hideCompletedSubtasks: Set<number>;
toggleHideCompletedSubtasks: (taskId: number) => void;
```

Implementation: same pattern as `expandedSubtasks` — `Set<number>`, capped at 100 entries, persisted via the existing Zustand persist middleware (serialize to array, rehydrate to Set).

### 3E. `frontend/src/components/task/task-item.tsx` — Per-parent subtask toggle

**In `SubtaskTree` component** (~line 961): Read `hideCompletedSubtasks` from store. Filter subtasks:
```typescript
const visibleSubtasks = isHidingCompleted
  ? subtasks.filter(st => st.status !== "completed")
  : subtasks;
```

**Subtask count badge** (~line 733): Make the badge always visible (currently hidden when expanded) and clickable. When hiding completed, show `activeCount/totalCount`. When showing all, show `totalCount`:

```typescript
{hasSubtasks && (
  <button onClick={...} title={isHidingCompleted ? "Show completed" : "Hide completed"}>
    <Badge>
      {isHidingCompleted ? `${activeCount}/${totalCount}` : totalCount}
    </Badge>
  </button>
)}
```

This badge serves dual purpose: shows progress at a glance AND toggles the filter.

---

## Phase 4: Validation

### 4A. Re-run orval if API changed
```bash
cd frontend && npx orval
```

### 4B. Run all checks
```bash
uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test
cd frontend && npx tsc -p tsconfig.app.json --noEmit && npx biome check . && npm run build
```

### 4C. Backend tests

Add tests in `tests/` for:
- `get_tasks()` with `limit` and `offset`
- `count_tasks()` returning correct counts
- `list_tasks` endpoint with `X-Total-Count` header when `limit` is set
- Endpoint without `limit` does NOT return the header

---

## Files to modify

**Delete:**
- `frontend/src/components/dashboard/filter-bar.tsx`
- `frontend/src/components/dashboard/settings-panel.tsx`

**Create:**
- `frontend/src/lib/query-keys.ts` (shared dashboard query key constant)

**Backend:**
- `app/services/task_service.py` — `limit`/`offset` in `get_tasks()`, new `count_tasks()`, extract `_build_task_filters()`
- `app/routers/tasks.py` — `limit`/`offset` query params, `Response` injection, `X-Total-Count` header

**Frontend:**
- `frontend/src/routes/_authenticated/dashboard.tsx` — `status: "all"` param
- `frontend/src/components/dashboard/task-panel.tsx` — single-row header, remove imports
- `frontend/src/components/task/completed-section.tsx` — retention control + client-side filtering
- `frontend/src/components/task/deleted-section.tsx` — limit=15 + show all + custom query
- `frontend/src/components/task/task-item.tsx` — subtask hide toggle + update query keys
- `frontend/src/components/task/task-editor.tsx` — update query key references
- `frontend/src/stores/ui-store.ts` — `hideCompletedSubtasks` state

**Regenerate:**
- `frontend/src/api/` (via `npx orval`)

## Key decisions

1. **`status=all` instead of self-fetch** — Dashboard fetches all non-archived tasks in one query. Simpler than CompletedSection self-fetching, and optimistic updates continue to work naturally.
2. **Client-side retention filtering** — `completed_retention_days` is applied in CompletedSection, not on the server. Keeps the API generic. Can add server-side filtering later if the query gets too large.
3. **`X-Total-Count` header** for deleted count — avoids schema changes. DeletedSection uses a custom `useQuery` call to read the header.
4. **Per-parent subtask hide** as `Set<number>` — same pattern as `expandedSubtasks`, persisted to localStorage.
5. **`hide_recurring_after_completion` DB field stays** — just removed from UI. No migration needed.
