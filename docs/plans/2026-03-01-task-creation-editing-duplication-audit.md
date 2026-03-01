---
version:
pr:
created: 2026-03-01
---

# Task Creation & Editing Duplication Audit

> **Scope:** React SPA task creation and editing surfaces — all entry points, shared hooks, and utility modules.
>
> **Prior work:** Two consolidation rounds already extracted `useTaskForm`, `useTriageForm`, `useTaskCreate`, `TaskFieldsBody`, and the smart-input hooks. This audit finds what they missed.

---

## Findings Summary

| # | Severity | Description | Estimated savings |
|---|----------|-------------|-------------------|
| 1 | **HIGH** | TaskEditor re-implements TaskFieldsBody | ~200 lines |
| 2 | **HIGH** | Parent task picker list rendered 4× | ~160 lines (4×40) |
| 3 | **HIGH** | Recurrence fields dropped on triage convert | **Bug** — data loss |
| 4 | **MEDIUM** | ThoughtsPage delete-with-undo duplicates useTaskForm | ~35 lines |
| 5 | LOW | ThoughtsPage.handleSend bypasses useTaskCreate | ~20 lines |
| 6 | LOW | Time regex inline instead of exported constant | 1 line |
| 7 | LOW | ConvertData imported via re-export chain | Import path |

### Checks that passed clean

- **Inconsistent defaults** — all create paths consistently default to `impact: 4` / `clarity: "normal"` (either via `useState` init in `useTaskForm` or via `?? 4` / `?? "normal"` in `useTaskCreate`).
- **`groupParentTasks` usage** — all 4 parent picker variants correctly use it from `task-utils`.
- **Regex/constant duplication** — all token patterns in `use-triage-form` use exports from `task-parser` (except the time regex in Finding 6).
- **Approach A vs B separation** — the two smart-input hooks are architecturally distinct by design and not cross-contaminated.

---

## Finding 1 — HIGH: TaskEditor re-implements all of TaskFieldsBody (~200 lines)

**Files:**

- `frontend/src/components/task/task-editor.tsx:59-61, 64-166, 182-393, 517-534`
- `frontend/src/components/task/task-fields-body.tsx:87-414`

`TaskDetailPanel` correctly delegates to `TaskFieldsBody` (task-detail-panel.tsx:124), but `TaskEditor` renders **every field inline** instead of using `TaskFieldsBody`. The duplication includes:

| Element | TaskEditor lines | TaskFieldsBody lines |
|---------|-----------------|---------------------|
| Local state: `calendarOpen`, `descriptionFocused`, `domainFlash` | 59–61 | 87–90 |
| `smartCallbacks` object (7 fields → markDirty) | 64–96 | 95–124 |
| `useSmartInputConsumer(domains, smartCallbacks)` call | 98–107 | 126–135 |
| Auto-resize title effect | 110–122 | 138–146 |
| `handleTitleChange` / `handleTitleKeyDown` | 149–166 | 148–163 |
| Title textarea + SmartInputAutocomplete | 183–208 | 167–194 |
| Domain row with flash | 212–221 | 197–206 |
| Parent task picker with domain flash | 224–241 | 209–225 |
| Impact button row | 244–252 | 228–236 |
| Clarity chip row | 255–263 | 239–247 |
| Duration picker row | 266–275 | 250–259 |
| Schedule section (Popover + Calendar) | 278–324 | 262–302 |
| Time picker | 327–336 | 305–314 |
| Recurrence toggle + picker | 339–377 | 317–358 |
| Notes textarea | 380–393 | 361–388 |
| `EditorFieldRow` helper | 517–534 | `FieldRow` 397–414 |

The `EditorFieldRow` helper is character-for-character identical to `FieldRow` in TaskFieldsBody:

```tsx
// task-editor.tsx:517-534
function EditorFieldRow({ label, children, flash }: { ... }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      <div className={cn("rounded-lg transition-all duration-300", flash && "bg-primary/20")}>
        {children}
      </div>
    </div>
  );
}

// task-fields-body.tsx:397-414 — identical
function FieldRow({ label, children, flash }: { ... }) { ... }
```

**Fix:** Have `TaskEditor` use `<TaskFieldsBody>` the same way `TaskDetailPanel` does. The Sheet/footer/delete-confirm/complete-toggle chrome stays in `TaskEditor`; the field layout delegates to `TaskFieldsBody`. Eliminates ~200 lines.

---

## Finding 2 — HIGH: Parent task picker list rendered 4 times

**Files:**

1. `frontend/src/components/task/parent-task-picker.tsx:249-357` — inline dropdown (used by TaskFieldsBody/TaskEditor)
2. `frontend/src/components/task/field-pickers.tsx:386-617` — portaled dropdown (`ParentTaskSelect`)
3. `frontend/src/components/task/task-inspector.tsx:293-429` — Popover (`ParentPickerPopover`)
4. `frontend/src/components/task/thought-triage-drawer.tsx:368-492` — nested Drawer (`ParentPickerDrawer`)

All four render the **same logical content**: search input → "None (top-level)" → grouped task list (via `groupParentTasks`) → each task button with domain icon, title, and subtask count badge. The only variation is the container (inline div, portal, Popover, Drawer).

Repeated pattern (~40 lines, appearing 4 times):

```tsx
{taskGroups.map((group, gi) => (
  <div key={group.label}>
    {gi > 0 && <div className="h-px bg-border mx-2 my-1" />}
    {showLabels && (
      <div className="px-3 pt-... text-[10px] font-medium text-muted-foreground uppercase ...">
        {group.label}
      </div>
    )}
    {group.tasks.map((t) => {
      const domain = t.domain_id ? domains.find((d) => d.id === t.domain_id) : null;
      const subtaskCount = t.subtasks?.length ?? 0;
      return (
        <button key={t.id} className={cn("w-full px-3 py-...", selectedId === t.id && "bg-accent font-medium")} onClick={() => onSelect(t.id)}>
          {domain?.icon && <span>{domain.icon}</span>}
          <span className="truncate">{t.title}</span>
          {subtaskCount > 0 && <span>·{subtaskCount}</span>}
        </button>
      );
    })}
  </div>
))}
```

**Fix:** Extract a `<ParentTaskListContent>` component that accepts `{ parentTasks, domains, selectedId, currentDomainId, search, onSearchChange, onSelect }` and renders the search + list. Each container (Popover, Drawer, inline dropdown) wraps it with their own chrome. The `ParentTaskSelect` in `field-pickers.tsx` may be unused after the dedicated drawer was added — verify and remove if dead code.

---

## Finding 3 — HIGH: Recurrence fields silently dropped in thought→task conversion (BUG)

**Files:**

- `frontend/src/routes/_authenticated/thoughts.lazy.tsx:253-264` (handleConvert)
- `frontend/src/hooks/use-triage-form.ts:177-194` (handleSubmit — sends recurrence)

`useTriageForm.handleSubmit` correctly sends `is_recurring`, `recurrence_rule`, and `recurrence_start` in the `ConvertData`:

```ts
// use-triage-form.ts:189-193
is_recurring: isRecurring || undefined,
recurrence_rule: isRecurring ? (recurrence!.rule as Record<string, unknown>) : undefined,
recurrence_start: isRecurring
  ? (parsed.scheduledDate ?? new Date().toISOString().split("T")[0])
  : undefined,
```

But the consumer `handleConvert` in `thoughts.lazy.tsx` never reads them:

```ts
// thoughts.lazy.tsx:253-264 — these fields are assembled into updateData
const updateData: Record<string, unknown> = {
  domain_id: data.domain_id,
  title: encrypted.title ?? data.title,
};
if (data.parent_id != null) updateData.parent_id = data.parent_id;
if (data.impact !== undefined) updateData.impact = data.impact;
if (data.clarity !== undefined) updateData.clarity = data.clarity;
if (data.duration_minutes) updateData.duration_minutes = data.duration_minutes;
if (data.scheduled_date) updateData.scheduled_date = data.scheduled_date;
if (data.scheduled_time) updateData.scheduled_time = data.scheduled_time;
if (encrypted.description) updateData.description = encrypted.description;
// ❌ MISSING: is_recurring, recurrence_rule, recurrence_start
```

**Impact:** When a user sets recurrence (Daily/Weekdays/Weekly/Monthly) during triage in either the mobile drawer or the desktop inspector, the recurrence is silently discarded on conversion. The triage UI has a `RecurrencePresetRow` that lets users set recurrence, but the data never reaches the API.

**Fix:** Add the missing fields:

```ts
if (data.is_recurring) updateData.is_recurring = data.is_recurring;
if (data.recurrence_rule) updateData.recurrence_rule = data.recurrence_rule;
if (data.recurrence_start) updateData.recurrence_start = data.recurrence_start;
```

---

## Finding 4 — MEDIUM: ThoughtsPage.handleDelete duplicates delete-with-undo-toast

**Files:**

- `frontend/src/routes/_authenticated/thoughts.lazy.tsx:201-239` (handleDelete)
- `frontend/src/hooks/use-task-form.ts` (handleDelete)

Both implement the same pattern:

```
deleteMutation.mutate(taskId)
  → onSuccess:
      invalidateQueries()
      toast.success("Deleted ...", {
        action: { label: "Undo", onClick:
          restoreMutation.mutate(taskId)
            → onSuccess: invalidateQueries()
        }
      })
```

The ThoughtsPage version additionally advances selection and closes the drawer; `useTaskForm` calls `onDone()` and closes the delete confirm dialog. But the mutation mechanics (delete → restore-on-undo → invalidate) are duplicated.

**Fix:** Extract a `useTaskDelete({ onSuccess })` hook that encapsulates the delete + undo-restore + invalidate pattern, and call it from both `useTaskForm` and ThoughtsPage. Each caller supplies the `onSuccess` callback for their selection/navigation logic.

---

## Finding 5 — LOW: ThoughtsPage.handleSend bypasses useTaskCreate

**File:** `frontend/src/routes/_authenticated/thoughts.lazy.tsx:178-199`

`handleSend` does its own `encryptTaskFields → createTask.mutate → invalidate` instead of using `useTaskCreate`. The differences (no undo toast, different invalidation key `getListTasksApiV1TasksGetQueryKey()` vs `dashboardTasksKey()`, restore input on error) are arguably intentional, but the encrypt → mutate → invalidate skeleton is shared.

**Fix (optional):** Could use `useTaskCreate` with `toastMessage: undefined` (suppress toast), but the different invalidation key and error recovery make this a borderline case. Low priority.

---

## Finding 6 — LOW: Inline time regex not exported from task-parser

**File:** `frontend/src/hooks/use-triage-form.ts:303`

```ts
tapToken("", time, /(?<![a-zA-Z\d])\d{1,2}:\d{2}(?:[ap]m)?(?![a-zA-Z])/i);
```

Every other token pattern is exported from `task-parser.ts` (`IMPACT_TOKEN_PATTERN`, `CLARITY_TOKEN_PATTERN`, `DURATION_TOKEN_PATTERN`, `SCHEDULE_DATE_PATTERN`), but the time pattern uses an inline regex.

**Fix:** Export `TIME_TOKEN_PATTERN` from `task-parser.ts` alongside the others.

---

## Finding 7 — LOW: ConvertData imported via re-export chain

**Files:**

- `frontend/src/components/task/thought-triage-drawer.tsx:29` — `export type { ConvertData }`
- `frontend/src/routes/_authenticated/thoughts.lazy.tsx:18` — imports from thought-triage-drawer

`thoughts.lazy.tsx` imports `ConvertData` from `thought-triage-drawer`, which re-exports it from `use-triage-form`. The canonical source is `use-triage-form.ts`.

**Fix:** Import directly: `import type { ConvertData } from "@/hooks/use-triage-form"`. Keep the re-export in thought-triage-drawer temporarily if other consumers depend on it.
