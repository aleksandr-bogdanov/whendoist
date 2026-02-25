---
version: v0.55.11
pr:
created: 2026-02-25
---

# Smart Quick Add Task V2

## Context

The current Quick Add Task (`frontend/src/components/task/task-quick-add.tsx`) is a simple modal with a title input + domain dropdown that creates tasks with hardcoded defaults (impact=4, clarity="normal"). It feels dated and requires the full task editor to set any metadata.

This plan redesigns Quick Add as an intelligent single-field input with inline metadata parsing — type naturally and metadata gets extracted automatically. Similar to Todoist's quick add but differentiated with our own syntax.

## Syntax Design

| Token | Metadata | Examples | Trigger |
|-------|----------|----------|---------|
| `@DomainName` | Domain | `@Work`, `@Personal` | Fuzzy autocomplete on `@` |
| `!critical` `!high` `!med` `!low` | Impact 1-4 | `Fix bug !high` | Keyword match |
| `?auto` `?brain` `?normal` | Clarity | `Research ?brain` | Autocomplete on `?` |
| `30m` `1h` `2h30m` | Duration | `Review PR 30m` | Bare number+unit |
| Natural language | Date/time | `tomorrow`, `next monday at 3pm` | chrono-node |
| `//` | Description | `Fix bug // timeout errors` | Split separator |

All trigger symbols (`@`, `!`, `?`, `//`) are on the iPhone number pad (one tap from letters). Duration uses bare tokens (no prefix needed).

## UI Design

- **Container**: Modal dialog (same as current — shadcn Dialog)
- **Single input field**: Plain `<Input>`, all parsing happens behind the scenes
- **Metadata bar**: Row of colored dismissable pills below input showing parsed tokens
- **Autocomplete dropdown**: Appears below input when typing `@` or `?`
- **Hint row**: Subtle syntax reference below metadata bar, dismissable (persisted to localStorage)
- **Keep-open toggle**: Checkbox in footer to stay open for batch creation (persisted to localStorage)
- **Placeholder**: `e.g. Fix login bug @Work !high 30m tomorrow`

## Files to Create

### 1. `frontend/src/lib/task-parser.ts` — Core parsing logic

Pure functions, no React. Two main exports:

**`parseTaskInput(input, domains, dismissedTypes?)`** → `ParsedTaskMetadata`
- Runs synchronously on every keystroke (<1ms)
- Processing order: description `//` → domain `@` → impact `!` → clarity `?` → duration → date (chrono-node)
- Each token type is extracted and removed from working text; remainder becomes title
- `dismissedTypes` set skips extraction for types the user manually dismissed via pill X
- Last-wins for duplicate tokens (e.g. `!high !low` → impact=4)
- Returns parsed metadata + array of `ParsedToken` objects for pill display

**`getAutocompleteSuggestions(input, cursorPos, domains)`** → suggestions + trigger position
- Scans backwards from cursor to find `@` or `?` trigger
- For `@`: fuzzy-matches domains (startsWith, then includes)
- For `?`: filters clarity options by prefix

Key regex patterns:
- Domain: `/@(\S+)/g`
- Impact: `/!(critical|high|med|low)\b/gi` → map to 1-4
- Clarity: `/\?(auto(?:pilot)?|brain(?:storm)?|normal)\b/gi`
- Duration: `/(?<![a-zA-Z])(\d+h\d+m|\d+h|\d+m)(?![a-zA-Z])/g`
- Date: chrono-node `chrono.parse()` on remaining text after other tokens removed

Date handling: `toDateString()` from `calendar-utils.ts` for YYYY-MM-DD. Time only extracted when `result.start.isCertain('hour')` is true (formats as HH:MM).

### 2. `frontend/src/components/task/smart-input-autocomplete.tsx` — Autocomplete dropdown

Absolutely-positioned div below input (follows `parent-task-picker.tsx` pattern — no Radix portal).

Props: `suggestions`, `visible`, `selectedIndex`, `onSelect`, `anchorRef`

Features:
- Domain suggestions show icon + name
- Clarity suggestions show label
- Keyboard: ArrowDown/Up navigate, Enter/Tab select, Escape dismiss
- Max height `max-h-48` with scroll
- Styled: `rounded-md border bg-popover shadow-md`

### 3. Rewrite `frontend/src/components/task/task-quick-add.tsx`

Same interface (`TaskQuickAddProps` with `open`, `onOpenChange`, `domains`) — dashboard needs no changes.

**Component state:**
- `rawInput` — single text field value
- `parsed` — derived `ParsedTaskMetadata` from parser
- `acVisible/acSuggestions/acSelectedIndex/acTriggerInfo` — autocomplete state
- `keepOpen` — toggle (localStorage `qa-keep-open`)
- `showHints` — hint row visibility (localStorage `qa-hints-dismissed`)
- `dismissedTypes` — Set of token types user dismissed via pill X

**Metadata pills:** Colored by type (domain=blue, impact=amber, clarity=purple, duration=green, date=rose, description=gray). Each pill has X button to dismiss. On dismiss: metadata cleared but text stays in input.

**On save:** Same mutation pattern as current (`useCreateTaskApiV1TasksPost`), but builds `TaskCreate` from parsed metadata instead of hardcoded values. Encrypt title+description via `encryptTaskFields()`. Undo via toast action + delete mutation.

**After creation:**
- Keep-open ON: clear input, stay open, refocus
- Keep-open OFF: clear input, close dialog (current behavior)

**Layout:**
```
┌─────────────────────────────────────┐
│ Quick Add Task                      │
│ Type naturally — metadata detected  │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Fix login @Work !high 30m tmrw  │ │
│ └─────────────────────────────────┘ │
│ ┌──────────────────────┐            │
│ │ autocomplete dropdown│ (if @/?)  │
│ └──────────────────────┘            │
│                                     │
│ [🔵 Work][🟡 High][🟢 30m][🌹 Tmrw]│
│                                     │
│ @ domain  ! priority  ? mode  ...   │
│                                     │
│ [✓] Keep open              [Create] │
└─────────────────────────────────────┘
```

## New Dependency

```bash
cd frontend && npm install chrono-node
```

~50KB, zero deps, TypeScript types included, tree-shakeable.

## Existing Code to Reuse

| What | File | Exports |
|------|------|---------|
| Impact maps | `frontend/src/lib/task-utils.ts` | `IMPACT_LABELS`, `IMPACT_COLORS` |
| Clarity maps | `frontend/src/lib/task-utils.ts` | `CLARITY_LABELS`, `CLARITY_COLORS` |
| Date formatting | `frontend/src/lib/calendar-utils.ts` | `toDateString()` |
| Encryption | `frontend/src/hooks/use-crypto.ts` | `useCrypto().encryptTaskFields()` |
| API mutation | `frontend/src/api/queries/tasks/tasks.ts` | `useCreateTaskApiV1TasksPost()` |
| Query keys | `frontend/src/lib/query-keys.ts` | `dashboardTasksKey()` |
| Task types | `frontend/src/api/model/taskCreate.ts` | `TaskCreate` |
| UI components | `frontend/src/components/ui/` | Dialog, Input, Button, Checkbox, Badge |

## Edge Cases

- **Empty domain list**: Autocomplete shows "No domains" message
- **No title after extraction**: Create button stays disabled
- **chrono false positives** (e.g. "May review" → May month): User dismisses date pill via X
- **"30m" in casual text**: Accepted as duration — in a task app, `30m` is almost always a duration
- **Multiple same-type tokens**: Last wins (simple, predictable)
- **Dismissed then re-typed**: Editing input clears all dismissals, re-parses fresh

## Verification

1. `cd frontend && npm install chrono-node`
2. `cd frontend && npx tsc -p tsconfig.app.json --noEmit` — type check
3. `cd frontend && npx biome check .` — lint
4. `cd frontend && npm run build` — production build
5. Manual test: open Quick Add (`q`), type various inputs, verify pills appear, autocomplete works, task creates with correct metadata
