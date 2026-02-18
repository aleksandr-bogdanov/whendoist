import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, ListTodo } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { AppRoutersTasksTaskResponse } from "@/api/model";
import { useListDomainsApiV1DomainsGet } from "@/api/queries/domains/domains";
import {
  getListTasksApiV1TasksGetQueryKey,
  useDeleteTaskApiV1TasksTaskIdDelete,
  useListTasksApiV1TasksGet,
  useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost,
} from "@/api/queries/tasks/tasks";
import { CalendarPanel } from "@/components/calendar/calendar-panel";
import { TaskPanel } from "@/components/dashboard/task-panel";
import { GestureDiscovery } from "@/components/gesture-discovery";
import { ShortcutsHelp } from "@/components/shortcuts-help";
import { TaskDndContext } from "@/components/task/task-dnd-context";
import { TaskEditor } from "@/components/task/task-editor";
import { TaskQuickAdd } from "@/components/task/task-quick-add";
import { Button } from "@/components/ui/button";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { useUIStore } from "@/stores/ui-store";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { data: tasks, isLoading: tasksLoading } = useListTasksApiV1TasksGet();
  const { data: domains, isLoading: domainsLoading } = useListDomainsApiV1DomainsGet();
  const queryClient = useQueryClient();
  const toggleComplete = useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost();
  const deleteTask = useDeleteTaskApiV1TasksTaskIdDelete();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<AppRoutersTasksTaskResponse | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);

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
    () => tasks?.filter((t) => t.parent_id === null && !t.is_recurring) ?? [],
    [tasks],
  );

  // Flat list of visible task IDs for j/k navigation
  const visibleTaskIds = useMemo(() => {
    if (!tasks) return [];
    // Only top-level pending tasks are navigable (matches the visible list)
    return tasks.filter((t) => t.parent_id === null).map((t) => t.id);
  }, [tasks]);

  // Keep a ref to avoid stale closures in shortcut handlers
  const stateRef = useRef({ selectedTaskId, visibleTaskIds, tasks, isModalOpen });
  useEffect(() => {
    stateRef.current = { selectedTaskId, visibleTaskIds, tasks, isModalOpen };
  });

  const handleNewTask = useCallback(() => {
    setEditingTask(null);
    setEditorOpen(true);
  }, []);

  const handleQuickAdd = useCallback(() => {
    setQuickAddOpen(true);
  }, []);

  const handleEditTask = useCallback((task: AppRoutersTasksTaskResponse) => {
    setEditingTask(task);
    setEditorOpen(true);
  }, []);

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
          description: "New task (editor)",
          category: "Tasks",
          excludeInputs: true,
          handler: () => {
            if (!stateRef.current.isModalOpen) {
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
            const { selectedTaskId: sel, isModalOpen: modal } = stateRef.current;
            if (modal || sel === null) return;
            toggleComplete.mutate(
              { taskId: sel, data: null },
              {
                onSuccess: () => {
                  queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
                  toast.success("Task toggled", { duration: 3000 });
                },
                onError: () => toast.error("Failed to update task"),
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
            if (task) {
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
            if (task) {
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

            // Move selection to next task
            const idx = ids.indexOf(sel);
            const nextId = ids[idx + 1] ?? ids[idx - 1] ?? null;
            selectTask(nextId);

            deleteTask.mutate(
              { taskId: sel },
              {
                onSuccess: () => {
                  queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
                  toast.success(`Deleted "${task.title}"`, { duration: 5000 });
                },
                onError: () => {
                  selectTask(sel);
                  toast.error("Failed to delete task");
                },
              },
            );
          },
        },
        {
          key: "Escape",
          description: "Close dialog / clear selection",
          category: "Navigation",
          preventDefault: false,
          handler: () => {
            // Only clear selection if no modal is open
            // (modals handle their own Escape via Radix)
            if (!stateRef.current.isModalOpen && stateRef.current.selectedTaskId !== null) {
              selectTask(null);
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
        duration: 8000,
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

  const safedomains = domains ?? [];
  const safeTasks = tasks ?? [];

  return (
    <TaskDndContext tasks={safeTasks}>
      <div className="flex flex-col flex-1 h-full">
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
        <div className="flex flex-1 min-h-0">
          {/* Task panel */}
          <div
            className={`flex flex-col min-w-0 ${
              mobileTab === "tasks" ? "flex-1" : "hidden"
            } md:flex md:flex-1 md:max-w-[55%]`}
          >
            <TaskPanel
              tasks={tasks}
              domains={domains}
              isLoading={tasksLoading || domainsLoading}
              onNewTask={handleNewTask}
              onQuickAdd={handleQuickAdd}
              onEditTask={handleEditTask}
            />
          </div>

          {/* Calendar panel */}
          <div
            className={`flex flex-col min-w-0 ${
              mobileTab === "calendar" ? "flex-1" : "hidden"
            } md:flex md:flex-1`}
          >
            <CalendarPanel tasks={safeTasks} onTaskClick={handleEditTask} />
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
