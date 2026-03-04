/**
 * Calendar utility functions for time positioning, overlap detection,
 * date navigation, and plan mode auto-scheduling.
 */

import type { EventResponse, InstanceResponse, TaskResponse } from "@/api/model";
import { getHoursInTimezone, getMinutesInTimezone, toDateStringInTimezone } from "@/lib/timezone";

// ─── Date Helpers ────────────────────────────────────────────────────────────

/** Format date as YYYY-MM-DD (local time, not UTC) */
export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Get today's date string (in user timezone if provided, otherwise browser local) */
export function todayString(tz?: string): string {
  if (tz) return toDateStringInTimezone(new Date(), tz);
  return toDateString(new Date());
}

/** Parse YYYY-MM-DD to Date (local midnight) */
export function parseDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`);
}

/** Add days to a date string */
export function addDays(dateStr: string, days: number): string {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return toDateString(d);
}

/** Get array of date strings for a range centered on a date */
export function getDateRange(centerDate: string, daysAround: number): string[] {
  const dates: string[] = [];
  for (let i = -daysAround; i <= daysAround; i++) {
    dates.push(addDays(centerDate, i));
  }
  return dates;
}

/** Format a date for display in column header */
export function formatDayHeader(dateStr: string): { dayName: string; dateLabel: string } {
  const date = parseDate(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  let dayName: string;
  if (date.getTime() === today.getTime()) dayName = "Today";
  else if (date.getTime() === tomorrow.getTime()) dayName = "Tomorrow";
  else if (date.getTime() === yesterday.getTime()) dayName = "Yesterday";
  else dayName = date.toLocaleDateString("en-US", { weekday: "short" });

  const dateLabel = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return { dayName, dateLabel };
}

// ─── Time Positioning ────────────────────────────────────────────────────────

/** Hours displayed in the day column (6am to 11pm) — used by plan-mode */
export const DAY_START_HOUR = 6;
export const DAY_END_HOUR = 23;
export const TOTAL_HOURS = DAY_END_HOUR - DAY_START_HOUR;

/** Convert hour + minutes to pixel offset from top (plan-mode compat) */
export function timeToOffset(hour: number, minutes: number, hourHeight: number): number {
  return (hour - DAY_START_HOUR + minutes / 60) * hourHeight;
}

/** Convert ISO datetime string to pixel offset (timezone-aware for UTC-stored datetimes) */
export function datetimeToOffset(datetimeStr: string, hourHeight: number, tz?: string): number {
  const date = new Date(datetimeStr);
  const h = tz ? getHoursInTimezone(date, tz) : date.getHours();
  const m = tz ? getMinutesInTimezone(date, tz) : date.getMinutes();
  return timeToOffset(h, m, hourHeight);
}

/** Convert pixel offset to hours and minutes (snapped to 15-minute grid) */
export function offsetToTime(
  offsetY: number,
  hourHeight: number,
  startHour = DAY_START_HOUR,
): { hour: number; minutes: number } {
  const totalMinutes = (offsetY / hourHeight) * 60 + startHour * 60;
  const snappedMinutes = Math.round(totalMinutes / 15) * 15;
  const hour = Math.floor(snappedMinutes / 60);
  const minutes = snappedMinutes % 60;
  return { hour: Math.max(0, Math.min(23, hour)), minutes };
}

/** Convert duration in minutes to pixel height */
export function durationToHeight(durationMinutes: number, hourHeight: number): number {
  return (durationMinutes / 60) * hourHeight;
}

/** Format time as HH:MM AM/PM */
export function formatTime(hour: number, minutes: number): string {
  const h = hour % 12 || 12;
  const ampm = hour < 12 ? "AM" : "PM";
  const m = minutes.toString().padStart(2, "0");
  return `${h}:${m} ${ampm}`;
}

/** Format hour as compact label (e.g., "9PM", "12AM") */
export function formatHourLabel(hour: number): string {
  const h = hour % 12 || 12;
  const ampm = hour < 12 ? "AM" : "PM";
  return `${h}${ampm}`;
}

// ─── Extended Timeline (31-hour view) ────────────────────────────────────────

export type DaySection = "prev" | "current" | "next";

/** Previous day starts at 10PM */
export const PREV_DAY_START_HOUR = 22;
/** Previous day contributes 2 hours (22:00-23:59) */
export const PREV_DAY_HOURS = 2;
/** Current day contributes all 24 hours */
export const CURRENT_DAY_HOURS = 24;
/** Next day ends at 5AM (exclusive) */
export const NEXT_DAY_END_HOUR = 5;
/** Next day contributes 5 hours (00:00-04:59) */
export const NEXT_DAY_HOURS = 5;
/** Total hours in the extended timeline */
export const EXTENDED_TOTAL_HOURS = PREV_DAY_HOURS + CURRENT_DAY_HOURS + NEXT_DAY_HOURS; // 31

/** Convert hour+minutes in a section to pixel offset on the 31h timeline */
export function extendedTimeToOffset(
  hour: number,
  minutes: number,
  section: DaySection,
  hourHeight: number,
): number {
  const fractional = minutes / 60;
  switch (section) {
    case "prev":
      return (hour - PREV_DAY_START_HOUR + fractional) * hourHeight;
    case "current":
      return (PREV_DAY_HOURS + hour + fractional) * hourHeight;
    case "next":
      return (PREV_DAY_HOURS + CURRENT_DAY_HOURS + hour + fractional) * hourHeight;
  }
}

/** Get pixel boundaries for each section */
export function getSectionBoundaries(hourHeight: number): {
  prevStart: number;
  prevEnd: number;
  currentStart: number;
  currentEnd: number;
  nextStart: number;
  nextEnd: number;
} {
  const prevStart = 0;
  const prevEnd = PREV_DAY_HOURS * hourHeight;
  const currentStart = prevEnd;
  const currentEnd = currentStart + CURRENT_DAY_HOURS * hourHeight;
  const nextStart = currentEnd;
  const nextEnd = nextStart + NEXT_DAY_HOURS * hourHeight;
  return { prevStart, prevEnd, currentStart, currentEnd, nextStart, nextEnd };
}

export interface ExtendedHourLabel {
  hour: number;
  section: DaySection;
  offset: number;
  label: string;
  isAdjacentDay: boolean;
}

/** Get hour labels for all hours of the extended timeline */
export function getExtendedHourLabels(hourHeight: number): ExtendedHourLabel[] {
  const labels: ExtendedHourLabel[] = [];

  // Prev day: hours 22-23
  for (let h = PREV_DAY_START_HOUR; h <= 23; h++) {
    labels.push({
      hour: h,
      section: "prev",
      offset: (h - PREV_DAY_START_HOUR) * hourHeight,
      label: formatHourLabel(h),
      isAdjacentDay: true,
    });
  }

  // Current day: hours 0-23
  for (let h = 0; h <= 23; h++) {
    labels.push({
      hour: h,
      section: "current",
      offset: (PREV_DAY_HOURS + h) * hourHeight,
      label: formatHourLabel(h),
      isAdjacentDay: false,
    });
  }

  // Next day: hours 0-16
  for (let h = 0; h < NEXT_DAY_END_HOUR; h++) {
    labels.push({
      hour: h,
      section: "next",
      offset: (PREV_DAY_HOURS + CURRENT_DAY_HOURS + h) * hourHeight,
      label: formatHourLabel(h),
      isAdjacentDay: true,
    });
  }

  return labels;
}

// ─── Time Range Types ────────────────────────────────────────────────────────

export interface TimeRange {
  startMinutes: number; // minutes from midnight
  endMinutes: number;
}

/** Convert an event or task to a TimeRange */
function toMinutesSinceMidnight(hour: number, minutes: number): number {
  return hour * 60 + minutes;
}

/** Extract hours and minutes from a UTC datetime, converted to the given timezone */
function datetimeHoursMinutes(dt: Date, tz?: string): { h: number; m: number } {
  return {
    h: tz ? getHoursInTimezone(dt, tz) : dt.getHours(),
    m: tz ? getMinutesInTimezone(dt, tz) : dt.getMinutes(),
  };
}

function eventToTimeRange(event: EventResponse, tz?: string): TimeRange {
  const start = datetimeHoursMinutes(new Date(event.start), tz);
  const end = datetimeHoursMinutes(new Date(event.end), tz);
  return {
    startMinutes: toMinutesSinceMidnight(start.h, start.m),
    endMinutes: toMinutesSinceMidnight(end.h, end.m),
  };
}

function taskToTimeRange(task: TaskResponse): TimeRange | null {
  if (!task.scheduled_time) return null;
  const [hStr, mStr] = task.scheduled_time.split(":");
  const h = Number.parseInt(hStr, 10);
  const m = Number.parseInt(mStr, 10);
  const duration = task.duration_minutes ?? 30;
  return {
    startMinutes: toMinutesSinceMidnight(h, m),
    endMinutes: toMinutesSinceMidnight(h, m) + duration,
  };
}

// ─── Overlap Detection ───────────────────────────────────────────────────────

export interface PositionedItem {
  id: string;
  type: "event" | "task" | "instance";
  top: number;
  height: number;
  startMinutes: number;
  endMinutes: number;
  column: number;
  totalColumns: number;
  daySection?: DaySection;
}

const MAX_OVERLAP_COLUMNS = 3;

/** Detect overlaps and assign column positions for side-by-side display (single day) */
export function calculateOverlaps(
  events: EventResponse[],
  tasks: TaskResponse[],
  dateStr: string,
  hourHeight: number,
  instances?: InstanceResponse[],
  tz?: string,
): PositionedItem[] {
  const items: {
    id: string;
    type: "event" | "task" | "instance";
    range: TimeRange;
    original: unknown;
  }[] = [];

  // Add events for this date
  for (const event of events) {
    if (event.all_day) continue;
    const eventStart = new Date(event.start);
    const eventDate = tz
      ? toDateStringInTimezone(eventStart, tz)
      : eventStart.toISOString().split("T")[0];
    if (eventDate !== dateStr) continue;
    items.push({
      id: event.id,
      type: "event",
      range: eventToTimeRange(event, tz),
      original: event,
    });
  }

  // Add scheduled tasks for this date (naive HH:MM — no tz conversion needed)
  for (const task of tasks) {
    if (task.scheduled_date !== dateStr || !task.scheduled_time) continue;
    const range = taskToTimeRange(task);
    if (!range) continue;
    items.push({ id: String(task.id), type: "task", range, original: task });
  }

  // Add recurring task instances for this date (only those with a scheduled time)
  if (instances) {
    for (const inst of instances) {
      if (inst.instance_date !== dateStr) continue;
      if (!inst.scheduled_datetime) continue; // Time-less → anytime section
      const { h, m } = datetimeHoursMinutes(new Date(inst.scheduled_datetime), tz);
      const duration = inst.duration_minutes ?? 30;
      const range: TimeRange = {
        startMinutes: toMinutesSinceMidnight(h, m),
        endMinutes: toMinutesSinceMidnight(h, m) + duration,
      };
      items.push({ id: `inst-${inst.id}`, type: "instance", range, original: inst });
    }
  }

  // Sort by start time, then by id for stable ordering across refetches
  items.sort((a, b) => a.range.startMinutes - b.range.startMinutes || a.id.localeCompare(b.id));

  // Group overlapping items
  const positioned: PositionedItem[] = [];
  let groupEnd = -1;
  let group: typeof items = [];

  function flushGroup() {
    if (group.length === 0) return;
    const totalColumns = Math.min(group.length, MAX_OVERLAP_COLUMNS);
    for (let i = 0; i < group.length; i++) {
      const item = group[i];
      const top = timeToOffset(
        Math.floor(item.range.startMinutes / 60),
        item.range.startMinutes % 60,
        hourHeight,
      );
      const duration = item.range.endMinutes - item.range.startMinutes;
      const height = durationToHeight(Math.max(duration, 15), hourHeight);
      positioned.push({
        id: item.id,
        type: item.type,
        top,
        height,
        startMinutes: item.range.startMinutes,
        endMinutes: item.range.endMinutes,
        column: i % totalColumns,
        totalColumns,
      });
    }
  }

  for (const item of items) {
    if (item.range.startMinutes < groupEnd) {
      // Overlaps with current group
      group.push(item);
      groupEnd = Math.max(groupEnd, item.range.endMinutes);
    } else {
      // New group
      flushGroup();
      group = [item];
      groupEnd = item.range.endMinutes;
    }
  }
  flushGroup();

  return positioned;
}

// ─── Extended Overlap Detection (44-hour unified) ────────────────────────────

interface ExtendedRangeItem {
  id: string;
  type: "event" | "task" | "instance";
  section: DaySection;
  /** Absolute minutes from the start of the 44h timeline (prev 21:00 = 0) */
  absStart: number;
  absEnd: number;
  /** Original minutes-since-midnight for the item's own day */
  startMinutes: number;
  endMinutes: number;
}

/** Convert a time-of-day range to absolute minutes on the 44h timeline */
function toAbsoluteMinutes(minutesSinceMidnight: number, section: DaySection): number {
  switch (section) {
    case "prev":
      // 21:00 = 0, 22:00 = 60, 23:00 = 120, 23:59 = 179
      return minutesSinceMidnight - PREV_DAY_START_HOUR * 60;
    case "current":
      // 0:00 = 180, 12:00 = 900, 23:59 = 1619
      return PREV_DAY_HOURS * 60 + minutesSinceMidnight;
    case "next":
      // 0:00 = 1620, 16:59 = 2639
      return (PREV_DAY_HOURS + CURRENT_DAY_HOURS) * 60 + minutesSinceMidnight;
  }
}

/** Calculate positioned items across the entire 44-hour extended timeline */
export function calculateExtendedOverlaps(
  events: EventResponse[],
  tasks: TaskResponse[],
  instances: InstanceResponse[],
  centerDate: string,
  hourHeight: number,
  tz?: string,
): PositionedItem[] {
  const prevDate = addDays(centerDate, -1);
  const nextDate = addDays(centerDate, 1);
  const rangeItems: ExtendedRangeItem[] = [];

  // Helper to collect items for a specific date+section
  function collectForDate(dateStr: string, section: DaySection, minHour: number, maxHour: number) {
    // Events
    for (const event of events) {
      if (event.all_day) continue;
      const eventStart = new Date(event.start);
      const eventDate = tz
        ? toDateStringInTimezone(eventStart, tz)
        : eventStart.toISOString().split("T")[0];
      if (eventDate !== dateStr) continue;
      const range = eventToTimeRange(event, tz);
      const startHour = Math.floor(range.startMinutes / 60);
      if (startHour < minHour || startHour >= maxHour) continue;
      rangeItems.push({
        id: event.id,
        type: "event",
        section,
        absStart: toAbsoluteMinutes(range.startMinutes, section),
        absEnd: toAbsoluteMinutes(range.endMinutes, section),
        startMinutes: range.startMinutes,
        endMinutes: range.endMinutes,
      });
    }

    // Tasks (naive HH:MM — no tz conversion needed)
    for (const task of tasks) {
      if (task.scheduled_date !== dateStr || !task.scheduled_time) continue;
      const range = taskToTimeRange(task);
      if (!range) continue;
      const startHour = Math.floor(range.startMinutes / 60);
      if (startHour < minHour || startHour >= maxHour) continue;
      rangeItems.push({
        id: String(task.id),
        type: "task",
        section,
        absStart: toAbsoluteMinutes(range.startMinutes, section),
        absEnd: toAbsoluteMinutes(range.endMinutes, section),
        startMinutes: range.startMinutes,
        endMinutes: range.endMinutes,
      });
    }

    // Instances (only those with a scheduled time — time-less go to anytime section)
    for (const inst of instances) {
      if (inst.instance_date !== dateStr) continue;
      if (!inst.scheduled_datetime) continue;
      const { h, m } = datetimeHoursMinutes(new Date(inst.scheduled_datetime), tz);
      const duration = inst.duration_minutes ?? 30;
      const range: TimeRange = {
        startMinutes: toMinutesSinceMidnight(h, m),
        endMinutes: toMinutesSinceMidnight(h, m) + duration,
      };
      const startHour = Math.floor(range.startMinutes / 60);
      if (startHour < minHour || startHour >= maxHour) continue;
      rangeItems.push({
        id: `inst-${inst.id}`,
        type: "instance",
        section,
        absStart: toAbsoluteMinutes(range.startMinutes, section),
        absEnd: toAbsoluteMinutes(range.endMinutes, section),
        startMinutes: range.startMinutes,
        endMinutes: range.endMinutes,
      });
    }
  }

  // Prev day: 21:00-23:59
  collectForDate(prevDate, "prev", PREV_DAY_START_HOUR, 24);
  // Current day: 00:00-23:59
  collectForDate(centerDate, "current", 0, 24);
  // Next day: 00:00-16:59
  collectForDate(nextDate, "next", 0, NEXT_DAY_END_HOUR);

  // Sort by absolute start, then by id for stable ordering across refetches
  rangeItems.sort((a, b) => a.absStart - b.absStart || a.id.localeCompare(b.id));

  // Group overlapping items and assign columns
  const positioned: PositionedItem[] = [];
  let groupEnd = -1;
  let group: ExtendedRangeItem[] = [];

  function flushGroup() {
    if (group.length === 0) return;
    const totalColumns = Math.min(group.length, MAX_OVERLAP_COLUMNS);
    for (let i = 0; i < group.length; i++) {
      const item = group[i];
      // Convert absolute minutes to pixel offset
      const top = (item.absStart / 60) * hourHeight;
      const durationMins = item.absEnd - item.absStart;
      const height = durationToHeight(Math.max(durationMins, 15), hourHeight);
      positioned.push({
        id: item.id,
        type: item.type,
        top,
        height,
        startMinutes: item.startMinutes,
        endMinutes: item.endMinutes,
        column: i % totalColumns,
        totalColumns,
        daySection: item.section,
      });
    }
  }

  for (const item of rangeItems) {
    if (item.absStart < groupEnd) {
      group.push(item);
      groupEnd = Math.max(groupEnd, item.absEnd);
    } else {
      flushGroup();
      group = [item];
      groupEnd = item.absEnd;
    }
  }
  flushGroup();

  return positioned;
}

// ─── Plan Mode: Auto-Scheduling ─────────────────────────────────────────────

export interface FreeSlot {
  startMinutes: number;
  endMinutes: number;
  cursor: number; // current fill level
}

/** Find free time slots between occupied ranges within [dayStartMinutes, dayEndMinutes] */
export function findFreeSlots(
  occupied: TimeRange[],
  dayStartMinutes: number,
  dayEndMinutes: number,
  bufferMinutes = 5,
): FreeSlot[] {
  // Only consider occupied ranges that overlap with the requested window —
  // without this filter, ranges outside the window create spurious free slots
  // between them, extending far beyond dayEndMinutes.
  const relevant = occupied.filter(
    (r) => r.endMinutes > dayStartMinutes && r.startMinutes < dayEndMinutes,
  );

  // Sort occupied ranges and merge overlaps
  const sorted = [...relevant].sort((a, b) => a.startMinutes - b.startMinutes);
  const merged: TimeRange[] = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.startMinutes <= last.endMinutes + bufferMinutes) {
      last.endMinutes = Math.max(last.endMinutes, r.endMinutes);
    } else {
      merged.push({ ...r });
    }
  }

  // Find gaps
  const slots: FreeSlot[] = [];
  let cursor = dayStartMinutes;
  for (const range of merged) {
    const gapStart = cursor + bufferMinutes;
    const gapEnd = range.startMinutes - bufferMinutes;
    if (gapEnd > gapStart && gapEnd - gapStart >= 15) {
      slots.push({ startMinutes: gapStart, endMinutes: gapEnd, cursor: gapStart });
    }
    cursor = Math.max(cursor, range.endMinutes);
  }
  // Gap after last event
  const finalStart = cursor + bufferMinutes;
  if (finalStart < dayEndMinutes && dayEndMinutes - finalStart >= 15) {
    slots.push({ startMinutes: finalStart, endMinutes: dayEndMinutes, cursor: finalStart });
  }

  // Belt-and-suspenders: hard-clamp all slots to the requested window.
  // The occupied-range filter above should already prevent out-of-range slots,
  // but this guarantees correctness regardless of edge cases.
  return slots
    .map((s) => {
      const start = Math.max(s.startMinutes, dayStartMinutes);
      const end = Math.min(s.endMinutes, dayEndMinutes);
      return { startMinutes: start, endMinutes: end, cursor: Math.max(s.cursor, start) };
    })
    .filter((s) => s.endMinutes - s.startMinutes >= 15);
}

export interface PlannedTask {
  taskId: number;
  title: string;
  scheduledHour: number;
  scheduledMinutes: number;
  durationMinutes: number;
}

// ─── Plan Strategy Interface ─────────────────────────────────────────────────

export type TaskSorter = (tasks: TaskResponse[]) => TaskResponse[];
export type SlotSelector = (
  task: TaskResponse,
  duration: number,
  slots: FreeSlot[],
) => number | null; // slot index, or null to skip

export interface PlanStrategy {
  id: string;
  label: string;
  description: string;
  sortTasks: TaskSorter;
  selectSlot: SlotSelector;
}

/** Sort by duration ASC, then impact ASC (pack more tasks into the day) */
function compactSort(tasks: TaskResponse[]): TaskResponse[] {
  return [...tasks].sort((a, b) => {
    const durDiff = (a.duration_minutes ?? 30) - (b.duration_minutes ?? 30);
    if (durDiff !== 0) return durDiff;
    return a.impact - b.impact;
  });
}

/** First-fit: pick the first slot with enough remaining space */
function firstFitSelect(_task: TaskResponse, duration: number, slots: FreeSlot[]): number | null {
  for (let i = 0; i < slots.length; i++) {
    const remaining = slots[i].endMinutes - slots[i].cursor;
    if (remaining >= duration) return i;
  }
  return null;
}

export const COMPACT_STRATEGY: PlanStrategy = {
  id: "compact",
  label: "Compact",
  description: "Pack as many tasks as possible into the time range",
  sortTasks: compactSort,
  selectSlot: firstFitSelect,
};

export const PLAN_STRATEGIES: Record<string, PlanStrategy> = {
  compact: COMPACT_STRATEGY,
};

/** First-fit bin packing of tasks into free slots within a user-selected range */
export function planTasks(
  tasks: TaskResponse[],
  events: EventResponse[],
  dateStr: string,
  rangeStartMinutes: number,
  rangeEndMinutes: number,
  scheduledTasks: TaskResponse[] = [],
  instances: InstanceResponse[] = [],
  strategy: PlanStrategy = COMPACT_STRATEGY,
  tz?: string,
): PlannedTask[] {
  // Collect occupied time ranges from events, scheduled tasks, and instances
  const occupied: TimeRange[] = [];

  for (const event of events) {
    if (event.all_day) continue;
    const eventStart = new Date(event.start);
    const eventDate = tz
      ? toDateStringInTimezone(eventStart, tz)
      : eventStart.toISOString().split("T")[0];
    if (eventDate !== dateStr) continue;
    occupied.push(eventToTimeRange(event, tz));
  }

  for (const task of scheduledTasks) {
    if (task.scheduled_date !== dateStr || !task.scheduled_time) continue;
    const range = taskToTimeRange(task);
    if (range) occupied.push(range);
  }

  for (const inst of instances) {
    if (inst.instance_date !== dateStr || !inst.scheduled_datetime) continue;
    const { h, m } = datetimeHoursMinutes(new Date(inst.scheduled_datetime), tz);
    const startMin = h * 60 + m;
    const duration = inst.duration_minutes ?? 30;
    occupied.push({ startMinutes: startMin, endMinutes: startMin + duration });
  }

  const freeSlots = findFreeSlots(occupied, rangeStartMinutes, rangeEndMinutes);
  if (freeSlots.length === 0) return [];

  const sortedTasks = strategy.sortTasks(tasks);
  const planned: PlannedTask[] = [];

  for (const task of sortedTasks) {
    const duration = task.duration_minutes ?? 30;
    const slotIndex = strategy.selectSlot(task, duration, freeSlots);

    if (slotIndex !== null) {
      const slot = freeSlots[slotIndex];
      const startMinutes = slot.cursor;
      const hour = Math.floor(startMinutes / 60);
      const minutes = startMinutes % 60;

      planned.push({
        taskId: task.id,
        title: task.title,
        scheduledHour: hour,
        scheduledMinutes: minutes,
        durationMinutes: duration,
      });

      slot.cursor += duration + 5; // 5-minute buffer between tasks
    }
  }

  return planned;
}

// ─── Zoom Steps ──────────────────────────────────────────────────────────────

export const ZOOM_STEPS = [30, 40, 50, 60, 70, 80, 90, 100];

export function getNextZoomStep(current: number, direction: "in" | "out"): number {
  if (direction === "in") {
    return ZOOM_STEPS.find((s) => s > current) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
  }
  return [...ZOOM_STEPS].reverse().find((s) => s < current) ?? ZOOM_STEPS[0];
}

/** Snap a continuous value to the nearest ZOOM_STEP for persistence */
export function snapToZoomStep(value: number): number {
  let closest = ZOOM_STEPS[0];
  let minDist = Math.abs(value - closest);
  for (const step of ZOOM_STEPS) {
    const dist = Math.abs(value - step);
    if (dist < minDist) {
      minDist = dist;
      closest = step;
    }
  }
  return closest;
}
