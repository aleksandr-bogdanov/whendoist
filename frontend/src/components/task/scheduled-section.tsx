import { useDroppable } from "@dnd-kit/core";
import { AlertTriangle, CalendarClock, ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";
import type { AppRoutersTasksTaskResponse, InstanceResponse } from "@/api/model";
import { useListInstancesApiV1InstancesGet } from "@/api/queries/instances/instances";
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

  // Fetch instances for overdue recurring tasks (single query, not N+1)
  // Range extends 30 days past today so we always find the next pending instance
  const hasOverdueRecurring = overdueGroups.some((g) => g.tasks.some((t) => t.is_recurring));
  const oldestOverdueDate = overdueGroups.length > 0 ? overdueGroups[0].date : null;
  const futureDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  }, []);
  const instancesQuery = useListInstancesApiV1InstancesGet(
    { start_date: oldestOverdueDate ?? today, end_date: futureDate },
    { query: { enabled: hasOverdueRecurring && !!oldestOverdueDate } },
  );

  // Map task_id → earliest pending instance (for "Skip this one" menu item)
  const pendingInstanceMap = useMemo(() => {
    const map = new Map<number, InstanceResponse>();
    const instances = instancesQuery.data ?? [];
    for (const inst of instances) {
      if (inst.status === "pending") {
        const existing = map.get(inst.task_id);
        if (!existing || inst.instance_date < existing.instance_date) {
          map.set(inst.task_id, inst);
        }
      }
    }
    return map;
  }, [instancesQuery.data]);

  if (tasks.length === 0) return null;

  const overdueCount = overdueGroups.reduce((sum, g) => sum + g.tasks.length, 0);

  return (
    <Collapsible open={showScheduled} onOpenChange={toggleShowScheduled}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2 px-3 py-2 text-sm font-medium",
            "rounded-md hover:bg-[rgba(109,94,246,0.04)] transition-colors",
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
                  <DateGroupHeader date={group.date} label={group.label} variant="overdue" />
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
                        <TaskItem
                          task={task}
                          onSelect={onSelectTask}
                          onEdit={onEditTask}
                          pendingInstance={pendingInstanceMap.get(task.id)}
                        />
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
                <DateGroupHeader
                  date={group.date}
                  label={group.label}
                  variant={isToday ? "today" : "default"}
                />
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

// ─── Droppable Date Group Header ──────────────────────────────────────────────

function DateGroupHeader({
  date,
  label,
  variant,
}: {
  date: string;
  label: string;
  variant: "overdue" | "today" | "default";
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `date-group-${date}`,
    data: { type: "date-group", dateStr: date },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "px-3 py-1 text-xs font-medium transition-colors rounded-sm",
        variant === "overdue" && "text-destructive/70 text-[11px] py-0.5",
        variant === "today" && "text-primary",
        variant === "default" && "text-muted-foreground",
        isOver && "bg-primary/10 ring-1 ring-primary/30",
      )}
    >
      {label}
    </div>
  );
}
