import { useDndMonitor } from "@dnd-kit/core";
import { useDrag } from "@use-gesture/react";
import { ChevronLeft, ChevronRight, Minus, Plus, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppRoutersTasksTaskResponse } from "@/api/model";
import {
  useGetCalendarsApiV1CalendarsGet,
  useGetEventsApiV1EventsGet,
} from "@/api/queries/api/api";
import { useListInstancesApiV1InstancesGet } from "@/api/queries/instances/instances";
import { Button } from "@/components/ui/button";
import { useSyncCalendarHourHeight } from "@/hooks/use-sync-preferences";
import {
  addDays,
  DAY_START_HOUR,
  formatDayHeader,
  formatTime,
  getNextZoomStep,
  parseDate,
  TOTAL_HOURS,
  todayString,
} from "@/lib/calendar-utils";
import { IMPACT_COLORS } from "@/lib/task-utils";
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
  useSyncCalendarHourHeight();

  const scrollRef = useRef<HTMLDivElement>(null);
  const savedScrollTop = useRef<number | null>(null);
  const [planModeOpen, setPlanModeOpen] = useState(false);

  // Visible date range: center +/- 1 day (3 days on desktop)
  const dates = useMemo(() => {
    return [addDays(calendarCenterDate, -1), calendarCenterDate, addDays(calendarCenterDate, 1)];
  }, [calendarCenterDate]);

  // Header label: "THURSDAY, FEB 19"
  const centerDateLabel = useMemo(() => {
    const d = parseDate(calendarCenterDate);
    const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
    const month = d.toLocaleDateString("en-US", { month: "short" });
    const day = d.getDate();
    return `${weekday}, ${month} ${day}`.toUpperCase();
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

  // Scheduled tasks with a specific time
  const scheduledTasks = useMemo(
    () => tasks.filter((t) => t.scheduled_date && t.scheduled_time),
    [tasks],
  );

  // Date-only scheduled tasks (no specific time)
  const anytimeTasks = useMemo(
    () => tasks.filter((t) => t.scheduled_date && !t.scheduled_time && t.status !== "completed"),
    [tasks],
  );

  // Save scroll position before navigating (Item 2)
  const saveScroll = useCallback(() => {
    if (scrollRef.current) {
      savedScrollTop.current = scrollRef.current.scrollTop;
    }
  }, []);

  // Navigate dates
  const goToPrev = useCallback(() => {
    saveScroll();
    setCalendarCenterDate(addDays(calendarCenterDate, -1));
  }, [calendarCenterDate, setCalendarCenterDate, saveScroll]);

  const goToNext = useCallback(() => {
    saveScroll();
    setCalendarCenterDate(addDays(calendarCenterDate, 1));
  }, [calendarCenterDate, setCalendarCenterDate, saveScroll]);

  // Zoom controls
  const zoomIn = useCallback(() => {
    setCalendarHourHeight(getNextZoomStep(calendarHourHeight, "in"));
  }, [calendarHourHeight, setCalendarHourHeight]);

  const zoomOut = useCallback(() => {
    setCalendarHourHeight(getNextZoomStep(calendarHourHeight, "out"));
  }, [calendarHourHeight, setCalendarHourHeight]);

  // Ctrl+Scroll wheel zoom — accumulate delta before stepping
  const zoomAccumulator = useRef(0);
  const ZOOM_THRESHOLD = 10; // low threshold for trackpad pinch responsiveness

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomAccumulator.current += e.deltaY;
        if (Math.abs(zoomAccumulator.current) >= ZOOM_THRESHOLD) {
          const direction = zoomAccumulator.current > 0 ? "out" : "in";
          setCalendarHourHeight(getNextZoomStep(calendarHourHeight, direction));
          zoomAccumulator.current = 0;
        }
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

  // Restore scroll position after date navigation (Item 2)
  // biome-ignore lint/correctness/useExhaustiveDependencies: calendarCenterDate triggers scroll restore on navigation
  useEffect(() => {
    if (savedScrollTop.current !== null && scrollRef.current) {
      scrollRef.current.scrollTop = savedScrollTop.current;
      savedScrollTop.current = null;
    }
  }, [calendarCenterDate]);

  // Swipe gesture for day navigation (touch + desktop mouse drag)
  const bindSwipe = useDrag(
    ({ swipe: [swipeX], event }) => {
      if (swipeX === -1) {
        event.preventDefault();
        goToNext();
      } else if (swipeX === 1) {
        event.preventDefault();
        goToPrev();
      }
    },
    {
      swipe: { distance: 50, velocity: 0.3 },
      filterTaps: true,
      axis: "x",
    },
  );

  // Auto-scroll during drag near top/bottom edges (Item 3) + cross-day drag nav (Item 5)
  const autoScrollRaf = useRef<number>(0);
  const edgeNavTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDraggingRef = useRef(false);

  useDndMonitor({
    onDragStart() {
      isDraggingRef.current = true;

      // Start auto-scroll loop
      const loop = () => {
        if (!isDraggingRef.current || !scrollRef.current) return;
        autoScrollRaf.current = requestAnimationFrame(loop);
      };
      autoScrollRaf.current = requestAnimationFrame(loop);
    },
    onDragOver(event) {
      if (!scrollRef.current || !isDraggingRef.current) return;

      const container = scrollRef.current;
      const rect = container.getBoundingClientRect();

      // Get current pointer Y
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

      // Auto-scroll near edges (Item 3)
      const EDGE_ZONE = 60;
      const SCROLL_SPEED = 8;
      const distFromTop = pointerY - rect.top;
      const distFromBottom = rect.bottom - pointerY;

      if (distFromTop < EDGE_ZONE && distFromTop > 0) {
        container.scrollTop -= SCROLL_SPEED * (1 - distFromTop / EDGE_ZONE);
      } else if (distFromBottom < EDGE_ZONE && distFromBottom > 0) {
        container.scrollTop += SCROLL_SPEED * (1 - distFromBottom / EDGE_ZONE);
      }

      // Cross-day edge navigation (Item 5)
      let clientX: number;
      if (event.activatorEvent instanceof TouchEvent) {
        clientX =
          event.activatorEvent.touches[0]?.clientX ??
          event.activatorEvent.changedTouches[0]?.clientX ??
          0;
      } else {
        clientX = (event.activatorEvent as PointerEvent).clientX;
      }
      const pointerX = clientX + (event.delta?.x ?? 0);

      const EDGE_X_ZONE = 40;
      const distFromLeft = pointerX - rect.left;
      const distFromRight = rect.right - pointerX;

      if (distFromLeft < EDGE_X_ZONE && distFromLeft >= 0) {
        if (!edgeNavTimer.current) {
          edgeNavTimer.current = setTimeout(() => {
            goToPrev();
            edgeNavTimer.current = null;
          }, 500);
        }
      } else if (distFromRight < EDGE_X_ZONE && distFromRight >= 0) {
        if (!edgeNavTimer.current) {
          edgeNavTimer.current = setTimeout(() => {
            goToNext();
            edgeNavTimer.current = null;
          }, 500);
        }
      } else if (edgeNavTimer.current) {
        clearTimeout(edgeNavTimer.current);
        edgeNavTimer.current = null;
      }
    },
    onDragEnd() {
      isDraggingRef.current = false;
      cancelAnimationFrame(autoScrollRaf.current);
      if (edgeNavTimer.current) {
        clearTimeout(edgeNavTimer.current);
        edgeNavTimer.current = null;
      }
    },
    onDragCancel() {
      isDraggingRef.current = false;
      cancelAnimationFrame(autoScrollRaf.current);
      if (edgeNavTimer.current) {
        clearTimeout(edgeNavTimer.current);
        edgeNavTimer.current = null;
      }
    },
  });

  return (
    <div className="relative flex flex-col flex-1 min-h-0 border-l">
      {/* Calendar header */}
      <div className="flex items-center gap-2 px-2 sm:px-3 py-2 border-b">
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 relative [@media(pointer:coarse)]:before:absolute [@media(pointer:coarse)]:before:inset-[-8px] [@media(pointer:coarse)]:before:content-['']"
            onClick={goToPrev}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs font-semibold tracking-wide uppercase whitespace-nowrap">
            {centerDateLabel}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 relative [@media(pointer:coarse)]:before:absolute [@media(pointer:coarse)]:before:inset-[-8px] [@media(pointer:coarse)]:before:content-['']"
            onClick={goToNext}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="ml-auto">
          <Button
            variant="default"
            size="sm"
            className="h-8 text-xs gap-1.5 font-semibold"
            onClick={() => setPlanModeOpen(true)}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Plan My Day
          </Button>
        </div>
      </div>

      {/* Day headers row (outside scroll for time-slot alignment) */}
      <div className="flex border-b flex-shrink-0">
        <div className="w-12 flex-shrink-0" />
        <div className="flex flex-1 divide-x divide-border/40">
          {dates.map((dateStr) => {
            const { dayName, dateLabel } = formatDayHeader(dateStr);
            const isToday = dateStr === todayString();
            const dayAnytime = anytimeTasks.filter((t) => t.scheduled_date === dateStr);
            return (
              <div
                key={dateStr}
                className={`flex-1 min-w-[140px] ${isToday ? "bg-primary/5" : ""}`}
              >
                <div className="flex flex-col items-center py-1.5">
                  <span
                    className={`text-xs font-semibold ${isToday ? "text-primary" : "text-muted-foreground"}`}
                  >
                    {dayName}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{dateLabel}</span>
                </div>
                {dayAnytime.length > 0 && (
                  <div className="border-t px-1 py-1 space-y-0.5">
                    <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide px-0.5">
                      Anytime
                    </span>
                    {dayAnytime.map((t) => (
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
              </div>
            );
          })}
        </div>
      </div>

      {/* Calendar body */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto"
        style={{
          maskImage:
            "linear-gradient(to bottom, transparent, black 40px, black calc(100% - 40px), transparent)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent, black 40px, black calc(100% - 40px), transparent)",
        }}
        onWheel={handleWheel}
        {...bindSwipe()}
      >
        <div className="flex">
          {/* Time ruler — aligned with day column grids */}
          <div className="flex-shrink-0 w-12 sticky left-0 z-10 bg-background">
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

          {/* Day columns (grid only — headers rendered above) */}
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
                hideHeader
              />
            ))}
          </div>
        </div>
      </div>

      {/* Floating zoom controls */}
      <div className="absolute bottom-4 right-4 flex items-center gap-2 z-20">
        <div className="flex items-center rounded-full bg-card border border-border shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={zoomOut}
            className="px-2 py-1 text-xs hover:bg-muted transition-colors"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <div className="w-px h-4 bg-border" />
          <button
            type="button"
            onClick={zoomIn}
            className="px-2 py-1 text-xs hover:bg-muted transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
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
