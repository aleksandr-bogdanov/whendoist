import { useQueryClient } from "@tanstack/react-query";
import { createLazyFileRoute } from "@tanstack/react-router";
import { CalendarDays, CalendarPlus, ListTodo, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { DomainResponse, InstanceResponse, TaskResponse } from "@/api/model";
import { useListDomainsApiV1DomainsGet } from "@/api/queries/domains/domains";
import { getListInstancesApiV1InstancesGetQueryKey } from "@/api/queries/instances/instances";
import { useGetMeApiV1MeGet } from "@/api/queries/me/me";
import {
  useDeleteTaskApiV1TasksTaskIdDelete,
  useListTasksApiV1TasksGet,
  useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost,
} from "@/api/queries/tasks/tasks";
import { CalendarPanel } from "@/components/calendar/calendar-panel";
import { TaskPanel } from "@/components/dashboard/task-panel";
import { GestureDiscovery } from "@/components/gesture-discovery";

import { TaskDetailPanel } from "@/components/task/task-detail-panel";
import { TaskDndContext } from "@/components/task/task-dnd-context";
import { TaskEditDrawer } from "@/components/task/task-edit-drawer";
import { TaskQuickAdd } from "@/components/task/task-quick-add";
import { Button } from "@/components/ui/button";
import { useCrypto } from "@/hooks/use-crypto";
import { useShortcuts } from "@/hooks/use-shortcuts";
import {
  batchDelete,
  batchToggleCompleteAll,
  deduplicateInstances,
  findPendingInstancesForTasks,
} from "@/lib/batch-mutations";
import { DASHBOARD_TASKS_PARAMS, dashboardTasksKey } from "@/lib/query-keys";
import { isNativeTabBarAvailable } from "@/lib/tauri-native-tabbar";
import {
  instanceSelectionId,
  resolveSelection,
  taskSelectionId,
  useSelectionStore,
} from "@/stores/selection-store";
import { useUIStore } from "@/stores/ui-store";

/** Matches Tailwind md: breakpoint for JS-level desktop checks. */
const MD_QUERY = "(min-width: 768px)";

export const Route = createLazyFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { t } = useTranslation();
  const isNativeTabBar = isNativeTabBarAvailable();
  const { data: tasks, isLoading: tasksLoading } =
    useListTasksApiV1TasksGet(DASHBOARD_TASKS_PARAMS);
  const { data: domains, isLoading: domainsLoading } = useListDomainsApiV1DomainsGet();
  const { data: me } = useGetMeApiV1MeGet();
  const queryClient = useQueryClient();
  const toggleComplete = useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost();
  const deleteTask = useDeleteTaskApiV1TasksTaskIdDelete();
  const { decryptTasks, decryptDomains } = useCrypto();
  const [decryptedTasks, setDecryptedTasks] = useState<TaskResponse[]>([]);
  const [decryptedDomains, setDecryptedDomains] = useState<DomainResponse[]>([]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskResponse | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const shortcutsHelpOpen = useUIStore((s) => s.shortcutsHelpOpen);
  const setShortcutsHelpOpen = useUIStore((s) => s.setShortcutsHelpOpen);
  const [gcalBannerDismissed, setGcalBannerDismissed] = useState(
    () => localStorage.getItem("gcal-banner-dismissed") === "1",
  );

  const showGcalBanner = me && !me.calendar_connected && !gcalBannerDismissed;

  const dismissGcalBanner = useCallback(() => {
    setGcalBannerDismissed(true);
    localStorage.setItem("gcal-banner-dismissed", "1");
  }, []);

  // Decrypt tasks for keyboard shortcuts, CalendarPanel, and DnD context
  const tasksFingerprint = useMemo(
    () => (tasks ?? []).map((t) => `${t.id}:${t.title?.slice(0, 8)}`).join(","),
    [tasks],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: fingerprint tracks changes
  useEffect(() => {
    let cancelled = false;
    decryptTasks(tasks ?? []).then((result) => {
      if (!cancelled) setDecryptedTasks(result);
    });
    return () => {
      cancelled = true;
    };
  }, [tasksFingerprint, decryptTasks]);

  // Decrypt domains for editor and quick-add
  const domainsFingerprint = useMemo(
    () => (domains ?? []).map((d) => `${d.id}:${d.name?.slice(0, 8)}`).join(","),
    [domains],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: fingerprint tracks changes
  useEffect(() => {
    let cancelled = false;
    decryptDomains(domains ?? []).then((result) => {
      if (!cancelled) setDecryptedDomains(result);
    });
    return () => {
      cancelled = true;
    };
  }, [domainsFingerprint, decryptDomains]);

  const {
    mobileTab,
    setMobileTab,
    selectedTaskId,
    selectTask,
    pushPaletteRecent,
    quickAddOpen: storeQuickAddOpen,
    setQuickAddOpen: setStoreQuickAddOpen,
    energyLevel,
    selectedDomainId,
  } = useUIStore();

  // Sync quick-add open state from store (triggered by mobile nav FAB)
  useEffect(() => {
    if (storeQuickAddOpen) {
      setQuickAddOpen(true);
      setStoreQuickAddOpen(false);
    }
  }, [storeQuickAddOpen, setStoreQuickAddOpen]);

  // Clear multi-selection when filters change or domain groups collapse (tasks may become invisible)
  const collapsedDomains = useUIStore((s) => s.collapsedDomains);
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally fires on filter/visibility change only
  useEffect(() => {
    useSelectionStore.getState().clear();
  }, [energyLevel, selectedDomainId, collapsedDomains]);

  // Track whether any modal is open to suppress task shortcuts
  const isModalOpen = editorOpen || quickAddOpen || shortcutsHelpOpen;

  // Top-level tasks for parent picker (exclude subtasks and recurring)
  const parentTasks = useMemo(
    () => decryptedTasks.filter((t) => t.parent_id === null && !t.is_recurring),
    [decryptedTasks],
  );

  // Flat list of visible task IDs for j/k navigation
  // Only include pending tasks (not scheduled or completed) to match what's visible
  const visibleTaskIds = useMemo(() => {
    if (!tasks) return [];
    return tasks
      .filter((t) => t.parent_id === null && t.status !== "completed" && !t.scheduled_date)
      .map((t) => t.id);
  }, [tasks]);

  // Keep a ref to avoid stale closures in shortcut handlers
  const stateRef = useRef({ selectedTaskId, visibleTaskIds, tasks: decryptedTasks, isModalOpen });
  useEffect(() => {
    stateRef.current = { selectedTaskId, visibleTaskIds, tasks: decryptedTasks, isModalOpen };
  });

  const handleNewTask = useCallback(() => {
    if (window.matchMedia(MD_QUERY).matches) {
      // Desktop: show create form in right pane
      selectTask(null);
      setCreating(true);
    } else {
      // Mobile: open Sheet editor
      setEditingTask(null);
      setEditorOpen(true);
    }
  }, [selectTask]);

  const handleEditTask = useCallback(
    (task: TaskResponse) => {
      pushPaletteRecent(task.id);
      if (window.matchMedia(MD_QUERY).matches) {
        // Desktop: show inline detail panel in right pane
        setCreating(false);
        selectTask(task.id);
      } else {
        // Mobile: open Sheet editor
        setEditingTask(task);
        setEditorOpen(true);
      }
    },
    [selectTask, pushPaletteRecent],
  );

  // Keyboard shortcuts
  useShortcuts(
    useMemo(
      () => [
        {
          key: "?",
          description: t("shortcuts.showShortcuts"),
          category: "Help",
          excludeInputs: true,
          handler: () => setShortcutsHelpOpen(true),
        },
        {
          key: "q",
          description: t("shortcuts.quickAdd"),
          category: "Tasks",
          excludeInputs: true,
          handler: () => {
            if (!stateRef.current.isModalOpen) setQuickAddOpen(true);
          },
        },
        {
          key: "n",
          description: t("shortcuts.newTask"),
          category: "Tasks",
          excludeInputs: true,
          handler: () => {
            if (stateRef.current.isModalOpen) return;
            if (window.matchMedia(MD_QUERY).matches) {
              selectTask(null);
              setCreating(true);
            } else {
              setEditingTask(null);
              setEditorOpen(true);
            }
          },
        },
        {
          key: "j",
          description: t("shortcuts.nextTask"),
          category: "Navigation",
          excludeInputs: true,
          handler: () => {
            if (stateRef.current.isModalOpen) return;
            const { visibleTaskIds: ids, selectedTaskId: sel } = stateRef.current;
            if (ids.length === 0) return;
            if (sel === null) {
              selectTask(ids[0]);
              return;
            }
            const idx = ids.indexOf(sel);
            if (idx < ids.length - 1) selectTask(ids[idx + 1]);
          },
        },
        {
          key: "k",
          description: t("shortcuts.prevTask"),
          category: "Navigation",
          excludeInputs: true,
          handler: () => {
            if (stateRef.current.isModalOpen) return;
            const { visibleTaskIds: ids, selectedTaskId: sel } = stateRef.current;
            if (ids.length === 0) return;
            if (sel === null) {
              selectTask(ids[ids.length - 1]);
              return;
            }
            const idx = ids.indexOf(sel);
            if (idx > 0) selectTask(ids[idx - 1]);
          },
        },
        {
          key: "c",
          description: t("shortcuts.completeSelected"),
          category: "Actions",
          excludeInputs: true,
          handler: () => {
            const { selectedTaskId: sel, isModalOpen: modal, tasks: allTasks } = stateRef.current;
            if (modal || sel === null) return;
            const task = allTasks?.find((tk) => tk.id === sel);
            toggleComplete.mutate(
              { taskId: sel, data: null },
              {
                onSuccess: () => {
                  queryClient.invalidateQueries({ queryKey: dashboardTasksKey() });
                  const label =
                    task?.status === "completed"
                      ? t("toast.taskReopened", { title: task.title })
                      : t("toast.taskCompleted", { title: task?.title ?? "Task" });
                  toast.success(label, { id: `complete-${sel}` });
                },
                onError: () =>
                  toast.error(t("toast.failedToUpdateTask"), { id: `complete-err-${sel}` }),
              },
            );
          },
        },
        {
          key: "e",
          description: t("shortcuts.editSelected"),
          category: "Actions",
          excludeInputs: true,
          handler: () => {
            const { selectedTaskId: sel, tasks: all, isModalOpen: modal } = stateRef.current;
            if (modal || sel === null || !all) return;
            const task = all.find((t) => t.id === sel);
            if (!task) return;
            if (window.matchMedia(MD_QUERY).matches) {
              // Desktop: task is already selected, right panel shows it
              // Selection was set by j/k or click — no extra action needed
            } else {
              setEditingTask(task);
              setEditorOpen(true);
            }
          },
        },
        {
          key: "Enter",
          description: t("shortcuts.editSelected"),
          category: "Actions",
          excludeInputs: true,
          showInHelp: false,
          handler: () => {
            const { selectedTaskId: sel, tasks: all, isModalOpen: modal } = stateRef.current;
            if (modal || sel === null || !all) return;
            const task = all.find((t) => t.id === sel);
            if (!task) return;
            if (window.matchMedia(MD_QUERY).matches) {
              // Desktop: right panel already shows the selected task
            } else {
              setEditingTask(task);
              setEditorOpen(true);
            }
          },
        },
        {
          key: "x",
          description: t("shortcuts.deleteSelected"),
          category: "Actions",
          excludeInputs: true,
          handler: () => {
            const {
              selectedTaskId: sel,
              tasks: all,
              visibleTaskIds: ids,
              isModalOpen: modal,
            } = stateRef.current;
            if (modal || sel === null || !all) return;
            const task = all.find((tk) => tk.id === sel);
            if (!task) return;

            if (task.subtasks?.length) {
              if (
                !window.confirm(
                  t("task.deleteDialog.messageWithSubtasks", {
                    title: task.title,
                    count: task.subtasks.length,
                  }),
                )
              )
                return;
            }

            // Move selection to next task
            const idx = ids.indexOf(sel);
            const nextId = ids[idx + 1] ?? ids[idx - 1] ?? null;
            selectTask(nextId);

            deleteTask.mutate(
              { taskId: sel },
              {
                onSuccess: () => {
                  queryClient.invalidateQueries({ queryKey: dashboardTasksKey() });
                  toast.success(t("toast.taskDeleted", { title: task.title }), {
                    id: `delete-${sel}`,
                  });
                },
                onError: () => {
                  selectTask(sel);
                  toast.error(t("toast.failedToDeleteTask"), { id: `delete-err-${sel}` });
                },
              },
            );
          },
        },
        {
          key: "Escape",
          description: t("shortcuts.closePanelClear"),
          category: "Navigation",
          preventDefault: false,
          handler: () => {
            // Only clear selection if no modal is open
            // (modals handle their own Escape via Radix)
            if (!stateRef.current.isModalOpen) {
              if (stateRef.current.selectedTaskId !== null) {
                selectTask(null);
              }
              setCreating(false);
            }
          },
        },
        // ── Multi-select shortcuts (§7 / §8) ─────────────────────────
        {
          key: "a",
          description: t("shortcuts.selectAll"),
          category: "Selection",
          meta: true,
          displayKey: "⌘A",
          excludeInputs: true,
          handler: () => {
            if (stateRef.current.isModalOpen) return;
            // Select ALL pending tasks (both scheduled and unscheduled)
            const allTasks = stateRef.current.tasks;
            const taskIds = allTasks
              .filter((t) => t.parent_id === null && t.status !== "completed")
              .map((t) => taskSelectionId(t.id));
            // Also select all visible recurring instances from the calendar cache
            const allInstanceQueries = queryClient.getQueriesData<InstanceResponse[]>({
              queryKey: getListInstancesApiV1InstancesGetQueryKey(),
            });
            const allInstances = allInstanceQueries.flatMap(([, data]) => data ?? []);
            const instanceIds = allInstances
              .filter((i) => i.status !== "completed" && i.status !== "skipped")
              .map((i) => instanceSelectionId(i.id));
            const ids = [...taskIds, ...instanceIds];
            if (ids.length > 0) {
              useSelectionStore.getState().selectAll(ids);
              const parts = [
                taskIds.length > 0 &&
                  `${taskIds.length} ${taskIds.length !== 1 ? t("common.tasks") : t("common.task")}`,
                instanceIds.length > 0 &&
                  `${instanceIds.length} ${instanceIds.length !== 1 ? t("common.instances") : t("common.instance")}`,
              ].filter(Boolean);
              toast(t("dashboard.selectedCount", { parts: parts.join(" and ") }));
            }
          },
        },
        {
          key: "Delete",
          description: t("shortcuts.deleteSelectedTasks"),
          category: "Selection",
          excludeInputs: true,
          showInHelp: false,
          handler: () => {
            if (stateRef.current.isModalOpen) return;
            const selectedIds = useSelectionStore.getState().selectedIds;
            if (selectedIds.size === 0) return;
            const { tasks: targets } = resolveSelection(queryClient, selectedIds);
            if (targets.length === 0) return;
            const subtaskCount = targets.reduce((sum, t) => sum + (t.subtasks?.length ?? 0), 0);
            if (subtaskCount > 0) {
              if (
                !window.confirm(
                  t("batch.deleteConfirmWithSubtasks", { count: targets.length, subtaskCount }),
                )
              )
                return;
            } else if (targets.length > 3) {
              if (!window.confirm(t("batch.deleteConfirm", { count: targets.length }))) return;
            }
            batchDelete(queryClient, targets);
            useSelectionStore.getState().clear();
          },
        },
        {
          key: "Backspace",
          description: t("shortcuts.deleteSelectedTasks"),
          category: "Selection",
          excludeInputs: true,
          handler: () => {
            if (stateRef.current.isModalOpen) return;
            const selectedIds = useSelectionStore.getState().selectedIds;
            if (selectedIds.size === 0) return;
            const { tasks: targets } = resolveSelection(queryClient, selectedIds);
            if (targets.length === 0) return;
            const subtaskCount = targets.reduce((sum, t) => sum + (t.subtasks?.length ?? 0), 0);
            if (subtaskCount > 0) {
              if (
                !window.confirm(
                  t("batch.deleteConfirmWithSubtasks", { count: targets.length, subtaskCount }),
                )
              )
                return;
            } else if (targets.length > 3) {
              if (!window.confirm(t("batch.deleteConfirm", { count: targets.length }))) return;
            }
            batchDelete(queryClient, targets);
            useSelectionStore.getState().clear();
          },
        },
        {
          key: "Enter",
          description: t("shortcuts.completeSelectedTasks"),
          category: "Selection",
          meta: true,
          displayKey: "⌘↵",
          excludeInputs: true,
          handler: () => {
            if (stateRef.current.isModalOpen) return;
            const selectedIds = useSelectionStore.getState().selectedIds;
            if (selectedIds.size === 0) return;
            const { tasks, instances } = resolveSelection(queryClient, selectedIds);
            if (tasks.length === 0 && instances.length === 0) return;
            const allTasksCompleted =
              tasks.length > 0 && tasks.every((t) => t.status === "completed" || !!t.completed_at);
            const allInstancesCompleted =
              instances.length > 0 && instances.every((i) => i.status === "completed");
            const allCompleted =
              (tasks.length > 0 || instances.length > 0) &&
              (tasks.length === 0 || allTasksCompleted) &&
              (instances.length === 0 || allInstancesCompleted);
            const completing = !allCompleted;
            // Mirror the FAB's handleComplete logic: separate recurring from non-recurring
            const taskTargets = completing
              ? tasks.filter((t) => t.status !== "completed" && !t.completed_at)
              : tasks;
            const instanceTargets = completing
              ? instances.filter((i) => i.status !== "completed")
              : instances;
            const nonRecurring = taskTargets.filter((t) => !t.is_recurring);
            const recurring = taskTargets.filter((t) => t.is_recurring);
            const pendingInstances = findPendingInstancesForTasks(queryClient, recurring);
            // Deduplicate: user may have selected both a recurring parent and its pending instance
            const allInstances = deduplicateInstances([...instanceTargets, ...pendingInstances]);
            batchToggleCompleteAll(queryClient, nonRecurring, allInstances, completing);
            useSelectionStore.getState().clear();
          },
        },
      ],
      [selectTask, queryClient, toggleComplete, deleteTask, setShortcutsHelpOpen, t],
    ),
  );

  // Show shortcuts hint once for desktop users
  useEffect(() => {
    const shown = localStorage.getItem("shortcuts-toast-shown");
    if (shown) return;
    const isMobile = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    if (isMobile) return;
    const timer = setTimeout(() => {
      toast.info(t("shortcuts.shortcutsHint"), {
        action: {
          label: t("shortcuts.show"),
          onClick: () => setShortcutsHelpOpen(true),
        },
      });
      localStorage.setItem("shortcuts-toast-shown", "1");
    }, 2000);
    return () => clearTimeout(timer);
  }, [setShortcutsHelpOpen, t]);

  // Scroll selected task into view
  useEffect(() => {
    if (selectedTaskId === null) return;
    const el = document.querySelector(`[data-task-id="${selectedTaskId}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedTaskId]);

  // Derive selected task for the inline detail panel (search subtasks too)
  const selectedTask = useMemo(() => {
    if (!selectedTaskId) return null;
    for (const t of decryptedTasks) {
      if (t.id === selectedTaskId) return t;
      const sub = t.subtasks?.find((st) => st.id === selectedTaskId);
      if (sub) return sub as unknown as TaskResponse;
    }
    return null;
  }, [selectedTaskId, decryptedTasks]);

  // Clear creating mode when a task gets selected (j/k, click)
  useEffect(() => {
    if (selectedTaskId !== null) setCreating(false);
  }, [selectedTaskId]);

  // Clear selection if the selected task disappears (deleted, moved, etc.)
  useEffect(() => {
    if (selectedTaskId && decryptedTasks.length > 0 && !selectedTask) {
      selectTask(null);
    }
  }, [selectedTaskId, selectedTask, decryptedTasks.length, selectTask]);

  // Determine right pane mode
  const detailPanelMode = creating ? "create" : selectedTask ? "edit" : "idle";

  const handleCloseDetailPanel = useCallback(() => {
    setCreating(false);
    selectTask(null);
  }, [selectTask]);

  const safedomains = decryptedDomains;
  const safeTasks = decryptedTasks;

  return (
    <TaskDndContext tasks={safeTasks}>
      <div className="flex flex-col flex-1 h-full min-h-0">
        {/* Mobile tab bar — hidden when native UITabBar provides separate Tasks/Calendar tabs */}
        <div className={`flex md:hidden border-b ${isNativeTabBar ? "hidden" : ""}`}>
          <Button
            variant="ghost"
            className={`flex-1 rounded-none h-9 text-xs gap-1.5 ${
              mobileTab === "tasks"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground"
            }`}
            onClick={() => setMobileTab("tasks")}
          >
            <ListTodo className="h-3.5 w-3.5" />
            {t("nav.tasks")}
          </Button>
          <Button
            variant="ghost"
            className={`flex-1 rounded-none h-9 text-xs gap-1.5 ${
              mobileTab === "calendar"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground"
            }`}
            onClick={() => setMobileTab("calendar")}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            {t("nav.calendar")}
          </Button>
        </div>

        {/* Main content: split pane on desktop, tab-switched on mobile */}
        <div className="flex flex-1 min-h-0">
          {/* Task panel */}
          <div
            className={`flex flex-col min-w-0 min-h-0 ${
              mobileTab === "tasks" ? "flex-1" : "hidden"
            } md:flex md:flex-[3] md:min-w-0`}
          >
            <TaskPanel
              tasks={tasks}
              domains={domains}
              isLoading={tasksLoading || domainsLoading}
              onNewTask={handleNewTask}
              onEditTask={handleEditTask}
            />
          </div>

          {/* Right pane — task detail (edit/create) or calendar (idle) */}
          <div
            className={`flex flex-col min-w-0 ${
              mobileTab === "calendar" ? "flex-1" : "hidden"
            } md:flex md:flex-[2] md:min-w-0 md:border-l md:border-border`}
          >
            {detailPanelMode !== "idle" ? (
              /* Inline task editor — replaces calendar when editing or creating */
              <TaskDetailPanel
                task={selectedTask}
                domains={safedomains}
                parentTasks={parentTasks}
                mode={detailPanelMode}
                onClose={handleCloseDetailPanel}
              />
            ) : (
              /* Calendar panel — default view when no task selected */
              <>
                {showGcalBanner && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border-b text-sm">
                    <CalendarPlus className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="flex-1">{t("banner.connectGcal")}</span>
                    <a
                      href="/auth/google"
                      className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      {t("banner.connect")}
                    </a>
                    <button
                      type="button"
                      onClick={dismissGcalBanner}
                      className="p-0.5 rounded hover:bg-accent"
                      title={t("common.dismiss")}
                    >
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </div>
                )}
                <CalendarPanel tasks={safeTasks} onTaskClick={handleEditTask} />
              </>
            )}
          </div>
        </div>

        {/* Task Edit Drawer (mobile bottom sheet) */}
        <TaskEditDrawer
          open={editorOpen}
          onOpenChange={setEditorOpen}
          task={editingTask}
          domains={safedomains}
          parentTasks={parentTasks}
        />

        {/* Quick Add Dialog */}
        <TaskQuickAdd
          open={quickAddOpen}
          onOpenChange={setQuickAddOpen}
          domains={safedomains}
          parentTasks={parentTasks}
        />

        {/* Mobile gesture hints (first-time only) */}
        <GestureDiscovery />
      </div>
    </TaskDndContext>
  );
}
