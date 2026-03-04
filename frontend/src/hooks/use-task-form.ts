/**
 * useTaskForm — shared form state + save/delete/complete logic for task editing.
 *
 * Extracts ALL duplicated state, mutations, and action handlers from
 * TaskEditor (Sheet) and TaskDetailPanel (dashboard right pane).
 * Both components become thin rendering shells, same pattern as useTriageForm.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { TaskCreate, TaskResponse, TaskUpdate } from "@/api/model";
import {
  getListInstancesApiV1InstancesGetQueryKey,
  useBatchCompleteInstancesApiV1InstancesBatchCompletePost,
  usePendingPastCountApiV1InstancesPendingPastCountGet,
} from "@/api/queries/instances/instances";
import {
  useCreateTaskApiV1TasksPost,
  useDeleteTaskApiV1TasksTaskIdDelete,
  useRestoreTaskApiV1TasksTaskIdRestorePost,
  useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost,
  useUpdateTaskApiV1TasksTaskIdPut,
} from "@/api/queries/tasks/tasks";
import { announce } from "@/components/live-announcer";
import type { RecurrenceRule } from "@/components/task/recurrence-picker";
import type { TaskFieldHandlers, TaskFieldValues } from "@/components/task/task-fields-body";
import { useCrypto } from "@/hooks/use-crypto";
import { dashboardTasksKey } from "@/lib/query-keys";
import { TOAST_DURATION_SHORT } from "@/lib/toast";
import { useUIStore } from "@/stores/ui-store";

/* ------------------------------------------------------------------ */
/*  Options & return type                                              */
/* ------------------------------------------------------------------ */

export interface UseTaskFormOptions {
  /** Task to edit, or null for create mode. */
  task: TaskResponse | null;
  /** Called after save/delete succeeds (close the panel/sheet). */
  onDone: () => void;
}

export interface UseTaskFormReturn {
  isEdit: boolean;

  /** Current field values (compatible with TaskFieldsBody). */
  values: TaskFieldValues;
  /** Field change handlers (compatible with TaskFieldsBody). Stable references. */
  handlers: TaskFieldHandlers;

  // Dirty tracking
  dirty: boolean;
  markDirty: () => void;

  // Delete confirmation
  showDeleteConfirm: boolean;
  setShowDeleteConfirm: (v: boolean) => void;

  // Actions
  handleSave: () => Promise<void>;
  handleDelete: () => void;
  /** Toggle complete. Pass optional callback for extra post-success behavior. */
  handleToggleComplete: (onSuccess?: () => void) => void;
  handleBatchComplete: () => void;

  // Loading states
  isSaving: boolean;
  isDeleting: boolean;
  isToggling: boolean;
  isBatchCompleting: boolean;

  // Recurring
  pendingPastCount: number;
}

/* ------------------------------------------------------------------ */
/*  Hook implementation                                                */
/* ------------------------------------------------------------------ */

export function useTaskForm({ task, onDone }: UseTaskFormOptions): UseTaskFormReturn {
  const isEdit = !!task;
  const queryClient = useQueryClient();
  const { encryptTaskFields } = useCrypto();
  const flashUpdatedTask = useUIStore((s) => s.flashUpdatedTask);

  // ─── Field state ─────────────────────────────────────────────────────
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [domainId, setDomainId] = useState<number | null>(task?.domain_id ?? null);
  const [impact, setImpact] = useState(task?.impact ?? 4);
  const [clarity, setClarity] = useState(task?.clarity ?? "normal");
  const [durationMinutes, setDurationMinutes] = useState<number | null>(
    task?.duration_minutes ?? null,
  );
  const [scheduledDate, setScheduledDate] = useState(task?.scheduled_date ?? "");
  const [scheduledTime, setScheduledTime] = useState(task?.scheduled_time ?? "");
  const [isRecurring, setIsRecurring] = useState(task?.is_recurring ?? false);
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule | null>(
    task?.recurrence_rule ? (task.recurrence_rule as unknown as RecurrenceRule) : null,
  );
  const [recurrenceStart, setRecurrenceStart] = useState<string | null>(
    task?.recurrence_start ?? null,
  );
  const [recurrenceEnd, setRecurrenceEnd] = useState<string | null>(task?.recurrence_end ?? null);
  const [reminderMinutesBefore, setReminderMinutesBefore] = useState<number | null>(
    task?.reminder_minutes_before ?? null,
  );
  const [dirty, setDirty] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const markDirty = useCallback(() => setDirty(true), []);

  // ─── Reset on task change (for mounted-panel pattern like TaskEditor) ──
  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description ?? "");
      setDomainId(task.domain_id ?? null);
      setImpact(task.impact);
      setClarity(task.clarity ?? "normal");
      setDurationMinutes(task.duration_minutes);
      setScheduledDate(task.scheduled_date ?? "");
      setScheduledTime(task.scheduled_time ?? "");
      setIsRecurring(task.is_recurring);
      setRecurrenceRule(
        task.recurrence_rule ? (task.recurrence_rule as unknown as RecurrenceRule) : null,
      );
      setRecurrenceStart(task.recurrence_start ?? null);
      setRecurrenceEnd(task.recurrence_end ?? null);
      setReminderMinutesBefore(task.reminder_minutes_before ?? null);
    } else {
      setTitle("");
      setDescription("");
      setDomainId(null);
      setImpact(4);
      setClarity("normal");
      setDurationMinutes(null);
      setScheduledDate("");
      setScheduledTime("");
      setIsRecurring(false);
      setRecurrenceRule(null);
      setRecurrenceStart(null);
      setRecurrenceEnd(null);
      setReminderMinutesBefore(null);
    }
    setDirty(false);
    setShowDeleteConfirm(false);
  }, [task]);

  // ─── Mutations ───────────────────────────────────────────────────────
  const createMutation = useCreateTaskApiV1TasksPost();
  const updateMutation = useUpdateTaskApiV1TasksTaskIdPut();
  const deleteMutation = useDeleteTaskApiV1TasksTaskIdDelete();
  const restoreMutation = useRestoreTaskApiV1TasksTaskIdRestorePost();
  const toggleCompleteMutation = useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost();

  // Pending past instances (recurring edit mode)
  const pendingPastQuery = usePendingPastCountApiV1InstancesPendingPastCountGet({
    query: { enabled: isEdit && !!task?.is_recurring },
  });
  const pendingPastCount =
    (pendingPastQuery.data as { pending_count?: number } | undefined)?.pending_count ?? 0;
  const batchComplete = useBatchCompleteInstancesApiV1InstancesBatchCompletePost();

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const invalidateQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: dashboardTasksKey() });
    queryClient.invalidateQueries({ queryKey: getListInstancesApiV1InstancesGetQueryKey() });
  }, [queryClient]);

  // ─── Save ────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }

    const encrypted = await encryptTaskFields({
      title: title.trim(),
      description: description.trim() || null,
    });

    if (isEdit && task) {
      const data: TaskUpdate = {
        title: encrypted.title,
        description: encrypted.description,
        domain_id: domainId,
        impact,
        clarity,
        duration_minutes: durationMinutes,
        scheduled_date: scheduledDate || null,
        scheduled_time: scheduledTime || null,
        is_recurring: isRecurring,
        recurrence_rule: recurrenceRule as TaskUpdate["recurrence_rule"],
        recurrence_start: recurrenceStart,
        recurrence_end: recurrenceEnd,
        reminder_minutes_before: reminderMinutesBefore,
      };

      updateMutation.mutate(
        { taskId: task.id, data },
        {
          onSuccess: () => {
            announce("Task updated");
            toast.success("Task updated", {
              id: `save-${task.id}`,
              duration: TOAST_DURATION_SHORT,
            });
            invalidateQueries();
            flashUpdatedTask(task.id);
            setDirty(false);
            onDone();
          },
          onError: () => toast.error("Failed to update task", { id: `save-err-${task.id}` }),
        },
      );
    } else {
      const data: TaskCreate = {
        title: encrypted.title!,
        description: encrypted.description,
        domain_id: domainId,
        impact,
        clarity,
        duration_minutes: durationMinutes,
        scheduled_date: scheduledDate || null,
        scheduled_time: scheduledTime || null,
        is_recurring: isRecurring,
        recurrence_rule: recurrenceRule as TaskCreate["recurrence_rule"],
        recurrence_start: recurrenceStart,
        recurrence_end: recurrenceEnd,
        reminder_minutes_before: reminderMinutesBefore,
      };

      createMutation.mutate(
        { data },
        {
          onSuccess: () => {
            announce("Task created");
            toast.success("Task created", { duration: TOAST_DURATION_SHORT });
            invalidateQueries();
            setDirty(false);
            onDone();
          },
          onError: () => toast.error("Failed to create task"),
        },
      );
    }
  }, [
    title,
    description,
    domainId,
    impact,
    clarity,
    durationMinutes,
    scheduledDate,
    scheduledTime,
    isRecurring,
    recurrenceRule,
    recurrenceStart,
    recurrenceEnd,
    reminderMinutesBefore,
    isEdit,
    task,
    encryptTaskFields,
    updateMutation,
    createMutation,
    invalidateQueries,
    flashUpdatedTask,
    onDone,
  ]);

  // ─── Delete ──────────────────────────────────────────────────────────
  const handleDelete = useCallback(() => {
    if (!task) return;
    deleteMutation.mutate(
      { taskId: task.id },
      {
        onSuccess: () => {
          toast.success("Task deleted", {
            id: `delete-${task.id}`,
            action: {
              label: "Undo",
              onClick: () => {
                restoreMutation.mutate(
                  { taskId: task.id },
                  {
                    onSuccess: () => {
                      toast.success("Task restored", { id: `restore-${task.id}` });
                      invalidateQueries();
                    },
                  },
                );
              },
            },
          });
          invalidateQueries();
          setShowDeleteConfirm(false);
          onDone();
        },
        onError: () => toast.error("Failed to delete task", { id: `delete-err-${task.id}` }),
      },
    );
  }, [task, deleteMutation, restoreMutation, invalidateQueries, onDone]);

  // ─── Toggle complete ─────────────────────────────────────────────────
  const handleToggleComplete = useCallback(
    (extraOnSuccess?: () => void) => {
      if (!task) return;
      const wasCompleted = task.status === "completed" || !!task.completed_at;
      toggleCompleteMutation.mutate(
        { taskId: task.id, data: null },
        {
          onSuccess: () => {
            invalidateQueries();
            toast.success(wasCompleted ? `Reopened "${task.title}"` : `Completed "${task.title}"`, {
              id: `complete-${task.id}`,
              action: {
                label: "Undo",
                onClick: () => {
                  toggleCompleteMutation.mutate(
                    { taskId: task.id, data: null },
                    { onSuccess: () => invalidateQueries() },
                  );
                },
              },
            });
            extraOnSuccess?.();
          },
          onError: () => toast.error("Failed to update task", { id: `complete-err-${task.id}` }),
        },
      );
    },
    [task, toggleCompleteMutation, invalidateQueries],
  );

  // ─── Batch complete past instances ───────────────────────────────────
  const handleBatchComplete = useCallback(() => {
    if (!task) return;
    const today = new Date().toISOString().split("T")[0];
    batchComplete.mutate(
      { data: { task_id: task.id, before_date: today } },
      {
        onSuccess: (data) => {
          const count = (data as { completed_count?: number }).completed_count ?? 0;
          invalidateQueries();
          toast.success(`Completed ${count} past instance(s)`, {
            duration: TOAST_DURATION_SHORT,
          });
        },
        onError: () => toast.error("Failed to complete past instances"),
      },
    );
  }, [task, batchComplete, invalidateQueries]);

  // ─── TaskFieldsBody-compatible interfaces ────────────────────────────
  const values: TaskFieldValues = {
    title,
    description,
    domainId,
    impact,
    clarity,
    durationMinutes,
    scheduledDate,
    scheduledTime,
    isRecurring,
    recurrenceRule,
    recurrenceStart,
    recurrenceEnd,
    reminderMinutesBefore,
  };

  // Memoized so consumers can depend on stable reference
  // (all setters are stable useState references)
  const handlers: TaskFieldHandlers = useMemo(
    () => ({
      onTitleChange: setTitle,
      onDescriptionChange: setDescription,
      onDomainChange: setDomainId,
      onImpactChange: setImpact,
      onClarityChange: setClarity,
      onDurationChange: setDurationMinutes,
      onScheduledDateChange: setScheduledDate,
      onScheduledTimeChange: setScheduledTime,
      onRecurringChange: setIsRecurring,
      onRecurrenceRuleChange: setRecurrenceRule,
      onRecurrenceStartChange: setRecurrenceStart,
      onRecurrenceEndChange: setRecurrenceEnd,
      onReminderChange: setReminderMinutesBefore,
    }),
    [],
  );

  return {
    isEdit,
    values,
    handlers,
    dirty,
    markDirty,
    showDeleteConfirm,
    setShowDeleteConfirm,
    handleSave,
    handleDelete,
    handleToggleComplete,
    handleBatchComplete,
    isSaving,
    isDeleting: deleteMutation.isPending,
    isToggling: toggleCompleteMutation.isPending,
    isBatchCompleting: batchComplete.isPending,
    pendingPastCount,
  };
}
