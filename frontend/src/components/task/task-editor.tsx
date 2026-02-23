import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpFromLine, CheckCircle, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type {
  AppRoutersTasksTaskResponse,
  DomainResponse,
  TaskCreate,
  TaskUpdate,
} from "@/api/model";
import {
  useBatchCompleteInstancesApiV1InstancesBatchCompletePost,
  usePendingPastCountApiV1InstancesPendingPastCountGet,
} from "@/api/queries/instances/instances";
import {
  getListTasksApiV1TasksGetQueryKey,
  useCreateTaskApiV1TasksPost,
  useDeleteTaskApiV1TasksTaskIdDelete,
  useRestoreTaskApiV1TasksTaskIdRestorePost,
  useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost,
  useUpdateTaskApiV1TasksTaskIdPut,
} from "@/api/queries/tasks/tasks";
import { announce } from "@/components/live-announcer";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useCrypto } from "@/hooks/use-crypto";
import {
  CLARITY_OPTIONS,
  DURATION_PRESETS,
  formatDurationLabel,
  IMPACT_COLORS,
  IMPACT_OPTIONS,
} from "@/lib/task-utils";
import { useUIStore } from "@/stores/ui-store";
import { RecurrencePicker, type RecurrenceRule } from "./recurrence-picker";

interface TaskEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: AppRoutersTasksTaskResponse | null;
  domains: DomainResponse[];
  parentTasks?: AppRoutersTasksTaskResponse[];
}

export function TaskEditor({ open, onOpenChange, task, domains, parentTasks }: TaskEditorProps) {
  const isEdit = !!task;
  const queryClient = useQueryClient();
  const { encryptTaskFields } = useCrypto();
  const flashUpdatedTask = useUIStore((s) => s.flashUpdatedTask);
  const titleRef = useRef<HTMLInputElement>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [domainId, setDomainId] = useState<string>("none");
  const [parentId, setParentId] = useState<string>("none");
  const [impact, setImpact] = useState(4);
  const [clarity, setClarity] = useState("normal");
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);
  const [customDuration, setCustomDuration] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule | null>(null);
  const [recurrenceStart, setRecurrenceStart] = useState<string | null>(null);
  const [recurrenceEnd, setRecurrenceEnd] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Populate form when task changes
  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description ?? "");
      setDomainId(task.domain_id != null ? String(task.domain_id) : "none");
      setParentId(task.parent_id != null ? String(task.parent_id) : "none");
      setImpact(task.impact);
      setClarity(task.clarity ?? "normal");
      setDurationMinutes(task.duration_minutes);
      setCustomDuration(task.duration_minutes ? String(task.duration_minutes) : "");
      setScheduledDate(task.scheduled_date ?? "");
      setScheduledTime(task.scheduled_time ?? "");
      setIsRecurring(task.is_recurring);
      setRecurrenceRule(
        task.recurrence_rule ? (task.recurrence_rule as unknown as RecurrenceRule) : null,
      );
      setRecurrenceStart(task.recurrence_start ?? null);
      setRecurrenceEnd(task.recurrence_end ?? null);
    } else {
      setTitle("");
      setDescription("");
      setDomainId("none");
      setParentId("none");
      setImpact(4);
      setClarity("normal");
      setDurationMinutes(null);
      setCustomDuration("");
      setScheduledDate("");
      setScheduledTime("");
      setIsRecurring(false);
      setRecurrenceRule(null);
      setRecurrenceStart(null);
      setRecurrenceEnd(null);
    }
    setDirty(false);
  }, [task]);

  // Focus title on open
  useEffect(() => {
    if (open) {
      setTimeout(() => titleRef.current?.focus(), 100);
    }
  }, [open]);

  // Pending past instances for recurring tasks
  const pendingPastQuery = usePendingPastCountApiV1InstancesPendingPastCountGet({
    query: { enabled: !!task?.is_recurring && open },
  });
  const pendingPastCount =
    (pendingPastQuery.data as { pending_count?: number } | undefined)?.pending_count ?? 0;
  const batchComplete = useBatchCompleteInstancesApiV1InstancesBatchCompletePost();

  const createMutation = useCreateTaskApiV1TasksPost();
  const updateMutation = useUpdateTaskApiV1TasksTaskIdPut();
  const deleteMutation = useDeleteTaskApiV1TasksTaskIdDelete();
  const restoreMutation = useRestoreTaskApiV1TasksTaskIdRestorePost();
  const toggleCompleteMutation = useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost();

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const markDirty = () => setDirty(true);

  const handleClose = () => {
    if (dirty) {
      if (!window.confirm("You have unsaved changes. Discard?")) return;
    }
    onOpenChange(false);
  };

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }

    const encrypted = await encryptTaskFields({
      title: title.trim(),
      description: description.trim() || null,
    });

    const parsedDomainId = domainId !== "none" ? Number(domainId) : null;
    const parsedParentId = parentId !== "none" ? Number(parentId) : null;

    if (isEdit && task) {
      const data: TaskUpdate = {
        title: encrypted.title,
        description: encrypted.description,
        domain_id: parsedDomainId,
        parent_id: parsedParentId,
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
            onOpenChange(false);
          },
          onError: () => toast.error("Failed to update task", { id: `save-err-${task.id}` }),
        },
      );
    } else {
      const data: TaskCreate = {
        title: encrypted.title!,
        description: encrypted.description,
        domain_id: parsedDomainId,
        parent_id: parsedParentId,
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
            setDirty(false);
            onOpenChange(false);
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
          onOpenChange(false);
        },
        onError: () => toast.error("Failed to delete task", { id: `delete-err-${task.id}` }),
      },
    );
  };

  const handleDurationPreset = (m: number) => {
    setDurationMinutes(durationMinutes === m ? null : m);
    setCustomDuration(durationMinutes === m ? "" : String(m));
    markDirty();
  };

  const handleCustomDuration = (val: string) => {
    setCustomDuration(val);
    const n = Number(val);
    setDurationMinutes(n > 0 && n <= 1440 ? n : null);
    markDirty();
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
          onOpenChange(false);
        },
        onError: () => toast.error("Failed to update task", { id: `complete-err-${task.id}` }),
      },
    );
  };

  const handlePromote = () => {
    if (!task) return;
    updateMutation.mutate(
      { taskId: task.id, data: { parent_id: null } },
      {
        onSuccess: () => {
          invalidateQueries();
          toast.success("Promoted to top-level task");
          onOpenChange(false);
        },
        onError: () => toast.error("Failed to promote task"),
      },
    );
  };

  return (
    <>
      <Sheet open={open} onOpenChange={handleClose}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto" showCloseButton>
          <SheetHeader>
            <SheetTitle>{isEdit ? "Edit Task" : "New Task"}</SheetTitle>
            <SheetDescription>
              {isEdit
                ? "Update the task details below."
                : "Fill in the details to create a new task."}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-5 px-4 pb-4">
            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="task-title" className="text-xs font-medium">
                Title
              </Label>
              <Input
                ref={titleRef}
                id="task-title"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  markDirty();
                }}
                placeholder="What needs to be done?"
                className="h-9"
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="task-desc" className="text-xs font-medium">
                Description
              </Label>
              <Textarea
                id="task-desc"
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  markDirty();
                }}
                placeholder="Add details..."
                rows={3}
                className="resize-none"
              />
            </div>

            {/* Domain */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Domain</Label>
              <Select
                value={domainId}
                onValueChange={(v) => {
                  setDomainId(v);
                  markDirty();
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="No domain" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Thought (no domain)</SelectItem>
                  {domains
                    .filter((d) => !d.is_archived)
                    .map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {d.icon ? `${d.icon} ` : ""}
                        {d.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Parent task */}
            {parentTasks && parentTasks.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Parent Task</Label>
                <Select
                  value={parentId}
                  onValueChange={(v) => {
                    setParentId(v);
                    markDirty();
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="None (top-level)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (top-level)</SelectItem>
                    {parentTasks
                      .filter((t) => t.id !== task?.id)
                      .map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.title}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Impact */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Impact</Label>
              <div className="flex gap-1.5">
                {IMPACT_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    type="button"
                    variant={impact === opt.value ? "default" : "outline"}
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    style={
                      impact === opt.value
                        ? {
                            backgroundColor: IMPACT_COLORS[opt.value],
                            borderColor: IMPACT_COLORS[opt.value],
                            color: "white",
                          }
                        : undefined
                    }
                    onClick={() => {
                      setImpact(opt.value);
                      markDirty();
                    }}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Clarity / Mode */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Mode</Label>
              <div className="flex gap-1.5">
                {CLARITY_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    type="button"
                    variant={clarity === opt.value ? "default" : "outline"}
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    onClick={() => {
                      setClarity(opt.value);
                      markDirty();
                    }}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Duration */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Duration</Label>
              <div className="flex gap-1.5 items-center">
                {DURATION_PRESETS.map((m) => (
                  <Button
                    key={m}
                    type="button"
                    variant={durationMinutes === m ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs px-2"
                    onClick={() => handleDurationPreset(m)}
                  >
                    {formatDurationLabel(m)}
                  </Button>
                ))}
                <Input
                  type="number"
                  min={1}
                  max={1440}
                  value={customDuration}
                  onChange={(e) => handleCustomDuration(e.target.value)}
                  placeholder="min"
                  className="h-7 w-16 text-xs"
                />
              </div>
            </div>

            {/* Scheduled date + time */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Scheduled</Label>
              <div className="flex gap-2 items-center">
                <Input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => {
                    setScheduledDate(e.target.value);
                    markDirty();
                  }}
                  className="h-8 text-xs flex-1"
                />
                <Input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => {
                    setScheduledTime(e.target.value);
                    markDirty();
                  }}
                  className="h-8 text-xs w-28"
                />
              </div>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] px-2"
                  onClick={() => {
                    setScheduledDate(new Date().toISOString().split("T")[0]);
                    markDirty();
                  }}
                >
                  Today
                </Button>
                {(scheduledDate || scheduledTime) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] px-2 text-muted-foreground"
                    onClick={() => {
                      setScheduledDate("");
                      setScheduledTime("");
                      markDirty();
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>

            {/* Recurrence */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-medium">Repeat</Label>
                <Button
                  type="button"
                  variant={isRecurring ? "default" : "outline"}
                  size="sm"
                  className="h-6 text-[10px] px-2"
                  onClick={() => {
                    const next = !isRecurring;
                    setIsRecurring(next);
                    if (!next) {
                      setRecurrenceRule(null);
                      setRecurrenceStart(null);
                      setRecurrenceEnd(null);
                    } else if (!recurrenceRule) {
                      setRecurrenceRule({ freq: "daily", interval: 1 });
                    }
                    markDirty();
                  }}
                >
                  {isRecurring ? "On" : "Off"}
                </Button>
              </div>
              {isRecurring && (
                <RecurrencePicker
                  rule={recurrenceRule}
                  recurrenceStart={recurrenceStart}
                  recurrenceEnd={recurrenceEnd}
                  onChange={(rule, start, end) => {
                    setRecurrenceRule(rule);
                    setRecurrenceStart(start);
                    setRecurrenceEnd(end);
                    if (!rule) setIsRecurring(false);
                    markDirty();
                  }}
                />
              )}
            </div>

            {/* Batch complete past instances */}
            {isEdit && task?.is_recurring && pendingPastCount > 0 && (
              <div className="pt-2 border-t">
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

            {/* Editor actions: promote / complete */}
            {isEdit && task && (
              <div className="flex gap-2 pt-2 border-t">
                {task.parent_id != null && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1"
                    onClick={handlePromote}
                    disabled={updateMutation.isPending}
                  >
                    <ArrowUpFromLine className="h-3.5 w-3.5" />
                    Promote to top-level
                  </Button>
                )}
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
              </div>
            )}

            {/* Metadata timestamps */}
            {isEdit && task && (
              <div className="text-[11px] text-muted-foreground pt-2 border-t">
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

            {/* Save / Delete */}
            <div className="flex gap-2 pt-2 border-t">
              <Button onClick={handleSave} disabled={isSaving || !title.trim()} className="flex-1">
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEdit ? "Save Changes" : "Create Task"}
              </Button>
              {isEdit && (
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={() => setShowDeleteConfirm(true)}
                  title="Delete task"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Task</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{task?.title}&rdquo;?
              {(task?.subtasks?.length ?? 0) > 0 &&
                ` This will also delete ${task!.subtasks!.length} subtask(s).`}
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
    </>
  );
}
