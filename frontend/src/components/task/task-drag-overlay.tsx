import { Clock, CornerDownRight } from "lucide-react";
import type { TaskResponse } from "@/api/model";
import { Badge } from "@/components/ui/badge";
import { formatDuration, IMPACT_COLORS } from "@/lib/task-utils";
import { cn } from "@/lib/utils";

interface TaskDragOverlayProps {
  task: TaskResponse;
  isReparenting?: boolean;
}

export function TaskDragOverlay({ task, isReparenting }: TaskDragOverlayProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border bg-background/95 px-3 py-2 shadow-lg backdrop-blur-sm max-w-xs transition-all",
        isReparenting && "border-[#6D5EF6] bg-[#6D5EF6]/10 ring-1 ring-[#6D5EF6]/30",
      )}
    >
      {isReparenting && <CornerDownRight className="h-3.5 w-3.5 text-[#6D5EF6] flex-shrink-0" />}
      <span className="text-sm font-medium truncate flex-1">{task.title}</span>
      <span className="flex items-center gap-1.5 flex-shrink-0">
        {task.duration_minutes && (
          <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
            <Clock className="h-3 w-3" />
            {formatDuration(task.duration_minutes)}
          </span>
        )}
        <Badge
          className="text-[10px] px-1.5 py-0 text-white"
          style={{
            backgroundColor: IMPACT_COLORS[task.impact] ?? IMPACT_COLORS[4],
          }}
        >
          P{task.impact}
        </Badge>
      </span>
    </div>
  );
}
