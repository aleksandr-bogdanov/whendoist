import { CalendarClock, ChevronDown } from "lucide-react";
import type { AppRoutersTasksTaskResponse } from "@/api/model";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { groupScheduledByDate } from "@/lib/task-utils";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { TaskItem } from "./task-item";

interface ScheduledSectionProps {
  tasks: AppRoutersTasksTaskResponse[];
  onSelectTask?: (taskId: number) => void;
}

export function ScheduledSection({ tasks, onSelectTask }: ScheduledSectionProps) {
  const { showScheduled, toggleShowScheduled } = useUIStore();

  if (tasks.length === 0) return null;

  const dateGroups = groupScheduledByDate(tasks);

  return (
    <Collapsible open={showScheduled} onOpenChange={toggleShowScheduled}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2 px-3 py-2 text-sm font-medium",
            "rounded-md hover:bg-accent/50 transition-colors",
            "border-t border-border mt-2 pt-3",
          )}
        >
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          <span className="flex-1 text-left">Scheduled</span>
          <span className="text-xs text-muted-foreground tabular-nums">{tasks.length}</span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              !showScheduled && "-rotate-90",
            )}
          />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="space-y-2 pt-1">
          {dateGroups.map((group) => (
            <div key={group.date}>
              <div className="px-3 py-1 text-xs font-medium text-muted-foreground">
                {group.label}
              </div>
              {group.tasks.map((task) => (
                <TaskItem key={task.id} task={task} onSelect={onSelectTask} />
              ))}
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
