import { useDndMonitor } from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, Minus, Plus, Sparkles } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AppRoutersTasksTaskResponse } from "@/api/model";
import {
  useGetCalendarsApiV1CalendarsGet,
  useGetEventsApiV1EventsGet,
} from "@/api/queries/api/api";
import { useListInstancesApiV1InstancesGet } from "@/api/queries/instances/instances";
import { Button } from "@/components/ui/button";
import { useCarousel } from "@/hooks/use-carousel";
import { useSyncCalendarHourHeight } from "@/hooks/use-sync-preferences";
import {
  addDays,
  EXTENDED_TOTAL_HOURS,
  getExtendedHourLabels,
  getNextZoomStep,
  PREV_DAY_HOURS,
  parseDate,
  snapToZoomStep,
  todayString,
  ZOOM_STEPS,
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
  const carouselRef = useRef<HTMLDivElement>(null);
  const savedScrollTop = useRef<number | null>(null);
  const [planModeOpen, setPlanModeOpen] = useState(false);

  // Header label: "THURSDAY, FEB 19"
  const centerDateLabel = useMemo(() => {
    const d = parseDate(calendarCenterDate);
    const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
    const month = d.toLocaleDateString("en-US", { month: "short" });
    const day = d.getDate();
    return `${weekday}, ${month} ${day}`.toUpperCase();
  }, [calendarCenterDate]);

  // Adjacent dates for carousel panels
  const prevDate = addDays(calendarCenterDate, -1);
  const nextDate = addDays(calendarCenterDate, 1);

  // Data fetch range: wider to cover all carousel panels' extended timelines
  const startDate = addDays(calendarCenterDate, -2);
  const endDate = addDays(calendarCenterDate, 3);

  // Fetch events
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

  // Fetch recurring task instances
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

  // Anytime tasks for the center date (date-only, no time, not completed)
  const anytimeTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.scheduled_date === calendarCenterDate && !t.scheduled_time && t.status !== "completed",
      ),
    [tasks, calendarCenterDate],
  );

  const isNotToday = calendarCenterDate !== todayString();

  // Save scroll position before navigating
  const saveScroll = useCallback(() => {
    if (scrollRef.current) {
      savedScrollTop.current = scrollRef.current.scrollTop;
    }
  }, []);

  // Navigate dates (used by header buttons)
  const goToPrev = useCallback(() => {
    saveScroll();
    setCalendarCenterDate(addDays(calendarCenterDate, -1));
  }, [calendarCenterDate, setCalendarCenterDate, saveScroll]);

  const goToNext = useCallback(() => {
    saveScroll();
    setCalendarCenterDate(addDays(calendarCenterDate, 1));
  }, [calendarCenterDate, setCalendarCenterDate, saveScroll]);

  const goToToday = useCallback(() => {
    setCalendarCenterDate(todayString());
  }, [setCalendarCenterDate]);

  // Zoom controls
  const zoomIn = useCallback(() => {
    setCalendarHourHeight(getNextZoomStep(calendarHourHeight, "in"));
  }, [calendarHourHeight, setCalendarHourHeight]);

  const zoomOut = useCallback(() => {
    setCalendarHourHeight(getNextZoomStep(calendarHourHeight, "out"));
  }, [calendarHourHeight, setCalendarHourHeight]);

  // Smooth continuous zoom via Ctrl+wheel
  const targetZoomRef = useRef(calendarHourHeight);
  const saveZoomTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    targetZoomRef.current = calendarHourHeight;
  }, [calendarHourHeight]);

  // ── Carousel (scroll-snap based) ──────────────────────────────────────────
  const [isDndDragging, setIsDndDragging] = useState(false);
  const pendingReset = useRef(false);

  const commitNavigation = useCallback(
    (direction: "prev" | "next") => {
      pendingReset.current = true;
      saveScroll();
      if (direction === "next") {
        setCalendarCenterDate(addDays(calendarCenterDate, 1));
      } else {
        setCalendarCenterDate(addDays(calendarCenterDate, -1));
      }
    },
    [calendarCenterDate, setCalendarCenterDate, saveScroll],
  );

  const carousel = useCarousel({
    onNavigate: commitNavigation,
    containerRef: carouselRef,
    disabled: isDndDragging,
  });

  // After date update from carousel navigation, recenter instantly
  // biome-ignore lint/correctness/useExhaustiveDependencies: calendarCenterDate triggers carousel recenter
  useLayoutEffect(() => {
    if (pendingReset.current) {
      pendingReset.current = false;
      carousel.scrollToCenter();
    }
  }, [calendarCenterDate]);

  // Ctrl+wheel zoom (horizontal wheel is handled natively by the carousel scroll)
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        targetZoomRef.current = Math.max(
          ZOOM_STEPS[0],
          Math.min(ZOOM_STEPS[ZOOM_STEPS.length - 1], targetZoomRef.current - e.deltaY * 0.2),
        );
        setCalendarHourHeight(Math.round(targetZoomRef.current));

        if (saveZoomTimer.current) clearTimeout(saveZoomTimer.current);
        saveZoomTimer.current = setTimeout(() => {
          const snapped = snapToZoomStep(targetZoomRef.current);
          targetZoomRef.current = snapped;
          setCalendarHourHeight(snapped);
        }, 500);
      }
    },
    [setCalendarHourHeight],
  );

  // Scroll to current time on first render
  const initialHourHeight = useRef(calendarHourHeight);
  useEffect(() => {
    if (scrollRef.current) {
      const now = new Date();
      const targetOffset = (PREV_DAY_HOURS + now.getHours() - 1) * initialHourHeight.current;
      scrollRef.current.scrollTop = Math.max(0, targetOffset);
    }
  }, []);

  // Restore scroll position after date navigation
  // biome-ignore lint/correctness/useExhaustiveDependencies: calendarCenterDate triggers scroll restore
  useEffect(() => {
    if (savedScrollTop.current !== null && scrollRef.current) {
      scrollRef.current.scrollTop = savedScrollTop.current;
      savedScrollTop.current = null;
    }
  }, [calendarCenterDate]);

  // Auto-scroll during dnd-kit drag near top/bottom edges
  const autoScrollRaf = useRef<number>(0);

  useDndMonitor({
    onDragStart() {
      setIsDndDragging(true);
      const loop = () => {
        if (!scrollRef.current) return;
        autoScrollRaf.current = requestAnimationFrame(loop);
      };
      autoScrollRaf.current = requestAnimationFrame(loop);
    },
    onDragOver(event) {
      if (!scrollRef.current) return;
      const container = scrollRef.current;
      const rect = container.getBoundingClientRect();

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

      const EDGE_ZONE = 60;
      const SCROLL_SPEED = 8;
      const distFromTop = pointerY - rect.top;
      const distFromBottom = rect.bottom - pointerY;

      if (distFromTop < EDGE_ZONE && distFromTop > 0) {
        container.scrollTop -= SCROLL_SPEED * (1 - distFromTop / EDGE_ZONE);
      } else if (distFromBottom < EDGE_ZONE && distFromBottom > 0) {
        container.scrollTop += SCROLL_SPEED * (1 - distFromBottom / EDGE_ZONE);
      }
    },
    onDragEnd() {
      setIsDndDragging(false);
      cancelAnimationFrame(autoScrollRaf.current);
    },
    onDragCancel() {
      setIsDndDragging(false);
      cancelAnimationFrame(autoScrollRaf.current);
    },
  });

  // Hour labels for the time ruler
  const hourLabels = useMemo(() => getExtendedHourLabels(calendarHourHeight), [calendarHourHeight]);
  const totalHeight = EXTENDED_TOTAL_HOURS * calendarHourHeight;

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
          {isNotToday && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] font-semibold ml-1"
              onClick={goToToday}
            >
              Today
            </Button>
          )}
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

      {/* Anytime section */}
      {anytimeTasks.length > 0 && (
        <div className="border-b px-3 py-1.5 flex items-start gap-2 max-h-[82px] overflow-auto flex-shrink-0">
          <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-[0.08em] mt-1 flex-shrink-0">
            ANYTIME
          </span>
          <div className="flex flex-wrap gap-1 min-w-0">
            {anytimeTasks.map((t) => (
              <button
                key={t.id}
                type="button"
                className="text-[11px] truncate rounded-full px-2 py-0.5 hover:bg-accent/50 cursor-pointer bg-card border border-border/40 max-w-[180px]"
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
        </div>
      )}

      {/* Calendar body — vertical scroll wrapper */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{
          maskImage:
            "linear-gradient(to bottom, transparent, black 40px, black calc(100% - 40px), transparent)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent, black 40px, black calc(100% - 40px), transparent)",
        }}
        onWheel={handleWheel}
      >
        <div className="flex" style={{ height: `${totalHeight}px` }}>
          {/* Time ruler */}
          <div className="flex-shrink-0 w-12 z-10 bg-background">
            <div className="relative" style={{ height: `${totalHeight}px` }}>
              {hourLabels.map((hl) => (
                <div
                  key={`${hl.section}-${hl.hour}`}
                  className={`absolute w-full text-right pr-1.5 text-[10px] -translate-y-1/2 ${
                    hl.isAdjacentDay ? "text-muted-foreground/70 italic" : "text-muted-foreground"
                  }`}
                  style={{ top: `${hl.offset}px` }}
                >
                  {hl.label}
                </div>
              ))}
            </div>
          </div>

          {/* Scroll-snap carousel */}
          <div
            ref={carouselRef}
            className="flex-1 overflow-x-auto overflow-y-hidden"
            style={{
              scrollSnapType: "x mandatory",
              overscrollBehaviorX: "contain",
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              WebkitOverflowScrolling: "touch",
            }}
          >
            <div className="flex h-full" style={{ width: "300%" }}>
              <div
                className="h-full"
                style={{ flex: "0 0 33.333%", scrollSnapAlign: "start", scrollSnapStop: "always" }}
              >
                <DayColumn
                  centerDate={prevDate}
                  events={safeEvents}
                  tasks={scheduledTasks}
                  instances={safeInstances}
                  hourHeight={calendarHourHeight}
                  calendarColors={calendarColors}
                  onTaskClick={onTaskClick}
                  panelId="prev"
                />
              </div>
              <div
                className="h-full"
                style={{ flex: "0 0 33.333%", scrollSnapAlign: "start", scrollSnapStop: "always" }}
              >
                <DayColumn
                  centerDate={calendarCenterDate}
                  events={safeEvents}
                  tasks={scheduledTasks}
                  instances={safeInstances}
                  hourHeight={calendarHourHeight}
                  calendarColors={calendarColors}
                  onTaskClick={onTaskClick}
                  panelId="center"
                />
              </div>
              <div
                className="h-full"
                style={{ flex: "0 0 33.333%", scrollSnapAlign: "start", scrollSnapStop: "always" }}
              >
                <DayColumn
                  centerDate={nextDate}
                  events={safeEvents}
                  tasks={scheduledTasks}
                  instances={safeInstances}
                  hourHeight={calendarHourHeight}
                  calendarColors={calendarColors}
                  onTaskClick={onTaskClick}
                  panelId="next"
                />
              </div>
            </div>
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
