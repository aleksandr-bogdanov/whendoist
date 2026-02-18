import { ChevronLeft, ChevronRight, Minus, Plus, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppRoutersTasksTaskResponse } from "@/api/model";
import {
  useGetCalendarsApiV1CalendarsGet,
  useGetEventsApiV1EventsGet,
} from "@/api/queries/api/api";
import { useListInstancesApiV1InstancesGet } from "@/api/queries/instances/instances";
import { Button } from "@/components/ui/button";
import {
  addDays,
  DAY_START_HOUR,
  formatTime,
  getNextZoomStep,
  TOTAL_HOURS,
  todayString,
} from "@/lib/calendar-utils";
import { useUIStore } from "@/stores/ui-store";
import { DayColumn } from "./day-column";
import { PlanMode } from "./plan-mode";

interface CalendarPanelProps {
  tasks: AppRoutersTasksTaskResponse[];
  onTaskClick?: (task: AppRoutersTasksTaskResponse) => void;
}

export function CalendarPanel({ tasks, onTaskClick }: CalendarPanelProps) {
  const { calendarHourHeight, calendarCenterDate, setCalendarHourHeight, setCalendarCenterDate } =
    useUIStore();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [planModeOpen, setPlanModeOpen] = useState(false);

  // Visible date range: center +/- 1 day (3 days on desktop)
  const dates = useMemo(() => {
    return [addDays(calendarCenterDate, -1), calendarCenterDate, addDays(calendarCenterDate, 1)];
  }, [calendarCenterDate]);

  // Fetch events for the visible range
  const startDate = dates[0];
  const endDate = addDays(dates[dates.length - 1], 1);
  const { data: events } = useGetEventsApiV1EventsGet(
    { start_date: startDate, end_date: endDate },
    { query: { staleTime: 60_000 } },
  );

  // Fetch calendars for color mapping
  const { data: calendars } = useGetCalendarsApiV1CalendarsGet({
    query: { staleTime: 300_000 },
  });

  const calendarColors = useMemo(() => {
    const map = new Map<string, string>();
    if (calendars) {
      for (const cal of calendars) {
        map.set(cal.id, cal.background_color);
      }
    }
    return map;
  }, [calendars]);

  // Fetch recurring task instances for the visible range
  const { data: instances } = useListInstancesApiV1InstancesGet(
    { start_date: startDate, end_date: endDate },
    { query: { staleTime: 60_000 } },
  );

  const safeEvents = events ?? [];
  const safeInstances = instances ?? [];

  // Scheduled tasks (have scheduled_date + scheduled_time)
  const scheduledTasks = useMemo(
    () => tasks.filter((t) => t.scheduled_date && t.scheduled_time),
    [tasks],
  );

  // Navigate dates
  const goToToday = useCallback(() => {
    setCalendarCenterDate(todayString());
  }, [setCalendarCenterDate]);

  const goToPrev = useCallback(() => {
    setCalendarCenterDate(addDays(calendarCenterDate, -1));
  }, [calendarCenterDate, setCalendarCenterDate]);

  const goToNext = useCallback(() => {
    setCalendarCenterDate(addDays(calendarCenterDate, 1));
  }, [calendarCenterDate, setCalendarCenterDate]);

  // Zoom controls
  const zoomIn = useCallback(() => {
    setCalendarHourHeight(getNextZoomStep(calendarHourHeight, "in"));
  }, [calendarHourHeight, setCalendarHourHeight]);

  const zoomOut = useCallback(() => {
    setCalendarHourHeight(getNextZoomStep(calendarHourHeight, "out"));
  }, [calendarHourHeight, setCalendarHourHeight]);

  // Ctrl+Scroll wheel zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? "out" : "in";
        setCalendarHourHeight(getNextZoomStep(calendarHourHeight, delta));
      }
    },
    [calendarHourHeight, setCalendarHourHeight],
  );

  // Scroll to current time on first render
  const initialHourHeight = useRef(calendarHourHeight);
  useEffect(() => {
    if (scrollRef.current) {
      const now = new Date();
      const targetOffset = (now.getHours() - DAY_START_HOUR - 1) * initialHourHeight.current;
      scrollRef.current.scrollTop = Math.max(0, targetOffset);
    }
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0 border-l">
      {/* Calendar header */}
      <div className="flex items-center justify-between gap-2 px-2 sm:px-3 py-2 border-b">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goToPrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={goToToday}>
            Today
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goToNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => setPlanModeOpen(true)}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Plan
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={zoomOut}>
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={zoomIn}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Calendar body */}
      <div ref={scrollRef} className="flex-1 overflow-auto" onWheel={handleWheel}>
        <div className="flex">
          {/* Time ruler */}
          <div
            className="flex-shrink-0 w-12 sticky left-0 z-10 bg-background"
            style={{ paddingTop: "32px" }} // offset for sticky day header
          >
            <div className="relative" style={{ height: `${TOTAL_HOURS * calendarHourHeight}px` }}>
              {Array.from({ length: TOTAL_HOURS }, (_, i) => DAY_START_HOUR + i).map((hour) => (
                <div
                  key={hour}
                  className="absolute w-full text-right pr-1.5 text-[10px] text-muted-foreground -translate-y-1/2"
                  style={{ top: `${(hour - DAY_START_HOUR) * calendarHourHeight}px` }}
                >
                  {formatTime(hour, 0).replace(":00 ", "")}
                </div>
              ))}
            </div>
          </div>

          {/* Day columns */}
          <div className="flex flex-1 divide-x divide-border/40">
            {dates.map((dateStr) => (
              <DayColumn
                key={dateStr}
                dateStr={dateStr}
                events={safeEvents}
                tasks={scheduledTasks}
                instances={safeInstances}
                hourHeight={calendarHourHeight}
                calendarColors={calendarColors}
                onTaskClick={onTaskClick}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Plan mode dialog */}
      <PlanMode
        open={planModeOpen}
        onOpenChange={setPlanModeOpen}
        tasks={tasks}
        events={safeEvents}
        centerDate={calendarCenterDate}
      />
    </div>
  );
}
