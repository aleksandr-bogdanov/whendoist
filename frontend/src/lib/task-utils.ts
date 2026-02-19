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
 * Sort tasks by the given field and direction.
 */
export function sortTasks(
  tasks: AppRoutersTasksTaskResponse[],
  field: SortField,
  direction: SortDirection,
): AppRoutersTasksTaskResponse[] {
  const sorted = [...tasks].sort((a, b) => {
    let cmp = 0;
    switch (field) {
      case "impact":
        cmp = a.impact - b.impact;
        break;
      case "duration":
        cmp = (a.duration_minutes ?? 0) - (b.duration_minutes ?? 0);
        break;
      case "clarity":
        cmp =
          (CLARITY_ORDER[a.clarity ?? "normal"] ?? 2) - (CLARITY_ORDER[b.clarity ?? "normal"] ?? 2);
        break;
    }
    return direction === "asc" ? cmp : -cmp;
  });
  return sorted;
}

/**
 * Filter tasks by energy level.
 * Level 1 (Zombie): only autopilot
 * Level 2 (Normal): autopilot + normal
 * Level 3 (Deep Focus): all tasks
 */
export function filterByEnergy(
  tasks: AppRoutersTasksTaskResponse[],
  energyLevel: 1 | 2 | 3,
): AppRoutersTasksTaskResponse[] {
  if (energyLevel === 3) return tasks;
  if (energyLevel === 2) return tasks.filter((t) => t.clarity !== "brainstorm");
  return tasks.filter((t) => t.clarity === "autopilot");
}

export interface DomainGroup {
  domain: DomainResponse | null;
  tasks: AppRoutersTasksTaskResponse[];
}

/**
 * Group tasks by domain, preserving domain sort order.
 * Tasks with no domain are grouped as "Inbox" (domain=null).
 */
export function groupByDomain(
  tasks: AppRoutersTasksTaskResponse[],
  domains: DomainResponse[],
): DomainGroup[] {
  const domainMap = new Map<number, DomainResponse>();
  for (const d of domains) {
    domainMap.set(d.id, d);
  }

  const groups = new Map<number | null, AppRoutersTasksTaskResponse[]>();

  for (const task of tasks) {
    const key = task.domain_id;
    const arr = groups.get(key);
    if (arr) {
      arr.push(task);
    } else {
      groups.set(key, [task]);
    }
  }

  // Sort domain groups by domain position, inbox (null) at end
  const sortedDomains = [...domains]
    .filter((d) => !d.is_archived)
    .sort((a, b) => a.position - b.position);

  const result: DomainGroup[] = [];

  // Inbox (no domain) first if it has tasks
  const inboxTasks = groups.get(null);
  if (inboxTasks?.length) {
    result.push({ domain: null, tasks: inboxTasks });
  }

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
