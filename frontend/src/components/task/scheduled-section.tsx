import { AlertTriangle, CalendarClock, ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";
import type { AppRoutersTasksTaskResponse } from "@/api/model";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { todayString } from "@/lib/calendar-utils";
import { groupScheduledByDate } from "@/lib/task-utils";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { TaskItem } from "./task-item";

interface ScheduledSectionProps {
  tasks: AppRoutersTasksTaskResponse[];
  onSelectTask?: (taskId: number) => void;
  onEditTask?: (task: AppRoutersTasksTaskResponse) => void;
}

export function ScheduledSection({ tasks, onSelectTask, onEditTask }: ScheduledSectionProps) {
  const { showScheduled, toggleShowScheduled } = useUIStore();

  const today = todayString();

  // Split date groups into overdue (past) and upcoming (today + future)
  const { overdueGroups, upcomingGroups } = useMemo(() => {
    const dateGroups = groupScheduledByDate(tasks);
    const overdue: typeof dateGroups = [];
    const upcoming: typeof dateGroups = [];
    for (const group of dateGroups) {
      if (group.date < today) {
        overdue.push(group);
      } else {
        upcoming.push(group);
      }
    }
    return { overdueGroups: overdue, upcomingGroups: upcoming };
  }, [tasks, today]);

  if (tasks.length === 0) return null;

  const overdueCount = overdueGroups.reduce((sum, g) => sum + g.tasks.length, 0);

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
          {/* Overdue scheduled tasks */}
          {overdueGroups.length > 0 && (
            <div className="rounded-md bg-destructive/5 border border-destructive/15 py-1">
              <div className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-destructive">
                <AlertTriangle className="h-3 w-3" />
                Overdue
                <span className="text-destructive/60 font-normal tabular-nums">{overdueCount}</span>
              </div>
              {overdueGroups.map((group) => (
                <div key={group.date}>
                  <div className="px-3 py-0.5 text-[11px] font-medium text-destructive/70">
                    {group.label}
                  </div>
                  <AnimatePresence initial={false}>
                    {group.tasks.map((task) => (
                      <motion.div
                        key={task.id}
                        layout
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <TaskItem task={task} onSelect={onSelectTask} onEdit={onEditTask} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          )}

          {/* Upcoming scheduled tasks (today + future) */}
          {upcomingGroups.map((group) => {
            const isToday = group.date === today;
            return (
              <div key={group.date}>
                <div
                  className={cn(
                    "px-3 py-1 text-xs font-medium",
                    isToday ? "text-primary font-medium" : "text-muted-foreground",
                  )}
                >
                  {group.label}
                </div>
                <AnimatePresence initial={false}>
                  {group.tasks.map((task) => (
                    <motion.div
                      key={task.id}
                      layout
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <TaskItem task={task} onSelect={onSelectTask} onEdit={onEditTask} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
