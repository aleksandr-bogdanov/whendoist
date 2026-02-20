import { useDroppable } from "@dnd-kit/core";
import { motion } from "motion/react";
import type { AppRoutersTasksTaskResponse } from "@/api/model";
import type { DomainGroup as DomainGroupType } from "@/lib/task-utils";
import { DomainGroup } from "./domain-group";

interface TaskListProps {
  groups: DomainGroupType[];
  onSelectTask?: (taskId: number) => void;
  onEditTask?: (task: AppRoutersTasksTaskResponse) => void;
  dragOverTaskId?: string | null;
}

export function TaskList({ groups, onSelectTask, onEditTask, dragOverTaskId }: TaskListProps) {
  // Make the entire task list a drop zone for unscheduling
  const { setNodeRef, isOver } = useDroppable({
    id: "task-list-drop",
    data: { type: "task-list" },
  });

  if (groups.length === 0) {
    return (
      <div ref={setNodeRef} className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground text-sm">No tasks to show</p>
        <p className="text-muted-foreground/60 text-xs mt-1">
          Tasks matching your filters will appear here
        </p>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} className={`space-y-1 ${isOver ? "bg-accent/30 rounded-md" : ""}`}>
      {groups.map((group) => (
        <motion.div key={group.domain?.id ?? "thoughts"} layout transition={{ duration: 0.2 }}>
          <DomainGroup
            domain={group.domain}
            tasks={group.tasks}
            onSelectTask={onSelectTask}
            onEditTask={onEditTask}
            dragOverTaskId={dragOverTaskId}
          />
        </motion.div>
      ))}
    </div>
  );
}
