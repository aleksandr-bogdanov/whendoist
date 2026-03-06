/**
 * TypeScript wrapper around Tauri notification commands.
 *
 * The WebView decrypts task titles before passing them to Rust.
 * Rust never touches encrypted data.
 */

import { isTauri } from "@/hooks/use-device";

/** Timeout for Tauri IPC invoke calls — prevents app freeze if IPC hangs (e.g. iOS dev mode) */
const INVOKE_TIMEOUT_MS = 1_500;

/** Fire-and-forget invoke with timeout — swallows failures since notifications are non-critical */
async function safeInvoke(command: string, args?: Record<string, unknown>): Promise<void> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await Promise.race([
      invoke(command, args),
      new Promise<void>((resolve) => setTimeout(resolve, INVOKE_TIMEOUT_MS)),
    ]);
  } catch {
    // Notification IPC failure is non-fatal
  }
}

/** Schedule a local notification for a task reminder. */
export async function scheduleReminder(
  taskId: number,
  title: string,
  body: string,
  fireAt: string,
): Promise<void> {
  if (!isTauri) return;
  await safeInvoke("schedule_reminder", { taskId, title, body, fireAt });
}

/** Cancel a previously scheduled reminder for a task. */
export async function cancelReminder(taskId: number): Promise<void> {
  if (!isTauri) return;
  await safeInvoke("cancel_reminder", { taskId });
}

/** Cancel all scheduled reminders (e.g. on logout). */
export async function cancelAllReminders(): Promise<void> {
  if (!isTauri) return;
  await safeInvoke("cancel_all_reminders");
}
