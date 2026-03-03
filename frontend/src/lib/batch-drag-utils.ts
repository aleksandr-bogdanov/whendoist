import { addDays, toDateString } from "@/lib/calendar-utils";

/**
 * Describes a selected item participating in a batch drag — enough info
 * to compute the delta and fire the correct mutation.
 */
export interface BatchItem {
  type: "task" | "instance";
  id: number;
  date: string | null;
  /** "HH:MM:SS" or null for anytime tasks */
  time: string | null;
  title: string;
}

/** Convert "HH:MM:SS" time string to total minutes since midnight */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Convert total minutes since midnight to "HH:MM:SS" time string */
export function minutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

/** Compute day difference between two YYYY-MM-DD date strings */
export function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * Apply a (daysDelta, minutesDelta) to a single BatchItem.
 * Returns the new { date, time } — handles wrap-past-midnight and clamp-negative-time.
 */
export function applyDelta(
  item: BatchItem,
  daysDelta: number,
  minutesDelta: number,
): { date: string; time: string | null } {
  const baseDate = item.date ?? toDateString(new Date());
  // Anytime tasks: only shift days, stay anytime
  if (!item.time) {
    return { date: addDays(baseDate, daysDelta), time: null };
  }
  let newMinutes = timeToMinutes(item.time) + minutesDelta;
  let extraDays = 0;
  // Wrap past midnight: ≥1440 → next day
  while (newMinutes >= 1440) {
    newMinutes -= 1440;
    extraDays++;
  }
  // Clamp negative time: < 0 → 00:00 (don't go to previous day)
  if (newMinutes < 0) {
    newMinutes = 0;
  }
  return {
    date: addDays(baseDate, daysDelta + extraDays),
    time: minutesToTime(newMinutes),
  };
}
