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
  collapsedDomains: Set<number>;
  expandedSubtasks: Set<number>;
  selectedTaskId: number | null;
  selectedDomainId: number | null;
  mobileTab: MobileTab;
  quickAddOpen: boolean;
  calendarHourHeight: number;
  calendarCenterDate: string;
  justUpdatedId: number | null;
}

interface UIActions {
  setTheme: (theme: Theme) => void;
  setEnergyLevel: (level: EnergyLevel) => void;
  toggleSort: (field: SortField) => void;
  toggleShowScheduled: () => void;
  toggleShowCompleted: () => void;
  toggleCollapsedDomain: (domainId: number) => void;
  toggleExpandedSubtask: (taskId: number) => void;
  selectTask: (taskId: number | null) => void;
  selectDomain: (domainId: number | null) => void;
  setMobileTab: (tab: MobileTab) => void;
  setQuickAddOpen: (open: boolean) => void;
  setCalendarHourHeight: (height: number) => void;
  setCalendarCenterDate: (date: string) => void;
  flashUpdatedTask: (taskId: number) => void;
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
      collapsedDomains: new Set<number>(),
      expandedSubtasks: new Set<number>(),
      selectedTaskId: null,
      selectedDomainId: null,
      mobileTab: "tasks",
      quickAddOpen: false,
      calendarHourHeight: 60,
      justUpdatedId: null,
      calendarCenterDate: (() => {
        const now = new Date();
        if (now.getHours() >= 20) {
          const tomorrow = new Date(now);
          tomorrow.setDate(tomorrow.getDate() + 1);
          return tomorrow.toISOString().split("T")[0];
        }
        return now.toISOString().split("T")[0];
      })(),

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

      toggleCollapsedDomain: (domainId) =>
        set((state) => {
          const next = new Set(state.collapsedDomains);
          if (next.has(domainId)) {
            next.delete(domainId);
          } else {
            next.add(domainId);
          }
          return { collapsedDomains: next };
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
      flashUpdatedTask: (taskId) => {
        set({ justUpdatedId: taskId });
        setTimeout(() => {
          document
            .querySelector(`[data-task-id="${taskId}"]`)
            ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }, 100);
        setTimeout(() => set({ justUpdatedId: null }), 1500);
      },
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
        collapsedDomains: [...state.collapsedDomains],
        expandedSubtasks: [...state.expandedSubtasks],
        mobileTab: state.mobileTab,
      }),
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const parsed = JSON.parse(str);
          // Rehydrate arrays back to Sets
          if (parsed?.state?.collapsedDomains) {
            parsed.state.collapsedDomains = new Set(parsed.state.collapsedDomains);
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
