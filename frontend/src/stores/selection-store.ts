import { create } from "zustand";

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

// Global Escape key listener — clears multi-selection
if (typeof document !== "undefined") {
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && useSelectionStore.getState().selectedIds.size > 0) {
      useSelectionStore.getState().clear();
    }
  });
}
