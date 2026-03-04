/**
 * useReminders — sync task reminders with Tauri local notifications.
 *
 * On launch: fetches tasks with active reminders from the API, decrypts titles,
 * and schedules local notifications via Rust.
 *
 * On task changes: the query invalidation triggers a re-fetch, and we
 * diff the reminder set to schedule new / cancel removed reminders.
 *
 * Only active when running inside Tauri (isTauri === true).
 * When isTauri is false, the query is disabled and effects are no-ops.
 */

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { TaskResponse } from "@/api/model";
import { isTauri } from "@/hooks/use-device";
import { apiClient } from "@/lib/api-client";
import { cancelAllReminders, cancelReminder, scheduleReminder } from "@/lib/tauri-notifications";
import { useCryptoStore } from "@/stores/crypto-store";

/** Compute the ISO datetime when the reminder should fire. */
function computeFireAt(task: TaskResponse): string | null {
  if (!task.scheduled_date) return null;
  // Default to midnight if no time set
  const time = task.scheduled_time ?? "00:00";
  const scheduledDt = new Date(`${task.scheduled_date}T${time}:00`);
  const minutesBefore = task.reminder_minutes_before ?? 0;
  const fireAt = new Date(scheduledDt.getTime() - minutesBefore * 60_000);
  return fireAt.toISOString();
}

/** Query key for the reminders endpoint. */
const REMINDERS_KEY = ["reminders"] as const;

async function fetchReminders(): Promise<TaskResponse[]> {
  return apiClient<TaskResponse[]>({ method: "GET", url: "/api/v1/tasks/reminders" });
}

/**
 * Hook that syncs task reminders with Tauri local notifications.
 * Call this once at the app root level.
 * When not in Tauri, the query is disabled and effects are no-ops.
 */
export function useReminders() {
  const derivedKey = useCryptoStore((s) => s.derivedKey);
  const encryptionEnabled = useCryptoStore((s) => s.encryptionEnabled);

  // Fetch tasks with active reminders — disabled when not in Tauri
  const { data: tasks } = useQuery({
    queryKey: REMINDERS_KEY,
    queryFn: fetchReminders,
    enabled: isTauri,
    refetchInterval: isTauri ? 5 * 60_000 : false,
    staleTime: 60_000,
  });

  // Track previously scheduled task IDs to diff
  const prevIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!isTauri || !tasks) return;

    const currentIds = new Set(tasks.map((t) => t.id));
    const prevIds = prevIdsRef.current;

    // Cancel reminders for tasks no longer in the list
    for (const id of prevIds) {
      if (!currentIds.has(id)) {
        cancelReminder(id);
      }
    }

    // Schedule/reschedule reminders for current tasks
    for (const task of tasks) {
      const fireAt = computeFireAt(task);
      if (!fireAt) continue;

      // Skip if fire time is in the past
      if (new Date(fireAt) <= new Date()) continue;

      // Decrypt title if encryption is enabled
      let title = task.title;
      if (encryptionEnabled && !derivedKey) {
        // Encryption enabled but not unlocked — use generic title
        title = "Task reminder";
      }
      // Note: for encrypted users who ARE unlocked, the tasks from the API
      // are already decrypted at the TanStack Query layer by useCrypto

      scheduleReminder(task.id, title, `Reminder: ${title}`, fireAt);
    }

    prevIdsRef.current = currentIds;
  }, [tasks, derivedKey, encryptionEnabled]);

  // Cancel all on unmount (app close) — only in Tauri
  useEffect(() => {
    if (!isTauri) return;
    return () => {
      cancelAllReminders();
    };
  }, []);
}
