import { useDroppable } from "@dnd-kit/core";
import { ArrowUpFromDot } from "lucide-react";
import { motion } from "motion/react";
import type { TaskResponse } from "@/api/model";
import type { DomainGroup as DomainGroupType } from "@/lib/task-utils";
import { DomainGroup } from "./domain-group";
import { useDndState } from "./task-dnd-context";

interface TaskListProps {
  groups: DomainGroupType[];
  onSelectTask?: (taskId: number) => void;
  onEditTask?: (task: TaskResponse) => void;
}

export function TaskList({ groups, onSelectTask, onEditTask }: TaskListProps) {
  // Make the entire task list a drop zone for unscheduling / promoting subtasks
  const { setNodeRef, isOver } = useDroppable({
    id: "task-list-drop",
    data: { type: "task-list" },
  });

  // Show a dedicated promote bar when dragging a subtask
  const dndState = useDndState();
  const isDraggingSubtask = dndState.activeTask?.parent_id != null;
  const { setNodeRef: setPromoteRef, isOver: isPromoteOver } = useDroppable({
    id: "task-list-promote",
    data: { type: "task-list" },
    disabled: !isDraggingSubtask,
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
      {isDraggingSubtask && (
        <div
          ref={setPromoteRef}
          className={`flex items-center justify-center gap-1.5 py-2 rounded-lg border-2 border-dashed text-xs font-medium transition-colors ${
            isPromoteOver
              ? "border-[#6D5EF6] bg-[#6D5EF6]/10 text-[#6D5EF6]"
              : "border-muted-foreground/25 text-muted-foreground/60"
          }`}
        >
          <ArrowUpFromDot className="h-3.5 w-3.5" />
          Drop to make standalone
        </div>
      )}
      {groups.map((group) => (
        <motion.div key={group.domain?.id ?? "thoughts"} layout transition={{ duration: 0.2 }}>
          <DomainGroup
            domain={group.domain}
            tasks={group.tasks}
            onSelectTask={onSelectTask}
            onEditTask={onEditTask}
          />
        </motion.div>
      ))}
    </div>
  );
}
