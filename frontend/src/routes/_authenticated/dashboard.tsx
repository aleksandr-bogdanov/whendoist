import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, CalendarPlus, ListTodo, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { DomainResponse, TaskResponse } from "@/api/model";
import { useListDomainsApiV1DomainsGet } from "@/api/queries/domains/domains";
import { useGetMeApiV1MeGet } from "@/api/queries/me/me";
import {
  useDeleteTaskApiV1TasksTaskIdDelete,
  useListTasksApiV1TasksGet,
  useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost,
} from "@/api/queries/tasks/tasks";
import { CalendarPanel } from "@/components/calendar/calendar-panel";
import { TaskPanel } from "@/components/dashboard/task-panel";
import { GestureDiscovery } from "@/components/gesture-discovery";
import { ShortcutsHelp } from "@/components/shortcuts-help";
import { TaskDetailPanel } from "@/components/task/task-detail-panel";
import { TaskDndContext } from "@/components/task/task-dnd-context";
import { TaskEditor } from "@/components/task/task-editor";
import { TaskQuickAdd } from "@/components/task/task-quick-add";
import { Button } from "@/components/ui/button";
import { useCrypto } from "@/hooks/use-crypto";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { DASHBOARD_TASKS_PARAMS, dashboardTasksKey } from "@/lib/query-keys";
import { useUIStore } from "@/stores/ui-store";

/** Matches Tailwind md: breakpoint for JS-level desktop checks. */
const MD_QUERY = "(min-width: 768px)";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
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
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
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
    quickAddOpen: storeQuickAddOpen,
    setQuickAddOpen: setStoreQuickAddOpen,
  } = useUIStore();

  // Sync quick-add open state from store (triggered by mobile nav FAB)
  useEffect(() => {
    if (storeQuickAddOpen) {
      setQuickAddOpen(true);
      setStoreQuickAddOpen(false);
    }
  }, [storeQuickAddOpen, setStoreQuickAddOpen]);

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
    [selectTask],
  );

  // Keyboard shortcuts
  useShortcuts(
    useMemo(
      () => [
        {
          key: "?",
          description: "Show keyboard shortcuts",
          category: "Help",
          excludeInputs: true,
          handler: () => setShortcutsHelpOpen(true),
        },
        {
          key: "q",
          description: "Quick add task",
          category: "Tasks",
          excludeInputs: true,
          handler: () => {
            if (!stateRef.current.isModalOpen) setQuickAddOpen(true);
          },
        },
        {
          key: "n",
          description: "New task",
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
          description: "Next task",
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
          description: "Previous task",
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
          description: "Complete selected task",
          category: "Actions",
          excludeInputs: true,
          handler: () => {
            const { selectedTaskId: sel, isModalOpen: modal, tasks: allTasks } = stateRef.current;
            if (modal || sel === null) return;
            const t = allTasks?.find((t) => t.id === sel);
            toggleComplete.mutate(
              { taskId: sel, data: null },
              {
                onSuccess: () => {
                  queryClient.invalidateQueries({ queryKey: dashboardTasksKey() });
                  const label =
                    t?.status === "completed"
                      ? `Reopened "${t.title}"`
                      : `Completed "${t?.title ?? "Task"}"`;
                  toast.success(label, { id: `complete-${sel}` });
                },
                onError: () => toast.error("Failed to update task", { id: `complete-err-${sel}` }),
              },
            );
          },
        },
        {
          key: "e",
          description: "Edit selected task",
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
          description: "Edit selected task",
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
          description: "Delete selected task",
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
            const task = all.find((t) => t.id === sel);
            if (!task) return;

            if (task.subtasks?.length) {
              if (!window.confirm(`Delete "${task.title}" and ${task.subtasks.length} subtask(s)?`))
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
                  toast.success(`Deleted "${task.title}"`, { id: `delete-${sel}` });
                },
                onError: () => {
                  selectTask(sel);
                  toast.error("Failed to delete task", { id: `delete-err-${sel}` });
                },
              },
            );
          },
        },
        {
          key: "Escape",
          description: "Close panel / clear selection",
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
      ],
      [selectTask, queryClient, toggleComplete, deleteTask],
    ),
  );

  // Show shortcuts hint once for desktop users
  useEffect(() => {
    const shown = localStorage.getItem("shortcuts-toast-shown");
    if (shown) return;
    const isMobile = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    if (isMobile) return;
    const timer = setTimeout(() => {
      toast.info("Press ? to view keyboard shortcuts", {
        action: {
          label: "Show",
          onClick: () => setShortcutsHelpOpen(true),
        },
      });
      localStorage.setItem("shortcuts-toast-shown", "1");
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  // Scroll selected task into view
  useEffect(() => {
    if (selectedTaskId === null) return;
    const el = document.querySelector(`[data-task-id="${selectedTaskId}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedTaskId]);

  // Derive selected task for the inline detail panel
  const selectedTask = useMemo(
    () => (selectedTaskId ? (decryptedTasks.find((t) => t.id === selectedTaskId) ?? null) : null),
    [selectedTaskId, decryptedTasks],
  );

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
        {/* Mobile tab bar */}
        <div className="flex md:hidden border-b">
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
            Tasks
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
            Calendar
          </Button>
        </div>

        {/* Main content: split pane on desktop, tab-switched on mobile */}
        <div className="flex flex-1 min-h-0 md:gap-1">
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
                    <span className="flex-1">
                      Connect Google Calendar to see your events alongside tasks.
                    </span>
                    <a
                      href="/auth/google"
                      className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      Connect
                    </a>
                    <button
                      type="button"
                      onClick={dismissGcalBanner}
                      className="p-0.5 rounded hover:bg-accent"
                      title="Dismiss"
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

        {/* Task Editor Sheet */}
        <TaskEditor
          open={editorOpen}
          onOpenChange={setEditorOpen}
          task={editingTask}
          domains={safedomains}
          parentTasks={parentTasks}
        />

        {/* Quick Add Dialog */}
        <TaskQuickAdd open={quickAddOpen} onOpenChange={setQuickAddOpen} domains={safedomains} />

        {/* Shortcuts Help Modal */}
        <ShortcutsHelp open={shortcutsHelpOpen} onOpenChange={setShortcutsHelpOpen} />

        {/* Mobile gesture hints (first-time only) */}
        <GestureDiscovery />
      </div>
    </TaskDndContext>
  );
}
