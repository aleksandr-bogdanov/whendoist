import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { InstanceResponse, TaskResponse } from "@/api/model";
import {
  getListInstancesApiV1InstancesGetQueryKey,
  scheduleInstanceApiV1InstancesInstanceIdSchedulePut,
  skipInstanceApiV1InstancesInstanceIdSkipPost,
  toggleInstanceCompleteApiV1InstancesInstanceIdToggleCompletePost,
  unskipInstanceApiV1InstancesInstanceIdUnskipPost,
} from "@/api/queries/instances/instances";
import {
  deleteTaskApiV1TasksTaskIdDelete,
  restoreTaskApiV1TasksTaskIdRestorePost,
  toggleTaskCompleteApiV1TasksTaskIdToggleCompletePost,
  updateTaskApiV1TasksTaskIdPut,
} from "@/api/queries/tasks/tasks";
import { dashboardTasksKey } from "@/lib/query-keys";

/* ------------------------------------------------------------------ */
/*  executeBatch — optimistic batch mutation with immediate toast       */
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

/**
 * Fire-and-forget batch mutation: applies optimistic update, shows toast
 * with undo immediately, then fires API calls in the background.
 *
 * Previously this was async and awaited all mutations before showing the
 * toast — with many tasks this caused the floating action bar to hang
 * and no feedback to appear.
 */
export function executeBatch({
  queryClient,
  tasks,
  applyOptimistic,
  mutateFn,
  undoFn,
  label,
}: ExecuteBatchOptions): void {
  if (tasks.length === 0) return;

  const cacheKey = dashboardTasksKey();
  const snapshot = queryClient.getQueryData<TaskResponse[]>(cacheKey);

  // 1. Apply optimistic update (instant)
  queryClient.setQueryData<TaskResponse[]>(cacheKey, (old) => (old ? applyOptimistic(old) : old));

  // 2. Show toast with undo immediately
  const noun = tasks.length === 1 ? "task" : "tasks";
  const message = `${label} ${tasks.length} ${noun}`;
  const toastId = `batch-${label.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;

  toast.success(message, {
    id: toastId,
    action: {
      label: "Undo",
      onClick: () => {
        // Restore snapshot optimistically
        if (snapshot) queryClient.setQueryData(cacheKey, snapshot);
        // Fire reverse mutations for all tasks
        Promise.allSettled(tasks.map(undoFn)).then(() => {
          queryClient.invalidateQueries({ queryKey: cacheKey });
        });
      },
    },
  });

  // 3. Fire all mutations in parallel (background)
  Promise.allSettled(tasks.map(mutateFn)).then((results) => {
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = tasks.length - succeeded;

    if (failed === tasks.length) {
      // All failed — rollback + replace toast with error
      if (snapshot) queryClient.setQueryData(cacheKey, snapshot);
      toast.error(`Failed to ${label.toLowerCase()} ${noun}`, { id: toastId });
    } else if (failed > 0) {
      // Partial failure — update toast
      toast.warning(`${label} ${succeeded} of ${tasks.length} ${noun}. ${failed} failed.`, {
        id: toastId,
      });
      queryClient.invalidateQueries({ queryKey: cacheKey });
    } else {
      // All succeeded — reconcile with server
      queryClient.invalidateQueries({ queryKey: cacheKey });
    }
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

  executeBatch({
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

  executeBatch({
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

  executeBatch({
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

/** Batch edit — apply partial field updates to all tasks, single undo toast */
export function batchEdit(
  queryClient: QueryClient,
  tasks: TaskResponse[],
  fields: Partial<Pick<TaskResponse, "impact" | "clarity" | "duration_minutes" | "domain_id">>,
) {
  const taskIds = new Set(tasks.map((t) => t.id));

  executeBatch({
    queryClient,
    tasks,
    applyOptimistic: (cached) => cached.map((t) => (taskIds.has(t.id) ? { ...t, ...fields } : t)),
    mutateFn: (task) => updateTaskApiV1TasksTaskIdPut(task.id, fields),
    undoFn: (task) => {
      // Restore each task's original values for the changed fields
      const restore: Record<string, unknown> = {};
      for (const key of Object.keys(fields)) {
        restore[key] = (task as unknown as Record<string, unknown>)[key];
      }
      return updateTaskApiV1TasksTaskIdPut(task.id, restore);
    },
    label: "Edited",
  });
}

/** Batch reschedule tasks to a new date (times preserved) */
export function batchReschedule(queryClient: QueryClient, tasks: TaskResponse[], date: string) {
  const taskIds = new Set(tasks.map((t) => t.id));

  executeBatch({
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

/* ------------------------------------------------------------------ */
/*  Instance batch operations                                          */
/* ------------------------------------------------------------------ */

/** Invalidate all instance query caches */
function invalidateInstances(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: getListInstancesApiV1InstancesGetQueryKey() });
}

/**
 * Fire-and-forget batch mutation on instances with immediate toast + undo.
 * Instance caches are keyed per date-range so we just invalidate rather
 * than doing fine-grained optimistic updates.
 */
function executeInstanceBatch(
  queryClient: QueryClient,
  instances: InstanceResponse[],
  mutateFn: (instance: InstanceResponse) => Promise<unknown>,
  undoFn: (instance: InstanceResponse) => Promise<unknown>,
  label: string,
): void {
  if (instances.length === 0) return;

  // Show toast with undo immediately
  const noun = instances.length === 1 ? "instance" : "instances";
  const message = `${label} ${instances.length} ${noun}`;
  const toastId = `batch-instance-${label.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;

  toast.success(message, {
    id: toastId,
    action: {
      label: "Undo",
      onClick: () => {
        Promise.allSettled(instances.map(undoFn)).then(() => {
          invalidateInstances(queryClient);
        });
      },
    },
  });

  // Fire mutations in background
  Promise.allSettled(instances.map(mutateFn)).then((results) => {
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = instances.length - succeeded;

    if (failed === instances.length) {
      toast.error(`Failed to ${label.toLowerCase()} ${noun}`, { id: toastId });
    } else if (failed > 0) {
      toast.warning(`${label} ${succeeded} of ${instances.length} ${noun}. ${failed} failed.`, {
        id: toastId,
      });
    }

    invalidateInstances(queryClient);
  });
}

/** Batch toggle complete for instances */
export function batchToggleCompleteInstances(
  queryClient: QueryClient,
  instances: InstanceResponse[],
  completing: boolean,
) {
  executeInstanceBatch(
    queryClient,
    instances,
    (inst) => toggleInstanceCompleteApiV1InstancesInstanceIdToggleCompletePost(inst.id),
    (inst) => toggleInstanceCompleteApiV1InstancesInstanceIdToggleCompletePost(inst.id),
    completing ? "Completed" : "Reopened",
  );
}

/** Batch skip instances */
export function batchSkipInstances(queryClient: QueryClient, instances: InstanceResponse[]) {
  executeInstanceBatch(
    queryClient,
    instances,
    (inst) => skipInstanceApiV1InstancesInstanceIdSkipPost(inst.id),
    (inst) => unskipInstanceApiV1InstancesInstanceIdUnskipPost(inst.id),
    "Skipped",
  );
}

/** Batch unschedule instances (set scheduled_datetime to null) */
export function batchUnscheduleInstances(queryClient: QueryClient, instances: InstanceResponse[]) {
  executeInstanceBatch(
    queryClient,
    instances,
    (inst) =>
      scheduleInstanceApiV1InstancesInstanceIdSchedulePut(inst.id, {
        scheduled_datetime: null,
      }),
    (inst) =>
      scheduleInstanceApiV1InstancesInstanceIdSchedulePut(inst.id, {
        scheduled_datetime: inst.scheduled_datetime,
      }),
    "Unscheduled",
  );
}

/** Batch reschedule instances to a new datetime */
export function batchRescheduleInstances(
  queryClient: QueryClient,
  instances: InstanceResponse[],
  dateStr: string,
) {
  // Instances use scheduled_datetime (ISO datetime), so we append T00:00:00
  const datetime = `${dateStr}T00:00:00`;
  executeInstanceBatch(
    queryClient,
    instances,
    (inst) =>
      scheduleInstanceApiV1InstancesInstanceIdSchedulePut(inst.id, {
        scheduled_datetime: datetime,
      }),
    (inst) =>
      scheduleInstanceApiV1InstancesInstanceIdSchedulePut(inst.id, {
        scheduled_datetime: inst.scheduled_datetime,
      }),
    "Rescheduled",
  );
}
