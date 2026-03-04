/**
 * Activity log display utilities.
 *
 * Maps event types to icons and human-readable labels,
 * and formats relative timestamps.
 */

import type { ActivityLogEntry } from "@/api/model";

/** Format a date string as a relative time ("2m ago", "3d ago", "Mar 4"). */
export function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Impact numeric value to human label. */
const IMPACT_LABELS: Record<string, string> = {
  "1": "High",
  "2": "Mid",
  "3": "Low",
  "4": "Min",
};

/** Clarity value to display label. */
const CLARITY_LABELS: Record<string, string> = {
  autopilot: "Autopilot",
  normal: "Normal",
  brainstorm: "Brainstorm",
};

/** Format a field value for display. */
function formatFieldValue(fieldName: string, value: string | null): string | null {
  if (value === null || value === "None") return null;
  if (fieldName === "impact") return IMPACT_LABELS[value] ?? `P${value}`;
  if (fieldName === "clarity") return CLARITY_LABELS[value] ?? value;
  if (fieldName === "duration_minutes") {
    const mins = Number.parseInt(value, 10);
    if (Number.isNaN(mins)) return value;
    if (mins >= 60) return `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ""}`;
    return `${mins}m`;
  }
  if (fieldName === "is_recurring") return value === "True" ? "Yes" : "No";
  return value;
}

/** Human-readable field names. */
const FIELD_LABELS: Record<string, string> = {
  domain_id: "Domain",
  parent_id: "Parent",
  impact: "Priority",
  clarity: "Clarity",
  duration_minutes: "Duration",
  scheduled_date: "Schedule",
  scheduled_time: "Time",
  is_recurring: "Recurring",
  recurrence_rule: "Repeat pattern",
  recurrence_start: "Repeat start",
  recurrence_end: "Repeat end",
  scheduled_datetime: "Schedule",
  title: "Title",
  description: "Notes",
  name: "Name",
  color: "Color",
  icon: "Icon",
};

/** Build a human-readable description for an activity log entry. */
export function describeActivity(entry: ActivityLogEntry): string {
  switch (entry.event_type) {
    case "task_created":
      return "Task created";
    case "task_completed":
      return "Completed";
    case "task_uncompleted":
      return "Reopened";
    case "task_archived":
      return "Archived";
    case "task_restored":
      return "Restored";
    case "task_deleted":
      return "Deleted";
    case "task_field_changed": {
      const label = FIELD_LABELS[entry.field_name ?? ""] ?? entry.field_name;
      // Encrypted fields have no old/new values
      if (entry.old_value === null && entry.new_value === null) {
        return `${label} updated`;
      }
      const oldFmt = formatFieldValue(entry.field_name ?? "", entry.old_value);
      const newFmt = formatFieldValue(entry.field_name ?? "", entry.new_value);
      if (oldFmt && newFmt) return `${label}: ${oldFmt} \u2192 ${newFmt}`;
      if (newFmt) return `${label} set to ${newFmt}`;
      if (oldFmt) return `${label} cleared (was ${oldFmt})`;
      return `${label} updated`;
    }
    case "instance_completed":
      return "Instance completed";
    case "instance_uncompleted":
      return "Instance reopened";
    case "instance_skipped":
      return "Instance skipped";
    case "instance_unskipped":
      return "Instance unskipped";
    case "instance_rescheduled":
      return "Instance rescheduled";
    case "instance_batch_completed":
      return `Batch completed ${entry.new_value ?? ""} instances`;
    case "instance_batch_skipped":
      return `Batch skipped ${entry.new_value ?? ""} instances`;
    case "domain_created":
      return "Domain created";
    case "domain_updated": {
      const label = FIELD_LABELS[entry.field_name ?? ""] ?? entry.field_name;
      if (entry.old_value === null && entry.new_value === null) {
        return `Domain ${label?.toLowerCase()} updated`;
      }
      const dOld = formatFieldValue(entry.field_name ?? "", entry.old_value);
      const dNew = formatFieldValue(entry.field_name ?? "", entry.new_value);
      if (dOld && dNew) return `Domain ${label?.toLowerCase()}: ${dOld} \u2192 ${dNew}`;
      if (dNew) return `Domain ${label?.toLowerCase()} set to ${dNew}`;
      if (dOld) return `Domain ${label?.toLowerCase()} cleared`;
      return `Domain ${label?.toLowerCase()} changed`;
    }
    case "domain_archived":
      return "Domain archived";
    case "encryption_enabled":
      return `Encryption enabled (${entry.new_value} tasks)`;
    case "encryption_disabled":
      return `Encryption disabled (${entry.new_value} tasks)`;
    case "data_imported":
      return "Data imported from Todoist";
    case "data_wiped":
      return "All data wiped";
    default:
      return entry.event_type.replaceAll("_", " ");
  }
}
