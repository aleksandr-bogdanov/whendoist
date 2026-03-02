---
version:
pr:
created: 2026-03-02
---

# Cmd+K Task Search Palette

## Context

Whendoist has no search capability. Users can't find tasks by name — they must manually scan
domain groups or scroll. This adds a global `Cmd+K` search palette with fuzzy matching across
all task titles and descriptions, available from any page.

**Key constraint:** Titles and descriptions may be E2EE-encrypted. The dashboard already loads
all tasks and decrypts client-side, so we piggyback on that — pure client-side fuzzy search,
zero backend changes.

---

## Decisions (from user)

- **Scope:** Pending + scheduled + completed tasks + thoughts. No deleted.
- **Fuzzy:** Yes — use fuse.js for typo-tolerant matching.
- **Fields:** Title (primary weight 0.7) + description (secondary weight 0.3).
- **Thoughts:** Included.
- **Recurring instances:** Searching the parent task is sufficient (instances inherit title).
- **Result action:** Navigate to the task's home page and select it.

---

## Architecture Notes

**Data flow:** The dashboard already fetches ALL non-archived tasks (`status: "all"`) and
decrypts them. SearchPalette uses the same TanStack Query call — TQ deduplicates, so if
the user was on the dashboard, search data is instant from cache. If not, it triggers a
fresh fetch.

**Thoughts are excluded from the dashboard task list** (`task-panel.tsx:97` filters
`domain_id !== null`). But the dashboard's `selectedTask` derivation (`dashboard.tsx:384`)
searches ALL `decryptedTasks` including thoughts. So selecting a thought on the dashboard
shows it in the detail panel even though it's not in the task list.

**Thoughts page uses local state** (`selectedId` in component, not Zustand), and renders
thoughts with `data-thought-id` attributes. To navigate to a specific thought, we need
a bridge: a `searchNavigateId` field in the Zustand store that the thoughts page picks up.

---

## Implementation Plan

### 1. Install fuse.js

```bash
cd frontend && npm install fuse.js
```

fuse.js is ~7KB gzipped, zero dependencies, well-maintained. It provides configurable fuzzy
matching with relevance scoring — perfect for client-side search over <2000 items.

### 2. Add state to `ui-store.ts`

Add to UIState/UIActions in `frontend/src/stores/ui-store.ts`:

```ts
// State
searchOpen: boolean;              // Controls palette visibility
searchNavigateId: number | null;  // Bridge for cross-page navigation from search

// Actions
setSearchOpen: (open: boolean) => void;
setSearchNavigateId: (id: number | null) => void;
```

Initialize both as `false`/`null`. Do NOT persist either (omit from `partialize`).

`searchNavigateId` is a one-shot signal: SearchPalette sets it before navigating, the target
page reads it on mount, applies the selection, and immediately clears it.

### 3. Create search hook — `frontend/src/hooks/use-task-search.ts`

A thin hook that wraps fuse.js over decrypted tasks:

```ts
export function useTaskSearch(tasks: TaskResponse[], domains: DomainResponse[])
```

Responsibilities:
- Flatten all tasks: parents + their subtasks into a single array, each with a
  `_domainName` and `_isThought` derived field for grouping results
- Build a Fuse index with:
  - `title` (weight: 0.7)
  - `description` (weight: 0.3)
- Fuse config: `threshold: 0.35`, `ignoreLocation: true`, `includeMatches: true`,
  `minMatchCharLength: 2`
- Rebuild index when tasks change (memoize with useMemo on tasks reference)
- Return `search(query: string) → SearchResult[]` function
- Each `SearchResult`: `{ task: TaskResponse, domain: DomainResponse | null, matches }`
- Limit results to 30 items for performance

### 4. Create SearchPalette component — `frontend/src/components/search/search-palette.tsx`

The main UI. Self-contained component that:
- Reads `searchOpen` / `setSearchOpen` from ui-store
- Fetches tasks via `useListTasksApiV1TasksGet(DASHBOARD_TASKS_PARAMS)` (deduped by TQ)
- Fetches domains via `useListDomainsApiV1DomainsGet()` (deduped by TQ)
- Decrypts both using `useCrypto()` with the same fingerprint pattern as dashboard
- Builds search index via `useTaskSearch()`
- Manages local state: `query`, `selectedIndex`

**UI structure (command palette style):**

```
┌──────────────────────────────────────────────┐
│  🔍  Search tasks...                   ⌘K   │
├──────────────────────────────────────────────┤
│                                              │
│  TASKS                                       │
│  ● Fix login timeout              Work  ▸   │  ← bg-accent when selected
│  ● Morning run routine          Health  ▸   │
│                                              │
│  THOUGHTS                                    │
│  ○ Research new frameworks                   │
│                                              │
│  COMPLETED                                   │
│  ✓ Deploy v2 release              Work      │
│                                              │
│                      ↑↓ navigate  ⏎ open     │
└──────────────────────────────────────────────┘
```

**Design details:**
- **Dialog positioning:** Use `Dialog` primitive. Override `DialogContent` positioning to
  `top-[15%] translate-y-0` instead of `top-[50%] translate-y-[-50%]` — command-palette
  feel (VS Code, Linear, Raycast all position ~20% from top).
- **Width:** `sm:max-w-lg` (matches quick-add dialog).
- **No DialogHeader/Footer** — clean command palette: just input + results.
- **Hide the Dialog close button** (`showCloseButton={false}` already supported).
- **Input area:** Full-width, borderless input with `Search` icon (Lucide) on the left and
  `⌘K` kbd hint on the right. Separator border below. Auto-focused.
  Style: `bg-transparent outline-none text-sm placeholder:text-muted-foreground` (like
  parent-task-picker's search input).
- **Results area:** `max-h-[50vh] overflow-y-auto` scrollable div.
  - Grouped into sections: **Tasks** (pending with domain), **Thoughts** (domain_id null),
    **Completed** (status=completed).
  - Section headers: `px-3 pt-3 pb-1 text-[10px] font-medium text-muted-foreground
    uppercase tracking-wider` (reuse parent-task-picker pattern).
  - Result rows: `px-3 py-2 text-sm cursor-pointer transition-colors flex items-center
    gap-2`. `hover:bg-accent/50` + `bg-accent` for keyboard-selected.
  - Each row shows: domain icon (if any) + task title + domain name badge on right
    (muted, small text).
  - Fuse.js match highlighting: wrap matched characters in
    `<mark className="bg-yellow-200/40 dark:bg-yellow-500/30 text-inherit rounded-sm">`.
- **Empty states:**
  - Before typing: nothing (clean, focused on input).
  - No results: centered muted text "No tasks found".
- **Keyboard navigation:**
  - `↑`/`↓`: Move `selectedIndex` through flat result list.
  - `Enter`: Select result → navigate + close.
  - `Escape`: Close palette (Dialog handles this via Radix).
  - Scroll selected item into view via `scrollIntoView({ block: "nearest" })`.
- **Footer hint:** Small muted text at bottom: `↑↓ navigate  ⏎ open  esc close`.

**On result selection (`handleSelect`):**
1. Close the palette: `setSearchOpen(false)`.
2. Clear query.
3. Branch on task type:
   - **Domain task** (`domain_id != null`):
     - `navigate({ to: "/dashboard" })`
     - `selectTask(task.id)` (Zustand)
     - After 150ms: scroll via `data-task-id` selector
   - **Thought** (`domain_id === null`):
     - `setSearchNavigateId(task.id)` (Zustand one-shot)
     - `navigate({ to: "/thoughts" })`
4. Use `useNavigate()` from TanStack Router.

### 5. Wire up thoughts page to receive search navigation

In `thoughts.lazy.tsx`, add a small effect that reads `searchNavigateId` from ui-store:

```ts
const searchNavigateId = useUIStore((s) => s.searchNavigateId);
const clearSearchNavigateId = useUIStore((s) => s.setSearchNavigateId);

useEffect(() => {
  if (searchNavigateId) {
    setSelectedId(searchNavigateId);
    clearSearchNavigateId(null);
    // Scroll into view after render
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-thought-id="${searchNavigateId}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }
}, [searchNavigateId, clearSearchNavigateId]);
```

This is a ~8-line addition — minimal impact on the thoughts page.

### 6. Handle Cmd+K keyboard binding

The global `useGlobalKeyHandler()` skips modifier keys (`if (e.ctrlKey || e.metaKey || e.altKey) return`).
Rather than modifying shared infrastructure, SearchPalette owns its `Cmd+K` / `Ctrl+K` listener:

```ts
useEffect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setSearchOpen((prev) => !prev); // Toggle — Cmd+K again closes
    }
  }
  document.addEventListener("keydown", handleKeyDown);
  return () => document.removeEventListener("keydown", handleKeyDown);
}, []);
```

**Also** register `/` as a secondary shortcut via `useShortcuts`, with `excludeInputs: true`.

### 7. Mount in `app-shell.tsx`

Add `<SearchPalette />` inside the AppShell, as a sibling to `LiveAnnouncer`:

```tsx
<LiveAnnouncer />
<SearchPalette />
```

This ensures search is available on dashboard, thoughts, settings, and analytics —
all authenticated pages.

### 8. Update shortcuts help

In the `SearchPalette` component, register `/` via `useShortcuts`:
```ts
useShortcuts(useMemo(() => [{
  key: "/",
  description: "Search tasks",
  category: "Navigation",
  excludeInputs: true,
  handler: () => setSearchOpen(true),
}], []));
```

This auto-appears in the `?` help modal. For the `Cmd+K` binding (which bypasses the
shortcut system), add a static entry in `shortcuts-help.tsx` so users see both shortcuts.

---

## Files to Create

| File | Purpose |
|------|---------|
| `frontend/src/hooks/use-task-search.ts` | Fuse.js search hook |
| `frontend/src/components/search/search-palette.tsx` | Search palette UI + Cmd+K listener |

## Files to Modify

| File | Change |
|------|--------|
| `frontend/src/stores/ui-store.ts` | Add `searchOpen`, `searchNavigateId`, and their setters |
| `frontend/src/components/layout/app-shell.tsx` | Mount `<SearchPalette />` |
| `frontend/src/routes/_authenticated/thoughts.lazy.tsx` | Read `searchNavigateId` and apply selection (~8 lines) |
| `frontend/src/components/shortcuts-help.tsx` | Add `⌘K` to help display |
| `frontend/package.json` | `fuse.js` dependency (via `npm install`) |

## Files to Reference (no changes)

| File | Why |
|------|-----|
| `frontend/src/components/task/task-quick-add.tsx` | Dialog pattern, Kbd component |
| `frontend/src/components/task/parent-task-picker.tsx` | Search-in-list pattern, section headers |
| `frontend/src/hooks/use-shortcuts.ts` | Shortcut registration API |
| `frontend/src/hooks/use-crypto.ts` | Decryption pattern (fingerprint + effect) |
| `frontend/src/lib/query-keys.ts` | `DASHBOARD_TASKS_PARAMS` |
| `frontend/src/routes/_authenticated/dashboard.tsx` | `selectTask`, scroll-into-view, data flow |
| `frontend/src/styles/globals.css` | Theme variables, brand colors |
| `frontend/src/components/ui/dialog.tsx` | Dialog primitive (positioning override) |

---

## Verification

1. `cd frontend && npx tsc -p tsconfig.app.json --noEmit` — TypeScript compiles
2. `cd frontend && npx biome check .` — lint passes
3. `cd frontend && npm run build` — production build succeeds
4. Manual testing:
   - `Cmd+K` on any authenticated page → palette opens
   - `Cmd+K` again → palette closes (toggle)
   - `/` on dashboard (not in input) → palette opens
   - Type a query → fuzzy results appear grouped by section
   - `↑`/`↓` navigate results, selected item scrolls into view
   - `Enter` on domain task → navigates to dashboard, task selected + scrolled into view
   - `Enter` on thought → navigates to thoughts page, thought selected + scrolled into view
   - `Escape` → closes palette
   - Works with encryption enabled (decrypted titles searched)
   - Works with encryption disabled (plaintext titles searched)
   - Match highlighting visible on result titles
   - Dark mode renders correctly
   - `?` help modal shows both `⌘K` and `/` shortcuts
