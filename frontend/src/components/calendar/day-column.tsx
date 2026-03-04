import { useDndMonitor, useDraggable } from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarOff, Check, Pencil, SkipForward } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { EventResponse, InstanceResponse, TaskResponse } from "@/api/model";
import {
  getListInstancesApiV1InstancesGetQueryKey,
  getPendingPastCountApiV1InstancesPendingPastCountGetQueryKey,
  useCompleteInstanceApiV1InstancesInstanceIdCompletePost,
  useScheduleInstanceApiV1InstancesInstanceIdSchedulePut,
  useSkipInstanceApiV1InstancesInstanceIdSkipPost,
  useUncompleteInstanceApiV1InstancesInstanceIdUncompletePost,
  useUnskipInstanceApiV1InstancesInstanceIdUnskipPost,
} from "@/api/queries/instances/instances";
import { BatchContextMenuItems } from "@/components/batch/batch-context-menu";
import { useDndState } from "@/components/task/task-dnd-context";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  applyDelta,
  type BatchItem,
  daysBetween,
  minutesToTime,
  timeToMinutes,
} from "@/lib/batch-drag-utils";
import type { PositionedItem } from "@/lib/calendar-utils";
import {
  addDays,
  CURRENT_DAY_HOURS,
  calculateExtendedOverlaps,
  durationToHeight,
  EXTENDED_TOTAL_HOURS,
  extendedTimeToOffset,
  formatTime,
  getSectionBoundaries,
  NEXT_DAY_END_HOUR,
  PREV_DAY_HOURS,
  PREV_DAY_START_HOUR,
  todayString,
} from "@/lib/calendar-utils";
import { dashboardTasksKey } from "@/lib/query-keys";
import { IMPACT_COLORS } from "@/lib/task-utils";
import { getCurrentTimeInTimezone, getHoursInTimezone, getMinutesInTimezone } from "@/lib/timezone";
import { instanceSelectionId, taskSelectionId, useSelectionStore } from "@/stores/selection-store";
import { CalendarEventCard } from "./calendar-event";
import { LassoRect, useLasso } from "./lasso-selection";
import { ScheduledTaskCard } from "./scheduled-task-card";

interface PhantomItem {
  offset: number;
  height: number;
  timeLabel: string;
  isAnchor: boolean;
}

interface DayColumnProps {
  centerDate: string;
  events: EventResponse[];
  tasks: TaskResponse[];
  /** All tasks (including anytime) — used for phantom card duration lookup during drag */
  allTasks?: TaskResponse[];
  instances: InstanceResponse[];
  hourHeight: number;
  calendarColors: Map<string, string>;
  onTaskClick?: (task: TaskResponse) => void;
  /** Whether this panel is the currently visible/active one (receives drop events) */
  isActivePanel?: boolean;
  /** Whether plan-my-day selection mode is active */
  isPlanMode?: boolean;
  /** Called when user clicks "Plan Tasks" after selecting a time range */
  onPlanExecute?: (startMinutes: number, endMinutes: number) => void;
  /** User's effective timezone (IANA string) for timezone-aware rendering */
  timezone?: string;
}

export function DayColumn({
  centerDate,
  events,
  tasks,
  allTasks,
  instances,
  hourHeight,
  calendarColors,
  onTaskClick,
  isActivePanel = false,
  isPlanMode = false,
  onPlanExecute,
  timezone,
}: DayColumnProps) {
  const queryClient = useQueryClient();
  const columnRef = useRef<HTMLDivElement>(null);
  const isToday = centerDate === todayString(timezone);
  const totalHeight = EXTENDED_TOTAL_HOURS * hourHeight;
  const boundaries = useMemo(() => getSectionBoundaries(hourHeight), [hourHeight]);

  // ── Plan mode selection state ──────────────────────────────────────────────
  const [planDragging, setPlanDragging] = useState(false);
  const planDraggingRef = useRef(false); // Ref avoids stale closure in pointer move handler
  const [planSelection, setPlanSelection] = useState<{ start: number; end: number } | null>(null);
  const planAnchorRef = useRef(0);

  // Clear selection when plan mode exits
  useEffect(() => {
    if (!isPlanMode) {
      setPlanSelection(null);
      setPlanDragging(false);
      planDraggingRef.current = false;
    }
  }, [isPlanMode]);

  const pointerToCurrentDayMinutes = useCallback(
    (e: React.PointerEvent) => {
      if (!columnRef.current) return 0;
      const rect = columnRef.current.getBoundingClientRect();
      const offsetY = e.clientY - rect.top;
      const absoluteMinutes = (offsetY / hourHeight) * 60;
      const currentDayMinutes = absoluteMinutes - PREV_DAY_HOURS * 60;
      return Math.round(currentDayMinutes / 15) * 15; // Snap to 15 min
    },
    [hourHeight],
  );

  const handlePlanPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!isPlanMode || !columnRef.current) return;
      if ((e.target as HTMLElement).closest("[data-plan-button]")) return;
      const minutes = pointerToCurrentDayMinutes(e);
      if (minutes < 0 || minutes >= 24 * 60) return;
      e.preventDefault(); // Prevent scroll interference during drag
      columnRef.current.setPointerCapture(e.pointerId);
      planDraggingRef.current = true;
      setPlanDragging(true);
      planAnchorRef.current = minutes;
      setPlanSelection({ start: minutes, end: Math.min(minutes + 15, 24 * 60) });
    },
    [isPlanMode, pointerToCurrentDayMinutes],
  );

  const handlePlanPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!planDraggingRef.current) return; // Ref is always current (no stale closure)
      const minutes = pointerToCurrentDayMinutes(e);
      const clamped = Math.max(0, Math.min(24 * 60, minutes));
      const anchor = planAnchorRef.current;
      setPlanSelection({
        start: Math.min(anchor, clamped),
        end: Math.max(anchor + 15, clamped),
      });
    },
    [pointerToCurrentDayMinutes],
  );

  const handlePlanPointerUp = useCallback(() => {
    planDraggingRef.current = false;
    setPlanDragging(false);
  }, []);

  // Day name for separators (e.g., "FRIDAY")
  const centerDayName = useMemo(() => {
    const d = new Date(`${centerDate}T00:00:00`);
    return d.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
  }, [centerDate]);

  // Positioned items across all 3 days
  const positioned = useMemo(
    () => calculateExtendedOverlaps(events, tasks, instances, centerDate, hourHeight, timezone),
    [events, tasks, instances, centerDate, hourHeight, timezone],
  );

  // Ordered selection IDs for Shift+Click range selection (sorted by visual position)
  const orderedIds = useMemo(() => {
    const sorted = [...positioned].sort((a, b) => a.top - b.top);
    return sorted.map((item) => {
      if (item.type === "instance") {
        const instId = Number(item.id.replace("inst-", ""));
        return instanceSelectionId(instId);
      }
      return taskSelectionId(Number(item.id));
    });
  }, [positioned]);

  // Lasso drag-select
  const lasso = useLasso(columnRef, isPlanMode);

  // Current time indicator — update every 60s (timezone-aware)
  const [nowTime, setNowTime] = useState(() =>
    timezone
      ? getCurrentTimeInTimezone(timezone)
      : { hours: new Date().getHours(), minutes: new Date().getMinutes() },
  );
  useEffect(() => {
    if (!isToday) return;
    // Immediate update so timezone changes reflect instantly (not after 60s)
    setNowTime(
      timezone
        ? getCurrentTimeInTimezone(timezone)
        : { hours: new Date().getHours(), minutes: new Date().getMinutes() },
    );
    const id = setInterval(() => {
      setNowTime(
        timezone
          ? getCurrentTimeInTimezone(timezone)
          : { hours: new Date().getHours(), minutes: new Date().getMinutes() },
      );
    }, 60_000);
    return () => clearInterval(id);
  }, [isToday, timezone]);

  const currentTimeOffset = isToday
    ? extendedTimeToOffset(nowTime.hours, nowTime.minutes, "current", hourHeight)
    : -1;

  const getTimeLabel = useCallback((startMinutes: number, endMinutes: number) => {
    const sh = Math.floor(startMinutes / 60);
    const sm = startMinutes % 60;
    const eh = Math.floor(endMinutes / 60);
    const em = endMinutes % 60;
    return `${formatTime(sh, sm)} - ${formatTime(eh, em)}`;
  }, []);

  // Find task by ID for click handling
  const taskMap = useMemo(() => {
    const m = new Map<string, TaskResponse>();
    for (const t of tasks) {
      m.set(String(t.id), t);
    }
    return m;
  }, [tasks]);

  // Lookup for phantom card — includes allTasks if provided (for anytime drag)
  const allTasksLookup = useMemo(() => {
    const lookup = allTasks ?? tasks;
    return lookup;
  }, [allTasks, tasks]);

  // Handle "Edit series" for recurring instances — look up parent task
  const handleEditSeries = useCallback(
    (taskId: number) => {
      // Look up the parent task from allTasks or tasks
      const parentTask = allTasksLookup.find((t) => t.id === taskId);
      if (parentTask && onTaskClick) {
        onTaskClick(parentTask);
      }
    },
    [allTasksLookup, onTaskClick],
  );

  // Track real pointer position for phantom card (bypasses dnd-kit delta which
  // includes scroll adjustment that double-counts with getBoundingClientRect)
  const lastPointerRef = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
    };
    document.addEventListener("pointermove", handler);
    return () => document.removeEventListener("pointermove", handler);
  }, []);

  // Phantom cards for drag-to-schedule preview (supports batch)
  const [phantomItems, setPhantomItems] = useState<PhantomItem[]>([]);
  const [isCalendarOver, setIsCalendarOver] = useState(false);

  // Cache resolved batch items on drag start so onDragMove doesn't re-resolve on every frame
  const batchItemsRef = useRef<{ items: BatchItem[]; anchorId: string } | null>(null);
  const { isBatchDrag } = useDndState();

  // Prev/next dates for this column (for filtering which phantoms land here)
  const prevDate = useMemo(() => addDays(centerDate, -1), [centerDate]);
  const nextDate = useMemo(() => addDays(centerDate, 1), [centerDate]);

  /** Convert a date + "HH:MM:SS" time to a pixel offset within this column, or null if out of range */
  const timeToColumnOffset = useCallback(
    (date: string, time: string): number | null => {
      const mins = timeToMinutes(time);
      if (date === prevDate) {
        // Only show if in the prev section (22:00–23:59)
        const h = Math.floor(mins / 60);
        if (h < PREV_DAY_START_HOUR) return null;
        const sectionMinutes = (h - PREV_DAY_START_HOUR) * 60 + (mins % 60);
        return (sectionMinutes / 60) * hourHeight;
      }
      if (date === centerDate) {
        return ((PREV_DAY_HOURS * 60 + mins) / 60) * hourHeight;
      }
      if (date === nextDate) {
        const h = Math.floor(mins / 60);
        if (h >= NEXT_DAY_END_HOUR) return null;
        return (((PREV_DAY_HOURS + CURRENT_DAY_HOURS) * 60 + mins) / 60) * hourHeight;
      }
      return null; // Different day entirely
    },
    [centerDate, prevDate, nextDate, hourHeight],
  );

  /** Look up duration for a task or instance by ID */
  const getDuration = useCallback(
    (activeIdStr: string): number => {
      if (activeIdStr.startsWith("instance-")) {
        const instanceId = Number.parseInt(activeIdStr.replace("instance-", ""), 10);
        return instances.find((i) => i.id === instanceId)?.duration_minutes ?? 30;
      }
      const numericId = activeIdStr.startsWith("anytime-task-")
        ? Number.parseInt(activeIdStr.replace("anytime-task-", ""), 10)
        : activeIdStr.startsWith("scheduled-task-")
          ? Number.parseInt(activeIdStr.replace("scheduled-task-", ""), 10)
          : Number.parseInt(activeIdStr, 10);
      return allTasksLookup.find((t) => t.id === numericId)?.duration_minutes ?? 30;
    },
    [instances, allTasksLookup],
  );

  /** Look up duration for a BatchItem by cache lookup */
  const getBatchItemDuration = useCallback(
    (item: BatchItem): number => {
      if (item.type === "instance") {
        return instances.find((i) => i.id === item.id)?.duration_minutes ?? 30;
      }
      return allTasksLookup.find((t) => t.id === item.id)?.duration_minutes ?? 30;
    },
    [instances, allTasksLookup],
  );

  /** Convert absolute offset minutes to display hour:minute */
  const absMinutesToTimeLabel = useCallback((absMinutes: number): string => {
    let hour: number;
    let minutes: number;
    if (absMinutes < PREV_DAY_HOURS * 60) {
      hour = PREV_DAY_START_HOUR + Math.floor(absMinutes / 60);
      minutes = absMinutes % 60;
    } else if (absMinutes < (PREV_DAY_HOURS + CURRENT_DAY_HOURS) * 60) {
      const sectionMin = absMinutes - PREV_DAY_HOURS * 60;
      hour = Math.floor(sectionMin / 60);
      minutes = sectionMin % 60;
    } else {
      const sectionMin = absMinutes - (PREV_DAY_HOURS + CURRENT_DAY_HOURS) * 60;
      hour = Math.floor(sectionMin / 60);
      minutes = sectionMin % 60;
    }
    return formatTime(Math.min(hour, 23), minutes);
  }, []);

  useDndMonitor({
    onDragStart(event) {
      // Resolve batch items once at drag start (selection doesn't change mid-drag)
      if (isBatchDrag) {
        const selectedIds = useSelectionStore.getState().selectedIds;
        const cachedTasks = queryClient.getQueryData<TaskResponse[]>(dashboardTasksKey()) ?? [];
        const cachedInstances =
          queryClient.getQueryData<InstanceResponse[]>(
            getListInstancesApiV1InstancesGetQueryKey(),
          ) ?? [];

        const items: BatchItem[] = [];
        for (const selId of selectedIds) {
          if (selId.startsWith("task-")) {
            const numId = Number.parseInt(selId.replace("task-", ""), 10);
            const t = cachedTasks.find((x) => x.id === numId);
            if (!t) continue;
            items.push({
              type: "task",
              id: numId,
              date: t.scheduled_date,
              time: t.scheduled_time,
              title: t.title,
            });
          } else if (selId.startsWith("instance-")) {
            const numId = Number.parseInt(selId.replace("instance-", ""), 10);
            const inst = cachedInstances.find((x) => x.id === numId);
            if (!inst) continue;
            let instTime: string | null = null;
            if (inst.scheduled_datetime) {
              const dt = new Date(inst.scheduled_datetime);
              const h = timezone ? getHoursInTimezone(dt, timezone) : dt.getHours();
              const m = timezone ? getMinutesInTimezone(dt, timezone) : dt.getMinutes();
              instTime = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
            }
            items.push({
              type: "instance",
              id: numId,
              date: inst.instance_date,
              time: instTime,
              title: inst.task_title,
            });
          }
        }
        batchItemsRef.current = { items, anchorId: String(event.active.id) };
      } else {
        batchItemsRef.current = null;
      }
    },
    onDragMove(event) {
      const overId = event.over?.id ? String(event.over.id) : null;
      const isOurZone = overId?.startsWith("calendar-overlay-") && isActivePanel;

      if (isOurZone && columnRef.current) {
        setIsCalendarOver(true);
        const rect = columnRef.current.getBoundingClientRect();
        const pointerY = lastPointerRef.current.y;
        const offsetY = pointerY - rect.top;

        // Snap anchor to 15-min grid on the extended timeline
        const totalMinutes = (offsetY / hourHeight) * 60;
        const snappedMinutes = Math.round(totalMinutes / 15) * 15;
        const snappedOffset = (snappedMinutes / 60) * hourHeight;

        const anchorTimeLabel = absMinutesToTimeLabel(snappedMinutes);
        const activeIdStr = String(event.active.id);

        // Determine the drop date based on which section the pointer is in
        let dropDate: string;
        let dropTimeMinutes: number;
        if (snappedMinutes < PREV_DAY_HOURS * 60) {
          dropDate = prevDate;
          dropTimeMinutes = PREV_DAY_START_HOUR * 60 + snappedMinutes;
        } else if (snappedMinutes < (PREV_DAY_HOURS + CURRENT_DAY_HOURS) * 60) {
          dropDate = centerDate;
          dropTimeMinutes = snappedMinutes - PREV_DAY_HOURS * 60;
        } else {
          dropDate = nextDate;
          dropTimeMinutes = snappedMinutes - (PREV_DAY_HOURS + CURRENT_DAY_HOURS) * 60;
        }
        const dropTime = minutesToTime(dropTimeMinutes);

        // Batch drag: compute phantoms for all selected items
        if (isBatchDrag && batchItemsRef.current) {
          const { items, anchorId } = batchItemsRef.current;

          // Find anchor item
          let anchorItem: BatchItem | null = null;
          const isAnchorInstance = anchorId.startsWith("instance-");
          for (const item of items) {
            if (isAnchorInstance && anchorId === `instance-${item.id}`) {
              anchorItem = item;
              break;
            }
            if (
              !isAnchorInstance &&
              (anchorId === `anytime-task-${item.id}` ||
                anchorId === `scheduled-task-${item.id}` ||
                anchorId === String(item.id))
            ) {
              anchorItem = item;
              break;
            }
          }

          if (anchorItem) {
            const anchorDate = anchorItem.date ?? centerDate;
            const dDays = daysBetween(anchorDate, dropDate);
            let dMinutes = 0;
            if (anchorItem.time) {
              dMinutes = timeToMinutes(dropTime) - timeToMinutes(anchorItem.time);
            }
            const isStackDrop = !anchorItem.time; // anytime → calendar = stack mode

            const newPhantoms: PhantomItem[] = [];
            let stackMinutes = dropTimeMinutes;

            for (const item of items) {
              let itemDate: string;
              let itemTime: string | null;
              const isItemAnchor = item.type === anchorItem.type && item.id === anchorItem.id;

              if (isStackDrop) {
                // Stack with 5-min gaps (like plan-my-day)
                itemDate = dropDate;
                itemTime = minutesToTime(Math.min(stackMinutes, 1439));
                const dur = getBatchItemDuration(item);
                stackMinutes += dur + 5;
              } else {
                const result = applyDelta(item, dDays, dMinutes);
                itemDate = result.date;
                itemTime = result.time;
              }

              if (!itemTime) continue; // anytime items don't get phantoms

              const px = timeToColumnOffset(itemDate, itemTime);
              if (px === null) continue; // lands outside this column

              const dur = getBatchItemDuration(item);
              newPhantoms.push({
                offset: px,
                height: durationToHeight(dur, hourHeight),
                timeLabel: formatTime(
                  Math.floor(timeToMinutes(itemTime) / 60),
                  timeToMinutes(itemTime) % 60,
                ),
                isAnchor: isItemAnchor,
              });
            }
            setPhantomItems(newPhantoms);
          }
        } else {
          // Single drag: one phantom card (original behavior)
          const duration = getDuration(activeIdStr);
          setPhantomItems([
            {
              offset: snappedOffset,
              height: durationToHeight(duration, hourHeight),
              timeLabel: anchorTimeLabel,
              isAnchor: true,
            },
          ]);
        }
      } else if (!isOurZone) {
        setPhantomItems([]);
        setIsCalendarOver(false);
      }
    },
    onDragEnd() {
      setPhantomItems([]);
      setIsCalendarOver(false);
      batchItemsRef.current = null;
    },
    onDragCancel() {
      setPhantomItems([]);
      setIsCalendarOver(false);
      batchItemsRef.current = null;
    },
  });

  // Generate hour grid lines for extended timeline
  const hourLines = useMemo(() => {
    const lines: { key: string; offset: number; isAdjacent: boolean; banded: boolean }[] = [];
    // Prev: 22-23
    for (let h = PREV_DAY_START_HOUR; h <= 23; h++) {
      lines.push({
        key: `prev-${h}`,
        offset: (h - PREV_DAY_START_HOUR) * hourHeight,
        isAdjacent: true,
        banded: false,
      });
    }
    // Current: 0-23 — alternating banding on even hours
    for (let h = 0; h <= 23; h++) {
      lines.push({
        key: `cur-${h}`,
        offset: (PREV_DAY_HOURS + h) * hourHeight,
        isAdjacent: false,
        banded: h % 2 === 0,
      });
    }
    // Next: 0-4
    for (let h = 0; h < NEXT_DAY_END_HOUR; h++) {
      lines.push({
        key: `next-${h}`,
        offset: (PREV_DAY_HOURS + CURRENT_DAY_HOURS + h) * hourHeight,
        isAdjacent: true,
        banded: false,
      });
    }
    return lines;
  }, [hourHeight]);

  return (
    <div className="flex flex-col flex-1 min-w-0">
      {/* Time grid — single 44-hour column */}
      <div
        ref={columnRef}
        className={`relative flex-1 ${isPlanMode ? "cursor-crosshair" : "cursor-crosshair"}`}
        style={{ height: `${totalHeight}px`, touchAction: isPlanMode ? "none" : undefined }}
        onPointerDown={isPlanMode ? handlePlanPointerDown : lasso.onPointerDown}
        onPointerMove={isPlanMode ? handlePlanPointerMove : lasso.onPointerMove}
        onPointerUp={isPlanMode ? handlePlanPointerUp : lasso.onPointerUp}
      >
        {/* Background regions — graduated dimming (prev: 0.7, today: 1.0, next: 0.85) */}
        {/* Prev evening — stronger dim */}
        <div
          className="absolute left-0 right-0 bg-muted/40"
          style={{ top: 0, height: `${boundaries.prevEnd}px`, opacity: 0.7 }}
        />
        {/* Current day — full opacity, clean background */}
        <div
          className="absolute left-0 right-0 bg-background"
          style={{
            top: `${boundaries.currentStart}px`,
            height: `${boundaries.currentEnd - boundaries.currentStart}px`,
          }}
        />
        {/* Next morning — lighter dim */}
        <div
          className="absolute left-0 right-0 bg-muted/30"
          style={{
            top: `${boundaries.nextStart}px`,
            height: `${boundaries.nextEnd - boundaries.nextStart}px`,
            opacity: 0.85,
          }}
        />

        {/* Hour grid lines */}
        {hourLines.map((line) => (
          <div
            key={line.key}
            className={`absolute w-full border-b ${line.isAdjacent ? "border-border/20" : "border-border/40"}`}
            style={{
              top: `${line.offset}px`,
              height: `${hourHeight}px`,
              backgroundColor: line.banded ? "rgba(15, 23, 42, 0.015)" : undefined,
            }}
          >
            {/* 30-minute subdivision */}
            <div
              className="absolute w-full border-b border-border/20"
              style={{ top: `${hourHeight / 2}px` }}
            />
          </div>
        ))}

        {/* Day separator: START OF {DAY} */}
        <DaySeparator label={`START OF ${centerDayName}`} offset={boundaries.currentStart} />

        {/* Day separator: END OF {DAY} */}
        <DaySeparator label={`END OF ${centerDayName}`} offset={boundaries.currentEnd} />

        {/* Drop indicator when dragging over */}
        {isCalendarOver && (
          <div className="absolute inset-0 border-2 border-dashed border-primary/40 rounded-md pointer-events-none z-30" />
        )}

        {/* Current time indicator */}
        {currentTimeOffset >= 0 && currentTimeOffset <= totalHeight && (
          <div
            className="absolute w-full z-20 pointer-events-none"
            style={{ top: `${currentTimeOffset}px` }}
          >
            <div className="flex items-center">
              <div className="h-2.5 w-2.5 rounded-full bg-[#167BFF] -ml-1" />
              <div className="flex-1 h-[2px] bg-[#167BFF]" />
            </div>
          </div>
        )}

        {/* Phantom card previews during drag-to-schedule (batch-aware) */}
        {phantomItems.map((phantom, i) => (
          <div
            key={`phantom-${i}-${phantom.offset}`}
            className={
              phantom.isAnchor
                ? "absolute left-0.5 right-0.5 rounded-md bg-primary/15 border border-dashed border-primary/40 pointer-events-none z-20 flex items-center px-1.5 text-[10px] text-primary font-medium"
                : "absolute left-0.5 right-0.5 rounded-md bg-primary/10 border border-dashed border-primary/30 pointer-events-none z-20 flex items-center px-1.5 text-[10px] text-primary/70 font-medium"
            }
            style={{
              top: `${phantom.offset}px`,
              height: `${Math.max(phantom.height, 18)}px`,
            }}
          >
            {phantom.timeLabel}
          </div>
        ))}

        {/* Plan mode selection overlay */}
        {isPlanMode && planSelection && (
          <div
            className="absolute left-0 right-0 bg-primary/10 border-y-2 border-dashed border-primary/40 z-[15] pointer-events-none flex flex-col items-center justify-center gap-1"
            style={{
              top: `${((PREV_DAY_HOURS * 60 + planSelection.start) / 60) * hourHeight}px`,
              height: `${Math.max(((planSelection.end - planSelection.start) / 60) * hourHeight, 20)}px`,
            }}
          >
            <span className="text-xs font-mono font-medium text-primary drop-shadow-sm">
              {formatTime(Math.floor(planSelection.start / 60), planSelection.start % 60)}
              {" \u2013 "}
              {formatTime(Math.floor(planSelection.end / 60), planSelection.end % 60)}
            </span>
            {!planDragging && (
              <button
                type="button"
                data-plan-button
                className="pointer-events-auto px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold shadow-sm hover:bg-primary/90 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  onPlanExecute?.(planSelection.start, planSelection.end);
                }}
              >
                Plan Tasks
              </button>
            )}
          </div>
        )}

        {/* Lasso selection rectangle */}
        {lasso.lassoRect && <LassoRect rect={lasso.lassoRect} />}

        {/* Rendered items */}
        <div
          className={`absolute inset-y-0 left-px right-0 pr-0.5 z-[1] ${isPlanMode ? "pointer-events-none" : ""}`}
        >
          {positioned.map((item) => {
            const timeLabel = getTimeLabel(item.startMinutes, item.endMinutes);
            const isDimmed = item.daySection === "prev" || item.daySection === "next";

            if (item.type === "event") {
              const event = events.find((e) => e.id === item.id);
              return (
                <CalendarEventCard
                  key={`event-${item.id}`}
                  item={item}
                  summary={event?.summary ?? ""}
                  timeLabel={timeLabel}
                  htmlLink={event?.html_link}
                  backgroundColor={event ? calendarColors.get(event.calendar_id) : undefined}
                  dimmed={isDimmed}
                />
              );
            }
            if (item.type === "instance") {
              const inst = instances.find((i) => `inst-${i.id}` === item.id);
              if (!inst) return null;
              return (
                <InstanceCard
                  key={item.id}
                  item={item}
                  instance={inst}
                  timeLabel={timeLabel}
                  dimmed={isDimmed}
                  onEditSeries={() => handleEditSeries(inst.task_id)}
                  orderedIds={orderedIds}
                />
              );
            }
            const task = taskMap.get(item.id);
            if (!task) return null;
            return (
              <ScheduledTaskCard
                key={`task-${item.id}`}
                item={item}
                taskId={task.id}
                title={task.title}
                impact={task.impact}
                durationMinutes={task.duration_minutes}
                isCompleted={task.status === "completed"}
                timeLabel={timeLabel}
                onClick={() => onTaskClick?.(task)}
                dimmed={isDimmed}
                orderedIds={orderedIds}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Day Separator Pill ──────────────────────────────────────────────────────

function DaySeparator({ label, offset }: { label: string; offset: number }) {
  return (
    <div
      className="absolute left-0 right-0 z-10 flex items-center pointer-events-none"
      style={{ top: `${offset}px`, transform: "translateY(-50%)" }}
    >
      <div className="flex-1 h-px bg-border/40" />
      <span className="mx-2 rounded-full text-[11px] font-semibold tracking-[0.10em] uppercase text-muted-foreground bg-background border border-border/40 px-3 py-0.5 whitespace-nowrap">
        {label}
      </span>
      <div className="flex-1 h-px bg-border/40" />
    </div>
  );
}

// ─── Instance Card ───────────────────────────────────────────────────────────

function InstanceCard({
  item,
  instance,
  timeLabel,
  dimmed,
  onEditSeries,
  orderedIds,
}: {
  item: PositionedItem;
  instance: InstanceResponse;
  timeLabel: string;
  dimmed?: boolean;
  onEditSeries?: () => void;
  orderedIds?: string[];
}) {
  const queryClient = useQueryClient();
  const selectionId = instanceSelectionId(instance.id);
  const isMultiSelected = useSelectionStore((s) => s.selectedIds.has(selectionId));

  const completeInstance = useCompleteInstanceApiV1InstancesInstanceIdCompletePost();
  const uncompleteInstance = useUncompleteInstanceApiV1InstancesInstanceIdUncompletePost();
  const skipInstance = useSkipInstanceApiV1InstancesInstanceIdSkipPost();
  const unskipInstance = useUnskipInstanceApiV1InstancesInstanceIdUnskipPost();
  const scheduleInstance = useScheduleInstanceApiV1InstancesInstanceIdSchedulePut();

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `instance-${instance.id}`,
    data: { type: "instance", instanceId: instance.id, instance },
  });

  const width = `${100 / item.totalColumns}%`;
  const left = `${(item.column / item.totalColumns) * 100}%`;
  const isCompleted = instance.status === "completed";
  const isSkipped = instance.status === "skipped";
  const isPending = instance.status === "pending";
  const impactColor = IMPACT_COLORS[instance.impact] ?? IMPACT_COLORS[4];
  const hasScheduledTime = !!instance.scheduled_datetime;

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getListInstancesApiV1InstancesGetQueryKey() });
    queryClient.invalidateQueries({ queryKey: dashboardTasksKey() });
    queryClient.invalidateQueries({
      queryKey: getPendingPastCountApiV1InstancesPendingPastCountGetQueryKey(),
    });
  };

  const handleUnschedule = () => {
    const prevDatetime = instance.scheduled_datetime;

    // Optimistic update — remove scheduled_datetime so it moves to anytime
    const previousInstances = queryClient.getQueryData(getListInstancesApiV1InstancesGetQueryKey());
    queryClient.setQueryData(
      getListInstancesApiV1InstancesGetQueryKey(),
      (old: InstanceResponse[] | undefined) =>
        old?.map((i) => (i.id === instance.id ? { ...i, scheduled_datetime: null } : i)),
    );

    scheduleInstance.mutate(
      { instanceId: instance.id, data: { scheduled_datetime: null } },
      {
        onSuccess: () => {
          invalidateAll();
          toast.success(`Unscheduled "${instance.task_title}"`, {
            id: `unschedule-inst-${instance.id}`,
            action: {
              label: "Undo",
              onClick: () => {
                queryClient.setQueryData(
                  getListInstancesApiV1InstancesGetQueryKey(),
                  (old: InstanceResponse[] | undefined) =>
                    old?.map((i) =>
                      i.id === instance.id ? { ...i, scheduled_datetime: prevDatetime } : i,
                    ),
                );
                scheduleInstance.mutate(
                  { instanceId: instance.id, data: { scheduled_datetime: prevDatetime } },
                  { onSuccess: () => invalidateAll() },
                );
              },
            },
          });
        },
        onError: () => {
          queryClient.setQueryData(getListInstancesApiV1InstancesGetQueryKey(), previousInstances);
          toast.error("Failed to unschedule instance", {
            id: `unschedule-inst-err-${instance.id}`,
          });
        },
      },
    );
  };

  const handleComplete = () => {
    const previousInstances = queryClient.getQueryData(getListInstancesApiV1InstancesGetQueryKey());
    queryClient.setQueryData(
      getListInstancesApiV1InstancesGetQueryKey(),
      (old: InstanceResponse[] | undefined) =>
        old?.map((i) => (i.id === instance.id ? { ...i, status: "completed" as const } : i)),
    );

    completeInstance.mutate(
      { instanceId: instance.id },
      {
        onSuccess: () => {
          invalidateAll();
          const dateHint = new Date(`${instance.instance_date}T00:00:00`).toLocaleDateString(
            "en-US",
            { month: "short", day: "numeric" },
          );
          toast.success(`Completed "${instance.task_title}" · ${dateHint}`, {
            id: `complete-inst-${instance.id}`,
            action: {
              label: "Undo",
              onClick: () => {
                uncompleteInstance.mutate(
                  { instanceId: instance.id },
                  {
                    onSuccess: () => invalidateAll(),
                    onError: () => toast.error("Undo failed"),
                  },
                );
              },
            },
          });
        },
        onError: () => {
          queryClient.setQueryData(getListInstancesApiV1InstancesGetQueryKey(), previousInstances);
          toast.error("Failed to complete instance", { id: `complete-inst-err-${instance.id}` });
        },
      },
    );
  };

  const handleSkip = () => {
    const previousInstances = queryClient.getQueryData(getListInstancesApiV1InstancesGetQueryKey());
    queryClient.setQueryData(
      getListInstancesApiV1InstancesGetQueryKey(),
      (old: InstanceResponse[] | undefined) =>
        old?.map((i) => (i.id === instance.id ? { ...i, status: "skipped" as const } : i)),
    );

    skipInstance.mutate(
      { instanceId: instance.id },
      {
        onSuccess: () => {
          invalidateAll();
          const dateHint = new Date(`${instance.instance_date}T00:00:00`).toLocaleDateString(
            "en-US",
            { month: "short", day: "numeric" },
          );
          toast.success(`Skipped "${instance.task_title}" · ${dateHint}`, {
            id: `skip-inst-${instance.id}`,
            action: {
              label: "Undo",
              onClick: () => {
                unskipInstance.mutate(
                  { instanceId: instance.id },
                  {
                    onSuccess: () => invalidateAll(),
                    onError: () => toast.error("Undo failed"),
                  },
                );
              },
            },
          });
        },
        onError: () => {
          queryClient.setQueryData(getListInstancesApiV1InstancesGetQueryKey(), previousInstances);
          toast.error("Failed to skip instance", { id: `skip-inst-err-${instance.id}` });
        },
      },
    );
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          ref={setNodeRef}
          type="button"
          data-selection-id={selectionId}
          className={`absolute rounded-md px-1.5 py-0.5 overflow-hidden text-xs text-left cursor-grab active:cursor-grabbing shadow-sm hover:ring-1 hover:ring-primary/50 transition-shadow ${
            isSkipped || isCompleted ? "opacity-50" : ""
          } ${isDragging ? "opacity-50 ring-1 ring-primary" : ""} ${dimmed ? "opacity-60" : ""} ${isMultiSelected ? "ring-inset ring-2 ring-primary z-[2]" : ""}`}
          style={{
            top: `${item.top}px`,
            height: `${item.height}px`,
            width,
            left,
            backgroundColor: `${impactColor}1A`,
            borderLeft: `3px solid ${impactColor}`,
          }}
          title={`${instance.task_title} (recurring)`}
          onClick={(e) => {
            if (e.shiftKey) {
              e.stopPropagation();
              const additive = e.metaKey || e.ctrlKey;
              useSelectionStore
                .getState()
                .selectRange(selectionId, orderedIds ?? [], additive, "calendar");
              return;
            }
            if (e.metaKey || e.ctrlKey) {
              e.stopPropagation();
              useSelectionStore.getState().toggle(selectionId, "calendar");
              return;
            }
            useSelectionStore.getState().clear();
            onEditSeries?.();
          }}
        >
          {/* Selection overlay + badge */}
          {isMultiSelected && (
            <>
              <div className="absolute inset-0 bg-primary/10 pointer-events-none" />
              <div className="absolute top-1/2 -translate-y-1/2 left-1 z-10 flex items-center justify-center h-3.5 w-3.5 rounded-full bg-primary text-primary-foreground pointer-events-none">
                <Check className="h-2 w-2" strokeWidth={3} />
              </div>
            </>
          )}
          {/* Drag handle — covers entire card */}
          <div className="absolute inset-0" {...listeners} {...attributes} />
          {/* Content — pointer-events-none so clicks/drags pass through */}
          <div className="relative pointer-events-none">
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">&#x21BB;</span>
              <span
                className={`truncate font-medium ${isCompleted || isSkipped ? "line-through decoration-1" : ""}`}
                style={{ color: impactColor }}
              >
                {instance.task_title}
              </span>
            </div>
            {item.height > 28 && (
              <div className="text-[10px] text-muted-foreground truncate">{timeLabel}</div>
            )}
          </div>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-[160px]">
        {isMultiSelected ? (
          <BatchContextMenuItems />
        ) : (
          <>
            {hasScheduledTime && (
              <ContextMenuItem onClick={handleUnschedule} disabled={!isPending}>
                <CalendarOff className="h-3.5 w-3.5 mr-2" />
                Unschedule
              </ContextMenuItem>
            )}
            <ContextMenuItem onClick={handleSkip} disabled={!isPending}>
              <SkipForward className="h-3.5 w-3.5 mr-2" />
              Skip
            </ContextMenuItem>
            <ContextMenuItem onClick={handleComplete} disabled={!isPending}>
              <Check className="h-3.5 w-3.5 mr-2" />
              Complete
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onEditSeries?.()}>
              <Pencil className="h-3.5 w-3.5 mr-2" />
              Edit series
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
