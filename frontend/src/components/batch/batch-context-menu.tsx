import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CalendarX2, Check, Pencil, Trash2, Undo2 } from "lucide-react";
import { useCallback, useMemo } from "react";
import type { TaskResponse } from "@/api/model";
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
  batchReschedule,
  batchToggleComplete,
  batchUnschedule,
} from "@/lib/batch-mutations";
import { dashboardTasksKey } from "@/lib/query-keys";
import { useSelectionStore } from "@/stores/selection-store";

/** Dismiss the Radix ContextMenu by dispatching Escape (used after date picker selection) */
function dismissContextMenu() {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
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

  const tasks = useMemo(() => {
    const cached = queryClient.getQueryData<TaskResponse[]>(dashboardTasksKey()) ?? [];
    const result: TaskResponse[] = [];
    for (const id of selectedIds) {
      if (id.startsWith("task-")) {
        const taskId = Number(id.slice(5));
        const task = cached.find((t) => t.id === taskId);
        if (task) result.push(task);
      }
    }
    return result;
  }, [selectedIds, queryClient]);

  const count = selectedIds.size;
  const noun = count === 1 ? "item" : "items";
  const allCompleted =
    tasks.length > 0 && tasks.every((t) => t.status === "completed" || !!t.completed_at);
  const anyCompleted = tasks.some((t) => t.status === "completed" || !!t.completed_at);
  const anyScheduled = tasks.some((t) => t.scheduled_date != null);

  const handleComplete = useCallback(async () => {
    const completing = !allCompleted;
    const targets = completing
      ? tasks.filter((t) => t.status !== "completed" && !t.completed_at)
      : tasks;
    await batchToggleComplete(queryClient, targets, completing);
    clear();
  }, [tasks, allCompleted, queryClient, clear]);

  const handleReopen = useCallback(async () => {
    const completed = tasks.filter((t) => t.status === "completed" || !!t.completed_at);
    await batchToggleComplete(queryClient, completed, false);
    clear();
  }, [tasks, queryClient, clear]);

  const handleUnschedule = useCallback(async () => {
    const scheduled = tasks.filter((t) => t.scheduled_date != null);
    await batchUnschedule(queryClient, scheduled);
    clear();
  }, [tasks, queryClient, clear]);

  const handleReschedule = useCallback(
    async (date: Date | undefined) => {
      if (!date) return;
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, "0");
      const dd = String(date.getDate()).padStart(2, "0");
      const dateStr = `${yyyy}-${mm}-${dd}`;
      await batchReschedule(queryClient, tasks, dateStr);
      clear();
      // Dismiss the context menu (Calendar clicks don't auto-close like ContextMenuItem)
      dismissContextMenu();
    },
    [tasks, queryClient, clear],
  );

  const handleDelete = useCallback(async () => {
    if (
      tasks.length > 3 &&
      !window.confirm(`Delete ${tasks.length} ${noun}? This can be undone.`)
    ) {
      return;
    }
    await batchDelete(queryClient, tasks);
    clear();
  }, [tasks, noun, queryClient, clear]);

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

      {/* Edit — placeholder for Phase 5 */}
      <ContextMenuItem disabled>
        <Pencil className="h-3.5 w-3.5 mr-2" />
        Edit{"\u2026"}
      </ContextMenuItem>

      <ContextMenuSeparator />

      {/* Delete */}
      <ContextMenuItem onSelect={handleDelete} className="text-destructive focus:text-destructive">
        <Trash2 className="h-3.5 w-3.5 mr-2" />
        Delete {count} {noun}
      </ContextMenuItem>
    </>
  );
}
