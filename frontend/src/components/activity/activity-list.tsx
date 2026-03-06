/**
 * Activity log list component.
 *
 * Renders a chronological list of activity entries with icons,
 * descriptions, and relative timestamps. Used in TaskDetailPanel
 * (desktop tabs), TaskEditDrawer (mobile nested drawer), and
 * Settings (user activity log).
 */

import {
  Archive,
  CheckCircle2,
  Clock,
  Eraser,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Shield,
  SkipForward,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";
import type React from "react";
import { useTranslation } from "react-i18next";
import type { ActivityLogEntry } from "@/api/model";
import { useGetTaskActivityApiV1ActivityTaskTaskIdGet } from "@/api/queries/activity/activity";
import { describeActivity, formatTimeAgo } from "./activity-utils";

const EVENT_ICONS: Record<string, React.ElementType> = {
  task_created: Plus,
  task_completed: CheckCircle2,
  task_uncompleted: RotateCcw,
  task_archived: Archive,
  task_restored: Undo2,
  task_deleted: Trash2,
  task_field_changed: Pencil,
  instance_completed: CheckCircle2,
  instance_uncompleted: RotateCcw,
  instance_skipped: SkipForward,
  instance_unskipped: Undo2,
  instance_rescheduled: Clock,
  instance_batch_completed: CheckCircle2,
  instance_batch_skipped: SkipForward,
  domain_created: Plus,
  domain_updated: Pencil,
  domain_archived: Archive,
  encryption_enabled: Shield,
  encryption_disabled: Shield,
  data_imported: Upload,
  data_wiped: Eraser,
};

function ActivityEntry({ entry }: { entry: ActivityLogEntry }) {
  const Icon = EVENT_ICONS[entry.event_type] ?? Pencil;
  const description = describeActivity(entry);
  const time = formatTimeAgo(entry.created_at);

  return (
    <div className="flex items-start gap-3 py-2.5 px-1">
      <div className="mt-0.5 shrink-0 rounded-full bg-muted p-1.5">
        <Icon className="h-3 w-3 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-snug">{description}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{time}</p>
      </div>
    </div>
  );
}

export function ActivityList({
  entries,
  isLoading,
  isError,
}: {
  entries: ActivityLogEntry[];
  isLoading?: boolean;
  isError?: boolean;
}) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-center text-sm text-muted-foreground py-8">{t("activity.failedToLoad")}</p>
    );
  }

  if (entries.length === 0) {
    return <p className="text-center text-sm text-muted-foreground py-8">{t("activity.empty")}</p>;
  }

  return (
    <div className="divide-y divide-border/50">
      {entries.map((entry) => (
        <ActivityEntry key={entry.id} entry={entry} />
      ))}
    </div>
  );
}

/** Fetches and displays activity for a single task. */
export function TaskActivityPanel({ taskId }: { taskId: number }) {
  const {
    data: entries = [],
    isLoading,
    isError,
  } = useGetTaskActivityApiV1ActivityTaskTaskIdGet(taskId);
  return <ActivityList entries={entries} isLoading={isLoading} isError={isError} />;
}
