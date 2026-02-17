import type { AppRoutersTasksTaskResponse } from "@/api/model";
import type { DomainGroup as DomainGroupType } from "@/lib/task-utils";
import { DomainGroup } from "./domain-group";

interface TaskListProps {
  groups: DomainGroupType[];
  onSelectTask?: (taskId: number) => void;
  onEditTask?: (task: AppRoutersTasksTaskResponse) => void;
}

export function TaskList({ groups, onSelectTask, onEditTask }: TaskListProps) {
  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground text-sm">No tasks to show</p>
        <p className="text-muted-foreground/60 text-xs mt-1">
          Tasks matching your filters will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {groups.map((group) => (
        <DomainGroup
          key={group.domain?.id ?? "inbox"}
          domain={group.domain}
          tasks={group.tasks}
          onSelectTask={onSelectTask}
          onEditTask={onEditTask}
        />
      ))}
    </div>
  );
}
