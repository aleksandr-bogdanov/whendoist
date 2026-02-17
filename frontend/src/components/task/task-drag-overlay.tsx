import { Clock } from "lucide-react";
import type { AppRoutersTasksTaskResponse } from "@/api/model";
import { Badge } from "@/components/ui/badge";
import { formatDuration, IMPACT_COLORS } from "@/lib/task-utils";

interface TaskDragOverlayProps {
  task: AppRoutersTasksTaskResponse;
}

export function TaskDragOverlay({ task }: TaskDragOverlayProps) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-background/95 px-3 py-2 shadow-lg backdrop-blur-sm max-w-xs">
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
