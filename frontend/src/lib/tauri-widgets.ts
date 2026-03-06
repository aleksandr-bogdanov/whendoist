/**
 * Home screen widget data bridge for Tauri native app.
 *
 * Computes today's task summary from the TanStack Query cache and pushes it
 * to native widgets via the Rust `update_widget_data` / `clear_widget_data`
 * IPC commands. Uses the same lazy-import pattern as tauri-cache.ts.
 *
 * Phase 6: Home Screen Widgets (iOS + Android)
 */

import type { TaskResponse } from "@/api/model";
import { isTauri } from "@/hooks/use-device";

interface WidgetTask {
  title: string;
  domain_name: string | null;
  scheduled_time: string | null;
  completed: boolean;
}

interface WidgetData {
  updated_at: string;
  encryption_enabled: boolean;
  total_today: number;
  overdue_count: number;
  completed_today: number;
  tasks: WidgetTask[];
}

/**
 * Push current task data to native home screen widgets.
 *
 * Filters today's tasks and overdue items from the full task list,
 * computes summary counts, and sends the data to the Rust bridge
 * which writes it to the platform-specific widget data store.
 *
 * When encryption is enabled, only counts are sent — no task titles.
 */
export async function updateWidgetData(
  tasks: TaskResponse[],
  encryptionEnabled: boolean,
): Promise<void> {
  if (!isTauri) return;

  try {
    const { invoke } = await import("@tauri-apps/api/core");

    const todayISO = new Date().toISOString().slice(0, 10);

    // Filter tasks for widget display
    const todayTasks = tasks.filter((t) => t.scheduled_date === todayISO && t.status !== "deleted");
    const overdueTasks = tasks.filter(
      (t) => t.scheduled_date !== null && t.scheduled_date < todayISO && t.status === "pending",
    );

    const completedToday = todayTasks.filter(
      (t) => t.status === "completed" || t.today_instance_completed === true,
    ).length;

    // Build widget task list (empty when encrypted — no titles available)
    const widgetTasks: WidgetTask[] = encryptionEnabled
      ? []
      : todayTasks
          .filter((t) => t.status !== "completed" && !t.today_instance_completed)
          .slice(0, 8) // Cap at 8 tasks for widget display
          .map((t) => ({
            title: t.title,
            domain_name: t.domain_name ?? null,
            scheduled_time: t.scheduled_time ?? null,
            completed: false,
          }));

    const data: WidgetData = {
      updated_at: new Date().toISOString(),
      encryption_enabled: encryptionEnabled,
      total_today: todayTasks.length,
      overdue_count: overdueTasks.length,
      completed_today: completedToday,
      tasks: widgetTasks,
    };

    await Promise.race([
      invoke("update_widget_data", { data }),
      new Promise<void>((resolve) => setTimeout(resolve, 1_500)),
    ]);
  } catch (e) {
    // Widget update failure is non-fatal — don't disrupt the app
    console.warn("[tauri-widgets] Failed to update widget data:", e);
  }
}

/**
 * Clear widget data (called on logout).
 *
 * Writes empty data so widgets show "Open Whendoist" instead of stale tasks.
 */
export async function clearWidgetData(): Promise<void> {
  if (!isTauri) return;

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await Promise.race([
      invoke("clear_widget_data"),
      new Promise<void>((resolve) => setTimeout(resolve, 1_500)),
    ]);
  } catch (e) {
    console.warn("[tauri-widgets] Failed to clear widget data:", e);
  }
}
