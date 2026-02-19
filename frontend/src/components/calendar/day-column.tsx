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
  calculateOverlaps,
  DAY_START_HOUR,
  durationToHeight,
  formatDayHeader,
  formatTime,
  getAdjacentDayItems,
  offsetToTime,
  TOTAL_HOURS,
  timeToOffset,
  todayString,
} from "@/lib/calendar-utils";
import { IMPACT_COLORS } from "@/lib/task-utils";
import { CalendarEventCard } from "./calendar-event";
import { ScheduledTaskCard } from "./scheduled-task-card";

interface DayColumnProps {
  dateStr: string;
  events: EventResponse[];
  tasks: AppRoutersTasksTaskResponse[];
  anytimeTasks?: AppRoutersTasksTaskResponse[];
  instances?: InstanceResponse[];
  hourHeight: number;
  calendarColors: Map<string, string>;
  onTaskClick?: (task: AppRoutersTasksTaskResponse) => void;
}

const HOUR_LABELS = Array.from({ length: TOTAL_HOURS }, (_, i) => DAY_START_HOUR + i);

export function DayColumn({
  dateStr,
  events,
  tasks,
  anytimeTasks,
  instances,
  hourHeight,
  calendarColors,
  onTaskClick,
}: DayColumnProps) {
  const columnRef = useRef<HTMLDivElement>(null);
  const { dayName, dateLabel } = formatDayHeader(dateStr);
  const isToday = dateStr === todayString();

  // Make the entire day column a droppable target for scheduling
  const { setNodeRef, isOver } = useDroppable({
    id: `calendar-${dateStr}`,
    data: { type: "calendar", dateStr },
  });

  const positioned = useMemo(
    () => calculateOverlaps(events, tasks, dateStr, hourHeight, instances),
    [events, tasks, dateStr, hourHeight, instances],
  );

  // Current time indicator — update every 60s
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!isToday) return;
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, [isToday]);
  const currentTimeOffset = isToday
    ? (now.getHours() - DAY_START_HOUR + now.getMinutes() / 60) * hourHeight
    : -1;

  const getTimeLabel = useCallback((startMinutes: number, endMinutes: number) => {
    const sh = Math.floor(startMinutes / 60);
    const sm = startMinutes % 60;
    const eh = Math.floor(endMinutes / 60);
    const em = endMinutes % 60;
    return `${formatTime(sh, sm)} - ${formatTime(eh, em)}`;
  }, []);

  // Date-only tasks for this day
  const dayAnytimeTasks = useMemo(
    () => (anytimeTasks ?? []).filter((t) => t.scheduled_date === dateStr),
    [anytimeTasks, dateStr],
  );

  // Find task by ID for click handling
  const taskMap = useMemo(() => {
    const m = new Map<string, AppRoutersTasksTaskResponse>();
    for (const t of tasks) {
      m.set(String(t.id), t);
    }
    return m;
  }, [tasks]);

  // Adjacent-day clones (Item 6)
  const adjacentItems = useMemo(
    () => getAdjacentDayItems(tasks, events, dateStr, hourHeight),
    [tasks, events, dateStr, hourHeight],
  );

  // Phantom card for drag-to-schedule preview (Item 4)
  const [phantomTime, setPhantomTime] = useState<{ hour: number; minutes: number } | null>(null);
  const [phantomDuration, setPhantomDuration] = useState(30);

  useDndMonitor({
    onDragOver(event) {
      const overId = event.over?.id ? String(event.over.id) : null;
      if (overId === `calendar-${dateStr}` && columnRef.current) {
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
        const time = offsetToTime(offsetY, hourHeight);
        setPhantomTime(time);

        // Try to get the dragged task's duration
        const activeId =
          typeof event.active.id === "string"
            ? Number.parseInt(event.active.id, 10)
            : Number(event.active.id);
        const draggedTask = tasks.find((t) => t.id === activeId);
        setPhantomDuration(draggedTask?.duration_minutes ?? 30);
      } else if (overId !== `calendar-${dateStr}`) {
        setPhantomTime(null);
      }
    },
    onDragEnd() {
      setPhantomTime(null);
    },
    onDragCancel() {
      setPhantomTime(null);
    },
  });

  return (
    <div className="flex flex-col flex-shrink-0" style={{ minWidth: "200px", width: "100%" }}>
      {/* Day header */}
      <div
        className={`sticky top-0 z-10 flex flex-col items-center py-1.5 border-b bg-background/95 backdrop-blur-sm ${
          isToday ? "bg-primary/5" : ""
        }`}
      >
        <span
          className={`text-xs font-semibold ${isToday ? "text-primary" : "text-muted-foreground"}`}
        >
          {dayName}
        </span>
        <span className="text-[10px] text-muted-foreground">{dateLabel}</span>
      </div>

      {/* Anytime tasks (date-only, no specific time) */}
      {dayAnytimeTasks.length > 0 && (
        <div className="border-b px-1 py-1 space-y-0.5">
          <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide px-0.5">
            Anytime
          </span>
          {dayAnytimeTasks.map((t) => (
            <button
              key={t.id}
              type="button"
              className="w-full text-left text-[11px] truncate rounded px-1 py-0.5 hover:bg-accent/50 cursor-pointer"
              style={{
                borderLeft: `3px solid ${IMPACT_COLORS[t.impact] ?? IMPACT_COLORS[4]}`,
              }}
              onClick={() => onTaskClick?.(t)}
              title={t.title}
            >
              {t.title}
            </button>
          ))}
        </div>
      )}

      {/* Time grid — droppable zone */}
      <div
        ref={(node) => {
          // Merge refs: dnd-kit droppable + our local ref
          setNodeRef(node);
          (columnRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        className={`relative flex-1 transition-colors ${isOver ? "bg-primary/5" : ""}`}
        style={{ height: `${TOTAL_HOURS * hourHeight}px` }}
      >
        {/* Hour grid lines */}
        {HOUR_LABELS.map((hour) => (
          <div
            key={hour}
            className="absolute w-full border-b border-border/40"
            style={{ top: `${(hour - DAY_START_HOUR) * hourHeight}px`, height: `${hourHeight}px` }}
          >
            {/* 30-minute subdivision */}
            <div
              className="absolute w-full border-b border-border/20"
              style={{ top: `${hourHeight / 2}px` }}
            />
          </div>
        ))}

        {/* Drop indicator when dragging over */}
        {isOver && (
          <div className="absolute inset-0 border-2 border-dashed border-primary/40 rounded-md pointer-events-none z-30" />
        )}

        {/* Current time indicator */}
        {currentTimeOffset >= 0 && currentTimeOffset <= TOTAL_HOURS * hourHeight && (
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
        {phantomTime && (
          <div
            className="absolute left-0.5 right-0.5 rounded-md bg-primary/15 border border-dashed border-primary/40 pointer-events-none z-20 flex items-center px-1.5 text-[10px] text-primary font-medium"
            style={{
              top: `${timeToOffset(phantomTime.hour, phantomTime.minutes, hourHeight)}px`,
              height: `${Math.max(durationToHeight(phantomDuration, hourHeight), 18)}px`,
            }}
          >
            {formatTime(phantomTime.hour, phantomTime.minutes)}
          </div>
        )}

        {/* Adjacent-day clone items (faded) */}
        {adjacentItems.map((item) => (
          <div
            key={item.id}
            className="absolute left-0.5 right-0.5 rounded-md px-1.5 py-0.5 overflow-hidden text-xs opacity-30 pointer-events-none"
            style={{
              top: `${item.top}px`,
              height: `${Math.max(item.height, 18)}px`,
              backgroundColor: "hsl(var(--muted))",
              borderLeft: "3px solid hsl(var(--muted-foreground) / 0.3)",
            }}
          >
            <div className="truncate text-muted-foreground text-[10px] italic">
              {item.adjacentLabel}
            </div>
          </div>
        ))}

        {/* Rendered items */}
        <div className="absolute inset-0 pl-0.5 pr-0.5">
          {positioned.map((item) => {
            const timeLabel = getTimeLabel(item.startMinutes, item.endMinutes);
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
                />
              );
            }
            if (item.type === "instance") {
              const inst = instances?.find((i) => `inst-${i.id}` === item.id);
              if (!inst) return null;
              return (
                <InstanceCard key={item.id} item={item} instance={inst} timeLabel={timeLabel} />
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
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function InstanceCard({
  item,
  instance,
  timeLabel,
}: {
  item: PositionedItem;
  instance: InstanceResponse;
  timeLabel: string;
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
      }`}
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
