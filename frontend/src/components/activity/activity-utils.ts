/**
 * Activity log display utilities.
 *
 * Maps event types to icons and human-readable labels,
 * and formats relative timestamps.
 */

import type { ActivityLogEntry } from "@/api/model";
import i18n from "@/lib/i18n";

/** Format a date string as a relative time ("2m ago", "3d ago", "Mar 4"). */
export function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return i18n.t("date.justNow");
  if (diffMin < 60) return i18n.t("date.minutesAgo", { count: diffMin });
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return i18n.t("date.hoursAgo", { count: diffHrs });
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays === 1) return i18n.t("date.yesterday");
  if (diffDays < 7) return i18n.t("date.daysAgo", { count: diffDays });
  const locale = i18n.resolvedLanguage ?? "en";
  return new Date(dateStr).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
  });
}

/** Impact numeric value to human label. */
function getImpactLabel(value: string): string {
  const key: Record<string, string> = {
    "1": "task.impact.high",
    "2": "task.impact.mid",
    "3": "task.impact.low",
    "4": "task.impact.min",
  };
  return key[value] ? i18n.t(key[value]) : `P${value}`;
}

/** Clarity value to display label. */
function getClarityLabel(value: string): string {
  const key: Record<string, string> = {
    autopilot: "task.clarity.autopilot",
    normal: "task.clarity.normal",
    brainstorm: "task.clarity.brainstorm",
  };
  return key[value] ? i18n.t(key[value]) : value;
}

/** Format a field value for display. */
function formatFieldValue(fieldName: string, value: string | null): string | null {
  if (value === null || value === "None") return null;
  if (fieldName === "impact") return getImpactLabel(value);
  if (fieldName === "clarity") return getClarityLabel(value);
  if (fieldName === "duration_minutes") {
    const mins = Number.parseInt(value, 10);
    if (Number.isNaN(mins)) return value;
    if (mins >= 60) return `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ""}`;
    return `${mins}m`;
  }
  if (fieldName === "is_recurring")
    return value === "True" ? i18n.t("common.yes") : i18n.t("common.no");
  return value;
}

/** Human-readable field names. */
function getFieldLabel(fieldName: string): string {
  const key: Record<string, string> = {
    domain_id: "activity.field.domain",
    parent_id: "activity.field.parent",
    impact: "activity.field.impact",
    clarity: "activity.field.clarity",
    duration_minutes: "activity.field.duration",
    scheduled_date: "activity.field.schedule",
    scheduled_time: "activity.field.time",
    is_recurring: "activity.field.recurring",
    recurrence_rule: "activity.field.repeatPattern",
    recurrence_start: "activity.field.repeatStart",
    recurrence_end: "activity.field.repeatEnd",
    scheduled_datetime: "activity.field.schedule",
    title: "activity.field.title",
    description: "activity.field.notes",
    name: "activity.field.name",
    color: "activity.field.color",
    icon: "activity.field.icon",
  };
  return key[fieldName] ? i18n.t(key[fieldName]) : fieldName;
}

/** Build a human-readable description for an activity log entry. */
export function describeActivity(entry: ActivityLogEntry): string {
  switch (entry.event_type) {
    case "task_created":
      return i18n.t("activity.taskCreated");
    case "task_completed":
      return i18n.t("activity.completed");
    case "task_uncompleted":
      return i18n.t("activity.reopened");
    case "task_archived":
      return i18n.t("activity.archived");
    case "task_restored":
      return i18n.t("activity.restored");
    case "task_deleted":
      return i18n.t("activity.deleted");
    case "task_field_changed": {
      const label = getFieldLabel(entry.field_name ?? "");
      // Encrypted fields have no old/new values
      if (entry.old_value === null && entry.new_value === null) {
        return i18n.t("activity.fieldUpdated", { label });
      }
      const oldFmt = formatFieldValue(entry.field_name ?? "", entry.old_value);
      const newFmt = formatFieldValue(entry.field_name ?? "", entry.new_value);
      if (oldFmt && newFmt)
        return i18n.t("activity.fieldChanged", { label, oldValue: oldFmt, newValue: newFmt });
      if (newFmt) return i18n.t("activity.fieldSetTo", { label, value: newFmt });
      if (oldFmt) return i18n.t("activity.fieldCleared", { label, value: oldFmt });
      return i18n.t("activity.fieldUpdated", { label });
    }
    case "instance_completed":
      return i18n.t("activity.instanceCompleted");
    case "instance_uncompleted":
      return i18n.t("activity.instanceReopened");
    case "instance_skipped":
      return i18n.t("activity.instanceSkipped");
    case "instance_unskipped":
      return i18n.t("activity.instanceUnskipped");
    case "instance_rescheduled":
      return i18n.t("activity.instanceRescheduled");
    case "instance_batch_completed":
      return i18n.t("activity.batchCompleted", { count: Number(entry.new_value) || 0 });
    case "instance_batch_skipped":
      return i18n.t("activity.batchSkipped", { count: Number(entry.new_value) || 0 });
    case "domain_created":
      return i18n.t("activity.domainCreated");
    case "domain_updated": {
      const label = getFieldLabel(entry.field_name ?? "");
      if (entry.old_value === null && entry.new_value === null) {
        return i18n.t("activity.domainFieldUpdated", { label });
      }
      const dOld = formatFieldValue(entry.field_name ?? "", entry.old_value);
      const dNew = formatFieldValue(entry.field_name ?? "", entry.new_value);
      if (dOld && dNew)
        return i18n.t("activity.domainFieldChanged", { label, oldValue: dOld, newValue: dNew });
      if (dNew) return i18n.t("activity.domainFieldSetTo", { label, value: dNew });
      if (dOld) return i18n.t("activity.domainFieldCleared", { label });
      return i18n.t("activity.domainFieldUpdated", { label });
    }
    case "domain_archived":
      return i18n.t("activity.domainArchived");
    case "encryption_enabled":
      return i18n.t("activity.encryptionEnabled", { count: Number(entry.new_value) || 0 });
    case "encryption_disabled":
      return i18n.t("activity.encryptionDisabled", { count: Number(entry.new_value) || 0 });
    case "data_imported":
      return i18n.t("activity.dataImported");
    case "data_wiped":
      return i18n.t("activity.dataWiped");
    default:
      return entry.event_type.replaceAll("_", " ");
  }
}
