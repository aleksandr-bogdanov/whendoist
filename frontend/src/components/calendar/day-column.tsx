import { useDroppable } from "@dnd-kit/core";
import { useCallback, useMemo, useRef } from "react";
import type { AppRoutersTasksTaskResponse, EventResponse } from "@/api/model";
import {
  calculateOverlaps,
  DAY_START_HOUR,
  formatDayHeader,
  formatTime,
  TOTAL_HOURS,
  todayString,
} from "@/lib/calendar-utils";
import { CalendarEventCard } from "./calendar-event";
import { ScheduledTaskCard } from "./scheduled-task-card";

interface DayColumnProps {
  dateStr: string;
  events: EventResponse[];
  tasks: AppRoutersTasksTaskResponse[];
  hourHeight: number;
  calendarColors: Map<string, string>;
  onTaskClick?: (task: AppRoutersTasksTaskResponse) => void;
}

const HOUR_LABELS = Array.from({ length: TOTAL_HOURS }, (_, i) => DAY_START_HOUR + i);

export function DayColumn({
  dateStr,
  events,
  tasks,
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
    () => calculateOverlaps(events, tasks, dateStr, hourHeight),
    [events, tasks, dateStr, hourHeight],
  );

  // Current time indicator position
  const now = new Date();
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

  // Find task by ID for click handling
  const taskMap = useMemo(() => {
    const m = new Map<string, AppRoutersTasksTaskResponse>();
    for (const t of tasks) {
      m.set(String(t.id), t);
    }
    return m;
  }, [tasks]);

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
                  summary={event?.summary ?? ""}
                  timeLabel={timeLabel}
                  backgroundColor={event ? calendarColors.get(event.calendar_id) : undefined}
                />
              );
            }
            const task = taskMap.get(item.id);
            if (!task) return null;
            return (
              <ScheduledTaskCard
                key={`task-${item.id}`}
                item={item}
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
