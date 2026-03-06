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
import i18n from "@/lib/i18n";
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
  const noun = tasks.length === 1 ? i18n.t("common.task") : i18n.t("common.tasks");
  const message = `${label} ${tasks.length} ${noun}`;
  const toastId = `batch-${label.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;

  const undoAction = {
    label: i18n.t("toast.undo"),
    onClick: () => {
      // Fire per-task reverse mutations (don't restore full snapshot —
      // the cache may have been invalidated/refetched since the operation)
      Promise.allSettled(tasks.map(undoFn)).then(() => {
        queryClient.invalidateQueries({ queryKey: cacheKey });
      });
    },
  };

  toast.success(message, { id: toastId, action: undoAction });

  // 3. Fire all mutations in parallel (background)
  Promise.allSettled(tasks.map(mutateFn)).then((results) => {
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = tasks.length - succeeded;

    if (failed === tasks.length) {
      // All failed — rollback + replace toast with error
      if (snapshot) queryClient.setQueryData(cacheKey, snapshot);
      toast.error(i18n.t("batch.failedToAction", { action: label.toLowerCase(), noun }), {
        id: toastId,
      });
    } else if (failed > 0) {
      // Partial failure — update toast but preserve undo action
      toast.warning(
        i18n.t("batch.partialFailure", {
          label,
          count: succeeded,
          total: tasks.length,
          noun,
          failed,
        }),
        {
          id: toastId,
          action: undoAction,
        },
      );
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
      cached.map((t) => {
        if (taskIds.has(t.id)) {
          return {
            ...t,
            status: completing ? ("completed" as const) : ("pending" as const),
            completed_at: completing ? new Date().toISOString() : null,
          };
        }
        // Also update nested subtasks
        if (t.subtasks?.some((st) => taskIds.has(st.id))) {
          return {
            ...t,
            subtasks: t.subtasks.map((st) =>
              taskIds.has(st.id)
                ? { ...st, status: completing ? ("completed" as const) : ("pending" as const) }
                : st,
            ),
          };
        }
        return t;
      }),
    mutateFn: (task) => toggleTaskCompleteApiV1TasksTaskIdToggleCompletePost(task.id, null),
    undoFn: (task) => toggleTaskCompleteApiV1TasksTaskIdToggleCompletePost(task.id, null),
    label: completing ? i18n.t("batch.completed") : i18n.t("batch.reopened"),
  });
}

/** Batch delete tasks */
export function batchDelete(queryClient: QueryClient, tasks: TaskResponse[]) {
  const taskIds = new Set(tasks.map((t) => t.id));

  executeBatch({
    queryClient,
    tasks,
    applyOptimistic: (cached) =>
      cached
        .filter((t) => !taskIds.has(t.id))
        .map((t) =>
          t.subtasks?.some((st) => taskIds.has(st.id))
            ? { ...t, subtasks: t.subtasks.filter((st) => !taskIds.has(st.id)) }
            : t,
        ),
    mutateFn: (task) => deleteTaskApiV1TasksTaskIdDelete(task.id),
    undoFn: (task) => restoreTaskApiV1TasksTaskIdRestorePost(task.id),
    label: i18n.t("batch.deleted"),
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
    label: i18n.t("batch.unscheduled"),
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
    applyOptimistic: (cached) =>
      cached.map((t) => {
        if (taskIds.has(t.id)) return { ...t, ...fields };
        if (t.subtasks?.some((st) => taskIds.has(st.id))) {
          return {
            ...t,
            subtasks: t.subtasks.map((st) => (taskIds.has(st.id) ? { ...st, ...fields } : st)),
          };
        }
        return t;
      }),
    mutateFn: (task) => updateTaskApiV1TasksTaskIdPut(task.id, fields),
    undoFn: (task) => {
      // Restore each task's original values for the changed fields
      const restore: Record<string, unknown> = {};
      for (const key of Object.keys(fields)) {
        restore[key] = (task as unknown as Record<string, unknown>)[key];
      }
      return updateTaskApiV1TasksTaskIdPut(task.id, restore);
    },
    label: i18n.t("batch.edited"),
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
    label: i18n.t("batch.rescheduled"),
  });
}

/* ------------------------------------------------------------------ */
/*  Instance batch operations                                          */
/* ------------------------------------------------------------------ */

/** Invalidate all instance query caches */
function invalidateInstances(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: getListInstancesApiV1InstancesGetQueryKey() });
}

/** Save snapshots of all instance query caches for undo */
function snapshotInstanceCaches(queryClient: QueryClient) {
  return queryClient.getQueriesData<InstanceResponse[]>({
    queryKey: getListInstancesApiV1InstancesGetQueryKey(),
  });
}

/** Restore all instance query caches from snapshot */
function restoreInstanceCaches(
  queryClient: QueryClient,
  snapshots: [readonly unknown[], InstanceResponse[] | undefined][],
) {
  for (const [key, data] of snapshots) {
    queryClient.setQueryData(key, data);
  }
}

/**
 * Apply an optimistic update to ALL instance query caches.
 * Instance caches are keyed per date-range, so we update all matching queries.
 */
function applyOptimisticToInstances(
  queryClient: QueryClient,
  instanceIds: Set<number>,
  updater: (instance: InstanceResponse) => InstanceResponse,
) {
  const baseKey = getListInstancesApiV1InstancesGetQueryKey();
  queryClient.setQueriesData<InstanceResponse[]>({ queryKey: baseKey }, (old) =>
    old?.map((i) => (instanceIds.has(i.id) ? updater(i) : i)),
  );
}

/**
 * Fire-and-forget batch mutation on instances with immediate toast + undo.
 * Applies optimistic updates across all instance query caches for instant feedback.
 */
function executeInstanceBatch(
  queryClient: QueryClient,
  instances: InstanceResponse[],
  mutateFn: (instance: InstanceResponse) => Promise<unknown>,
  undoFn: (instance: InstanceResponse) => Promise<unknown>,
  label: string,
  optimisticUpdater?: (instance: InstanceResponse) => InstanceResponse,
): void {
  if (instances.length === 0) return;

  const instanceIds = new Set(instances.map((i) => i.id));

  // 1. Apply optimistic update (instant)
  const snapshots = optimisticUpdater ? snapshotInstanceCaches(queryClient) : undefined;
  if (optimisticUpdater) {
    applyOptimisticToInstances(queryClient, instanceIds, optimisticUpdater);
  }

  // 2. Show toast with undo immediately
  const noun = instances.length === 1 ? i18n.t("common.instance") : i18n.t("common.instances");
  const message = `${label} ${instances.length} ${noun}`;
  const toastId = `batch-instance-${label.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;

  const undoAction = {
    label: i18n.t("toast.undo"),
    onClick: () => {
      // Fire per-instance reverse mutations (don't restore full snapshot —
      // the cache may have been invalidated/refetched since the operation)
      Promise.allSettled(instances.map(undoFn)).then(() => {
        invalidateInstances(queryClient);
      });
    },
  };

  toast.success(message, { id: toastId, action: undoAction });

  // 3. Fire mutations in background
  Promise.allSettled(instances.map(mutateFn)).then((results) => {
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = instances.length - succeeded;

    if (failed === instances.length) {
      // All failed — rollback
      if (snapshots) restoreInstanceCaches(queryClient, snapshots);
      toast.error(i18n.t("batch.failedToAction", { action: label.toLowerCase(), noun }), {
        id: toastId,
      });
    } else if (failed > 0) {
      // Partial failure — preserve undo action
      toast.warning(
        i18n.t("batch.partialFailure", {
          label,
          count: succeeded,
          total: instances.length,
          noun,
          failed,
        }),
        {
          id: toastId,
          action: undoAction,
        },
      );
      invalidateInstances(queryClient);
    } else {
      invalidateInstances(queryClient);
    }
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
    completing ? i18n.t("batch.completed") : i18n.t("batch.reopened"),
    (inst) => ({ ...inst, status: completing ? ("completed" as const) : ("pending" as const) }),
  );
}

/** Batch skip instances */
export function batchSkipInstances(queryClient: QueryClient, instances: InstanceResponse[]) {
  executeInstanceBatch(
    queryClient,
    instances,
    (inst) => skipInstanceApiV1InstancesInstanceIdSkipPost(inst.id),
    (inst) => unskipInstanceApiV1InstancesInstanceIdUnskipPost(inst.id),
    i18n.t("batch.skipped"),
    (inst) => ({ ...inst, status: "skipped" as const }),
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
    i18n.t("batch.unscheduled"),
    (inst) => ({ ...inst, scheduled_datetime: null }),
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
    i18n.t("batch.rescheduled"),
    (inst) => ({ ...inst, scheduled_datetime: datetime }),
  );
}

/* ------------------------------------------------------------------ */
/*  Instance deduplication helper                                       */
/* ------------------------------------------------------------------ */

/**
 * Deduplicate an array of instances by ID.
 * Needed when merging user-selected instances with auto-resolved pending
 * instances for recurring tasks — the same instance can appear in both.
 * Without dedup, toggle-based mutations fire twice and cancel out.
 */
export function deduplicateInstances(instances: InstanceResponse[]): InstanceResponse[] {
  const seen = new Set<number>();
  return instances.filter((i) => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });
}

/* ------------------------------------------------------------------ */
/*  Helpers for recurring task handling in batch operations             */
/* ------------------------------------------------------------------ */

/**
 * Find the earliest pending instance for each recurring task.
 * Mirrors the logic in scheduled-section.tsx's pendingInstanceMap.
 */
export function findPendingInstancesForTasks(
  queryClient: QueryClient,
  recurringTasks: TaskResponse[],
): InstanceResponse[] {
  if (recurringTasks.length === 0) return [];

  const taskIds = new Set(recurringTasks.map((t) => t.id));
  const allInstanceQueries = queryClient.getQueriesData<InstanceResponse[]>({
    queryKey: getListInstancesApiV1InstancesGetQueryKey(),
  });
  const allInstances = allInstanceQueries.flatMap(([, data]) => data ?? []);

  // Map task_id → earliest pending instance
  const map = new Map<number, InstanceResponse>();
  for (const inst of allInstances) {
    if (inst.status === "pending" && taskIds.has(inst.task_id)) {
      const existing = map.get(inst.task_id);
      if (!existing || inst.instance_date < existing.instance_date) {
        map.set(inst.task_id, inst);
      }
    }
  }

  return Array.from(map.values());
}

/* ------------------------------------------------------------------ */
/*  Composite batch operations (tasks + instances → single toast)      */
/* ------------------------------------------------------------------ */

/**
 * Batch toggle complete for a mixed selection of tasks and instances.
 * Produces a single toast with a single Undo that reverses everything.
 */
export function batchToggleCompleteAll(
  queryClient: QueryClient,
  tasks: TaskResponse[],
  instances: InstanceResponse[],
  completing: boolean,
) {
  if (tasks.length === 0 && instances.length === 0) return;

  const taskIds = new Set(tasks.map((t) => t.id));
  const instanceIds = new Set(instances.map((i) => i.id));
  const totalCount = tasks.length + instances.length;

  // 1. Take snapshots for error rollback
  const taskCacheKey = dashboardTasksKey();
  const taskSnapshot = queryClient.getQueryData<TaskResponse[]>(taskCacheKey);
  const instanceSnapshots = instances.length > 0 ? snapshotInstanceCaches(queryClient) : undefined;

  // 2. Apply optimistic updates
  if (tasks.length > 0) {
    queryClient.setQueryData<TaskResponse[]>(taskCacheKey, (old) =>
      old?.map((t) => {
        if (taskIds.has(t.id)) {
          return {
            ...t,
            status: completing ? ("completed" as const) : ("pending" as const),
            completed_at: completing ? new Date().toISOString() : null,
          };
        }
        if (t.subtasks?.some((st) => taskIds.has(st.id))) {
          return {
            ...t,
            subtasks: t.subtasks.map((st) =>
              taskIds.has(st.id)
                ? { ...st, status: completing ? ("completed" as const) : ("pending" as const) }
                : st,
            ),
          };
        }
        return t;
      }),
    );
  }
  if (instances.length > 0) {
    applyOptimisticToInstances(queryClient, instanceIds, (inst) => ({
      ...inst,
      status: completing ? ("completed" as const) : ("pending" as const),
    }));
  }

  // 3. Single toast with single undo
  const label = completing ? i18n.t("batch.completed") : i18n.t("batch.reopened");
  const noun = totalCount === 1 ? i18n.t("common.item") : i18n.t("common.items");
  const message = `${label} ${totalCount} ${noun}`;
  const toastId = `batch-${label.toLowerCase()}-all-${Date.now()}`;

  const taskMutateFn = (task: TaskResponse) =>
    toggleTaskCompleteApiV1TasksTaskIdToggleCompletePost(task.id, null);
  const instanceMutateFn = (inst: InstanceResponse) =>
    toggleInstanceCompleteApiV1InstancesInstanceIdToggleCompletePost(inst.id);

  const undoAction = {
    label: i18n.t("toast.undo"),
    onClick: () => {
      // Fire per-item reverse mutations
      const undos = [...tasks.map(taskMutateFn), ...instances.map(instanceMutateFn)];
      Promise.allSettled(undos).then(() => {
        queryClient.invalidateQueries({ queryKey: taskCacheKey });
        invalidateInstances(queryClient);
      });
    },
  };

  toast.success(message, { id: toastId, action: undoAction });

  // 4. Fire all mutations in parallel
  const allMutations = [...tasks.map(taskMutateFn), ...instances.map(instanceMutateFn)];
  Promise.allSettled(allMutations).then((results) => {
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === totalCount) {
      if (taskSnapshot) queryClient.setQueryData(taskCacheKey, taskSnapshot);
      if (instanceSnapshots) restoreInstanceCaches(queryClient, instanceSnapshots);
      toast.error(i18n.t("batch.failedToAction", { action: label.toLowerCase(), noun }), {
        id: toastId,
      });
    } else if (failed > 0) {
      const succeeded = totalCount - failed;
      toast.warning(
        i18n.t("batch.partialFailure", {
          label,
          count: succeeded,
          total: totalCount,
          noun,
          failed,
        }),
        {
          id: toastId,
          action: undoAction,
        },
      );
      queryClient.invalidateQueries({ queryKey: taskCacheKey });
      invalidateInstances(queryClient);
    } else {
      queryClient.invalidateQueries({ queryKey: taskCacheKey });
      invalidateInstances(queryClient);
    }
  });
}

/**
 * Batch unschedule for a mixed selection of tasks and instances.
 * Produces a single toast with a single Undo that reverses everything.
 */
export function batchUnscheduleAll(
  queryClient: QueryClient,
  tasks: TaskResponse[],
  instances: InstanceResponse[],
) {
  if (tasks.length === 0 && instances.length === 0) return;

  const taskIds = new Set(tasks.map((t) => t.id));
  const instanceIds = new Set(instances.map((i) => i.id));
  const totalCount = tasks.length + instances.length;

  // 1. Take snapshots for error rollback
  const taskCacheKey = dashboardTasksKey();
  const taskSnapshot = queryClient.getQueryData<TaskResponse[]>(taskCacheKey);
  const instanceSnapshots = instances.length > 0 ? snapshotInstanceCaches(queryClient) : undefined;

  // 2. Apply optimistic updates
  if (tasks.length > 0) {
    queryClient.setQueryData<TaskResponse[]>(taskCacheKey, (old) =>
      old?.map((t) =>
        taskIds.has(t.id) ? { ...t, scheduled_date: null, scheduled_time: null } : t,
      ),
    );
  }
  if (instances.length > 0) {
    applyOptimisticToInstances(queryClient, instanceIds, (inst) => ({
      ...inst,
      scheduled_datetime: null,
    }));
  }

  // 3. Single toast with single undo
  const noun = totalCount === 1 ? i18n.t("common.item") : i18n.t("common.items");
  const label = i18n.t("batch.unscheduled");
  const message = `${label} ${totalCount} ${noun}`;
  const toastId = `batch-unschedule-all-${Date.now()}`;

  const undoAction = {
    label: i18n.t("toast.undo"),
    onClick: () => {
      const undos = [
        ...tasks.map((task) =>
          updateTaskApiV1TasksTaskIdPut(task.id, {
            scheduled_date: task.scheduled_date,
            scheduled_time: task.scheduled_time,
          }),
        ),
        ...instances.map((inst) =>
          scheduleInstanceApiV1InstancesInstanceIdSchedulePut(inst.id, {
            scheduled_datetime: inst.scheduled_datetime,
          }),
        ),
      ];
      Promise.allSettled(undos).then(() => {
        queryClient.invalidateQueries({ queryKey: taskCacheKey });
        invalidateInstances(queryClient);
      });
    },
  };

  toast.success(message, { id: toastId, action: undoAction });

  // 4. Fire all mutations in parallel
  const allMutations = [
    ...tasks.map((task) =>
      updateTaskApiV1TasksTaskIdPut(task.id, {
        scheduled_date: null,
        scheduled_time: null,
      }),
    ),
    ...instances.map((inst) =>
      scheduleInstanceApiV1InstancesInstanceIdSchedulePut(inst.id, {
        scheduled_datetime: null,
      }),
    ),
  ];
  Promise.allSettled(allMutations).then((results) => {
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === totalCount) {
      if (taskSnapshot) queryClient.setQueryData(taskCacheKey, taskSnapshot);
      if (instanceSnapshots) restoreInstanceCaches(queryClient, instanceSnapshots);
      toast.error(i18n.t("batch.failedToUnschedule"), { id: toastId });
    } else if (failed > 0) {
      const succeeded = totalCount - failed;
      toast.warning(
        i18n.t("batch.partialFailure", {
          label,
          count: succeeded,
          total: totalCount,
          noun,
          failed,
        }),
        {
          id: toastId,
          action: undoAction,
        },
      );
      queryClient.invalidateQueries({ queryKey: taskCacheKey });
      invalidateInstances(queryClient);
    } else {
      queryClient.invalidateQueries({ queryKey: taskCacheKey });
      invalidateInstances(queryClient);
    }
  });
}

/**
 * Batch reschedule for a mixed selection of tasks and instances.
 * Produces a single toast with a single Undo that reverses everything.
 */
export function batchRescheduleAll(
  queryClient: QueryClient,
  tasks: TaskResponse[],
  instances: InstanceResponse[],
  date: string,
) {
  if (tasks.length === 0 && instances.length === 0) return;

  const taskIds = new Set(tasks.map((t) => t.id));
  const instanceIds = new Set(instances.map((i) => i.id));
  const totalCount = tasks.length + instances.length;

  // Instances use scheduled_datetime (ISO datetime), so we append T00:00:00
  const datetime = `${date}T00:00:00`;

  // 1. Take snapshots for error rollback
  const taskCacheKey = dashboardTasksKey();
  const taskSnapshot = queryClient.getQueryData<TaskResponse[]>(taskCacheKey);
  const instanceSnapshots = instances.length > 0 ? snapshotInstanceCaches(queryClient) : undefined;

  // 2. Apply optimistic updates
  if (tasks.length > 0) {
    queryClient.setQueryData<TaskResponse[]>(taskCacheKey, (old) =>
      old?.map((t) => (taskIds.has(t.id) ? { ...t, scheduled_date: date } : t)),
    );
  }
  if (instances.length > 0) {
    applyOptimisticToInstances(queryClient, instanceIds, (inst) => ({
      ...inst,
      scheduled_datetime: datetime,
    }));
  }

  // 3. Single toast with single undo
  const noun = totalCount === 1 ? i18n.t("common.item") : i18n.t("common.items");
  const label = i18n.t("batch.rescheduled");
  const message = `${label} ${totalCount} ${noun}`;
  const toastId = `batch-reschedule-all-${Date.now()}`;

  const undoAction = {
    label: i18n.t("toast.undo"),
    onClick: () => {
      const undos = [
        ...tasks.map((task) =>
          updateTaskApiV1TasksTaskIdPut(task.id, {
            scheduled_date: task.scheduled_date,
            scheduled_time: task.scheduled_time,
          }),
        ),
        ...instances.map((inst) =>
          scheduleInstanceApiV1InstancesInstanceIdSchedulePut(inst.id, {
            scheduled_datetime: inst.scheduled_datetime,
          }),
        ),
      ];
      Promise.allSettled(undos).then(() => {
        queryClient.invalidateQueries({ queryKey: taskCacheKey });
        invalidateInstances(queryClient);
      });
    },
  };

  toast.success(message, { id: toastId, action: undoAction });

  // 4. Fire all mutations in parallel
  const allMutations = [
    ...tasks.map((task) => updateTaskApiV1TasksTaskIdPut(task.id, { scheduled_date: date })),
    ...instances.map((inst) =>
      scheduleInstanceApiV1InstancesInstanceIdSchedulePut(inst.id, {
        scheduled_datetime: datetime,
      }),
    ),
  ];
  Promise.allSettled(allMutations).then((results) => {
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === totalCount) {
      if (taskSnapshot) queryClient.setQueryData(taskCacheKey, taskSnapshot);
      if (instanceSnapshots) restoreInstanceCaches(queryClient, instanceSnapshots);
      toast.error(i18n.t("batch.failedToReschedule"), { id: toastId });
    } else if (failed > 0) {
      const succeeded = totalCount - failed;
      toast.warning(
        i18n.t("batch.partialFailure", {
          label,
          count: succeeded,
          total: totalCount,
          noun,
          failed,
        }),
        {
          id: toastId,
          action: undoAction,
        },
      );
      queryClient.invalidateQueries({ queryKey: taskCacheKey });
      invalidateInstances(queryClient);
    } else {
      queryClient.invalidateQueries({ queryKey: taskCacheKey });
      invalidateInstances(queryClient);
    }
  });
}
