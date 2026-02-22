---
version:
pr:
created: 2026-02-22
---

# Fix: Add-task not visible + add undo to toast

## Context

When adding a task via the "+Add task" button at the bottom of a domain, the new task sometimes doesn't appear in the list until refresh. This is because the creation uses `invalidateQueries` (full refetch) with no optimistic update — unlike complete/unschedule which update the cache immediately. The refetch race or timing gap causes the "invisible task" bug.

Additionally, the creation toast (`toast.success("Task created")`) lacks an undo action, unlike delete/complete/unschedule which all have undo.

## Changes

### 1. Add optimistic update to inline task creation (`domain-group.tsx:51-72`)

In `handleInlineAdd`, after calling `createTask.mutate()`, optimistically append the new task to the query cache **before** the API responds. Use a temporary negative ID (like `Date.now() * -1`) as placeholder until the refetch replaces it.

```tsx
// Before mutation: build optimistic task
const optimisticTask: AppRoutersTasksTaskResponse = {
  id: -Date.now(), // temp ID, replaced on refetch
  title: newTaskTitle.trim(), // plaintext for display
  description: null,
  domain_id: domain?.id ?? null,
  domain_name: domain?.name ?? null,
  impact: 4,
  clarity: "normal",
  // ... other required fields with defaults
};

// Optimistically add to cache
queryClient.setQueryData<AppRoutersTasksTaskResponse[]>(
  getListTasksApiV1TasksGetQueryKey(),
  (old) => (old ? [...old, optimisticTask] : [optimisticTask]),
);
```

On error, roll back by removing the optimistic entry.

### 2. Add undo action to creation toast (`domain-group.tsx:65`)

The `onSuccess` callback receives the created task response (with real ID). Use it to show a toast with undo that deletes the task:

```tsx
onSuccess: (createdTask) => {
  queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
  toast.success(`Created "${newTaskTitle.trim()}"`, {
    id: `create-${createdTask.id}`,
    action: {
      label: "Undo",
      onClick: () => {
        deleteTask.mutate(
          { taskId: createdTask.id },
          {
            onSuccess: () => queryClient.invalidateQueries({...}),
            onError: () => toast.error("Undo failed"),
          },
        );
      },
    },
    duration: 5000,
  });
}
```

Need to add `useDeleteTaskApiV1TasksTaskIdDelete` import and hook.

### 3. Same changes to Quick Add dialog (`task-quick-add.tsx:61-63`)

Apply the same undo toast pattern. Optimistic update is less critical here since the dialog closes, but adding it for consistency. The undo action is the key fix.

## Files to modify

- `frontend/src/components/task/domain-group.tsx` — optimistic update + undo toast
- `frontend/src/components/task/task-quick-add.tsx` — undo toast

## Verification

1. `cd frontend && npx tsc --noEmit && npx biome check . && npm run build`
2. Manual: Add task via "+Add task" in a domain → task appears instantly, toast shows with "Undo" button
3. Manual: Click "Undo" → task disappears from list
4. Manual: Quick Add dialog → same undo behavior
