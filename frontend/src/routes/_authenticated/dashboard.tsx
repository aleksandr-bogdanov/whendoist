import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, ListTodo } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import type { AppRoutersTasksTaskResponse } from "@/api/model";
import { useListDomainsApiV1DomainsGet } from "@/api/queries/domains/domains";
import { useListTasksApiV1TasksGet } from "@/api/queries/tasks/tasks";
import { CalendarPanel } from "@/components/calendar/calendar-panel";
import { TaskPanel } from "@/components/dashboard/task-panel";
import { TaskEditor } from "@/components/task/task-editor";
import { TaskQuickAdd } from "@/components/task/task-quick-add";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/stores/ui-store";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { data: tasks, isLoading: tasksLoading } = useListTasksApiV1TasksGet();
  const { data: domains, isLoading: domainsLoading } = useListDomainsApiV1DomainsGet();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<AppRoutersTasksTaskResponse | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  const { mobileTab, setMobileTab } = useUIStore();

  // Top-level tasks for parent picker (exclude subtasks and the task being edited)
  const parentTasks = useMemo(
    () =>
      tasks?.filter(
        (t) => t.parent_id === null && !t.is_recurring && (t.subtasks?.length ?? 0) === 0,
      ) ?? [],
    [tasks],
  );

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

  const safedomains = domains ?? [];
  const safeTasks = tasks ?? [];

  return (
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
    </div>
  );
}
