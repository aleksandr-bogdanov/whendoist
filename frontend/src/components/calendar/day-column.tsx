import { useDndMonitor, useDroppable } from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { Check, SkipForward } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { AppRoutersTasksTaskResponse, EventResponse, InstanceResponse } from "@/api/model";
import {
  getListInstancesApiV1InstancesGetQueryKey,
  useCompleteInstanceApiV1InstancesInstanceIdCompletePost,
  useSkipInstanceApiV1InstancesInstanceIdSkipPost,
} from "@/api/queries/instances/instances";
import { getListTasksApiV1TasksGetQueryKey } from "@/api/queries/tasks/tasks";
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
import { IMPACT_COLORS } from "@/lib/task-utils";
import { CalendarEventCard } from "./calendar-event";
import { ScheduledTaskCard } from "./scheduled-task-card";

interface DayColumnProps {
  centerDate: string;
  events: EventResponse[];
  tasks: AppRoutersTasksTaskResponse[];
  instances: InstanceResponse[];
  hourHeight: number;
  calendarColors: Map<string, string>;
  onTaskClick?: (task: AppRoutersTasksTaskResponse) => void;
}

export function DayColumn({
  centerDate,
  events,
  tasks,
  instances,
  hourHeight,
  calendarColors,
  onTaskClick,
}: DayColumnProps) {
  const columnRef = useRef<HTMLDivElement>(null);
  const prevDate = addDays(centerDate, -1);
  const nextDate = addDays(centerDate, 1);
  const isToday = centerDate === todayString();
  const totalHeight = EXTENDED_TOTAL_HOURS * hourHeight;
  const boundaries = useMemo(() => getSectionBoundaries(hourHeight), [hourHeight]);

  // Day name for separators (e.g., "FRIDAY")
  const centerDayName = useMemo(() => {
    const d = new Date(`${centerDate}T00:00:00`);
    return d.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
  }, [centerDate]);

  // 3 stacked droppable zones
  const { setNodeRef: setPrevRef, isOver: isPrevOver } = useDroppable({
    id: `calendar-${prevDate}`,
    data: { type: "calendar", dateStr: prevDate, startHour: PREV_DAY_START_HOUR },
  });
  const { setNodeRef: setCurrentRef, isOver: isCurrentOver } = useDroppable({
    id: `calendar-${centerDate}`,
    data: { type: "calendar", dateStr: centerDate, startHour: 0 },
  });
  const { setNodeRef: setNextRef, isOver: isNextOver } = useDroppable({
    id: `calendar-${nextDate}`,
    data: { type: "calendar", dateStr: nextDate, startHour: 0 },
  });

  const isOver = isPrevOver || isCurrentOver || isNextOver;

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

  // Phantom card for drag-to-schedule preview
  const [phantomOffset, setPhantomOffset] = useState<number | null>(null);
  const [phantomDuration, setPhantomDuration] = useState(30);
  const [phantomTimeLabel, setPhantomTimeLabel] = useState("");

  useDndMonitor({
    onDragOver(event) {
      const overId = event.over?.id ? String(event.over.id) : null;
      const isOurZone =
        overId === `calendar-${prevDate}` ||
        overId === `calendar-${centerDate}` ||
        overId === `calendar-${nextDate}`;

      if (isOurZone && columnRef.current) {
        const rect = columnRef.current.getBoundingClientRect();
        let clientY: number;
        if (event.activatorEvent instanceof TouchEvent) {
          clientY =
            event.activatorEvent.touches[0]?.clientY ??
            event.activatorEvent.changedTouches[0]?.clientY ??
            0;
        } else {
          clientY = (event.activatorEvent as PointerEvent).clientY;
        }
        const pointerY = clientY + (event.delta?.y ?? 0);
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

        // Get the dragged task's duration
        const activeId =
          typeof event.active.id === "string"
            ? Number.parseInt(event.active.id, 10)
            : Number(event.active.id);
        const draggedTask = tasks.find((t) => t.id === activeId);
        setPhantomDuration(draggedTask?.duration_minutes ?? 30);
      } else if (!isOurZone) {
        setPhantomOffset(null);
      }
    },
    onDragEnd() {
      setPhantomOffset(null);
    },
    onDragCancel() {
      setPhantomOffset(null);
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

        {/* Droppable zones (invisible, stacked) */}
        <div
          ref={setPrevRef}
          className="absolute left-0 right-0 z-[1]"
          style={{ top: 0, height: `${boundaries.prevEnd}px` }}
        />
        <div
          ref={setCurrentRef}
          className="absolute left-0 right-0 z-[1]"
          style={{
            top: `${boundaries.currentStart}px`,
            height: `${boundaries.currentEnd - boundaries.currentStart}px`,
          }}
        />
        <div
          ref={setNextRef}
          className="absolute left-0 right-0 z-[1]"
          style={{
            top: `${boundaries.nextStart}px`,
            height: `${boundaries.nextEnd - boundaries.nextStart}px`,
          }}
        />

        {/* Drop indicator when dragging over */}
        {isOver && (
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
}: {
  item: PositionedItem;
  instance: InstanceResponse;
  timeLabel: string;
  dimmed?: boolean;
}) {
  const queryClient = useQueryClient();
  const completeInstance = useCompleteInstanceApiV1InstancesInstanceIdCompletePost();
  const skipInstance = useSkipInstanceApiV1InstancesInstanceIdSkipPost();
  const [showActions, setShowActions] = useState(false);

  const width = `${100 / item.totalColumns}%`;
  const left = `${(item.column / item.totalColumns) * 100}%`;
  const isCompleted = instance.status === "completed";
  const isSkipped = instance.status === "skipped";
  const impactColor = IMPACT_COLORS[instance.impact] ?? IMPACT_COLORS[4];

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getListInstancesApiV1InstancesGetQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
  };

  const handleComplete = (e: React.MouseEvent) => {
    e.stopPropagation();

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
          toast.success("Instance completed", { id: `complete-inst-${instance.id}` });
        },
        onError: () => {
          queryClient.setQueryData(getListInstancesApiV1InstancesGetQueryKey(), previousInstances);
          toast.error("Failed to complete instance", { id: `complete-inst-err-${instance.id}` });
        },
      },
    );
    setShowActions(false);
  };

  const handleSkip = (e: React.MouseEvent) => {
    e.stopPropagation();

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
          toast.success("Instance skipped", { id: `skip-inst-${instance.id}` });
        },
        onError: () => {
          queryClient.setQueryData(getListInstancesApiV1InstancesGetQueryKey(), previousInstances);
          toast.error("Failed to skip instance", { id: `skip-inst-err-${instance.id}` });
        },
      },
    );
    setShowActions(false);
  };

  return (
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
      onClick={() => setShowActions((v) => !v)}
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
      {showActions && instance.status === "pending" && (
        <div className="flex gap-1 mt-0.5">
          <button
            type="button"
            className="flex items-center gap-0.5 rounded bg-green-500/20 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:text-green-400 hover:bg-green-500/30"
            onClick={handleComplete}
          >
            <Check className="h-2.5 w-2.5" /> Done
          </button>
          <button
            type="button"
            className="flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted/80"
            onClick={handleSkip}
          >
            <SkipForward className="h-2.5 w-2.5" /> Skip
          </button>
        </div>
      )}
    </button>
  );
}
