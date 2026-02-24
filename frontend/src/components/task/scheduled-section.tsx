import { useDroppable } from "@dnd-kit/core";
import { AlertTriangle, CalendarClock, ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";
import type { InstanceResponse, TaskResponse } from "@/api/model";
import { useListInstancesApiV1InstancesGet } from "@/api/queries/instances/instances";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { todayString } from "@/lib/calendar-utils";
import { groupScheduledByDate } from "@/lib/task-utils";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { TaskItem } from "./task-item";

interface ScheduledSectionProps {
  tasks: TaskResponse[];
  onSelectTask?: (taskId: number) => void;
  onEditTask?: (task: TaskResponse) => void;
}

export function ScheduledSection({ tasks, onSelectTask, onEditTask }: ScheduledSectionProps) {
  const { showScheduled, toggleShowScheduled } = useUIStore();

  const today = todayString();

  // Fetch instances for ALL recurring tasks (single query, not N+1)
  // Range: min(oldest scheduled date, today) → 30 days out, so we cover overdue + upcoming
  const hasAnyRecurring = tasks.some((t) => t.is_recurring);
  const oldestScheduledDate = useMemo(() => {
    let oldest: string | null = null;
    for (const t of tasks) {
      if (t.scheduled_date && (!oldest || t.scheduled_date < oldest)) {
        oldest = t.scheduled_date;
      }
    }
    return oldest;
  }, [tasks]);
  const futureDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  }, []);
  const instanceStartDate =
    oldestScheduledDate && oldestScheduledDate < today ? oldestScheduledDate : today;
  const instancesQuery = useListInstancesApiV1InstancesGet(
    { start_date: instanceStartDate, end_date: futureDate },
    { query: { enabled: hasAnyRecurring } },
  );

  // Map task_id → earliest pending instance (for checkbox, skip, complete actions)
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

  // Split date groups into overdue (past) and upcoming (today + future)
  // For recurring tasks, override scheduled_date with instance date so they appear in the right group
  const { overdueGroups, upcomingGroups } = useMemo(() => {
    const adjustedTasks = tasks.map((t) => {
      if (t.is_recurring) {
        const inst = pendingInstanceMap.get(t.id);
        if (inst) {
          return { ...t, scheduled_date: inst.instance_date };
        }
      }
      return t;
    });
    const dateGroups = groupScheduledByDate(adjustedTasks);
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
  }, [tasks, today, pendingInstanceMap]);

  // Set of recurring task IDs that have a pending instance in the past
  const recurringWithPastPending = useMemo(() => {
    const set = new Set<number>();
    const instances = instancesQuery.data ?? [];
    for (const inst of instances) {
      if (inst.status === "pending" && inst.instance_date < today) {
        set.add(inst.task_id);
      }
    }
    return set;
  }, [instancesQuery.data, today]);

  // Filter overdue groups: exclude recurring tasks with no pending past instances
  const filteredOverdueGroups = useMemo(() => {
    const result: typeof overdueGroups = [];
    for (const group of overdueGroups) {
      const filtered = group.tasks.filter(
        (t) => !t.is_recurring || recurringWithPastPending.has(t.id),
      );
      if (filtered.length > 0) {
        result.push({ ...group, tasks: filtered });
      }
    }
    return result;
  }, [overdueGroups, recurringWithPastPending]);

  if (tasks.length === 0) return null;

  const overdueCount = filteredOverdueGroups.reduce((sum, g) => sum + g.tasks.length, 0);

  return (
    <Collapsible open={showScheduled} onOpenChange={toggleShowScheduled}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2 px-3 py-2 text-sm font-medium",
            "rounded-md hover:bg-[rgba(109,94,246,0.04)] transition-colors",
            "border-t border-border/50 mt-6 pt-4",
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
          {filteredOverdueGroups.length > 0 && (
            <div className="rounded-md bg-destructive/5 border border-destructive/15 py-1">
              <div className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-destructive">
                <AlertTriangle className="h-3 w-3" />
                Overdue
                <span className="text-destructive/60 font-normal tabular-nums">{overdueCount}</span>
              </div>
              {filteredOverdueGroups.map((group) => (
                <DateGroupDropZone
                  key={group.date}
                  date={group.date}
                  label={group.label}
                  variant="overdue"
                >
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
                </DateGroupDropZone>
              ))}
            </div>
          )}

          {/* Upcoming scheduled tasks (today + future) */}
          {upcomingGroups.map((group) => {
            const isToday = group.date === today;
            return (
              <DateGroupDropZone
                key={group.date}
                date={group.date}
                label={group.label}
                variant={isToday ? "today" : "default"}
              >
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
              </DateGroupDropZone>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Droppable Date Group Wrapper ─────────────────────────────────────────────
// Wraps the entire date group (header + tasks) so dropping anywhere in the group
// reschedules the task to that date — collision detection gives date-group-*
// priority over task-drop-* (reparent), preventing accidental subtask creation.

function DateGroupDropZone({
  date,
  label,
  variant,
  children,
}: {
  date: string;
  label: string;
  variant: "overdue" | "today" | "default";
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `date-group-${date}`,
    data: { type: "date-group", dateStr: date },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-sm transition-colors",
        isOver && "bg-primary/10 ring-1 ring-primary/30",
      )}
    >
      <div
        className={cn(
          "px-3 py-1 text-xs font-medium",
          variant === "overdue" && "text-destructive/70 text-[11px] py-0.5",
          variant === "today" && "text-primary",
          variant === "default" && "text-muted-foreground",
        )}
      >
        {label}
      </div>
      {children}
    </div>
  );
}
