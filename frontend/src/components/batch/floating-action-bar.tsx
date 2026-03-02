import { useQueryClient } from "@tanstack/react-query";
import { CalendarX2, Check, Pencil, Trash2, Undo2, X } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { TaskResponse } from "@/api/model";
import { BatchEditForm } from "@/components/batch/batch-edit-popover";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { batchDelete, batchToggleComplete, batchUnschedule } from "@/lib/batch-mutations";
import { dashboardTasksKey } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { useSelectionStore } from "@/stores/selection-store";

/* ------------------------------------------------------------------ */
/*  FloatingActionBar                                                  */
/* ------------------------------------------------------------------ */

export function FloatingActionBar() {
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const clear = useSelectionStore((s) => s.clear);
  const queryClient = useQueryClient();
  const count = selectedIds.size;

  /* ---- Resolve selected IDs → TaskResponse objects from cache ---- */
  const tasks = useMemo(() => {
    if (count === 0) return [];
    const cached = queryClient.getQueryData<TaskResponse[]>(dashboardTasksKey()) ?? [];
    const result: TaskResponse[] = [];
    for (const id of selectedIds) {
      if (id.startsWith("task-")) {
        const taskId = Number(id.slice(5));
        const task = cached.find((t) => t.id === taskId);
        if (task) result.push(task);
      }
      // Instance support deferred to later phases
    }
    return result;
  }, [selectedIds, count, queryClient]);

  /* ---- Contextual visibility (per §2 table) ---- */
  const allCompleted =
    tasks.length > 0 && tasks.every((t) => t.status === "completed" || !!t.completed_at);
  const anyScheduled = tasks.some((t) => t.scheduled_date != null);

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

  /* ---- Batch edit popover state ---- */
  const [editOpen, setEditOpen] = useState(false);

  // Allow context menu to open the edit popover via custom event
  useEffect(() => {
    const handler = () => setEditOpen(true);
    window.addEventListener("open-batch-edit", handler);
    return () => window.removeEventListener("open-batch-edit", handler);
  }, []);

  // Close popover when selection is cleared
  useEffect(() => {
    if (count === 0) setEditOpen(false);
  }, [count]);

  /* ---- Handlers ---- */
  const handleComplete = useCallback(async () => {
    const completing = !allCompleted;
    // If mixed selection, only complete the pending ones
    const targets = completing
      ? tasks.filter((t) => t.status !== "completed" && !t.completed_at)
      : tasks;
    await batchToggleComplete(queryClient, targets, completing);
    clear();
  }, [tasks, allCompleted, queryClient, clear]);

  const handleUnschedule = useCallback(async () => {
    const scheduled = tasks.filter((t) => t.scheduled_date != null);
    await batchUnschedule(queryClient, scheduled);
    clear();
  }, [tasks, queryClient, clear]);

  const handleDelete = useCallback(async () => {
    if (tasks.length > 3 && !window.confirm(`Delete ${tasks.length} tasks? This can be undone.`)) {
      return;
    }
    await batchDelete(queryClient, tasks);
    clear();
  }, [tasks, queryClient, clear]);

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

        {/* Count label */}
        <span className="px-1.5 text-muted-foreground font-medium tabular-nums whitespace-nowrap">
          {count} selected
        </span>

        <Divider />

        {/* Complete / Reopen */}
        <ActionButton
          icon={allCompleted ? Undo2 : Check}
          label={allCompleted ? "Reopen" : "Complete"}
          onClick={handleComplete}
        />

        {/* Unschedule — hidden if all completed or none scheduled */}
        {!allCompleted && anyScheduled && (
          <ActionButton icon={CalendarX2} label="Unschedule" onClick={handleUnschedule} />
        )}

        {/* Edit… — opens batch edit popover */}
        <Popover open={editOpen} onOpenChange={setEditOpen}>
          <PopoverTrigger asChild>
            <ActionButton icon={Pencil} label="Edit\u2026" onClick={() => setEditOpen(true)} />
          </PopoverTrigger>
          <PopoverContent side="top" sideOffset={8} className="w-72">
            <BatchEditForm
              tasks={tasks}
              onDone={() => {
                setEditOpen(false);
                clear();
              }}
            />
          </PopoverContent>
        </Popover>

        <Divider />

        {/* Delete */}
        <ActionButton icon={Trash2} label="Delete" onClick={handleDelete} destructive />
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
