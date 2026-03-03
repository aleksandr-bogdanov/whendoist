import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  CalendarX2,
  Check,
  FastForward,
  Pencil,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BatchEditForm } from "@/components/batch/batch-edit-popover";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  batchDelete,
  batchRescheduleAll,
  batchSkipInstances,
  batchToggleCompleteAll,
  batchUnscheduleAll,
  deduplicateInstances,
  findPendingInstancesForTasks,
} from "@/lib/batch-mutations";
import { cn } from "@/lib/utils";
import { resolveSelection, useSelectionStore } from "@/stores/selection-store";

/* ------------------------------------------------------------------ */
/*  FloatingActionBar                                                  */
/* ------------------------------------------------------------------ */

export function FloatingActionBar() {
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const clear = useSelectionStore((s) => s.clear);
  const queryClient = useQueryClient();
  const count = selectedIds.size;

  /* ---- Resolve selected IDs → tasks + instances from cache ---- */
  const { tasks, instances } = useMemo(
    () => resolveSelection(queryClient, selectedIds),
    [selectedIds, queryClient],
  );

  const hasInstances = instances.length > 0;
  const hasTasks = tasks.length > 0;

  /* ---- Contextual visibility ---- */
  const allTasksCompleted =
    tasks.length > 0 && tasks.every((t) => t.status === "completed" || !!t.completed_at);
  const allInstancesCompleted =
    instances.length > 0 && instances.every((i) => i.status === "completed");
  const allCompleted =
    (hasTasks || hasInstances) &&
    (!hasTasks || allTasksCompleted) &&
    (!hasInstances || allInstancesCompleted);
  const anyScheduled =
    tasks.some((t) => t.scheduled_date != null) ||
    instances.some((i) => i.scheduled_datetime != null);

  /* ---- Slide-up / slide-down animation ---- */
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (count > 0) {
      setMounted(true);
      // Double rAF: ensure DOM is painted before triggering CSS transition
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
      return () => cancelAnimationFrame(id);
    }
    setVisible(false);
    const timer = setTimeout(() => setMounted(false), 200);
    return () => clearTimeout(timer);
  }, [count]);

  /* ---- Batch edit & reschedule popover state ---- */
  const [editOpen, setEditOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  // Allow context menu to open the edit popover via custom event
  useEffect(() => {
    const handler = () => setEditOpen(true);
    window.addEventListener("open-batch-edit", handler);
    return () => window.removeEventListener("open-batch-edit", handler);
  }, []);

  // Close popovers when selection is cleared
  useEffect(() => {
    if (count === 0) {
      setEditOpen(false);
      setRescheduleOpen(false);
    }
  }, [count]);

  /* ---- Handlers (fire-and-forget: optimistic update + toast shown instantly) ---- */
  const handleComplete = useCallback(() => {
    const completing = !allCompleted;
    const taskTargets = completing
      ? tasks.filter((t) => t.status !== "completed" && !t.completed_at)
      : tasks;
    const instanceTargets = completing
      ? instances.filter((i) => i.status !== "completed")
      : instances;
    // Recurring tasks in the task list need their pending instances completed, not the parent
    const nonRecurring = taskTargets.filter((t) => !t.is_recurring);
    const recurring = taskTargets.filter((t) => t.is_recurring);
    const pendingInstances = findPendingInstancesForTasks(queryClient, recurring);
    // Deduplicate: user may have selected both a recurring parent and its pending instance
    const allInstances = deduplicateInstances([...instanceTargets, ...pendingInstances]);
    batchToggleCompleteAll(queryClient, nonRecurring, allInstances, completing);
    clear();
  }, [tasks, instances, allCompleted, queryClient, clear]);

  const handleUnschedule = useCallback(() => {
    // Recurring tasks can't be unscheduled (schedule is part of recurrence), filter them out
    const scheduledTasks = tasks.filter((t) => t.scheduled_date != null && !t.is_recurring);
    const scheduledInstances = instances.filter((i) => i.scheduled_datetime != null);
    batchUnscheduleAll(queryClient, scheduledTasks, scheduledInstances);
    clear();
  }, [tasks, instances, queryClient, clear]);

  const handleDelete = useCallback(() => {
    const subtaskCount = tasks.reduce((sum, t) => sum + (t.subtasks?.length ?? 0), 0);
    if (subtaskCount > 0) {
      if (!window.confirm(`Delete ${tasks.length} tasks and ${subtaskCount} subtasks?`)) return;
    } else if (tasks.length > 3) {
      if (!window.confirm(`Delete ${tasks.length} tasks?`)) return;
    }
    batchDelete(queryClient, tasks);
    clear();
  }, [tasks, queryClient, clear]);

  const handleReschedule = useCallback(
    (date: Date | undefined) => {
      if (!date) return;
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, "0");
      const dd = String(date.getDate()).padStart(2, "0");
      const dateStr = `${yyyy}-${mm}-${dd}`;
      // Recurring tasks can't be rescheduled at the parent level, filter them out
      const nonRecurringTasks = tasks.filter((t) => !t.is_recurring);
      batchRescheduleAll(queryClient, nonRecurringTasks, instances, dateStr);
      setRescheduleOpen(false);
      clear();
    },
    [tasks, instances, queryClient, clear],
  );

  const handleSkip = useCallback(() => {
    batchSkipInstances(queryClient, instances);
    clear();
  }, [instances, queryClient, clear]);

  if (!mounted) return null;

  return (
    <div
      className={cn(
        // Positioning: centered, above mobile nav on small screens
        "fixed left-1/2 -translate-x-1/2 z-[45]",
        "bottom-[calc(env(safe-area-inset-bottom,0px)+var(--nav-pill-mb)+var(--nav-pill-height)+0.75rem)]",
        "md:bottom-6",
        // Animation
        "transition-all duration-200 ease-out",
        visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0 pointer-events-none",
      )}
    >
      <div className="flex items-center gap-0.5 rounded-xl border bg-background/95 backdrop-blur-sm shadow-lg px-1.5 py-1 text-sm">
        {/* Close */}
        <button
          type="button"
          onClick={clear}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
          aria-label="Clear selection"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Count label — use resolved count so stale/deleted IDs don't inflate the number */}
        <span className="px-1.5 text-muted-foreground font-medium tabular-nums whitespace-nowrap">
          {tasks.length + instances.length} selected
        </span>

        <Divider />

        {/* Complete / Reopen */}
        <ActionButton
          icon={allCompleted ? Undo2 : Check}
          label={allCompleted ? "Reopen" : "Complete"}
          onClick={handleComplete}
        />

        {/* Reschedule — date picker popover */}
        {!allCompleted && (
          <Popover open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
            <PopoverTrigger asChild>
              <ActionButton
                icon={CalendarDays}
                label="Reschedule"
                onClick={() => setRescheduleOpen(true)}
              />
            </PopoverTrigger>
            <PopoverContent side="top" avoidCollisions sideOffset={8} className="w-auto p-0">
              <Calendar mode="single" onSelect={handleReschedule} defaultMonth={new Date()} />
            </PopoverContent>
          </Popover>
        )}

        {/* Unschedule — hidden if all completed or none scheduled */}
        {!allCompleted && anyScheduled && (
          <ActionButton icon={CalendarX2} label="Unschedule" onClick={handleUnschedule} />
        )}

        {/* Edit… — opens batch edit popover */}
        <Popover open={editOpen} onOpenChange={setEditOpen}>
          <PopoverTrigger asChild>
            <ActionButton icon={Pencil} label="Edit…" onClick={() => setEditOpen(true)} />
          </PopoverTrigger>
          <PopoverContent side="top" avoidCollisions sideOffset={8} className="w-72">
            <BatchEditForm
              tasks={tasks}
              instanceCount={instances.length}
              onDone={() => {
                setEditOpen(false);
                clear();
              }}
            />
          </PopoverContent>
        </Popover>

        <Divider />

        {/* Skip — only when instances are selected */}
        {hasInstances && <ActionButton icon={FastForward} label="Skip" onClick={handleSkip} />}

        {/* Delete — tasks only (instances can't be deleted) */}
        {hasTasks && (
          <ActionButton icon={Trash2} label="Delete" onClick={handleDelete} destructive />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ActionButton                                                       */
/* ------------------------------------------------------------------ */

const ActionButton = React.forwardRef<
  HTMLButtonElement,
  {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    onClick: () => void;
    destructive?: boolean;
    disabled?: boolean;
  }
>(({ icon: Icon, label, onClick, destructive, disabled, ...props }, ref) => {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
        "hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed",
        destructive && "text-destructive hover:bg-destructive/10",
      )}
      {...props}
    >
      <Icon className="h-4 w-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
});
ActionButton.displayName = "ActionButton";

/* ------------------------------------------------------------------ */
/*  Divider                                                            */
/* ------------------------------------------------------------------ */

function Divider() {
  return <div className="w-px h-5 bg-border mx-0.5" />;
}
