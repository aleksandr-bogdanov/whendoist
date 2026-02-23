import { useDndMonitor, useDroppable } from "@dnd-kit/core";
import { keepPreviousData } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Minus, Plus, Sparkles } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AppRoutersTasksTaskResponse, InstanceResponse } from "@/api/model";
import {
  useGetCalendarsApiV1CalendarsGet,
  useGetEventsApiV1EventsGet,
} from "@/api/queries/api/api";
import { useListInstancesApiV1InstancesGet } from "@/api/queries/instances/instances";
import { useListTasksApiV1TasksGet } from "@/api/queries/tasks/tasks";
import { Button } from "@/components/ui/button";
import { useCarousel } from "@/hooks/use-carousel";
import { useSyncCalendarHourHeight } from "@/hooks/use-sync-preferences";
import {
  addDays,
  EXTENDED_TOTAL_HOURS,
  getExtendedHourLabels,
  getNextZoomStep,
  getSectionBoundaries,
  PREV_DAY_HOURS,
  parseDate,
  snapToZoomStep,
  todayString,
  ZOOM_STEPS,
} from "@/lib/calendar-utils";
import { useUIStore } from "@/stores/ui-store";
import { AnytimeInstancePill } from "./anytime-instance-pill";
import { AnytimeTaskPill } from "./anytime-task-pill";
import { DayColumn } from "./day-column";
import { PlanMode } from "./plan-mode";

const CENTER_INDEX = 2; // 5 panels: 0, 1, [2], 3, 4
const PANEL_OFFSETS = [-2, -1, 0, 1, 2];

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

  // 5 carousel panel dates
  const panelDates = useMemo(
    () => PANEL_OFFSETS.map((offset) => addDays(calendarCenterDate, offset)),
    [calendarCenterDate],
  );

  // Track which carousel panel is currently visible (updates live during scroll)
  const [visiblePanel, setVisiblePanel] = useState(CENTER_INDEX);
  const displayDate = addDays(calendarCenterDate, visiblePanel - CENTER_INDEX);

  // Header label based on currently visible panel
  const displayDateLabel = useMemo(() => {
    const d = parseDate(displayDate);
    const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
    const month = d.toLocaleDateString("en-US", { month: "short" });
    const day = d.getDate();
    return `${weekday}, ${month} ${day}`.toUpperCase();
  }, [displayDate]);

  // Wider fetch range: covers all 5 panels' extended timelines + 1 day of navigation buffer
  // Each panel needs ±1 day for extended timelines (prev evening / next morning),
  // plus extra padding so that navigating ±2 days still hits cache.
  const startDate = addDays(calendarCenterDate, -5);
  const endDate = addDays(calendarCenterDate, 5);

  // Fetch events — keepPreviousData prevents flash when date range shifts
  const { data: events } = useGetEventsApiV1EventsGet(
    { start_date: startDate, end_date: endDate },
    { query: { staleTime: 60_000, placeholderData: keepPreviousData } },
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

  // Fetch recurring task instances (all statuses so completed stay visible) — keepPreviousData prevents flash
  const { data: instances } = useListInstancesApiV1InstancesGet(
    { start_date: startDate, end_date: endDate, status: "all" },
    { query: { staleTime: 60_000, placeholderData: keepPreviousData } },
  );

  const safeEvents = events ?? [];
  const safeInstances = instances ?? [];

  // Fetch all tasks (pending + completed) for calendar display — so completed tasks stay visible
  const { data: allStatusTasks } = useListTasksApiV1TasksGet(
    { status: "all" },
    { query: { staleTime: 60_000, placeholderData: keepPreviousData } },
  );
  const safeAllStatusTasks = allStatusTasks ?? tasks;

  // Scheduled tasks with a specific time (exclude recurring parents — their instances render instead)
  const scheduledTasks = useMemo(
    () => safeAllStatusTasks.filter((t) => t.scheduled_date && t.scheduled_time && !t.is_recurring),
    [safeAllStatusTasks],
  );

  // Anytime tasks for the displayed date (exclude recurring parents)
  const anytimeTasks = useMemo(
    () =>
      safeAllStatusTasks.filter(
        (t) => t.scheduled_date === displayDate && !t.scheduled_time && !t.is_recurring,
      ),
    [safeAllStatusTasks, displayDate],
  );

  // Anytime instances for the displayed date (no scheduled_datetime, not skipped)
  const anytimeInstances = useMemo(
    () =>
      safeInstances.filter(
        (inst) =>
          inst.instance_date === displayDate &&
          !inst.scheduled_datetime &&
          inst.status !== "skipped",
      ),
    [safeInstances, displayDate],
  );

  const isNotToday = displayDate !== todayString();

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

  // ── Carousel (scroll-snap based, 5 panels) ────────────────────────────────
  const [isDndDragging, setIsDndDragging] = useState(false);

  const commitNavigation = useCallback(
    (offset: number) => {
      saveScroll();
      // Reset visiblePanel to center BEFORE updating the date — React 18 batches both
      // state updates into one render, so displayDate never shows the wrong day.
      setVisiblePanel(CENTER_INDEX);
      setCalendarCenterDate(addDays(calendarCenterDate, offset));
    },
    [calendarCenterDate, setCalendarCenterDate, saveScroll],
  );

  const carousel = useCarousel({
    onNavigate: commitNavigation,
    onVisiblePanelChange: setVisiblePanel,
    containerRef: carouselRef,
    disabled: isDndDragging,
  });

  // After any date change, recenter the carousel to panel 2 (center)
  // biome-ignore lint/correctness/useExhaustiveDependencies: calendarCenterDate triggers carousel recenter
  useLayoutEffect(() => {
    carousel.scrollToCenter();
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

  // Auto-scroll during dnd-kit drag near top/bottom edges (vertical) and
  // auto-navigate to previous/next day near left/right edges (horizontal).
  // Uses real pointer position (not dnd-kit delta which drifts) and runs in a
  // RAF loop so scrolling continues even when the pointer is held still.
  const autoScrollRaf = useRef<number>(0);
  const dndPointerY = useRef<number>(0);
  const dndPointerX = useRef<number>(0);
  const isDndActive = useRef(false);
  const navCooldownRef = useRef<number>(0);
  const isNavAnimating = useRef(false);
  const calendarCenterDateRef = useRef(calendarCenterDate);
  calendarCenterDateRef.current = calendarCenterDate;

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (isDndActive.current) {
        dndPointerY.current = e.clientY;
        dndPointerX.current = e.clientX;
      }
    };
    const touchHandler = (e: TouchEvent) => {
      if (isDndActive.current && e.touches[0]) {
        dndPointerY.current = e.touches[0].clientY;
        dndPointerX.current = e.touches[0].clientX;
      }
    };
    document.addEventListener("pointermove", handler);
    document.addEventListener("touchmove", touchHandler);
    return () => {
      document.removeEventListener("pointermove", handler);
      document.removeEventListener("touchmove", touchHandler);
    };
  }, []);

  useDndMonitor({
    onDragStart(event) {
      setIsDndDragging(true);
      isDndActive.current = true;
      navCooldownRef.current = Date.now(); // Prevent immediate navigation on drag start
      isNavAnimating.current = false;
      // Seed initial pointer position from the activator event
      const ev = event.activatorEvent;
      if (ev instanceof TouchEvent) {
        dndPointerY.current = ev.touches[0]?.clientY ?? 0;
        dndPointerX.current = ev.touches[0]?.clientX ?? 0;
      } else {
        dndPointerY.current = (ev as PointerEvent).clientY;
        dndPointerX.current = (ev as PointerEvent).clientX;
      }
      const EDGE_ZONE = 60;
      const SCROLL_SPEED = 8;
      const HORIZONTAL_EDGE_ZONE = 40;
      const NAV_COOLDOWN_MS = 700;
      const loop = () => {
        if (!scrollRef.current || !isDndActive.current) return;
        const container = scrollRef.current;
        const rect = container.getBoundingClientRect();
        const pointerY = dndPointerY.current;
        const pointerX = dndPointerX.current;

        // Vertical auto-scroll near top/bottom edges
        const distFromTop = pointerY - rect.top;
        const distFromBottom = rect.bottom - pointerY;
        if (distFromTop < EDGE_ZONE && distFromTop > 0) {
          container.scrollTop -= SCROLL_SPEED * (1 - distFromTop / EDGE_ZONE);
        } else if (distFromBottom < EDGE_ZONE && distFromBottom > 0) {
          container.scrollTop += SCROLL_SPEED * (1 - distFromBottom / EDGE_ZONE);
        }

        // Horizontal auto-navigate: smoothly slide carousel, then commit
        const el = carouselRef.current;
        const now = Date.now();
        if (el && !isNavAnimating.current && now - navCooldownRef.current > NAV_COOLDOWN_MS) {
          const distFromLeft = pointerX - rect.left;
          const distFromRight = rect.right - pointerX;
          let direction = 0;
          if (distFromLeft < HORIZONTAL_EDGE_ZONE && distFromLeft > 0) direction = -1;
          else if (distFromRight < HORIZONTAL_EDGE_ZONE && distFromRight > 0) direction = 1;

          if (direction !== 0) {
            isNavAnimating.current = true;
            navCooldownRef.current = now;
            const panelWidth = el.offsetWidth;
            const targetPanel = Math.max(0, Math.min(4, CENTER_INDEX + direction));
            // Smooth scroll to adjacent panel
            el.scrollTo({ left: targetPanel * panelWidth, behavior: "smooth" });
            // After animation settles, commit navigation and recenter
            setTimeout(() => {
              if (!isDndActive.current) return;
              savedScrollTop.current = container.scrollTop;
              setVisiblePanel(CENTER_INDEX);
              setCalendarCenterDate(addDays(calendarCenterDateRef.current, direction));
              isNavAnimating.current = false;
            }, 350);
          }
        }

        autoScrollRaf.current = requestAnimationFrame(loop);
      };
      autoScrollRaf.current = requestAnimationFrame(loop);
    },
    onDragEnd() {
      setIsDndDragging(false);
      isDndActive.current = false;
      isNavAnimating.current = false;
      cancelAnimationFrame(autoScrollRaf.current);
      // Re-center carousel after drag — it may have drifted off-center
      requestAnimationFrame(() => carousel.scrollToCenter());
    },
    onDragCancel() {
      setIsDndDragging(false);
      isDndActive.current = false;
      isNavAnimating.current = false;
      cancelAnimationFrame(autoScrollRaf.current);
      requestAnimationFrame(() => carousel.scrollToCenter());
    },
  });

  // Hour labels for the time ruler
  const hourLabels = useMemo(() => getExtendedHourLabels(calendarHourHeight), [calendarHourHeight]);
  const totalHeight = EXTENDED_TOTAL_HOURS * calendarHourHeight;

  // Drop overlay for calendar body — sits OUTSIDE scroll containers so dnd-kit
  // measures the rect correctly. Calendar droppables inside nested scroll containers
  // (carouselRef + scrollRef) have broken coordinate math in dnd-kit's Rect class.
  const overlayBoundaries = useMemo(
    () => getSectionBoundaries(calendarHourHeight),
    [calendarHourHeight],
  );
  const getScrollTop = useCallback(() => scrollRef.current?.scrollTop ?? 0, []);
  const getCalendarRect = useCallback(() => scrollRef.current?.getBoundingClientRect() ?? null, []);
  const { setNodeRef: setOverlayDropRef } = useDroppable({
    id: `calendar-overlay-${displayDate}`,
    data: {
      type: "calendar-overlay",
      centerDate: calendarCenterDate,
      prevDate: addDays(calendarCenterDate, -1),
      nextDate: addDays(calendarCenterDate, 1),
      boundaries: overlayBoundaries,
      getScrollTop,
      getCalendarRect,
    },
  });

  return (
    <div className="relative flex flex-col flex-1 min-h-0 border-l md:border md:rounded-[12px] md:shadow-[var(--shadow-card)]">
      {/* Calendar header */}
      <div className="flex items-center gap-1.5 px-2 sm:px-4 py-2 border-b bg-muted/30 md:rounded-t-[12px]">
        {/* Navigation: arrows + date label (can shrink) */}
        <div className="flex items-center gap-0.5 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 flex-shrink-0 relative [@media(pointer:coarse)]:before:absolute [@media(pointer:coarse)]:before:inset-[-8px] [@media(pointer:coarse)]:before:content-['']"
            onClick={goToPrev}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs font-semibold tracking-wide uppercase truncate min-w-0">
            {displayDateLabel}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 flex-shrink-0 relative [@media(pointer:coarse)]:before:absolute [@media(pointer:coarse)]:before:inset-[-8px] [@media(pointer:coarse)]:before:content-['']"
            onClick={goToNext}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Pinned action buttons */}
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
          {isNotToday && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] font-semibold"
              onClick={goToToday}
            >
              Today
            </Button>
          )}
          <Button
            variant="cta"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => setPlanModeOpen(true)}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Plan My Day
          </Button>
        </div>
      </div>

      {/* Anytime section — droppable drop zone, horizontal scroll */}
      <AnytimeSection
        displayDate={displayDate}
        anytimeTasks={anytimeTasks}
        anytimeInstances={anytimeInstances}
        allTasks={safeAllStatusTasks}
        onTaskClick={onTaskClick}
      />

      {/* Calendar body — wrapper for scroll + drop overlay */}
      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollRef}
          className="absolute inset-0 overflow-y-auto overflow-x-hidden"
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
            <div className="flex-shrink-0 w-12 bg-background">
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

            {/* Scroll-snap carousel (5 panels) */}
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
              <div className="flex h-full" style={{ width: "500%" }}>
                {panelDates.map((date, i) => (
                  <div
                    key={PANEL_OFFSETS[i]}
                    className="h-full"
                    style={{
                      flex: "0 0 20%",
                      scrollSnapAlign: "start",
                      scrollSnapStop: "always",
                    }}
                  >
                    <DayColumn
                      centerDate={date}
                      events={safeEvents}
                      tasks={scheduledTasks}
                      allTasks={safeAllStatusTasks}
                      instances={safeInstances}
                      hourHeight={calendarHourHeight}
                      calendarColors={calendarColors}
                      onTaskClick={onTaskClick}
                      isActivePanel={i === CENTER_INDEX}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        {/* Drop overlay — outside scroll containers so dnd-kit rect measurement works */}
        <div ref={setOverlayDropRef} className="absolute inset-0 pointer-events-none z-[5]" />
      </div>

      {/* Floating controls: zoom */}
      <div className="absolute bottom-4 right-4 flex items-center gap-2 z-20">
        <div className="flex items-center rounded-full bg-card border border-border shadow-[var(--shadow-card)] overflow-hidden">
          <button
            type="button"
            onClick={zoomOut}
            className="px-2 py-1 text-xs hover:bg-[rgba(109,94,246,0.06)] transition-colors"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <div className="w-px h-4 bg-border" />
          <button
            type="button"
            onClick={zoomIn}
            className="px-2 py-1 text-xs hover:bg-[rgba(109,94,246,0.06)] transition-colors"
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

// ─── Anytime Section (droppable + draggable pills) ──────────────────────────

function AnytimeSection({
  displayDate,
  anytimeTasks,
  anytimeInstances,
  allTasks,
  onTaskClick,
}: {
  displayDate: string;
  anytimeTasks: AppRoutersTasksTaskResponse[];
  anytimeInstances: InstanceResponse[];
  allTasks: AppRoutersTasksTaskResponse[];
  onTaskClick?: (task: AppRoutersTasksTaskResponse) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `anytime-drop-${displayDate}`,
    data: { type: "anytime", dateStr: displayDate },
  });

  // Build a lookup map for parent tasks (for instance pills)
  const taskMap = useMemo(() => {
    const map = new Map<number, AppRoutersTasksTaskResponse>();
    for (const t of allTasks) map.set(t.id, t);
    return map;
  }, [allTasks]);

  const hasItems = anytimeTasks.length > 0 || anytimeInstances.length > 0;

  return (
    <div
      ref={setNodeRef}
      className={`border-b px-3 py-1.5 flex-shrink-0 transition-colors flex items-start gap-2 ${
        isOver ? "bg-primary/10 border-b-primary/40" : ""
      }`}
    >
      <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-[0.08em] leading-[22px] flex-shrink-0">
        ANYTIME
      </span>
      <div className="flex flex-wrap gap-1 min-h-[22px] items-center flex-1 min-w-0">
        {hasItems ? (
          <>
            {anytimeTasks.map((t) => (
              <AnytimeTaskPill key={t.id} task={t} onClick={() => onTaskClick?.(t)} />
            ))}
            {anytimeInstances.map((inst) => (
              <AnytimeInstancePill
                key={`inst-${inst.id}`}
                instance={inst}
                parentTask={taskMap.get(inst.task_id)}
                onTaskClick={onTaskClick}
              />
            ))}
          </>
        ) : (
          <span className="text-[10px] text-muted-foreground/50">
            {isOver ? "Drop here for anytime" : "No tasks"}
          </span>
        )}
      </div>
    </div>
  );
}
