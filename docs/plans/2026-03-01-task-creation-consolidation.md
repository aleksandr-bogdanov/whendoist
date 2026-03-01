---
version:
pr:
created: 2026-03-01
---

# Consolidate Task Creation: Eliminate Duplication Across 8 Entry Points

## Context

Task creation/editing logic is scattered across 8 frontend components with significant duplication:
- **TaskInspector** and **ThoughtTriageDrawer** are ~90% identical (~400 lines duplicated)
- **Encrypt + create + toast + undo** pattern repeated in 3 components (~100 lines)
- **Parent task grouping** logic copy-pasted across 3 components (~60 lines)
- **Triage regex constants** duplicated in 2 files

Total: ~560 lines of duplicated logic to eliminate via 4 extractions.

## Step 1: Extract `groupParentTasks` utility

**New export in** `frontend/src/lib/task-utils.ts`

```typescript
export interface ParentTaskGroup {
  label: string;
  tasks: TaskResponse[];
}

export function groupParentTasks(
  parentTasks: TaskResponse[],
  currentDomainId: number | null,
  search: string,
  excludeTaskId?: number,
): ParentTaskGroup[]
```

Replaces identical `taskGroups` useMemo in:
- `thought-triage-drawer.tsx` → `ParentPickerDrawer` (line 576)
- `task-inspector.tsx` → `ParentPickerPopover` (line 487)
- `parent-task-picker.tsx` → `ParentTaskPicker` (line 51, uses `excludeTaskId`)

## Step 2: Move triage constants to `task-parser.ts`

Add 3 exports to `frontend/src/lib/task-parser.ts`:

```typescript
export const IMPACT_TOKEN_PATTERN = /!(high|mid|low|min|p[1-4])\b/i;
export const IMPACT_KEYWORDS: Record<number, string> = { 1: "high", 2: "mid", 3: "low", 4: "min" };
export const SCHEDULE_DATE_PATTERN = /\b(today|tod|tomorrow|tom|tmrw?|yes|yest|...)\b/i;
```

Remove local duplicates from:
- `task-inspector.tsx` (lines 27-30)
- `thought-triage-drawer.tsx` (lines 96-99)

Note: The existing private `IMPACT_PATTERN` (line 57, `g` flag) is for `matchAll` in the parser. The new `IMPACT_TOKEN_PATTERN` (no `g` flag) is for `tapToken` replacement — different purpose.

## Step 3: Extract `useTriageForm` hook (biggest win)

**New file:** `frontend/src/hooks/use-triage-form.ts`

Extracts ALL shared logic between `InspectorBody` and `DrawerBody`:

- State: parentId, description, recurrence, calendarOpen, domainFlash, descriptionFocused, displayTitle
- `useSmartInput<HTMLTextAreaElement>` setup
- Callbacks: handleTitleEdit, clearTokenType, handleDateSelect, handleSubmit
- Field handlers: handleDomainSelect, handleImpactChange, handleClarityChange, handleDurationChange, handleTimeChange, handleParentSelect (with domain auto-sync + flash)
- Derived: canConvert
- `ConvertData` type (moved here from thought-triage-drawer.tsx)

**Return interface:**
```typescript
export interface UseTriageFormReturn {
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  parsed: ParsedTaskMetadata;
  displayTitle: string;
  description: string; setDescription: (v: string) => void;
  descriptionFocused: boolean; setDescriptionFocused: (v: boolean) => void;
  recurrence: RecurrencePresetValue | null; setRecurrence: (v: RecurrencePresetValue | null) => void;
  parentId: number | null; setParentId: (v: number | null) => void;
  domainFlash: boolean;
  calendarOpen: boolean; setCalendarOpen: (v: boolean) => void;
  canConvert: boolean;
  handleTitleEdit: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleDateSelect: (iso: string) => void;
  handleSubmit: () => void;
  clearTokenType: (type: string) => void;
  handleDomainSelect: (id: number, name: string) => void;
  handleImpactChange: (impact: number) => void;
  handleClarityChange: (clarity: string) => void;
  handleDurationChange: (m: number | null) => void;
  handleTimeChange: (time: string) => void;
  handleParentSelect: (id: number | null) => void;
  tapToken: (prefix: string, value: string, existingPattern: RegExp) => void;
}
```

**Result:** `ThoughtTriageDrawer` shrinks ~705→~300 lines, `TaskInspector` shrinks ~625→~250 lines. Both become pure layout shells.

**Files modified:**
- **Create:** `frontend/src/hooks/use-triage-form.ts` (~150 lines)
- **Rewrite:** `frontend/src/components/task/thought-triage-drawer.tsx` (layout shell)
- **Rewrite:** `frontend/src/components/task/task-inspector.tsx` (layout shell)
- **Update import:** `frontend/src/routes/_authenticated/thoughts.lazy.tsx` (ConvertData)

## Step 4: Extract `useTaskCreate` hook

**New file:** `frontend/src/hooks/use-task-create.ts`

Centralizes encrypt → create → toast + undo → invalidate pattern.

```typescript
export interface CreateTaskInput {
  title: string;
  description?: string | null;
  domain_id?: number | null;
  parent_id?: number | null;
  impact?: number;        // default 4
  clarity?: string;       // default "normal"
  duration_minutes?: number | null;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  is_recurring?: boolean;
  recurrence_rule?: TaskCreate["recurrence_rule"];
  recurrence_start?: string | null;
  recurrence_end?: string | null;
}

export function useTaskCreate(options?: {
  onCreated?: (task: TaskResponse) => void;
  optimisticAppend?: boolean;
}): {
  create: (input: CreateTaskInput) => Promise<void>;
  isPending: boolean;
}
```

Replaces boilerplate in:
- `task-quick-add.tsx` — handleSave (lines 85-141)
- `domain-group.tsx` — handleInlineAdd (lines 76-123)
- `subtask-ghost-row.tsx` — handleCreate (lines 45-98)

## What NOT to change

- **Approach A vs B** — `useSmartInputConsumer` (tokens consumed) and `useSmartInput` (raw text SOT) serve different UX patterns. Don't merge.
- **TaskEditor / TaskDetailPanel** — their edit+create+delete lifecycle is complex enough that a shared hook would add more abstraction than clarity. Leave as-is.
- **DomainGroup / SubtaskGhostRow smart input** — intentionally minimal; no smart input needed.

## Files Summary

| File | Action |
|------|--------|
| `frontend/src/lib/task-utils.ts` | Add `groupParentTasks` + `ParentTaskGroup` type |
| `frontend/src/lib/task-parser.ts` | Add 3 exported constants |
| `frontend/src/hooks/use-triage-form.ts` | **New** — triage form hook (~150 lines) |
| `frontend/src/hooks/use-task-create.ts` | **New** — create task hook (~60 lines) |
| `frontend/src/components/task/thought-triage-drawer.tsx` | Rewrite to layout shell |
| `frontend/src/components/task/task-inspector.tsx` | Rewrite to layout shell |
| `frontend/src/components/task/task-quick-add.tsx` | Replace handleSave with useTaskCreate |
| `frontend/src/components/task/domain-group.tsx` | Replace handleInlineAdd with useTaskCreate |
| `frontend/src/components/task/subtask-ghost-row.tsx` | Replace handleCreate with useTaskCreate |
| `frontend/src/components/task/parent-task-picker.tsx` | Use groupParentTasks |
| `frontend/src/routes/_authenticated/thoughts.lazy.tsx` | Update ConvertData import |

## Verification

After each step:
```bash
cd frontend && npx tsc -p tsconfig.app.json --noEmit && npx biome check . && npm run build
```

Manual testing after Step 3:
- Desktop: Thoughts page → select thought → verify inspector works (all fields, parent sync, submit)
- Mobile: Thoughts page → tap thought → verify drawer works (same, plus nested drawers)

Manual testing after Step 4:
- Quick Add dialog (Cmd+K): create task with tokens, verify toast + undo
- Domain group "+Add task": create inline, verify toast + undo
- Subtask "+Add subtask": create inline, verify toast + undo
