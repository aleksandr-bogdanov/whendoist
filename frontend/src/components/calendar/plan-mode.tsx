import { useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, Loader2, Sparkles } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import type { AppRoutersTasksTaskResponse, EventResponse } from "@/api/model";
import {
  getListTasksApiV1TasksGetQueryKey,
  useUpdateTaskApiV1TasksTaskIdPut,
} from "@/api/queries/tasks/tasks";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatTime, type PlannedTask, planTasks } from "@/lib/calendar-utils";
import { filterByEnergy } from "@/lib/task-utils";
import { useUIStore } from "@/stores/ui-store";

interface PlanModeProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tasks: AppRoutersTasksTaskResponse[];
  events: EventResponse[];
  centerDate: string;
}

export function PlanMode({ open, onOpenChange, tasks, events, centerDate }: PlanModeProps) {
  const { energyLevel } = useUIStore();
  const queryClient = useQueryClient();
  const updateTask = useUpdateTaskApiV1TasksTaskIdPut();
  const [isCommitting, setIsCommitting] = useState(false);

  // Filter to unscheduled, pending tasks matching energy level
  const eligibleTasks = useMemo(() => {
    const unscheduled = tasks.filter(
      (t) =>
        !t.scheduled_date && !t.completed_at && t.status !== "completed" && t.parent_id === null,
    );
    return filterByEnergy(unscheduled, energyLevel);
  }, [tasks, energyLevel]);

  // Compute planned schedule
  const planned = useMemo(() => {
    if (!open) return [];
    return planTasks(eligibleTasks, events, centerDate);
  }, [open, eligibleTasks, events, centerDate]);

  const handleConfirm = useCallback(async () => {
    if (planned.length === 0) return;
    setIsCommitting(true);

    let successCount = 0;
    let failCount = 0;

    for (const p of planned) {
      const timeStr = `${String(p.scheduledHour).padStart(2, "0")}:${String(p.scheduledMinutes).padStart(2, "0")}`;
      try {
        await updateTask.mutateAsync({
          taskId: p.taskId,
          data: {
            scheduled_date: centerDate,
            scheduled_time: timeStr,
          },
        });
        successCount++;
      } catch {
        failCount++;
      }
    }

    await queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
    setIsCommitting(false);
    onOpenChange(false);

    if (failCount === 0) {
      toast.success(`Scheduled ${successCount} tasks`);
    } else {
      toast.warning(`Scheduled ${successCount} tasks, ${failCount} failed`);
    }
  }, [planned, centerDate, updateTask, queryClient, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Plan My Day
          </DialogTitle>
          <DialogDescription>
            Auto-schedule {eligibleTasks.length} unscheduled tasks into free time slots for{" "}
            {centerDate}.
          </DialogDescription>
        </DialogHeader>

        {planned.length > 0 ? (
          <div className="max-h-64 overflow-auto space-y-1">
            {planned.map((p) => (
              <PlanPreviewRow key={p.taskId} item={p} />
            ))}
          </div>
        ) : (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {eligibleTasks.length === 0
              ? "No unscheduled tasks to plan."
              : "No free time slots available for the selected day."}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isCommitting}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={planned.length === 0 || isCommitting}>
            {isCommitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                Scheduling...
              </>
            ) : (
              <>
                <CalendarCheck className="h-4 w-4 mr-1" />
                Schedule {planned.length} tasks
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlanPreviewRow({ item }: { item: PlannedTask }) {
  const timeLabel = formatTime(item.scheduledHour, item.scheduledMinutes);
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50 text-sm">
      <span className="text-xs font-mono text-muted-foreground w-20 flex-shrink-0">
        {timeLabel}
      </span>
      <span className="truncate">{item.title}</span>
      <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
        {item.durationMinutes}m
      </span>
    </div>
  );
}
