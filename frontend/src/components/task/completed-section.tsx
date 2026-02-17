import { CheckCircle2, ChevronDown } from "lucide-react";
import type { AppRoutersTasksTaskResponse } from "@/api/model";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { TaskItem } from "./task-item";

interface CompletedSectionProps {
  tasks: AppRoutersTasksTaskResponse[];
  onSelectTask?: (taskId: number) => void;
  onEditTask?: (task: AppRoutersTasksTaskResponse) => void;
}

export function CompletedSection({ tasks, onSelectTask, onEditTask }: CompletedSectionProps) {
  const { showCompleted, toggleShowCompleted } = useUIStore();

  if (tasks.length === 0) return null;

  // Sort by completed_at descending (most recent first)
  const sorted = [...tasks].sort((a, b) => {
    const aTime = a.completed_at ? new Date(a.completed_at).getTime() : 0;
    const bTime = b.completed_at ? new Date(b.completed_at).getTime() : 0;
    return bTime - aTime;
  });

  return (
    <Collapsible open={showCompleted} onOpenChange={toggleShowCompleted}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2 px-3 py-2 text-sm font-medium",
            "rounded-md hover:bg-accent/50 transition-colors",
            "border-t border-border mt-2 pt-3",
          )}
        >
          <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          <span className="flex-1 text-left">Completed</span>
          <span className="text-xs text-muted-foreground tabular-nums">{sorted.length}</span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              !showCompleted && "-rotate-90",
            )}
          />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="pt-1">
          {sorted.map((task) => (
            <TaskItem key={task.id} task={task} onSelect={onSelectTask} onEdit={onEditTask} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
