/**
 * Calendar utility functions for time positioning, overlap detection,
 * date navigation, and plan mode auto-scheduling.
 */

import type { AppRoutersTasksTaskResponse, EventResponse } from "@/api/model";

// ─── Date Helpers ────────────────────────────────────────────────────────────

/** Format date as YYYY-MM-DD */
export function toDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

/** Get today's date string */
export function todayString(): string {
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

/** Hours displayed in the day column (6am to 11pm) */
export const DAY_START_HOUR = 6;
export const DAY_END_HOUR = 23;
export const TOTAL_HOURS = DAY_END_HOUR - DAY_START_HOUR;

/** Convert hour + minutes to pixel offset from top */
export function timeToOffset(hour: number, minutes: number, hourHeight: number): number {
  return (hour - DAY_START_HOUR + minutes / 60) * hourHeight;
}

/** Convert ISO datetime string to pixel offset */
export function datetimeToOffset(datetimeStr: string, hourHeight: number): number {
  const date = new Date(datetimeStr);
  return timeToOffset(date.getHours(), date.getMinutes(), hourHeight);
}

/** Convert pixel offset to hours and minutes (snapped to 15-minute grid) */
export function offsetToTime(
  offsetY: number,
  hourHeight: number,
): { hour: number; minutes: number } {
  const totalMinutes = (offsetY / hourHeight) * 60 + DAY_START_HOUR * 60;
  const snappedMinutes = Math.round(totalMinutes / 15) * 15;
  const hour = Math.floor(snappedMinutes / 60);
  const minutes = snappedMinutes % 60;
  return { hour: Math.max(DAY_START_HOUR, Math.min(DAY_END_HOUR, hour)), minutes };
}

/** Convert duration in minutes to pixel height */
export function durationToHeight(durationMinutes: number, hourHeight: number): number {
  return (durationMinutes / 60) * hourHeight;
}

/** Format time as HH:MM */
export function formatTime(hour: number, minutes: number): string {
  const h = hour % 12 || 12;
  const ampm = hour < 12 ? "AM" : "PM";
  const m = minutes.toString().padStart(2, "0");
  return `${h}:${m} ${ampm}`;
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

function eventToTimeRange(event: EventResponse): TimeRange {
  const start = new Date(event.start);
  const end = new Date(event.end);
  return {
    startMinutes: toMinutesSinceMidnight(start.getHours(), start.getMinutes()),
    endMinutes: toMinutesSinceMidnight(end.getHours(), end.getMinutes()),
  };
}

function taskToTimeRange(task: AppRoutersTasksTaskResponse): TimeRange | null {
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
  type: "event" | "task";
  top: number;
  height: number;
  startMinutes: number;
  endMinutes: number;
  column: number;
  totalColumns: number;
}

const MAX_OVERLAP_COLUMNS = 3;

/** Detect overlaps and assign column positions for side-by-side display */
export function calculateOverlaps(
  events: EventResponse[],
  tasks: AppRoutersTasksTaskResponse[],
  dateStr: string,
  hourHeight: number,
): PositionedItem[] {
  const items: { id: string; type: "event" | "task"; range: TimeRange; original: unknown }[] = [];

  // Add events for this date
  for (const event of events) {
    if (event.all_day) continue;
    const eventDate = new Date(event.start).toISOString().split("T")[0];
    if (eventDate !== dateStr) continue;
    items.push({ id: event.id, type: "event", range: eventToTimeRange(event), original: event });
  }

  // Add scheduled tasks for this date
  for (const task of tasks) {
    if (task.scheduled_date !== dateStr || !task.scheduled_time) continue;
    const range = taskToTimeRange(task);
    if (!range) continue;
    items.push({ id: String(task.id), type: "task", range, original: task });
  }

  // Sort by start time
  items.sort((a, b) => a.range.startMinutes - b.range.startMinutes);

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

// ─── Plan Mode: Auto-Scheduling ─────────────────────────────────────────────

export interface FreeSlot {
  startMinutes: number;
  endMinutes: number;
  cursor: number; // current fill level
}

/** Find free time slots between occupied ranges */
export function findFreeSlots(
  occupied: TimeRange[],
  dayStartMinutes: number,
  dayEndMinutes: number,
  bufferMinutes = 5,
): FreeSlot[] {
  // Sort occupied ranges and merge overlaps
  const sorted = [...occupied].sort((a, b) => a.startMinutes - b.startMinutes);
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

  return slots;
}

export interface PlannedTask {
  taskId: number;
  title: string;
  scheduledHour: number;
  scheduledMinutes: number;
  durationMinutes: number;
}

/** First-fit bin packing of tasks into free slots */
export function planTasks(
  tasks: AppRoutersTasksTaskResponse[],
  events: EventResponse[],
  dateStr: string,
): PlannedTask[] {
  // Collect occupied time ranges from events and already-scheduled tasks
  const occupied: TimeRange[] = [];

  for (const event of events) {
    if (event.all_day) continue;
    const eventDate = new Date(event.start).toISOString().split("T")[0];
    if (eventDate !== dateStr) continue;
    occupied.push(eventToTimeRange(event));
  }

  // Day boundaries: 8am to 8pm
  const dayStart = 8 * 60;
  const dayEnd = 20 * 60;

  const freeSlots = findFreeSlots(occupied, dayStart, dayEnd);
  if (freeSlots.length === 0) return [];

  // Sort tasks: smaller duration first, then higher impact (lower number = higher)
  const sortedTasks = [...tasks].sort((a, b) => {
    const durDiff = (a.duration_minutes ?? 30) - (b.duration_minutes ?? 30);
    if (durDiff !== 0) return durDiff;
    return a.impact - b.impact;
  });

  const planned: PlannedTask[] = [];

  for (const task of sortedTasks) {
    const duration = task.duration_minutes ?? 30;

    // Find first slot with enough space
    for (const slot of freeSlots) {
      const remaining = slot.endMinutes - slot.cursor;
      if (remaining >= duration) {
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
        break;
      }
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
