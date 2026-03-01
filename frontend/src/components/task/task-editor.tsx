import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  useListTasksApiV1TasksGet,
  useRestoreTaskApiV1TasksTaskIdRestorePost,
  useToggleTaskCompleteApiV1TasksTaskIdToggleCompletePost,
  useUpdateTaskApiV1TasksTaskIdPut,
} from "@/api/queries/tasks/tasks";
import { announce } from "@/components/live-announcer";
import {
  ClarityChipRow,
  DomainChipRow,
  DurationPickerRow,
  ImpactButtonRow,
  ScheduleButtonRow,
  TimePickerField,
} from "@/components/task/field-pickers";
import { SmartInputAutocomplete } from "@/components/task/smart-input-autocomplete";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useCrypto } from "@/hooks/use-crypto";
import { useSmartInputConsumer } from "@/hooks/use-smart-input-consumer";
import { DASHBOARD_TASKS_PARAMS, dashboardTasksKey } from "@/lib/query-keys";
import { TOAST_DURATION_SHORT } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { ParentTaskPicker } from "./parent-task-picker";
import { RecurrencePicker, type RecurrenceRule } from "./recurrence-picker";

interface TaskEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: TaskResponse | null;
  domains: DomainResponse[];
  parentTasks?: TaskResponse[];
}

export function TaskEditor({ open, onOpenChange, task, domains, parentTasks }: TaskEditorProps) {
  const isEdit = !!task;
  const queryClient = useQueryClient();
  const { encryptTaskFields } = useCrypto();
  const flashUpdatedTask = useUIStore((s) => s.flashUpdatedTask);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [domainId, setDomainId] = useState<number | null>(null);
  const [impact, setImpact] = useState(4);
  const [clarity, setClarity] = useState("normal");
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule | null>(null);
  const [recurrenceStart, setRecurrenceStart] = useState<string | null>(null);
  const [recurrenceEnd, setRecurrenceEnd] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [descriptionFocused, setDescriptionFocused] = useState(false);
  const [domainFlash, setDomainFlash] = useState(false);

  const markDirty = useCallback(() => setDirty(true), []);

  // Smart input consumer (Approach A) — tokens in title are detected and consumed
  const smartCallbacks = useMemo(
    () => ({
      onDomain: (id: number) => {
        setDomainId(id);
        markDirty();
      },
      onImpact: (v: number) => {
        setImpact(v);
        markDirty();
      },
      onClarity: (v: string) => {
        setClarity(v);
        markDirty();
      },
      onDuration: (m: number) => {
        setDurationMinutes(m);
        markDirty();
      },
      onScheduledDate: (d: string) => {
        setScheduledDate(d);
        markDirty();
      },
      onScheduledTime: (t: string) => {
        setScheduledTime(t);
        markDirty();
      },
      onDescription: (d: string) => {
        setDescription(d);
        markDirty();
      },
    }),
    [markDirty],
  );

  const {
    titleRef,
    flashTarget,
    processTitle,
    acVisible,
    acSuggestions,
    acSelectedIndex,
    handleAcSelect,
    handleKeyDown: handleSmartKeyDown,
  } = useSmartInputConsumer(domains, smartCallbacks);

  // Auto-resize title textarea
  const resizeTitle = useCallback(() => {
    const el = titleRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.style.height = "0";
      el.style.height = `${el.scrollHeight}px`;
    });
  }, [titleRef]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: title change triggers resize
  useEffect(() => {
    resizeTitle();
  }, [title, resizeTitle]);

  // Populate form when task changes
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
    }
    setDirty(false);
  }, [task]);

  // Close editor if the task being edited is deleted/archived
  const { data: allTasks } = useListTasksApiV1TasksGet(DASHBOARD_TASKS_PARAMS);
  useEffect(() => {
    if (open && task && allTasks) {
      const stillExists = allTasks.some(
        (t) => t.id === task.id || t.subtasks?.some((st) => st.id === task.id),
      );
      if (!stillExists) onOpenChange(false);
    }
  }, [open, task, allTasks, onOpenChange]);

  // Focus title on open
  useEffect(() => {
    if (open) {
      setTimeout(() => titleRef.current?.focus(), 100);
    }
  }, [open, titleRef]);

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

  const handleClose = () => {
    if (dirty) {
      if (!window.confirm("You have unsaved changes. Discard?")) return;
    }
    onOpenChange(false);
  };

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: dashboardTasksKey() });
    queryClient.invalidateQueries({ queryKey: getListInstancesApiV1InstancesGetQueryKey() });
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
            toast.success("Task updated", {
              id: `save-${task.id}`,
              duration: TOAST_DURATION_SHORT,
            });
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
            toast.success("Task created", { duration: TOAST_DURATION_SHORT });
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

  const handleTitleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const cleaned = processTitle(e.target.value);
    setTitle(cleaned);
    markDirty();
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (handleSmartKeyDown(e)) {
      // Autocomplete consumed the event — if it was Enter/Tab, apply the selection
      if ((e.key === "Enter" || e.key === "Tab") && acSuggestions[acSelectedIndex]) {
        const cleaned = handleAcSelect(acSuggestions[acSelectedIndex], title);
        setTitle(cleaned);
        markDirty();
      }
      return;
    }
    // Don't submit on Enter in editor — allow multiline
  };

  const titleInputRef = useRef<HTMLDivElement>(null);

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

          <div className="space-y-4 px-4 pb-4">
            {/* Title — smart input (Approach A: tokens consumed) */}
            <div className="space-y-1.5">
              <Label htmlFor="task-title" className="text-xs font-medium">
                Title
              </Label>
              <div ref={titleInputRef} className="relative">
                <textarea
                  ref={titleRef}
                  id="task-title"
                  value={title}
                  onChange={handleTitleChange}
                  onKeyDown={handleTitleKeyDown}
                  placeholder="What needs to be done? (try #domain !high 30m)"
                  className="w-full text-sm bg-transparent outline-none caret-primary placeholder:text-muted-foreground py-2 px-3 resize-none overflow-hidden rounded-md border border-input focus:ring-1 focus:ring-ring transition-colors"
                  rows={1}
                />
                <SmartInputAutocomplete
                  suggestions={acSuggestions}
                  visible={acVisible}
                  selectedIndex={acSelectedIndex}
                  onSelect={(s) => {
                    const cleaned = handleAcSelect(s, title);
                    setTitle(cleaned);
                    markDirty();
                  }}
                />
              </div>
            </div>

            {/* Domain */}
            <EditorFieldRow label="Domain" flash={flashTarget === "domain" || domainFlash}>
              <DomainChipRow
                domains={domains}
                selectedId={domainId}
                onSelect={(id) => {
                  setDomainId(domainId === id ? null : id);
                  markDirty();
                }}
              />
            </EditorFieldRow>

            {/* Parent task (edit mode only — immediate apply with undo) */}
            {isEdit && task && parentTasks && parentTasks.length > 0 && (
              <EditorFieldRow label="Parent">
                <ParentTaskPicker
                  task={task}
                  parentTasks={parentTasks}
                  domains={domains}
                  onParentChanged={(parentDomainId) => {
                    // Auto-sync domain to match parent's domain
                    if (parentDomainId !== null && parentDomainId !== domainId) {
                      setDomainId(parentDomainId);
                      setDomainFlash(true);
                      setTimeout(() => setDomainFlash(false), 800);
                      markDirty();
                    }
                  }}
                />
              </EditorFieldRow>
            )}

            {/* Impact */}
            <EditorFieldRow label="Impact" flash={flashTarget === "impact"}>
              <ImpactButtonRow
                value={impact}
                onChange={(v) => {
                  setImpact(impact === v ? 4 : v);
                  markDirty();
                }}
              />
            </EditorFieldRow>

            {/* Clarity */}
            <EditorFieldRow label="Clarity" flash={flashTarget === "clarity"}>
              <ClarityChipRow
                value={clarity}
                onChange={(v) => {
                  setClarity(clarity === v ? "normal" : v);
                  markDirty();
                }}
              />
            </EditorFieldRow>

            {/* Duration */}
            <EditorFieldRow label="Duration" flash={flashTarget === "duration"}>
              <DurationPickerRow
                value={durationMinutes}
                showCustom
                onChange={(m) => {
                  setDurationMinutes(m);
                  markDirty();
                }}
              />
            </EditorFieldRow>

            {/* Schedule */}
            <EditorFieldRow label="When" flash={flashTarget === "schedule"}>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <div>
                    <ScheduleButtonRow
                      selectedDate={scheduledDate || null}
                      onSelectDate={(iso) => {
                        setScheduledDate(scheduledDate === iso ? "" : iso);
                        markDirty();
                      }}
                      onClear={() => {
                        setScheduledDate("");
                        setScheduledTime("");
                        markDirty();
                      }}
                      onCalendarOpen={() => setCalendarOpen(true)}
                    />
                  </div>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start" sideOffset={8}>
                  <Calendar
                    mode="single"
                    selected={scheduledDate ? new Date(`${scheduledDate}T00:00:00`) : undefined}
                    onSelect={(date) => {
                      if (date) {
                        const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                        setScheduledDate(iso);
                        setCalendarOpen(false);
                        markDirty();
                      }
                    }}
                    defaultMonth={
                      scheduledDate ? new Date(`${scheduledDate}T00:00:00`) : new Date()
                    }
                    className="mx-auto"
                  />
                </PopoverContent>
              </Popover>
            </EditorFieldRow>

            {/* Time — progressive disclosure: only when date is set */}
            <EditorFieldRow label="Time">
              <TimePickerField
                value={scheduledTime}
                visible={!!scheduledDate}
                onChange={(t) => {
                  setScheduledTime(t);
                  markDirty();
                }}
              />
            </EditorFieldRow>

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

            {/* Notes / Description */}
            <EditorFieldRow label="Notes" flash={flashTarget === "description"}>
              <textarea
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  markDirty();
                }}
                onFocus={() => setDescriptionFocused(true)}
                onBlur={() => setDescriptionFocused(false)}
                placeholder="Add notes..."
                rows={descriptionFocused || description ? 3 : 1}
                className="w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-[13px] outline-none resize-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring transition-all"
              />
            </EditorFieldRow>

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
                          toast.success(`Completed ${count} past instance(s)`, {
                            duration: TOAST_DURATION_SHORT,
                          });
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

            {/* Editor actions: complete / reopen */}
            {isEdit && task && (
              <div className="flex gap-2 pt-2 border-t">
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

/* ------------------------------------------------------------------ */
/*  EditorFieldRow — label + content + optional flash                  */
/* ------------------------------------------------------------------ */

function EditorFieldRow({
  label,
  children,
  flash,
}: {
  label: string;
  children: React.ReactNode;
  flash?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      <div className={cn("rounded-lg transition-all duration-300", flash && "bg-primary/20")}>
        {children}
      </div>
    </div>
  );
}
