import type { QueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import type { InstanceResponse, TaskResponse } from "@/api/model";
import { getListInstancesApiV1InstancesGetQueryKey } from "@/api/queries/instances/instances";
import { dashboardTasksKey } from "@/lib/query-keys";

type SelectionView = "calendar" | "tasklist";

interface SelectionState {
  selectedIds: Set<string>;
  lastClickedId: string | null;
  lastClickedView: SelectionView | null;
}

interface SelectionActions {
  toggle: (id: string, view?: SelectionView) => void;
  clear: () => void;
  selectAll: (ids: string[]) => void;
  /** Shift+Click range selection — selects all IDs between lastClickedId and toId in orderedIds */
  selectRange: (toId: string, orderedIds: string[], additive: boolean, view: SelectionView) => void;
}

export const useSelectionStore = create<SelectionState & SelectionActions>()((set, get) => ({
  selectedIds: new Set<string>(),
  lastClickedId: null,
  lastClickedView: null,

  toggle: (id, view) =>
    set((state) => {
      const next = new Set(state.selectedIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return {
        selectedIds: next,
        lastClickedId: id,
        lastClickedView: view ?? state.lastClickedView,
      };
    }),

  clear: () => {
    if (get().selectedIds.size === 0 && get().lastClickedId === null) return;
    set({ selectedIds: new Set(), lastClickedId: null, lastClickedView: null });
  },

  selectAll: (ids) => set({ selectedIds: new Set(ids) }),

  selectRange: (toId, orderedIds, additive, view) => {
    const { lastClickedId, lastClickedView, selectedIds } = get();

    // Cross-view or no anchor — fall back to toggle
    if (!lastClickedId || lastClickedView !== view) {
      const next = new Set(selectedIds);
      if (next.has(toId)) next.delete(toId);
      else next.add(toId);
      return set({ selectedIds: next, lastClickedId: toId, lastClickedView: view });
    }

    const fromIdx = orderedIds.indexOf(lastClickedId);
    const toIdx = orderedIds.indexOf(toId);

    // If either ID not in the ordered list, fall back to toggle
    if (fromIdx === -1 || toIdx === -1) {
      const next = new Set(selectedIds);
      if (next.has(toId)) next.delete(toId);
      else next.add(toId);
      return set({ selectedIds: next, lastClickedId: toId, lastClickedView: view });
    }

    const lo = Math.min(fromIdx, toIdx);
    const hi = Math.max(fromIdx, toIdx);
    const rangeIds = orderedIds.slice(lo, hi + 1);

    const next = additive ? new Set(selectedIds) : new Set<string>();
    for (const id of rangeIds) next.add(id);

    set({ selectedIds: next, lastClickedId: toId, lastClickedView: view });
  },
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
      // Search top-level tasks first
      let task = taskCache.find((t) => t.id === taskId);
      // If not found, search nested subtasks (subtasks are real tasks with parent_id)
      if (!task) {
        for (const parent of taskCache) {
          const subtask = parent.subtasks?.find((st) => st.id === taskId);
          if (subtask) {
            // Coerce SubtaskResponse into TaskResponse with defaults for missing fields
            task = {
              ...subtask,
              domain_id: parent.domain_id,
              parent_id: parent.id,
              is_recurring: false,
              recurrence_rule: null,
              completed_at: subtask.status === "completed" ? new Date().toISOString() : null,
              subtasks: [],
            } as TaskResponse;
            break;
          }
        }
      }
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
// Radix overlays (popovers, dialogs, context menus) use capture-phase Escape
// handlers that call event.preventDefault(). We check defaultPrevented so that
// pressing Escape to close a Radix overlay doesn't also clear the selection.
if (typeof document !== "undefined") {
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (useSelectionStore.getState().selectedIds.size === 0) return;
    // Radix's DismissableLayer fires in capture phase and calls preventDefault()
    if (e.defaultPrevented) return;
    // Safety net: skip if any Radix-managed overlay is still open in the DOM
    if (document.querySelector("[data-radix-popper-content-wrapper], [data-radix-menu-content]"))
      return;
    useSelectionStore.getState().clear();
  });
}
