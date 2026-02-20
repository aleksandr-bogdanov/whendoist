import { useDraggable } from "@dnd-kit/core";
import type { AppRoutersTasksTaskResponse } from "@/api/model";
import { IMPACT_COLORS } from "@/lib/task-utils";

interface AnytimeTaskPillProps {
  task: AppRoutersTasksTaskResponse;
  onClick?: () => void;
}

export function AnytimeTaskPill({ task, onClick }: AnytimeTaskPillProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `anytime-task-${task.id}`,
    data: { type: "anytime-task", taskId: task.id },
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`text-[11px] truncate rounded-full px-2 py-0.5 hover:bg-[rgba(109,94,246,0.04)] cursor-grab active:cursor-grabbing bg-card border border-border/40 max-w-[180px] flex-shrink-0 ${isDragging ? "opacity-30" : ""}`}
      style={{
        borderLeft: `3px solid ${IMPACT_COLORS[task.impact] ?? IMPACT_COLORS[4]}`,
      }}
      onClick={onClick}
      title={task.title}
      {...listeners}
      {...attributes}
    >
      {task.title}
    </button>
  );
}
