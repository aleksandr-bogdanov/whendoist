/**
 * TaskDetailPanel — inline task editor for the dashboard right pane (desktop).
 *
 * Supports two modes:
 * - "edit": editing an existing task (populated from task prop)
 * - "create": creating a new task (empty fields)
 *
 * When mode is "idle" (no task selected, not creating), shows an empty state
 * with keyboard navigation hints.
 */

import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle, Loader2, MousePointerClick, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { DomainResponse, TaskCreate, TaskResponse, TaskUpdate } from "@/api/model";
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
import {
  type TaskFieldHandlers,
  TaskFieldsBody,
  type TaskFieldValues,
} from "@/components/task/task-fields-body";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCrypto } from "@/hooks/use-crypto";
import { dashboardTasksKey } from "@/lib/query-keys";
import { useUIStore } from "@/stores/ui-store";
import type { RecurrenceRule } from "./recurrence-picker";

interface TaskDetailPanelProps {
  task: TaskResponse | null;
  domains: DomainResponse[];
  parentTasks: TaskResponse[];
  /** "idle" = no task, show empty state. "edit" = editing task. "create" = new task form. */
  mode: "idle" | "edit" | "create";
  /** Called when the user closes the panel (X button, Escape, or after create). */
  onClose: () => void;
}

export function TaskDetailPanel({
  task,
  domains,
  parentTasks,
  mode,
  onClose,
}: TaskDetailPanelProps) {
  if (mode === "idle") {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <MousePointerClick className="h-8 w-8 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">Select a task to view details</p>
          <p className="text-xs text-muted-foreground/60">
            <kbd className="px-1 py-0.5 rounded border border-border text-[10px]">j</kbd>{" "}
            <kbd className="px-1 py-0.5 rounded border border-border text-[10px]">k</kbd> to
            navigate, <kbd className="px-1 py-0.5 rounded border border-border text-[10px]">n</kbd>{" "}
            to create
          </p>
        </div>
      </div>
    );
  }

  return (
    <DetailBody
      key={mode === "create" ? "create" : task!.id}
      task={mode === "edit" ? task! : null}
      domains={domains}
      parentTasks={parentTasks}
      onClose={onClose}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  DetailBody — handles both edit and create modes                    */
/* ------------------------------------------------------------------ */

function DetailBody({
  task,
  domains,
  parentTasks,
  onClose,
}: {
  task: TaskResponse | null;
  domains: DomainResponse[];
  parentTasks: TaskResponse[];
  onClose: () => void;
}) {
  const isEdit = !!task;
  const queryClient = useQueryClient();
  const { encryptTaskFields } = useCrypto();
  const flashUpdatedTask = useUIStore((s) => s.flashUpdatedTask);

  // Field state — populated from task on mount (edit) or empty (create)
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
  const [dirty, setDirty] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const markDirty = useCallback(() => setDirty(true), []);

  // Mutations
  const createMutation = useCreateTaskApiV1TasksPost();
  const updateMutation = useUpdateTaskApiV1TasksTaskIdPut();
  const deleteMutation = useDeleteTaskApiV1TasksTaskIdDelete();
  const restoreMutation = useRestoreTaskApiV1TasksTaskIdRestorePost();
  const toggleCompleteMutation = useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost();

  // Pending past instances for recurring tasks (edit mode only)
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

  // Focus title on mount for create mode
  useEffect(() => {
    if (!isEdit) {
      // Small delay to let TaskFieldsBody mount and create the textarea ref
      const timer = setTimeout(() => {
        const titleEl = document.getElementById("task-title") as HTMLTextAreaElement | null;
        titleEl?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isEdit]);

  const handleSave = async () => {
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
      };

      updateMutation.mutate(
        { taskId: task.id, data },
        {
          onSuccess: () => {
            announce("Task updated");
            toast.success("Task updated", { id: `save-${task.id}` });
            invalidateQueries();
            flashUpdatedTask(task.id);
            setDirty(false);
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
      };

      createMutation.mutate(
        { data },
        {
          onSuccess: () => {
            announce("Task created");
            toast.success("Task created");
            invalidateQueries();
            onClose();
          },
          onError: () => toast.error("Failed to create task"),
        },
      );
    }
  };

  const handleDelete = () => {
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
          onClose();
        },
        onError: () => toast.error("Failed to delete task", { id: `delete-err-${task.id}` }),
      },
    );
  };

  const handleToggleComplete = () => {
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
        },
        onError: () => toast.error("Failed to update task", { id: `complete-err-${task.id}` }),
      },
    );
  };

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
  };

  const handlers: TaskFieldHandlers = {
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
  };

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header with title and close button */}
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="text-sm font-semibold">{isEdit ? "Edit Task" : "New Task"}</h2>
          <button
            type="button"
            onClick={() => {
              if (dirty && !window.confirm("You have unsaved changes. Discard?")) return;
              onClose();
            }}
            className="p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Close (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5">
          <TaskFieldsBody
            values={values}
            handlers={handlers}
            domains={domains}
            task={task}
            parentTasks={parentTasks}
            onDirty={markDirty}
          />

          {/* Batch complete past instances (edit mode, recurring only) */}
          {isEdit && task?.is_recurring && pendingPastCount > 0 && (
            <div className="pt-3 mt-3 border-t">
              <Button
                variant="outline"
                size="sm"
                className="text-xs w-full"
                disabled={batchComplete.isPending}
                onClick={() => {
                  const today = new Date().toISOString().split("T")[0];
                  batchComplete.mutate(
                    { data: { task_id: task.id, before_date: today } },
                    {
                      onSuccess: (data) => {
                        const count = (data as { completed_count?: number }).completed_count ?? 0;
                        invalidateQueries();
                        toast.success(`Completed ${count} past instance(s)`);
                      },
                      onError: () => toast.error("Failed to complete past instances"),
                    },
                  );
                }}
              >
                {batchComplete.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                Complete {pendingPastCount} past instance(s)
              </Button>
            </div>
          )}

          {/* Metadata timestamps (edit mode only) */}
          {isEdit && task && (
            <div className="text-[11px] text-muted-foreground pt-3 mt-3 border-t">
              {task.created_at && (
                <span>
                  Created{" "}
                  {new Date(task.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              )}
              {task.completed_at && (
                <span>
                  {" · "}Completed{" "}
                  {new Date(task.completed_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Footer — action buttons */}
        <div className="border-t bg-background px-5 py-3 flex items-center gap-2">
          {isEdit && task && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1"
                onClick={handleToggleComplete}
                disabled={toggleCompleteMutation.isPending}
              >
                {task.status === "completed" || task.completed_at ? (
                  <>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reopen
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-3.5 w-3.5" />
                    Complete
                  </>
                )}
              </Button>
              <div className="flex-1" />
              <Button
                variant="destructive"
                size="icon"
                className="h-8 w-8"
                onClick={() => setShowDeleteConfirm(true)}
                title="Delete task"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          {!isEdit && <div className="flex-1" />}
          <Button
            onClick={handleSave}
            disabled={isSaving || !title.trim() || (isEdit && !dirty)}
            size="sm"
            className="text-xs gap-1"
          >
            {isSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            {isEdit ? (
              "Save"
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" />
                Create Task
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Delete confirmation (edit mode only) */}
      {isEdit && task && (
        <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Task</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete &ldquo;{task.title}&rdquo;?
                {(task.subtasks?.length ?? 0) > 0 &&
                  ` This will also delete ${task.subtasks!.length} subtask(s).`}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
