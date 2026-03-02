---
version: v0.55.90
pr: 583
created: 2026-03-02
---

# Command Palette — 5 Enhancements

## Context

The command palette (Cmd+K) has its core four phases implemented (v0.55.78–v0.55.88):
task search, command mode, creation fallthrough, empty state, and task action drilldown.
This plan covers the next 5 enhancements that make the palette a true power-user hub.

**Implementation order: 3 → 2 → 4 → 5 → 6** (type dependencies flow this way).

---

## Enhancement 3: Subtask Search

**Problem:** `useTaskSearch` only indexes parent tasks. Subtasks (`task.subtasks[]`) are invisible to search.

**Approach:** Flatten subtasks into the Fuse index alongside parents. Each `FlatTask` gets a new `subtask` field.

### Changes

**`frontend/src/hooks/use-task-search.ts`**
- Extend `FlatTask` with `subtask: SubtaskResponse | null` and `parentTask: TaskResponse | null`
- In the `flatTasks` memo, loop through `task.subtasks ?? []` and push each as a separate `FlatTask`
  with `title: subtask.title`, `description: subtask.description ?? ""`, `subtask: subtask`, `parentTask: task`
- Extend `SearchResult` with `subtask: SubtaskResponse | null` and `parentTask: TaskResponse | null`
- Map Fuse results to populate these new fields

**`frontend/src/components/search/search-palette.tsx`**
- In `renderTaskSection`, when `result.subtask` is set, render as:
  `<span class="text-muted-foreground">{parentTitle} ›</span> {subtaskTitle}`
- When selecting a subtask: navigate to the parent task, expand its subtasks via `expandSubtask(parentTask.id)` from ui-store

---

## Enhancement 2: Smart Filters

**Problem:** Users can only search by fuzzy text match. No way to filter by date, domain, or status from the palette.

**Approach:** Detect `@` prefix tokens (e.g. `@today`, `@overdue`, `#Work`) in the search query, apply them as post-filters on task results.

### Changes

**New file: `frontend/src/lib/palette-filters.ts`**
```ts
interface PaletteFilter {
  type: "date" | "domain" | "status";
  label: string;       // display label, e.g. "@today", "#Work"
  predicate: (task: TaskResponse, domain?: DomainResponse | null) => boolean;
}

// parseFilterTokens(query: string, domains: DomainResponse[]): { cleanQuery: string; filters: PaletteFilter[] }
// — extracts @today, @tomorrow, @overdue, @unscheduled, @week, @completed, #DomainName
// — returns the remaining query text with filter tokens stripped
```

Supported filters:
| Token | Matches |
|-------|---------|
| `@today` | `scheduled_date === today` |
| `@tomorrow` | `scheduled_date === tomorrow` |
| `@overdue` | `scheduled_date < today && status !== "completed"` |
| `@unscheduled` | `scheduled_date === null && status !== "completed"` |
| `@week` | `scheduled_date` within next 7 days |
| `@completed` | `status === "completed"` |
| `#DomainName` | fuzzy match on domain name (reuse Fuse) |

**`frontend/src/components/search/search-palette.tsx`**
- Import `parseFilterTokens` from `palette-filters.ts`
- Before fuzzy search: `const { cleanQuery, filters } = parseFilterTokens(searchQuery, domains)`
- Pass `cleanQuery` to `search()` instead of `searchQuery`
- After results: `taskResults.filter(r => filters.every(f => f.predicate(r.task, r.domain)))`
- Show active filters as pills below the input (reuse `MetadataPill` from task-quick-add)
- Show filter suggestions in autocomplete when user types `@` — list all filter tokens

**`frontend/src/components/search/search-palette.tsx` (footer)**
- Add `@` hint to footer: `<kbd>@</kbd> filter`

---

## Enhancement 4: Description Snippet

**Problem:** When Fuse matches on description, users see no indication — only the title is displayed.

**Approach:** When a search result has a match on the `description` key, show a truncated snippet below the title with the matched portion highlighted.

### Changes

**`frontend/src/components/search/search-palette.tsx`**
- New inline component `DescriptionSnippet`:
  - Takes `description: string` and `matchIndices: [number, number][]`
  - Finds the first match, extracts ~60 chars around it
  - Adds `...` prefix/suffix if truncated
  - Uses existing `HighlightedText` for highlighting
- In `renderTaskSection`, after the title line, check `result.matches?.find(m => m.key === "description")`
- If present, render `<DescriptionSnippet>` as a second line in `text-xs text-muted-foreground`

This also works for subtask descriptions (from Enhancement 3) since subtask descriptions are indexed in the same `description` field.

---

## Enhancement 5: Merge Quick-Add into Palette

**Problem:** Two separate dialogs for task creation — `TaskQuickAdd` (Q shortcut) and the palette's creation fallthrough — duplicate functionality and confuse the mental model.

**Approach:** Replace the palette's plain `<input>` with `useSmartInput()` so it has full smart parsing (autocomplete, token dismissal, pills). Then deprecate the standalone `TaskQuickAdd` dialog.

### Changes

**`frontend/src/components/search/search-palette.tsx`** (largest change)
- Replace `useState("")` query with `useSmartInput({ domains })` hook
  - Wire `inputRef`, `handleInputChange`, `rawInput` from the hook
  - The hook's `parsed` replaces the current manual `parseTaskInput()` call
  - Render `<SmartInputAutocomplete>` positioned below the input
  - Show `MetadataPill`s between the input area and results list
- Keyboard coordination: the hook's `handleKeyDown` returns `boolean`
  - If `true`: autocomplete consumed the event (skip palette navigation)
  - If `false`: fall through to existing ArrowUp/ArrowDown/Enter/Tab handling
- Mode detection: derive `isCommandMode` from `rawInput.startsWith(">")`
  - When in command mode, smart input parsing is skipped (the `>` prefix is not a task token)
- Search query: use `parsed.title` (with filter tokens stripped per Enhancement 2) as the fuzzy search input
  - This means metadata tokens are automatically excluded from search text

**`frontend/src/lib/palette-commands.ts`**
- Change the `task-new` command handler: instead of opening `QuickAdd`, just focus the palette input
  ```ts
  handler: () => {
    // Palette is already the task creation surface
    // If palette is open, just focus input. If closed, open it.
    if (!get().searchOpen) set({ searchOpen: true });
  }
  ```

**`frontend/src/stores/ui-store.ts`**
- Keep `quickAddOpen` and `setQuickAddOpen` for now (they become dead code), remove in a follow-up cleanup

**`frontend/src/components/layout/mobile-nav.tsx`**
- Change the `+` FAB button: `onClick={() => setSearchOpen(true)}` instead of `setQuickAddOpen(true)`
- This makes the FAB open the palette (which is now the unified creation surface)

**`frontend/src/hooks/use-shortcuts.ts`** (no change needed)
- The `Q` shortcut already calls palette commands, which will now open the palette

**What stays from `task-quick-add.tsx`:**
- `MetadataPill`, `Kbd`, `PILL_STYLES`, `PILL_ICONS` — these are already exported and used elsewhere
- The `TaskQuickAdd` component itself becomes unused (can be removed later or kept for reference)

---

## Enhancement 6: Multi-Select + Batch Actions

**Problem:** Users must act on tasks one at a time via the drilldown. No way to batch-complete, batch-schedule, or batch-move.

**Approach:** Cmd+Click (or Ctrl+Click) toggles task selection. When 2+ tasks are selected, show a batch action bar instead of the results footer.

### Changes

**`frontend/src/components/search/search-palette.tsx`**
- New state: `const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(new Set())`
- Clear selection on query change and palette open/close
- Modify task item `onClick`:
  - If `e.metaKey || e.ctrlKey`: toggle task ID in `selectedTaskIds`
  - Else: existing behavior (navigate to task)
- Visual: selected tasks get a checkbox icon + `ring-2 ring-primary/50` highlight
- When `selectedTaskIds.size >= 2`, replace the footer with a batch action bar

**New file: `frontend/src/components/search/palette-batch-actions.tsx`**
```ts
interface PaletteBatchActionsProps {
  taskIds: Set<number>;
  tasks: TaskResponse[];
  domains: DomainResponse[];
  onDone: () => void;  // close palette + clear selection
}
```

Batch actions (horizontal button row):
| Action | Behavior |
|--------|----------|
| Complete all | `PATCH /api/v1/tasks/batch` with `status: "completed"` for all IDs |
| Schedule today | `PATCH /api/v1/tasks/batch` with `scheduled_date: today` |
| Schedule tomorrow | `PATCH /api/v1/tasks/batch` with `scheduled_date: tomorrow` |
| Move to domain | Mini domain picker (same pattern as `palette-task-actions.tsx` domain picker) |
| Delete all | Confirmation step, then `DELETE /api/v1/tasks/batch` |

**Backend consideration:** Check if batch endpoints already exist. If not, this enhancement needs a backend `PATCH /api/v1/tasks/batch` endpoint. If they don't exist, create:
- `PATCH /api/v1/tasks/batch` — accepts `{ task_ids: number[], updates: Partial<TaskUpdate> }`
- `DELETE /api/v1/tasks/batch` — accepts `{ task_ids: number[] }`

Both must filter by `user_id` (multitenancy rule).

**Footer hint update:**
- When no tasks selected: existing footer
- When tasks selected: `"{n} selected — Complete | Schedule | Move | Delete"`

---

## Files Summary

| File | Enhancements | Action |
|------|-------------|--------|
| `frontend/src/hooks/use-task-search.ts` | 3 | Extend FlatTask + SearchResult with subtask fields |
| `frontend/src/lib/palette-filters.ts` | 2 | **New** — filter token parser |
| `frontend/src/components/search/search-palette.tsx` | 2, 3, 4, 5, 6 | Main integration point for all enhancements |
| `frontend/src/components/search/palette-batch-actions.tsx` | 6 | **New** — batch action bar |
| `frontend/src/lib/palette-commands.ts` | 5 | Change `task-new` handler |
| `frontend/src/components/layout/mobile-nav.tsx` | 5 | FAB opens palette |
| `frontend/src/stores/ui-store.ts` | 5 | (minor) quickAddOpen becomes unused |
| Backend: `app/routers/v1/tasks.py` | 6 | Batch PATCH/DELETE endpoints (if not existing) |
| Backend: `app/services/task_service.py` | 6 | Batch update/delete methods |

---

## Verification

After each enhancement:
1. `cd frontend && npx tsc -p tsconfig.app.json --noEmit` — no type errors
2. `cd frontend && npx biome check .` — no lint/format issues
3. `cd frontend && npm run build` — production build succeeds
4. Manual testing in browser:
   - **Enh 3:** Search for a subtask title → shows "Parent > Subtask", selecting navigates correctly
   - **Enh 2:** Type `@today fix` → only today's tasks matching "fix"; `#Work` filters by domain
   - **Enh 4:** Search a word that appears in a description → snippet shows below title
   - **Enh 5:** Press Q → palette opens (no separate dialog); type `Fix login #Work !high 30m` → pills appear, autocomplete works; Enter creates task
   - **Enh 6:** Cmd+Click 3 tasks → batch bar appears; "Complete all" works
5. Backend (if batch endpoints added): `uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test`
