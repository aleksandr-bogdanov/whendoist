import i18n from "@/lib/i18n";

/** Maps backend error `detail` strings to i18n keys. */
const BACKEND_ERROR_MAP: Record<string, string> = {
  "Task not found": "errors.backend.taskNotFound",
  "Domain not found": "errors.backend.domainNotFound",
  "Encryption is already enabled": "errors.backend.encryptionAlreadyEnabled",
  "Encryption is not enabled": "errors.backend.encryptionNotEnabled",
  "Invalid passphrase": "errors.backend.invalidPassphrase",
  "Google Calendar not connected": "errors.backend.gcalNotConnected",
  "Calendar not found": "errors.backend.calendarNotFound",
  "Rate limit exceeded": "errors.backend.rateLimitExceeded",
  "Invalid recurrence rule": "errors.backend.invalidRecurrenceRule",
  "Parent task not found": "errors.backend.parentNotFound",
  "Cannot nest subtasks": "errors.backend.cannotNestSubtasks",
  "Task already completed": "errors.backend.taskAlreadyCompleted",
  "Instance not found": "errors.backend.instanceNotFound",
};

/** Translate a backend error detail string, falling back to the original. */
export function translateBackendError(detail: string): string {
  const key = BACKEND_ERROR_MAP[detail];
  return key && i18n.exists(key) ? i18n.t(key) : detail;
}
