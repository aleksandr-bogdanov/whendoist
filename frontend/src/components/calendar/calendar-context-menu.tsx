import { useQueryClient } from "@tanstack/react-query";
import { CalendarX2, Check, FastForward, Pencil, Trash2, Undo2 } from "lucide-react";
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  batchDelete,
  batchSkipInstances,
  batchToggleCompleteAll,
  batchUnscheduleAll,
  deduplicateInstances,
  findPendingInstancesForTasks,
} from "@/lib/batch-mutations";
import { resolveSelection, useSelectionStore } from "@/stores/selection-store";

/* ─── Types ──────────────────────────────────────────────── */

interface Position {
  x: number;
  y: number;
}

interface CalendarContextMenuState {
  open: boolean;
  position: Position;
  handleContextMenu: (e: React.MouseEvent) => void;
  close: () => void;
  menuRef: RefObject<HTMLDivElement | null>;
}

/**
 * Lightweight hook for right-click menus in the calendar.
 *
 * Radix ContextMenu has unresolved event-chain issues inside the
 * calendar's DnD / lasso / carousel environment — hovers work but
 * clicks on menu items silently fail in both modal and non-modal mode.
 *
 * This hook manages a plain portal-rendered menu with simple buttons,
 * avoiding Radix's DismissableLayer / FocusScope / pointer-events
 * overrides entirely.
 */
export function useCalendarContextMenu(): CalendarContextMenuState {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => setOpen(false), []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPosition({ x: e.clientX, y: e.clientY });
    setOpen(true);
  }, []);

  // Close on click outside, Escape, or scroll
  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    const handleScroll = () => setOpen(false);

    // Use setTimeout(0) so the opening right-click doesn't immediately dismiss
    const timerId = window.setTimeout(() => {
      document.addEventListener("pointerdown", handlePointerDown, { capture: true });
      document.addEventListener("keydown", handleKeyDown, { capture: true });
      window.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    }, 0);

    return () => {
      window.clearTimeout(timerId);
      document.removeEventListener("pointerdown", handlePointerDown, { capture: true });
      document.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.removeEventListener("scroll", handleScroll, { capture: true });
    };
  }, [open]);

  return { open, position, handleContextMenu, close, menuRef };
}

/* ─── Menu container (portal) ────────────────────────────── */

interface CalendarContextMenuPortalProps {
  state: CalendarContextMenuState;
  children: ReactNode;
}

/**
 * Renders the context menu content in a portal positioned at the cursor.
 * Matches the visual style of shadcn/Radix context menus.
 */
export function CalendarContextMenuPortal({ state, children }: CalendarContextMenuPortalProps) {
  const { open, position, menuRef } = state;

  if (!open) return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-50 min-w-[160px] origin-top-left animate-in fade-in-0 zoom-in-95 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      style={{ left: position.x, top: position.y }}
      // Prevent this menu from triggering calendar interactions underneath
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}

/* ─── Menu item ──────────────────────────────────────────── */

interface CalendarContextMenuItemProps {
  children: ReactNode;
  onSelect: () => void;
  className?: string;
}

export function CalendarContextMenuItem({
  children,
  onSelect,
  className = "",
}: CalendarContextMenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`relative flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 ${className}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {children}
    </button>
  );
}

/* ─── Separator ──────────────────────────────────────────── */

export function CalendarContextMenuSeparator() {
  return <hr className="bg-border -mx-1 my-1 h-px border-0" />;
}

/* ─── Batch menu items (calendar-specific) ───────────────── */

interface CalendarBatchMenuItemsProps {
  close: () => void;
}

/**
 * Batch action items for multi-selected calendar tasks/instances.
 * Uses the same logic as BatchContextMenuItems but renders with
 * CalendarContextMenuItem instead of Radix's ContextMenuItem.
 *
 * Omits the Reschedule sub-menu (date picker) since that requires
 * Radix sub-menu support. Users can use the floating action bar.
 */
export function CalendarBatchMenuItems({ close }: CalendarBatchMenuItemsProps) {
  const { t } = useTranslation();
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const clearSelection = useSelectionStore((s) => s.clear);
  const queryClient = useQueryClient();

  const { tasks, instances } = useMemo(
    () => resolveSelection(queryClient, selectedIds),
    [selectedIds, queryClient],
  );

  const count = tasks.length + instances.length;
  const noun = count === 1 ? t("common.item") : t("common.items");
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
    const nonRecurring = taskTargets.filter((t) => !t.is_recurring);
    const recurring = taskTargets.filter((t) => t.is_recurring);
    const pendingInstances = findPendingInstancesForTasks(queryClient, recurring);
    const allInstances = deduplicateInstances([...instanceTargets, ...pendingInstances]);
    batchToggleCompleteAll(queryClient, nonRecurring, allInstances, completing);
    clearSelection();
    close();
  }, [tasks, instances, allCompleted, queryClient, clearSelection, close]);

  const handleReopen = useCallback(() => {
    const completedTasks = tasks.filter((t) => t.status === "completed" || !!t.completed_at);
    const completedInstances = instances.filter((i) => i.status === "completed");
    const nonRecurring = completedTasks.filter((t) => !t.is_recurring);
    batchToggleCompleteAll(queryClient, nonRecurring, completedInstances, false);
    clearSelection();
    close();
  }, [tasks, instances, queryClient, clearSelection, close]);

  const handleUnschedule = useCallback(() => {
    const scheduledTasks = tasks.filter((t) => t.scheduled_date != null && !t.is_recurring);
    const scheduledInstances = instances.filter((i) => i.scheduled_datetime != null);
    batchUnscheduleAll(queryClient, scheduledTasks, scheduledInstances);
    clearSelection();
    close();
  }, [tasks, instances, queryClient, clearSelection, close]);

  const handleSkip = useCallback(() => {
    batchSkipInstances(queryClient, instances);
    clearSelection();
    close();
  }, [instances, queryClient, clearSelection, close]);

  const handleDelete = useCallback(() => {
    const subtaskCount = tasks.reduce((sum, t) => sum + (t.subtasks?.length ?? 0), 0);
    if (subtaskCount > 0) {
      if (
        !window.confirm(
          t("task.deleteDialog.batchMessage", { taskCount: tasks.length, subtaskCount }),
        )
      )
        return;
    } else if (tasks.length > 3) {
      if (!window.confirm(t("task.deleteDialog.batchSimple", { count: tasks.length }))) return;
    }
    batchDelete(queryClient, tasks);
    clearSelection();
    close();
  }, [tasks, queryClient, clearSelection, close, t]);

  if (count === 0) return null;

  return (
    <>
      <CalendarContextMenuItem onSelect={handleComplete}>
        <Check className="h-3.5 w-3.5 mr-2" />
        {allCompleted ? t("batch.reopen") : t("batch.complete")} {count} {noun}
      </CalendarContextMenuItem>
      {anyCompleted && !allCompleted && (
        <CalendarContextMenuItem onSelect={handleReopen}>
          <Undo2 className="h-3.5 w-3.5 mr-2" />
          {t("batch.reopenCompleted")}
        </CalendarContextMenuItem>
      )}
      <CalendarContextMenuSeparator />
      {anyScheduled && (
        <CalendarContextMenuItem onSelect={handleUnschedule}>
          <CalendarX2 className="h-3.5 w-3.5 mr-2" />
          {t("batch.unschedule")}
        </CalendarContextMenuItem>
      )}
      <CalendarContextMenuItem
        onSelect={() => {
          close();
          window.dispatchEvent(new Event("open-batch-edit"));
        }}
      >
        <Pencil className="h-3.5 w-3.5 mr-2" />
        {t("batch.editMore")}
      </CalendarContextMenuItem>
      <CalendarContextMenuSeparator />
      {hasInstances && (
        <CalendarContextMenuItem onSelect={handleSkip}>
          <FastForward className="h-3.5 w-3.5 mr-2" />
          {t("batch.skipInstances")} {instances.length}{" "}
          {instances.length === 1 ? t("common.instance") : t("common.instances")}
        </CalendarContextMenuItem>
      )}
      {hasTasks && (
        <CalendarContextMenuItem
          onSelect={handleDelete}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5 mr-2" />
          {t("batch.delete")} {tasks.length}{" "}
          {tasks.length === 1 ? t("common.task") : t("common.tasks")}
        </CalendarContextMenuItem>
      )}
    </>
  );
}
