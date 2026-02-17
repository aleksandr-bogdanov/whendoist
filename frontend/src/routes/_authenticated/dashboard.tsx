import { createFileRoute } from "@tanstack/react-router";
import { useListDomainsApiV1DomainsGet } from "@/api/queries/domains/domains";
import { useListTasksApiV1TasksGet } from "@/api/queries/tasks/tasks";
import { TaskPanel } from "@/components/dashboard/task-panel";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { data: tasks, isLoading: tasksLoading } = useListTasksApiV1TasksGet();

  const { data: domains, isLoading: domainsLoading } = useListDomainsApiV1DomainsGet();

  return (
    <div className="flex flex-1 h-full">
      {/* Task panel — full width for now, calendar panel comes in Phase 8 */}
      <div className="flex flex-col flex-1 min-w-0">
        <TaskPanel tasks={tasks} domains={domains} isLoading={tasksLoading || domainsLoading} />
      </div>
    </div>
  );
}
