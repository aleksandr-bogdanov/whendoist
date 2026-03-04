/**
 * TypeScript wrapper around Tauri notification commands.
 *
 * The WebView decrypts task titles before passing them to Rust.
 * Rust never touches encrypted data.
 */

import { isTauri } from "@/hooks/use-device";

/** Schedule a local notification for a task reminder. */
export async function scheduleReminder(
  taskId: number,
  title: string,
  body: string,
  fireAt: string,
): Promise<void> {
  if (!isTauri) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("schedule_reminder", {
    taskId,
    title,
    body,
    fireAt,
  });
}

/** Cancel a previously scheduled reminder for a task. */
export async function cancelReminder(taskId: number): Promise<void> {
  if (!isTauri) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("cancel_reminder", { taskId });
}

/** Cancel all scheduled reminders (e.g. on logout). */
export async function cancelAllReminders(): Promise<void> {
  if (!isTauri) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("cancel_all_reminders");
}
