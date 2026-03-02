import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { TaskResponse } from "@/api/model";
import {
  deleteTaskApiV1TasksTaskIdDelete,
  restoreTaskApiV1TasksTaskIdRestorePost,
  toggleTaskCompleteApiV1TasksTaskIdToggleCompletePost,
  updateTaskApiV1TasksTaskIdPut,
} from "@/api/queries/tasks/tasks";
import { dashboardTasksKey } from "@/lib/query-keys";

/* ------------------------------------------------------------------ */
/*  executeBatch — generic batch mutation with snapshot + undo          */
/* ------------------------------------------------------------------ */

interface ExecuteBatchOptions {
  queryClient: QueryClient;
  /** The tasks to operate on (already filtered to targets) */
  tasks: TaskResponse[];
  /** Return a new cache array with optimistic changes applied */
  applyOptimistic: (cached: TaskResponse[]) => TaskResponse[];
  /** Execute the mutation for one task */
  mutateFn: (task: TaskResponse) => Promise<unknown>;
  /** Execute the undo mutation for one task */
  undoFn: (task: TaskResponse) => Promise<unknown>;
  /** Past-tense label for the toast (e.g. "Completed", "Deleted") */
  label: string;
}

export async function executeBatch({
  queryClient,
  tasks,
  applyOptimistic,
  mutateFn,
  undoFn,
  label,
}: ExecuteBatchOptions): Promise<void> {
  if (tasks.length === 0) return;

  const cacheKey = dashboardTasksKey();
  const snapshot = queryClient.getQueryData<TaskResponse[]>(cacheKey);

  // 1. Apply optimistic update
  queryClient.setQueryData<TaskResponse[]>(cacheKey, (old) => (old ? applyOptimistic(old) : old));

  // 2. Fire all mutations in parallel
  const results = await Promise.allSettled(tasks.map(mutateFn));

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  // 3. All failed → full rollback
  if (failed === tasks.length) {
    queryClient.setQueryData(cacheKey, snapshot);
    toast.error(`Failed to ${label.toLowerCase()} tasks`);
    return;
  }

  // 4. Invalidate to reconcile with server
  queryClient.invalidateQueries({ queryKey: cacheKey });

  // 5. Build toast
  const noun = tasks.length === 1 ? "task" : "tasks";
  const message =
    failed > 0
      ? `${label} ${succeeded} of ${tasks.length} ${noun}. ${failed} failed.`
      : `${label} ${succeeded} ${noun}`;

  const toastId = `batch-${label.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
  const succeededTasks = tasks.filter((_, i) => results[i].status === "fulfilled");

  toast.success(message, {
    id: toastId,
    action: {
      label: "Undo",
      onClick: () => {
        // Restore snapshot optimistically
        if (snapshot) queryClient.setQueryData(cacheKey, snapshot);
        // Fire reverse mutations for succeeded items
        Promise.allSettled(succeededTasks.map(undoFn)).then(() => {
          queryClient.invalidateQueries({ queryKey: cacheKey });
        });
      },
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Pre-built batch operations                                         */
/* ------------------------------------------------------------------ */

/** Batch complete (or reopen) tasks */
export function batchToggleComplete(
  queryClient: QueryClient,
  tasks: TaskResponse[],
  completing: boolean,
) {
  const taskIds = new Set(tasks.map((t) => t.id));

  return executeBatch({
    queryClient,
    tasks,
    applyOptimistic: (cached) =>
      cached.map((t) =>
        taskIds.has(t.id)
          ? {
              ...t,
              status: completing ? ("completed" as const) : ("pending" as const),
              completed_at: completing ? new Date().toISOString() : null,
            }
          : t,
      ),
    mutateFn: (task) => toggleTaskCompleteApiV1TasksTaskIdToggleCompletePost(task.id, null),
    undoFn: (task) => toggleTaskCompleteApiV1TasksTaskIdToggleCompletePost(task.id, null),
    label: completing ? "Completed" : "Reopened",
  });
}

/** Batch delete tasks */
export function batchDelete(queryClient: QueryClient, tasks: TaskResponse[]) {
  const taskIds = new Set(tasks.map((t) => t.id));

  return executeBatch({
    queryClient,
    tasks,
    applyOptimistic: (cached) => cached.filter((t) => !taskIds.has(t.id)),
    mutateFn: (task) => deleteTaskApiV1TasksTaskIdDelete(task.id),
    undoFn: (task) => restoreTaskApiV1TasksTaskIdRestorePost(task.id),
    label: "Deleted",
  });
}

/** Batch unschedule tasks (remove scheduled_date + scheduled_time) */
export function batchUnschedule(queryClient: QueryClient, tasks: TaskResponse[]) {
  const taskIds = new Set(tasks.map((t) => t.id));

  return executeBatch({
    queryClient,
    tasks,
    applyOptimistic: (cached) =>
      cached.map((t) =>
        taskIds.has(t.id) ? { ...t, scheduled_date: null, scheduled_time: null } : t,
      ),
    mutateFn: (task) =>
      updateTaskApiV1TasksTaskIdPut(task.id, { scheduled_date: null, scheduled_time: null }),
    undoFn: (task) =>
      updateTaskApiV1TasksTaskIdPut(task.id, {
        scheduled_date: task.scheduled_date,
        scheduled_time: task.scheduled_time,
      }),
    label: "Unscheduled",
  });
}

/** Batch reschedule tasks to a new date (times preserved) */
export function batchReschedule(queryClient: QueryClient, tasks: TaskResponse[], date: string) {
  const taskIds = new Set(tasks.map((t) => t.id));

  return executeBatch({
    queryClient,
    tasks,
    applyOptimistic: (cached) =>
      cached.map((t) => (taskIds.has(t.id) ? { ...t, scheduled_date: date } : t)),
    mutateFn: (task) => updateTaskApiV1TasksTaskIdPut(task.id, { scheduled_date: date }),
    undoFn: (task) =>
      updateTaskApiV1TasksTaskIdPut(task.id, {
        scheduled_date: task.scheduled_date,
        scheduled_time: task.scheduled_time,
      }),
    label: "Rescheduled",
  });
}
