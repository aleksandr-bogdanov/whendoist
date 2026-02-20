import { useDndMonitor } from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, SkipForward } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { AppRoutersTasksTaskResponse, EventResponse, InstanceResponse } from "@/api/model";
import {
  getListInstancesApiV1InstancesGetQueryKey,
  useCompleteInstanceApiV1InstancesInstanceIdCompletePost,
  useSkipInstanceApiV1InstancesInstanceIdSkipPost,
} from "@/api/queries/instances/instances";
import { getListTasksApiV1TasksGetQueryKey } from "@/api/queries/tasks/tasks";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { PositionedItem } from "@/lib/calendar-utils";
import {
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
import { IMPACT_COLORS } from "@/lib/task-utils";
import { CalendarEventCard } from "./calendar-event";
import { ScheduledTaskCard } from "./scheduled-task-card";

interface DayColumnProps {
  centerDate: string;
  events: EventResponse[];
  tasks: AppRoutersTasksTaskResponse[];
  /** All tasks (including anytime) — used for phantom card duration lookup during drag */
  allTasks?: AppRoutersTasksTaskResponse[];
  instances: InstanceResponse[];
  hourHeight: number;
  calendarColors: Map<string, string>;
  onTaskClick?: (task: AppRoutersTasksTaskResponse) => void;
  /** Whether this panel is the currently visible/active one (receives drop events) */
  isActivePanel?: boolean;
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
}: DayColumnProps) {
  const columnRef = useRef<HTMLDivElement>(null);
  const isToday = centerDate === todayString();
  const totalHeight = EXTENDED_TOTAL_HOURS * hourHeight;
  const boundaries = useMemo(() => getSectionBoundaries(hourHeight), [hourHeight]);

  // Day name for separators (e.g., "FRIDAY")
  const centerDayName = useMemo(() => {
    const d = new Date(`${centerDate}T00:00:00`);
    return d.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
  }, [centerDate]);

  // Positioned items across all 3 days
  const positioned = useMemo(
    () => calculateExtendedOverlaps(events, tasks, instances, centerDate, hourHeight),
    [events, tasks, instances, centerDate, hourHeight],
  );

  // Current time indicator — update every 60s
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!isToday) return;
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, [isToday]);

  const currentTimeOffset = isToday
    ? extendedTimeToOffset(now.getHours(), now.getMinutes(), "current", hourHeight)
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
    const m = new Map<string, AppRoutersTasksTaskResponse>();
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

  // Phantom card for drag-to-schedule preview
  const [phantomOffset, setPhantomOffset] = useState<number | null>(null);
  const [phantomDuration, setPhantomDuration] = useState(30);
  const [phantomTimeLabel, setPhantomTimeLabel] = useState("");
  const [isCalendarOver, setIsCalendarOver] = useState(false);

  useDndMonitor({
    onDragMove(event) {
      const overId = event.over?.id ? String(event.over.id) : null;
      const isOurZone = overId?.startsWith("calendar-overlay-") && isActivePanel;

      if (isOurZone && columnRef.current) {
        setIsCalendarOver(true);
        const rect = columnRef.current.getBoundingClientRect();
        const pointerY = lastPointerRef.current.y;
        const offsetY = pointerY - rect.top;

        // Snap to 15-min grid on the extended timeline
        const totalMinutes = (offsetY / hourHeight) * 60;
        const snappedMinutes = Math.round(totalMinutes / 15) * 15;
        const snappedOffset = (snappedMinutes / 60) * hourHeight;
        setPhantomOffset(snappedOffset);

        // Determine the display time based on absolute minutes
        const absMinutes = snappedMinutes;
        let hour: number;
        let minutes: number;
        if (absMinutes < PREV_DAY_HOURS * 60) {
          // Prev section
          hour = PREV_DAY_START_HOUR + Math.floor(absMinutes / 60);
          minutes = absMinutes % 60;
        } else if (absMinutes < (PREV_DAY_HOURS + CURRENT_DAY_HOURS) * 60) {
          // Current section
          const sectionMin = absMinutes - PREV_DAY_HOURS * 60;
          hour = Math.floor(sectionMin / 60);
          minutes = sectionMin % 60;
        } else {
          // Next section
          const sectionMin = absMinutes - (PREV_DAY_HOURS + CURRENT_DAY_HOURS) * 60;
          hour = Math.floor(sectionMin / 60);
          minutes = sectionMin % 60;
        }
        setPhantomTimeLabel(formatTime(Math.min(hour, 23), minutes));

        // Get the dragged task's duration — parse ID to handle prefixed IDs
        const activeIdStr = String(event.active.id);
        const numericId = activeIdStr.startsWith("anytime-task-")
          ? Number.parseInt(activeIdStr.replace("anytime-task-", ""), 10)
          : activeIdStr.startsWith("scheduled-task-")
            ? Number.parseInt(activeIdStr.replace("scheduled-task-", ""), 10)
            : Number.parseInt(activeIdStr, 10);
        const draggedTask = allTasksLookup.find((t) => t.id === numericId);
        setPhantomDuration(draggedTask?.duration_minutes ?? 30);
      } else if (!isOurZone) {
        setPhantomOffset(null);
        setIsCalendarOver(false);
      }
    },
    onDragEnd() {
      setPhantomOffset(null);
      setIsCalendarOver(false);
    },
    onDragCancel() {
      setPhantomOffset(null);
      setIsCalendarOver(false);
    },
  });

  // Generate hour grid lines for extended timeline
  const hourLines = useMemo(() => {
    const lines: { key: string; offset: number; isAdjacent: boolean }[] = [];
    // Prev: 22-23
    for (let h = PREV_DAY_START_HOUR; h <= 23; h++) {
      lines.push({
        key: `prev-${h}`,
        offset: (h - PREV_DAY_START_HOUR) * hourHeight,
        isAdjacent: true,
      });
    }
    // Current: 0-23
    for (let h = 0; h <= 23; h++) {
      lines.push({ key: `cur-${h}`, offset: (PREV_DAY_HOURS + h) * hourHeight, isAdjacent: false });
    }
    // Next: 0-4
    for (let h = 0; h < NEXT_DAY_END_HOUR; h++) {
      lines.push({
        key: `next-${h}`,
        offset: (PREV_DAY_HOURS + CURRENT_DAY_HOURS + h) * hourHeight,
        isAdjacent: true,
      });
    }
    return lines;
  }, [hourHeight]);

  return (
    <div className="flex flex-col flex-1 min-w-0">
      {/* Time grid — single 44-hour column */}
      <div ref={columnRef} className="relative flex-1" style={{ height: `${totalHeight}px` }}>
        {/* Background regions */}
        {/* Prev evening — dimmed */}
        <div
          className="absolute left-0 right-0 bg-muted/30"
          style={{ top: 0, height: `${boundaries.prevEnd}px` }}
        />
        {/* Current day — normal background */}
        <div
          className="absolute left-0 right-0 bg-background"
          style={{
            top: `${boundaries.currentStart}px`,
            height: `${boundaries.currentEnd - boundaries.currentStart}px`,
          }}
        />
        {/* Next morning — dimmed */}
        <div
          className="absolute left-0 right-0 bg-muted/30"
          style={{
            top: `${boundaries.nextStart}px`,
            height: `${boundaries.nextEnd - boundaries.nextStart}px`,
          }}
        />

        {/* Hour grid lines */}
        {hourLines.map((line) => (
          <div
            key={line.key}
            className={`absolute w-full border-b ${line.isAdjacent ? "border-border/20" : "border-border/40"}`}
            style={{ top: `${line.offset}px`, height: `${hourHeight}px` }}
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
              <div className="h-2.5 w-2.5 rounded-full bg-red-500 -ml-1" />
              <div className="flex-1 h-[2px] bg-red-500" />
            </div>
          </div>
        )}

        {/* Phantom card preview during drag-to-schedule */}
        {phantomOffset !== null && (
          <div
            className="absolute left-0.5 right-0.5 rounded-md bg-primary/15 border border-dashed border-primary/40 pointer-events-none z-20 flex items-center px-1.5 text-[10px] text-primary font-medium"
            style={{
              top: `${phantomOffset}px`,
              height: `${Math.max(durationToHeight(phantomDuration, hourHeight), 18)}px`,
            }}
          >
            {phantomTimeLabel}
          </div>
        )}

        {/* Rendered items */}
        <div className="absolute inset-0 pl-0.5 pr-0.5">
          {positioned.map((item) => {
            const timeLabel = getTimeLabel(item.startMinutes, item.endMinutes);
            const isDimmed = item.daySection === "prev" || item.daySection === "next";

            if (item.type === "event") {
              const event = events.find((e) => e.id === item.id);
              return (
                <CalendarEventCard
                  key={`event-${item.id}`}
                  item={item}
                  eventId={item.id}
                  summary={event?.summary ?? ""}
                  timeLabel={timeLabel}
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
}: {
  item: PositionedItem;
  instance: InstanceResponse;
  timeLabel: string;
  dimmed?: boolean;
  onEditSeries?: () => void;
}) {
  const queryClient = useQueryClient();
  const completeInstance = useCompleteInstanceApiV1InstancesInstanceIdCompletePost();
  const skipInstance = useSkipInstanceApiV1InstancesInstanceIdSkipPost();

  const width = `${100 / item.totalColumns}%`;
  const left = `${(item.column / item.totalColumns) * 100}%`;
  const isCompleted = instance.status === "completed";
  const isSkipped = instance.status === "skipped";
  const isPending = instance.status === "pending";
  const impactColor = IMPACT_COLORS[instance.impact] ?? IMPACT_COLORS[4];

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getListInstancesApiV1InstancesGetQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
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
          toast.success(`Completed instance of "${instance.task_title}"`, {
            id: `complete-inst-${instance.id}`,
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
          toast.success(`Skipped instance of "${instance.task_title}"`, {
            id: `skip-inst-${instance.id}`,
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
          type="button"
          className={`absolute rounded-md px-1.5 py-0.5 overflow-hidden text-xs text-left border-l-2 cursor-pointer hover:ring-1 hover:ring-primary/50 transition-shadow ${
            isCompleted || isSkipped ? "opacity-50" : ""
          } ${dimmed ? "opacity-60" : ""}`}
          style={{
            top: `${item.top}px`,
            height: `${item.height}px`,
            width,
            left,
            backgroundColor: `${impactColor}15`,
            borderLeftColor: impactColor,
          }}
          title={`${instance.task_title} (recurring)`}
          onClick={() => onEditSeries?.()}
        >
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">&#x21BB;</span>
            <span className="truncate font-medium" style={{ color: impactColor }}>
              {instance.task_title}
            </span>
          </div>
          {item.height > 28 && (
            <div className="text-[10px] text-muted-foreground truncate">{timeLabel}</div>
          )}
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-[160px]">
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
      </ContextMenuContent>
    </ContextMenu>
  );
}
