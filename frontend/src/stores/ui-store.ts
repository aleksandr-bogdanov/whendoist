import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "light" | "dark" | "system";
type EnergyLevel = 1 | 2 | 3;
type SortField = "impact" | "duration" | "clarity";
type SortDirection = "asc" | "desc";
type MobileTab = "tasks" | "calendar";

interface UIState {
  theme: Theme;
  energyLevel: EnergyLevel;
  sortField: SortField;
  sortDirection: SortDirection;
  showScheduled: boolean;
  showCompleted: boolean;
  expandedDomains: Set<number>;
  expandedSubtasks: Set<number>;
  selectedTaskId: number | null;
  selectedDomainId: number | null;
  mobileTab: MobileTab;
  quickAddOpen: boolean;
  calendarHourHeight: number;
  calendarCenterDate: string;
}

interface UIActions {
  setTheme: (theme: Theme) => void;
  setEnergyLevel: (level: EnergyLevel) => void;
  toggleSort: (field: SortField) => void;
  toggleShowScheduled: () => void;
  toggleShowCompleted: () => void;
  toggleExpandedDomain: (domainId: number) => void;
  toggleExpandedSubtask: (taskId: number) => void;
  selectTask: (taskId: number | null) => void;
  selectDomain: (domainId: number | null) => void;
  setMobileTab: (tab: MobileTab) => void;
  setQuickAddOpen: (open: boolean) => void;
  setCalendarHourHeight: (height: number) => void;
  setCalendarCenterDate: (date: string) => void;
}

export const useUIStore = create<UIState & UIActions>()(
  persist(
    (set, get) => ({
      theme: "system",
      energyLevel: 3,
      sortField: "clarity",
      sortDirection: "asc",
      showScheduled: true,
      showCompleted: true,
      expandedDomains: new Set<number>(),
      expandedSubtasks: new Set<number>(),
      selectedTaskId: null,
      selectedDomainId: null,
      mobileTab: "tasks",
      quickAddOpen: false,
      calendarHourHeight: 60,
      calendarCenterDate: new Date().toISOString().split("T")[0],

      setTheme: (theme) => set({ theme }),
      setEnergyLevel: (level) => set({ energyLevel: level }),

      toggleSort: (field) => {
        const state = get();
        if (state.sortField === field) {
          set({ sortDirection: state.sortDirection === "asc" ? "desc" : "asc" });
        } else {
          set({ sortField: field, sortDirection: "asc" });
        }
      },

      toggleShowScheduled: () => set((s) => ({ showScheduled: !s.showScheduled })),
      toggleShowCompleted: () => set((s) => ({ showCompleted: !s.showCompleted })),

      toggleExpandedDomain: (domainId) =>
        set((state) => {
          const next = new Set(state.expandedDomains);
          if (next.has(domainId)) {
            next.delete(domainId);
          } else {
            next.add(domainId);
          }
          return { expandedDomains: next };
        }),

      toggleExpandedSubtask: (taskId) =>
        set((state) => {
          const next = new Set(state.expandedSubtasks);
          if (next.has(taskId)) {
            next.delete(taskId);
          } else {
            next.add(taskId);
          }
          return { expandedSubtasks: next };
        }),

      selectTask: (taskId) => set({ selectedTaskId: taskId }),
      selectDomain: (domainId) =>
        set((state) => ({
          selectedDomainId: state.selectedDomainId === domainId ? null : domainId,
        })),
      setMobileTab: (tab) => set({ mobileTab: tab }),
      setQuickAddOpen: (open) => set({ quickAddOpen: open }),
      setCalendarHourHeight: (height) =>
        set({ calendarHourHeight: Math.max(30, Math.min(100, height)) }),
      setCalendarCenterDate: (date) => set({ calendarCenterDate: date }),
    }),
    {
      name: "whendoist-ui",
      partialize: (state) => ({
        theme: state.theme,
        energyLevel: state.energyLevel,
        calendarHourHeight: state.calendarHourHeight,
        sortField: state.sortField,
        sortDirection: state.sortDirection,
        showScheduled: state.showScheduled,
        showCompleted: state.showCompleted,
        expandedDomains: [...state.expandedDomains],
        expandedSubtasks: [...state.expandedSubtasks],
      }),
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const parsed = JSON.parse(str);
          // Rehydrate arrays back to Sets
          if (parsed?.state?.expandedDomains) {
            parsed.state.expandedDomains = new Set(parsed.state.expandedDomains);
          }
          if (parsed?.state?.expandedSubtasks) {
            parsed.state.expandedSubtasks = new Set(parsed.state.expandedSubtasks);
          }
          return parsed;
        },
        setItem: (name, value) => localStorage.setItem(name, JSON.stringify(value)),
        removeItem: (name) => localStorage.removeItem(name),
      },
    },
  ),
);
