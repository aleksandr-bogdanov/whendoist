import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CalendarX2, Check, FastForward, Pencil, Trash2, Undo2 } from "lucide-react";
import { useCallback, useMemo } from "react";
import { Calendar } from "@/components/ui/calendar";
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import {
  batchDelete,
  batchRescheduleAll,
  batchSkipInstances,
  batchToggleCompleteAll,
  batchUnscheduleAll,
  deduplicateInstances,
  findPendingInstancesForTasks,
} from "@/lib/batch-mutations";
import { resolveSelection, useSelectionStore } from "@/stores/selection-store";

/** Dismiss the Radix ContextMenu programmatically (used after date picker selection).
 *  Targets the Radix content element directly so the Escape event is processed by
 *  Radix's capture-phase handler (which calls preventDefault), preventing the global
 *  selection-clear listener from firing. */
function dismissContextMenu() {
  const content = document.querySelector<HTMLElement>("[data-slot='context-menu-content']");
  const target = content ?? document;
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
  );
}

/**
 * Batch context menu items — renders inside a <ContextMenuContent>.
 * Reads the selection from useSelectionStore and resolves tasks from TQ cache.
 *
 * ContextMenuItem actions auto-close the Radix menu via onSelect.
 * The Reschedule date picker uses dismissContextMenu() since it's not a ContextMenuItem.
 */
export function BatchContextMenuItems() {
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const clear = useSelectionStore((s) => s.clear);
  const queryClient = useQueryClient();

  const { tasks, instances } = useMemo(
    () => resolveSelection(queryClient, selectedIds),
    [selectedIds, queryClient],
  );

  const count = selectedIds.size;
  const noun = count === 1 ? "item" : "items";
  const hasInstances = instances.length > 0;
  const hasTasks = tasks.length > 0;
  const allTasksCompleted =
    tasks.length > 0 && tasks.every((t) => t.status === "completed" || !!t.completed_at);
  const allInstancesCompleted =
    instances.length > 0 && instances.every((i) => i.status === "completed");
  const allCompleted =
    (hasTasks || hasInstances) &&
    (!hasTasks || allTasksCompleted) &&
    (!hasInstances || allInstancesCompleted);
  const anyCompleted =
    tasks.some((t) => t.status === "completed" || !!t.completed_at) ||
    instances.some((i) => i.status === "completed");
  const anyScheduled =
    tasks.some((t) => t.scheduled_date != null) ||
    instances.some((i) => i.scheduled_datetime != null);

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

  const handleReopen = useCallback(() => {
    const completedTasks = tasks.filter((t) => t.status === "completed" || !!t.completed_at);
    const completedInstances = instances.filter((i) => i.status === "completed");
    // Recurring tasks: reopen doesn't apply to parent (it was never completed), skip them
    const nonRecurring = completedTasks.filter((t) => !t.is_recurring);
    batchToggleCompleteAll(queryClient, nonRecurring, completedInstances, false);
    clear();
  }, [tasks, instances, queryClient, clear]);

  const handleUnschedule = useCallback(() => {
    // Recurring tasks can't be unscheduled (schedule is part of recurrence), filter them out
    const scheduledTasks = tasks.filter((t) => t.scheduled_date != null && !t.is_recurring);
    const scheduledInstances = instances.filter((i) => i.scheduled_datetime != null);
    batchUnscheduleAll(queryClient, scheduledTasks, scheduledInstances);
    clear();
  }, [tasks, instances, queryClient, clear]);

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
      clear();
      dismissContextMenu();
    },
    [tasks, instances, queryClient, clear],
  );

  const handleSkip = useCallback(() => {
    batchSkipInstances(queryClient, instances);
    clear();
  }, [instances, queryClient, clear]);

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

  if (count === 0) return null;

  return (
    <>
      {/* Complete / Reopen */}
      <ContextMenuItem onSelect={handleComplete}>
        <Check className="h-3.5 w-3.5 mr-2" />
        {allCompleted ? "Reopen" : "Complete"} {count} {noun}
      </ContextMenuItem>
      {anyCompleted && !allCompleted && (
        <ContextMenuItem onSelect={handleReopen}>
          <Undo2 className="h-3.5 w-3.5 mr-2" />
          Reopen completed
        </ContextMenuItem>
      )}

      <ContextMenuSeparator />

      {/* Reschedule — date picker submenu */}
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <CalendarDays className="h-3.5 w-3.5 mr-2" />
          Reschedule{"\u2026"}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="p-0 min-w-0">
          <Calendar mode="single" onSelect={handleReschedule} defaultMonth={new Date()} />
        </ContextMenuSubContent>
      </ContextMenuSub>

      {/* Unschedule — only if any are scheduled */}
      {anyScheduled && (
        <ContextMenuItem onSelect={handleUnschedule}>
          <CalendarX2 className="h-3.5 w-3.5 mr-2" />
          Unschedule
        </ContextMenuItem>
      )}

      <ContextMenuSeparator />

      {/* Edit — opens batch edit popover (anchored in FloatingActionBar) */}
      <ContextMenuItem
        onSelect={() => {
          window.dispatchEvent(new Event("open-batch-edit"));
        }}
      >
        <Pencil className="h-3.5 w-3.5 mr-2" />
        Edit{"\u2026"}
      </ContextMenuItem>

      <ContextMenuSeparator />

      {/* Skip — only when instances are in selection */}
      {hasInstances && (
        <ContextMenuItem onSelect={handleSkip}>
          <FastForward className="h-3.5 w-3.5 mr-2" />
          Skip {instances.length} {instances.length === 1 ? "instance" : "instances"}
        </ContextMenuItem>
      )}

      {/* Delete — tasks only (instances can't be deleted) */}
      {hasTasks && (
        <ContextMenuItem
          onSelect={handleDelete}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5 mr-2" />
          Delete {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
        </ContextMenuItem>
      )}
    </>
  );
}
