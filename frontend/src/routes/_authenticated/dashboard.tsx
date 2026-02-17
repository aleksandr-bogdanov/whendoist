import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import type { AppRoutersTasksTaskResponse } from "@/api/model";
import { useListDomainsApiV1DomainsGet } from "@/api/queries/domains/domains";
import { useListTasksApiV1TasksGet } from "@/api/queries/tasks/tasks";
import { TaskPanel } from "@/components/dashboard/task-panel";
import { TaskEditor } from "@/components/task/task-editor";
import { TaskQuickAdd } from "@/components/task/task-quick-add";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { data: tasks, isLoading: tasksLoading } = useListTasksApiV1TasksGet();
  const { data: domains, isLoading: domainsLoading } = useListDomainsApiV1DomainsGet();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<AppRoutersTasksTaskResponse | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

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

  return (
    <div className="flex flex-1 h-full">
      {/* Task panel — full width for now, calendar panel comes in Phase 8 */}
      <div className="flex flex-col flex-1 min-w-0">
        <TaskPanel
          tasks={tasks}
          domains={domains}
          isLoading={tasksLoading || domainsLoading}
          onNewTask={handleNewTask}
          onQuickAdd={handleQuickAdd}
          onEditTask={handleEditTask}
        />
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
