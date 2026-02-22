/**
 * Task processing utilities for the dashboard.
 *
 * Handles grouping, sorting, filtering, and date formatting for tasks.
 */

import type { AppRoutersTasksTaskResponse, DomainResponse } from "@/api/model";

// Impact metadata matching app/constants.py
export const IMPACT_LABELS: Record<number, string> = {
  1: "High",
  2: "Mid",
  3: "Low",
  4: "Min",
};

export const IMPACT_COLORS: Record<number, string> = {
  1: "#C9505A",
  2: "#B8860B",
  3: "#1A9160",
  4: "#6B7385",
};

// Subtle background tints for task rows — one per impact level (brand spec)
export const IMPACT_WASHES: Record<number, string> = {
  1: "rgba(201, 80, 90, 0.030)",
  2: "rgba(184, 134, 11, 0.022)",
  3: "rgba(26, 145, 96, 0.030)",
  4: "rgba(107, 115, 133, 0.018)",
};

export const CLARITY_COLORS: Record<string, string> = {
  autopilot: "#167BFF",
  normal: "#6D5EF6",
  brainstorm: "#A020C0",
};

export const CLARITY_TINTS: Record<string, string> = {
  autopilot: "#EAF2FF",
  normal: "#EFEEFF",
  brainstorm: "#F3ECFA",
};

export const CLARITY_LABELS: Record<string, string> = {
  autopilot: "Autopilot",
  normal: "Normal",
  brainstorm: "Brainstorm",
};

type SortField = "impact" | "duration" | "clarity";
type SortDirection = "asc" | "desc";

const CLARITY_ORDER: Record<string, number> = {
  autopilot: 1,
  normal: 2,
  brainstorm: 3,
};

/**
 * Numeric sort value for a task or subtask by the given field.
 */
function getSortValue(
  item: { impact: number; duration_minutes?: number | null; clarity?: string | null },
  field: SortField,
): number {
  switch (field) {
    case "impact":
      return item.impact;
    case "duration":
      return item.duration_minutes ?? 0;
    case "clarity":
      return CLARITY_ORDER[item.clarity ?? "normal"] ?? 2;
  }
}

/**
 * Sort tasks by the given field and direction.
 *
 * Subtasks are also sorted within each parent: pending subtasks first
 * (ordered by the active sort field), completed subtasks last. The parent's
 * effective sort value is derived from its best pending subtask, so parents
 * with high-priority / short / autopilot subtasks bubble up accordingly.
 */
export function sortTasks(
  tasks: AppRoutersTasksTaskResponse[],
  field: SortField,
  direction: SortDirection,
): AppRoutersTasksTaskResponse[] {
  const dirMul = direction === "asc" ? 1 : -1;

  // For each task, sort subtasks and compute the effective sort value
  const prepared = tasks.map((task) => {
    const subtasks = task.subtasks;
    if (!subtasks?.length) {
      return { task, effectiveValue: getSortValue(task, field) };
    }

    const pending = subtasks.filter((s) => s.status !== "completed");
    const completed = subtasks.filter((s) => s.status === "completed");

    // Sort pending subtasks by field+direction, tiebreak by position
    const sortedPending = [...pending].sort((a, b) => {
      const cmp = getSortValue(a, field) - getSortValue(b, field);
      if (cmp !== 0) return dirMul * cmp;
      return a.position - b.position;
    });

    // Completed subtasks keep their original position order
    const sortedCompleted = [...completed].sort((a, b) => a.position - b.position);

    // Effective value: best pending subtask, or parent's own value
    const effectiveValue =
      sortedPending.length > 0 ? getSortValue(sortedPending[0], field) : getSortValue(task, field);

    return {
      task: { ...task, subtasks: [...sortedPending, ...sortedCompleted] },
      effectiveValue,
    };
  });

  // Sort top-level tasks by effective value, tiebreak by task's own value
  prepared.sort((a, b) => {
    const cmp = a.effectiveValue - b.effectiveValue;
    if (cmp !== 0) return dirMul * cmp;
    return dirMul * (getSortValue(a.task, field) - getSortValue(b.task, field));
  });

  return prepared.map((p) => p.task);
}

/**
 * Filter tasks by energy level.
 * Level 1 (Zombie): only autopilot
 * Level 2 (Normal): autopilot + normal
 * Level 3 (Deep Focus): all tasks
 *
 * Parent tasks (with subtasks) are exempt — they show if any subtask
 * matches the energy level, so containers aren't accidentally hidden.
 */
export function filterByEnergy(
  tasks: AppRoutersTasksTaskResponse[],
  energyLevel: 1 | 2 | 3,
): AppRoutersTasksTaskResponse[] {
  if (energyLevel === 3) return tasks;

  const matchesEnergy = (clarity: string | null | undefined): boolean => {
    const c = clarity ?? "normal";
    if (energyLevel === 2) return c !== "brainstorm";
    return c === "autopilot";
  };

  const result: AppRoutersTasksTaskResponse[] = [];
  for (const t of tasks) {
    if (t.subtasks && t.subtasks.length > 0) {
      const filtered = t.subtasks.filter((st) => matchesEnergy(st.clarity));
      if (filtered.length > 0) {
        result.push({ ...t, subtasks: filtered });
      }
    } else if (matchesEnergy(t.clarity)) {
      result.push(t);
    }
  }
  return result;
}

export interface DomainGroup {
  domain: DomainResponse | null;
  tasks: AppRoutersTasksTaskResponse[];
}

/**
 * Group tasks by domain, preserving domain sort order.
 * Thoughts (domain_id=null) are excluded — they belong on the Thoughts page.
 */
export function groupByDomain(
  tasks: AppRoutersTasksTaskResponse[],
  domains: DomainResponse[],
): DomainGroup[] {
  const groups = new Map<number | null, AppRoutersTasksTaskResponse[]>();

  for (const task of tasks) {
    const key = task.domain_id;
    if (key === null) continue; // Skip thoughts (no domain)
    const arr = groups.get(key);
    if (arr) {
      arr.push(task);
    } else {
      groups.set(key, [task]);
    }
  }

  // Sort domain groups by domain position
  const sortedDomains = [...domains]
    .filter((d) => !d.is_archived)
    .sort((a, b) => a.position - b.position);

  const result: DomainGroup[] = [];

  for (const domain of sortedDomains) {
    const domainTasks = groups.get(domain.id);
    if (domainTasks?.length) {
      result.push({ domain, tasks: domainTasks });
    }
  }

  return result;
}

/**
 * Separate tasks into pending, scheduled, and completed buckets.
 */
export function categorizeTasks(tasks: AppRoutersTasksTaskResponse[]) {
  const pending: AppRoutersTasksTaskResponse[] = [];
  const scheduled: AppRoutersTasksTaskResponse[] = [];
  const completed: AppRoutersTasksTaskResponse[] = [];

  for (const task of tasks) {
    // Only top-level tasks (not subtasks)
    if (task.parent_id !== null) continue;

    if (task.status === "completed" || task.completed_at) {
      completed.push(task);
    } else if (task.scheduled_date) {
      scheduled.push(task);
    } else {
      pending.push(task);
    }
  }

  return { pending, scheduled, completed };
}

/**
 * Format a duration in minutes to a human-readable string.
 */
export function formatDuration(minutes: number | null): string {
  if (!minutes) return "";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem > 0 ? `${hours}h${rem}m` : `${hours}h`;
}

/**
 * Format a date string for display.
 */
export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(`${dateStr}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.getTime() === today.getTime()) return "Today";
  if (date.getTime() === tomorrow.getTime()) return "Tomorrow";

  const diff = date.getTime() - today.getTime();
  const days = Math.round(diff / (1000 * 60 * 60 * 24));

  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days <= 7) {
    return date.toLocaleDateString("en-US", { weekday: "short" });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Format a schedule target for toast messages.
 * Examples: "Today", "Tomorrow at 2:30 PM", "Feb 25 at 10:00 AM"
 */
export function formatScheduleTarget(dateStr: string, timeStr?: string | null): string {
  const dateLabel = formatDate(dateStr);
  if (!timeStr) return dateLabel;
  const [hStr, mStr] = timeStr.split(":");
  const hour = Number.parseInt(hStr, 10);
  const minutes = Number.parseInt(mStr, 10);
  const h = hour % 12 || 12;
  const ampm = hour < 12 ? "AM" : "PM";
  const m = minutes.toString().padStart(2, "0");
  return `${dateLabel} at ${h}:${m} ${ampm}`;
}

/**
 * Check if a date is overdue.
 */
export function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const date = new Date(`${dateStr}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

/**
 * Group scheduled tasks by date for the scheduled section.
 */
export function groupScheduledByDate(
  tasks: AppRoutersTasksTaskResponse[],
): { label: string; date: string; tasks: AppRoutersTasksTaskResponse[] }[] {
  const byDate = new Map<string, AppRoutersTasksTaskResponse[]>();

  for (const task of tasks) {
    const date = task.scheduled_date ?? "";
    const arr = byDate.get(date);
    if (arr) {
      arr.push(task);
    } else {
      byDate.set(date, [task]);
    }
  }

  const sorted = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));

  return sorted.map(([date, tasks]) => ({
    label: formatDate(date),
    date,
    tasks,
  }));
}
