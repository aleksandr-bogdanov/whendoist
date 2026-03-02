import type { QueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import type { InstanceResponse, TaskResponse } from "@/api/model";
import { getListInstancesApiV1InstancesGetQueryKey } from "@/api/queries/instances/instances";
import { dashboardTasksKey } from "@/lib/query-keys";

interface SelectionState {
  selectedIds: Set<string>;
}

interface SelectionActions {
  toggle: (id: string) => void;
  clear: () => void;
  selectAll: (ids: string[]) => void;
}

export const useSelectionStore = create<SelectionState & SelectionActions>()((set, get) => ({
  selectedIds: new Set<string>(),

  toggle: (id) =>
    set((state) => {
      const next = new Set(state.selectedIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { selectedIds: next };
    }),

  clear: () => {
    if (get().selectedIds.size === 0) return;
    set({ selectedIds: new Set() });
  },

  selectAll: (ids) => set({ selectedIds: new Set(ids) }),
}));

/** Stable key for a task in the selection set */
export const taskSelectionId = (id: number) => `task-${id}`;

/** Stable key for a recurring instance in the selection set */
export const instanceSelectionId = (id: number) => `instance-${id}`;

/* ------------------------------------------------------------------ */
/*  resolveSelection — split selected IDs into tasks + instances       */
/* ------------------------------------------------------------------ */

export interface ResolvedSelection {
  tasks: TaskResponse[];
  instances: InstanceResponse[];
}

/**
 * Resolve the current selection set into concrete TaskResponse and
 * InstanceResponse objects by looking them up in the TanStack Query cache.
 */
export function resolveSelection(
  queryClient: QueryClient,
  selectedIds: Set<string>,
): ResolvedSelection {
  if (selectedIds.size === 0) return { tasks: [], instances: [] };

  const tasks: TaskResponse[] = [];
  const instances: InstanceResponse[] = [];

  // Lazily resolve caches only when needed
  let taskCache: TaskResponse[] | undefined;
  let instanceCache: InstanceResponse[] | undefined;

  for (const id of selectedIds) {
    if (id.startsWith("task-")) {
      if (!taskCache) {
        taskCache = queryClient.getQueryData<TaskResponse[]>(dashboardTasksKey()) ?? [];
      }
      const taskId = Number(id.slice(5));
      const task = taskCache.find((t) => t.id === taskId);
      if (task) tasks.push(task);
    } else if (id.startsWith("instance-")) {
      if (!instanceCache) {
        // Instance cache uses the base key (no params) — matches how queries are stored
        const allInstanceQueries = queryClient.getQueriesData<InstanceResponse[]>({
          queryKey: getListInstancesApiV1InstancesGetQueryKey(),
        });
        instanceCache = allInstanceQueries.flatMap(([, data]) => data ?? []);
      }
      const instanceId = Number(id.slice(9));
      const instance = instanceCache.find((i) => i.id === instanceId);
      if (instance) instances.push(instance);
    }
  }

  return { tasks, instances };
}

// Global Escape key listener — clears multi-selection
if (typeof document !== "undefined") {
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && useSelectionStore.getState().selectedIds.size > 0) {
      useSelectionStore.getState().clear();
    }
  });
}
