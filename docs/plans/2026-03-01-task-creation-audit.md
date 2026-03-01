---
version:
pr:
created: 2026-03-01
---

# Task Creation Duplication Audit

Fresh-eyes audit of all task creation paths in the React frontend.

## Architecture Overview

Two smart input approaches coexist intentionally:
- **Approach A** (`useSmartInputConsumer`) — tokens consumed into separate `useState` fields (task-editor)
- **Approach B** (`useSmartInput`) — raw text is source of truth (quick-add, triage)

## Entry Points Analyzed

| Surface | Hook | Creates via | Smart Input |
|---------|------|-------------|-------------|
| TaskQuickAdd | `useTaskCreate` | create mutation wrapper | Approach B |
| DomainGroup inline | `useTaskCreate` | create mutation wrapper | None |
| SubtaskGhostRow | `useTaskCreate` | create mutation wrapper | None |
| TaskEditor (create mode) | raw `useCreateTaskApiV1TasksPost` | direct API | Approach A |
| TaskDetailPanel (create mode) | raw `useCreateTaskApiV1TasksPost` | direct API | None |
| ThoughtTriageDrawer | `useTriageForm` → parent does update | update mutation | Approach B |
| TaskInspector | `useTriageForm` → parent does update | update mutation | Approach B |
| thoughts.lazy.tsx (capture) | raw `useCreateTaskApiV1TasksPost` | direct API | None |

## Findings

### 1a. ParentTaskSelect duplicates groupParentTasks() — HIGH

`field-pickers.tsx:424-453` contains a verbatim copy of the grouping logic from
`task-utils.ts:groupParentTasks()`. The `ParentTaskPicker` component correctly calls the
shared utility, but `ParentTaskSelect` (used by triage drawer/inspector) reimplements it
inline.

The inline copy also lacks the `excludeTaskId` parameter.

**Fix**: Replace the inline logic with a call to `groupParentTasks()`.

### 1b. TaskEditor and TaskDetailPanel near-identical — MEDIUM

Both manage ~12 identical `useState` calls, identical `handleSave` functions, identical
payload assembly for create and update, same toast patterns. Could share a hook.

### 3a. TaskEditor/TaskDetailPanel skip useTaskCreate — LOW

Their create paths use raw `useCreateTaskApiV1TasksPost()` instead of `useTaskCreate`.
Consequence: no undo toast on create, different invalidation keys (includes instances).

This may be intentional since these are full editors handling updates + deletion too,
but the UX is inconsistent (quick-add gets undo, editor doesn't).

### 3b. Thought capture uses raw API — LOW

`thoughts.lazy.tsx` creates thoughts with `{ title }` only via raw API call.
Server defaults apply for impact/clarity rather than client defaults (4/"normal").
Probably fine since server likely defaults the same, but fragile.

### 5a. Inline clarity regex in useTriageForm — LOW

`use-triage-form.ts:273` hardcodes `/\?(autopilot|normal|brainstorm)\b/i` rather than
importing an exported constant from task-parser.ts. If clarity values ever change, this
would be missed.

### 5b. Inline duration fallback regex diverges — LOW

`use-triage-form.ts:287` uses a simplified duration pattern that doesn't handle `hrs`/`mins`
variants that the canonical `DURATION_PATTERN` in task-parser.ts supports.

### 6a. Triage conversion omits impact/clarity when unset — MEDIUM

When converting a thought, if the user doesn't explicitly set impact or clarity, the
triage form returns `undefined` for these fields. In `thoughts.lazy.tsx:258-259`:

```typescript
if (data.impact !== undefined) updateData.impact = data.impact;
if (data.clarity) updateData.clarity = data.clarity;
```

This means the update payload **omits** these fields, relying on whatever server default
the thought was created with. Every other create surface explicitly defaults to 4/"normal".

Not currently broken (server likely defaults to 4/"normal"), but fragile.

### 6b. Asymmetric falsy-vs-undefined checks — LOW

In `thoughts.lazy.tsx`, impact uses `!== undefined` check but clarity uses a truthy check.
If clarity were ever `""`, it would be silently dropped. Not a current bug since clarity
values are always non-empty strings, but inconsistent.

## Recommended Priority

1. **Quick win**: Fix 1a — replace inline grouping in `ParentTaskSelect` with `groupParentTasks()`
2. **Quick win**: Fix 5a — export clarity regex constant from task-parser.ts
3. **Consider**: Fix 6a — explicitly default impact=4 / clarity="normal" in triage conversion
4. **Consider**: Fix 6b — normalize the conditional checks in thoughts.lazy.tsx
5. **Later**: Fix 1b — extract shared editor state/save hook for TaskEditor + TaskDetailPanel
6. **Later**: Fix 3a — evaluate whether editor create path should use `useTaskCreate`
