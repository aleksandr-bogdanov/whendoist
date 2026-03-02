---
version:
pr:
created: 2026-03-02
---

# Command Palette — Architecture & Iteration Plan

## Core Architecture

**One palette. One input. Two modes.**

| Input starts with | Mode | What's shown |
|-------------------|------|-------------|
| *(anything else)* | Search | Fuzzy-matched tasks + any matching commands in "Actions" section |
| `>` | Command | Commands only (navigation, toggles, data ops) |

No other prefixes. Everything else is iteration on top of this foundation.

### Data model

```ts
// Command registry — static array, lives in its own file
interface PaletteCommand {
  id: string;                    // "theme-dark", "nav-dashboard", "task-new"
  label: string;                 // "Switch to dark theme"
  keywords: string[];            // ["dark mode", "night"] — extra fuzzy targets
  category: string;              // "Appearance", "Navigation", "Tasks", "Data"
  icon?: React.ComponentType;    // Lucide icon
  shortcut?: string;             // "Q" — shown on the right, Superhuman-style
  handler: () => void;           // What happens on Enter
}

// Palette state — extends existing search state in ui-store
// searchOpen: boolean           — already exists
// searchNavigateId: number      — already exists
// paletteMode: "search" | "command" — derived from input (starts with ">")
// paletteRecents: number[]      — ring buffer of last 8 task IDs (session only)
```

### Rendering logic (pseudocode)

```
if query is empty:
  show RECENTS (last 8 tasks interacted with)
  show RIGHT NOW (today count, overdue count, thought count)

else if query starts with ">":
  strip ">" prefix
  fuzzy match against command registry
  show grouped by category

else:
  fuzzy match against tasks (existing behavior)
  fuzzy match against command registry
  show TASKS section (grouped: pending, thoughts, completed)
  show ACTIONS section (matching commands, if any)
  if no results at all:
    show CREATE section (fallthrough)
```

### Component structure

```
SearchPalette (existing — becomes the shell)
├── PaletteInput (search icon, input, ⌘K badge)
├── PaletteResults (switches content based on mode)
│   ├── PaletteRecents (empty state)
│   ├── PaletteTaskResults (search mode — existing, extracted)
│   ├── PaletteCommandResults (command mode, or Actions section in search)
│   ├── PaletteCreateFallthrough (no results state)
│   └── PaletteTaskActions (drilldown sub-menu, future)
└── PaletteFooter (keyboard hints)
```

---

## Iteration Plan

Each phase is a standalone PR. No phase depends on a later one.

### Phase 1: Command mode (`>` prefix)

Add `>` prefix detection to the existing palette. When active, hide task search
and show commands from a static registry. Fuzzy match command labels + keywords
with the same Fuse.js. Each command shows its shortcut on the right (Superhuman
training pattern).

**Command registry (~25 commands):**

| Category | Commands |
|----------|----------|
| Navigation | Go to Dashboard, Thoughts, Analytics, Settings |
| Tasks | New task, New thought, Plan My Day |
| Appearance | Switch to light/dark/system theme |
| Filters | Set energy High/Med/Low, Toggle show scheduled, Toggle show completed |
| Data | Export backup, Create snapshot, Sync Google Calendar |
| Help | Keyboard shortcuts |

**Files:** New `palette-commands.ts` registry, modify `search-palette.tsx`.

### Phase 2: Creation fallthrough

When search returns zero results, show "Create task" and "Capture thought" options.
Run the smart input parser on the query to extract metadata (domain, date, duration,
priority) and show parsed tokens as pills below the creation option.

`Enter` = create task. `Cmd+Enter` = capture thought.

**Files:** Modify `search-palette.tsx`, import from `task-parser.ts`.

### Phase 3: Empty state — recents + "Right Now"

Track last 8 task IDs the user interacted with (selected, edited, completed) in a
session-only ring buffer in `ui-store`. On empty query, show:
- **Recents** — last tasks touched (resolved from decrypted task array)
- **Right Now** — computed counts: tasks today, overdue, unprocessed thoughts

**Files:** Modify `ui-store.ts` (add `paletteRecents`), modify `search-palette.tsx`.

### Phase 4: Task action drilldown

When a task is selected in results, `→` or `Tab` opens a sub-menu of actions:
Complete, Schedule for today/tomorrow, Move to domain, Edit, Delete. Each action
executes via existing mutation hooks without leaving the palette. `←` or `Escape`
returns to search.

**Files:** New `palette-task-actions.tsx`, modify `search-palette.tsx`.

### Phase 5: Polish — shortcut hints + keyboard training

Show standalone keyboard shortcuts next to every command and action that has one.
Goal: users see "Q" next to "New task" enough times that they stop opening the
palette for it.

---

## UX Reference (from competitive research)

**Patterns adopted:**
- **Superhuman** — flat unified list, shortcut hints as training tool, speed obsession
- **Raycast** — two-level find-then-act (Enter = primary, Tab = action panel)
- **VS Code/GitHub** — `>` prefix for command mode (universally understood)
- **Slack** — frecency-ranked recents on empty state, "no results = create"

**Patterns skipped:**
- Multiple prefix characters (`#`, `@`, `!`, `/`) — overkill for our feature surface
- Scoping (GitHub Tab-to-narrow) — flat domain→task hierarchy doesn't need it
- Inline positioning (Notion slash commands) — no block editor context
- Tab-based categories (Figma) — flat list is simpler, sufficient for ~25 commands

---

## Design Principle

The palette should feel like **talking to the app.** Express intent, get results.
Every iteration reduces the distance between intention and execution.
