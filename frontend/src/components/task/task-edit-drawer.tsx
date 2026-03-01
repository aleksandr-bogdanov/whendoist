/**
 * TaskEditDrawer — mobile bottom drawer for creating and editing tasks.
 *
 * Mirrors the ThoughtTriageDrawer pattern: thin vaul layout shell,
 * all form logic in useTaskForm, compact inline-label field rows.
 */

import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle, ChevronRight, Loader2, RotateCcw, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Drawer } from "vaul";
import type { DomainResponse, SubtaskResponse, TaskResponse } from "@/api/model";
import {
  useListTasksApiV1TasksGet,
  useUpdateTaskApiV1TasksTaskIdPut,
} from "@/api/queries/tasks/tasks";
import { announce } from "@/components/live-announcer";
import {
  ClarityChipRow,
  DomainChipRow,
  DurationPickerRow,
  ImpactButtonRow,
  RecurrencePresetRow,
  type RecurrencePresetValue,
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
import { RichText } from "@/components/ui/rich-text";
import { usePasteUrl } from "@/hooks/use-paste-url";
import { useSmartInputConsumer } from "@/hooks/use-smart-input-consumer";
import { useTaskForm } from "@/hooks/use-task-form";
import { DASHBOARD_TASKS_PARAMS, dashboardTasksKey } from "@/lib/query-keys";
import { hasLinks } from "@/lib/rich-text-parser";
import { groupParentTasks } from "@/lib/task-utils";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";

/* ------------------------------------------------------------------ */
/*  Recurrence rule ↔ preset mapping                                   */
/* ------------------------------------------------------------------ */

const WEEKDAY_KEYS = ["MO", "TU", "WE", "TH", "FR"];

function ruleToPreset(
  isRecurring: boolean,
  rule: Record<string, unknown> | null,
): RecurrencePresetValue | null {
  if (!isRecurring || !rule) return null;
  const freq = rule.freq as string | undefined;
  const interval = (rule.interval as number) ?? 1;
  const days = rule.days_of_week as string[] | undefined;

  if (freq === "daily" && interval === 1 && !days?.length)
    return { preset: "daily", rule: { freq: "daily", interval: 1 } };
  if (
    freq === "weekly" &&
    interval === 1 &&
    days?.length === 5 &&
    WEEKDAY_KEYS.every((d) => days.includes(d))
  )
    return {
      preset: "weekdays",
      rule: { freq: "weekly", interval: 1, days_of_week: [...WEEKDAY_KEYS] },
    };
  if (freq === "weekly" && interval === 1 && (!days || days.length === 0))
    return { preset: "weekly", rule: { freq: "weekly", interval: 1 } };
  if (freq === "monthly" && interval === 1)
    return { preset: "monthly", rule: { freq: "monthly", interval: 1 } };

  // Complex rule — can't map to a preset, show as "Custom" (treat as none for presets)
  return null;
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface TaskEditDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: TaskResponse | null;
  domains: DomainResponse[];
  parentTasks?: TaskResponse[];
}

export function TaskEditDrawer({
  open,
  onOpenChange,
  task,
  domains,
  parentTasks,
}: TaskEditDrawerProps) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Drawer.Content
          className={cn(
            "fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-2xl",
            "bg-background border-t border-border",
            "max-h-[90vh] max-w-lg mx-auto",
          )}
        >
          <div className="mx-auto mt-3 mb-1 h-1.5 w-12 rounded-full bg-muted-foreground/20" />
          <Drawer.Title className="sr-only">{task ? "Edit Task" : "New Task"}</Drawer.Title>

          {open && (
            <DrawerBody
              key={task?.id ?? "create"}
              task={task ?? null}
              domains={domains}
              parentTasks={parentTasks ?? []}
              onDone={() => onOpenChange(false)}
            />
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/* ------------------------------------------------------------------ */
/*  DrawerBody                                                         */
/* ------------------------------------------------------------------ */

function DrawerBody({
  task,
  domains,
  parentTasks,
  onDone,
}: {
  task: TaskResponse | null;
  domains: DomainResponse[];
  parentTasks: TaskResponse[];
  onDone: () => void;
}) {
  const form = useTaskForm({ task, onDone });
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [descriptionFocused, setDescriptionFocused] = useState(false);
  const [domainFlash, setDomainFlash] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [parentPickerOpen, setParentPickerOpen] = useState(false);
  const [parentSearch, setParentSearch] = useState("");

  // Recurrence preset state (maps task's rule to closest preset)
  const [recurrence, setRecurrence] = useState<RecurrencePresetValue | null>(() =>
    ruleToPreset(
      form.values.isRecurring,
      form.values.recurrenceRule as Record<string, unknown> | null,
    ),
  );

  // Sync recurrence preset when task changes
  useEffect(() => {
    setRecurrence(
      ruleToPreset(
        form.values.isRecurring,
        form.values.recurrenceRule as Record<string, unknown> | null,
      ),
    );
  }, [form.values.isRecurring, form.values.recurrenceRule]);

  // URL paste handling for notes
  const { onPaste: handleDescriptionPaste } = usePasteUrl({
    getValue: () => form.values.description,
    setValue: (v) => {
      form.handlers.onDescriptionChange(v);
      form.markDirty();
    },
    textareaRef: descriptionRef,
    onDirty: form.markDirty,
  });

  // Smart input consumer (Approach A)
  const smartCallbacks = useMemo(
    () => ({
      onDomain: (id: number) => {
        form.handlers.onDomainChange(id);
        setDomainFlash(true);
        setTimeout(() => setDomainFlash(false), 800);
        form.markDirty();
      },
      onImpact: (v: number) => {
        form.handlers.onImpactChange(v);
        form.markDirty();
      },
      onClarity: (v: string) => {
        form.handlers.onClarityChange(v);
        form.markDirty();
      },
      onDuration: (m: number) => {
        form.handlers.onDurationChange(m);
        form.markDirty();
      },
      onScheduledDate: (d: string) => {
        form.handlers.onScheduledDateChange(d);
        form.markDirty();
      },
      onScheduledTime: (t: string) => {
        form.handlers.onScheduledTimeChange(t);
        form.markDirty();
      },
      onDescription: (d: string) => {
        form.handlers.onDescriptionChange(d);
        form.markDirty();
      },
    }),
    [form.handlers, form.markDirty],
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
  } = useSmartInputConsumer(domains, smartCallbacks, task?.title);

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
  }, [form.values.title, resizeTitle]);

  // Focus title with delay (vaul animation needs to settle)
  useEffect(() => {
    const timer = setTimeout(() => titleRef.current?.focus(), 300);
    return () => clearTimeout(timer);
  }, [titleRef]);

  // Close drawer if the task being edited is deleted/archived externally
  const { data: allTasks } = useListTasksApiV1TasksGet(DASHBOARD_TASKS_PARAMS);
  useEffect(() => {
    if (task && allTasks) {
      const stillExists = allTasks.some(
        (t) => t.id === task.id || t.subtasks?.some((st) => st.id === task.id),
      );
      if (!stillExists) onDone();
    }
  }, [task, allTasks, onDone]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const cleaned = processTitle(e.target.value);
    form.handlers.onTitleChange(cleaned);
    form.markDirty();
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (handleSmartKeyDown(e)) {
      if ((e.key === "Enter" || e.key === "Tab") && acSuggestions[acSelectedIndex]) {
        const cleaned = handleAcSelect(acSuggestions[acSelectedIndex], form.values.title);
        form.handlers.onTitleChange(cleaned);
        form.markDirty();
      }
      return;
    }
  };

  const handleRecurrenceChange = (value: RecurrencePresetValue) => {
    setRecurrence(value);
    if (value.preset === "none" || !value.rule) {
      form.handlers.onRecurringChange(false);
      form.handlers.onRecurrenceRuleChange(null);
    } else {
      form.handlers.onRecurringChange(true);
      form.handlers.onRecurrenceRuleChange(
        value.rule as Parameters<typeof form.handlers.onRecurrenceRuleChange>[0],
      );
    }
    form.markDirty();
  };

  return (
    <>
      {/* Scrollable body */}
      <div className="overflow-y-auto px-4 pb-2 space-y-2">
        {/* Title — smart input (Approach A) */}
        <div className="relative">
          <textarea
            ref={titleRef}
            value={form.values.title}
            onChange={handleTitleChange}
            onKeyDown={handleTitleKeyDown}
            placeholder="What needs to be done? (try #domain !high 30m)"
            className="w-full text-base bg-transparent outline-none caret-primary placeholder:text-muted-foreground py-1.5 resize-none overflow-hidden border-b border-border/40 focus:border-primary transition-colors"
            rows={1}
          />
          <SmartInputAutocomplete
            suggestions={acSuggestions}
            visible={acVisible}
            selectedIndex={acSelectedIndex}
            onSelect={(s) => {
              const cleaned = handleAcSelect(s, form.values.title);
              form.handlers.onTitleChange(cleaned);
              form.markDirty();
            }}
          />
        </div>

        {/* Domain */}
        <div
          className={cn(
            "relative pl-16 rounded-lg transition-all duration-300",
            (flashTarget === "domain" || domainFlash) && "bg-primary/20",
          )}
        >
          <span className="absolute left-0 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            Domain
          </span>
          <div className="-mr-4 pr-4 overflow-x-auto scrollbar-hide touch-pan-x" data-vaul-no-drag>
            <DomainChipRow
              domains={domains}
              selectedId={form.values.domainId}
              onSelect={(id) => {
                form.handlers.onDomainChange(form.values.domainId === id ? null : id);
                form.markDirty();
              }}
            />
          </div>
        </div>

        {/* Parent task (edit mode only) */}
        {form.isEdit && task && parentTasks.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0 w-14">Parent</span>
            <button
              type="button"
              className={cn(
                "flex-1 flex items-center justify-between rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors active:scale-95",
                task.parent_id !== null
                  ? "bg-primary/10 text-primary"
                  : "bg-secondary text-secondary-foreground active:bg-secondary/80",
              )}
              onClick={() => {
                setParentSearch("");
                setParentPickerOpen(true);
              }}
            >
              <span className="flex items-center gap-1.5 truncate min-w-0">
                {task.parent_id !== null ? (
                  (() => {
                    const p = parentTasks.find((t) => t.id === task.parent_id);
                    const d = p?.domain_id ? domains.find((dm) => dm.id === p.domain_id) : null;
                    return (
                      <>
                        {d?.icon && <span className="shrink-0">{d.icon}</span>}
                        <span className="truncate">{p?.title ?? "Unknown"}</span>
                      </>
                    );
                  })()
                ) : (
                  <span>None</span>
                )}
              </span>
              <ChevronRight className="h-3 w-3 opacity-50 shrink-0 ml-1.5" />
            </button>
          </div>
        )}

        {/* Impact */}
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg transition-all duration-300",
            flashTarget === "impact" && "bg-primary/20",
          )}
        >
          <span className="text-xs text-muted-foreground shrink-0 w-14">Impact</span>
          <div className="flex-1">
            <ImpactButtonRow
              value={form.values.impact}
              onChange={(v) => {
                form.handlers.onImpactChange(form.values.impact === v ? 4 : v);
                form.markDirty();
              }}
            />
          </div>
        </div>

        {/* When (Schedule) */}
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg transition-all duration-300",
            flashTarget === "schedule" && "bg-primary/20",
          )}
        >
          <span className="text-xs text-muted-foreground shrink-0 w-14">When</span>
          <div className="flex-1">
            <ScheduleButtonRow
              selectedDate={form.values.scheduledDate || null}
              onSelectDate={(iso) => {
                form.handlers.onScheduledDateChange(form.values.scheduledDate === iso ? "" : iso);
                form.markDirty();
              }}
              onClear={() => {
                form.handlers.onScheduledDateChange("");
                form.handlers.onScheduledTimeChange("");
                form.markDirty();
              }}
              onCalendarOpen={() => setCalendarOpen(true)}
            />
          </div>
        </div>

        {/* Duration */}
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg transition-all duration-300",
            flashTarget === "duration" && "bg-primary/20",
          )}
        >
          <span className="text-xs text-muted-foreground shrink-0 w-14">Duration</span>
          <div className="flex-1">
            <DurationPickerRow
              value={form.values.durationMinutes}
              showCustom
              onChange={(m) => {
                form.handlers.onDurationChange(m);
                form.markDirty();
              }}
            />
          </div>
        </div>

        {/* Time — progressive disclosure: only when date is set */}
        {form.values.scheduledDate && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0 w-14">Time</span>
            <div className="flex-1">
              <TimePickerField
                value={form.values.scheduledTime}
                visible
                onChange={(t) => {
                  form.handlers.onScheduledTimeChange(t);
                  form.markDirty();
                }}
              />
            </div>
          </div>
        )}

        {/* Recurrence */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0 w-14">Repeat</span>
          <div className="flex-1">
            <RecurrencePresetRow value={recurrence} onChange={handleRecurrenceChange} />
          </div>
        </div>

        {/* Clarity */}
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg transition-all duration-300",
            flashTarget === "clarity" && "bg-primary/20",
          )}
        >
          <span className="text-xs text-muted-foreground shrink-0 w-14">Clarity</span>
          <div className="flex-1">
            <ClarityChipRow
              value={form.values.clarity}
              onChange={(v) => {
                form.handlers.onClarityChange(form.values.clarity === v ? "normal" : v);
                form.markDirty();
              }}
            />
          </div>
        </div>

        {/* Notes */}
        <div className="flex items-start gap-2 pt-1 border-t border-border/30">
          <span className="text-xs text-muted-foreground shrink-0 w-14 pt-2">Notes</span>
          <div className="flex-1">
            {!descriptionFocused && form.values.description && hasLinks(form.values.description) ? (
              <button
                type="button"
                data-vaul-no-drag
                onClick={() => {
                  setDescriptionFocused(true);
                  requestAnimationFrame(() => descriptionRef.current?.focus());
                }}
                className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-[13px] text-left whitespace-pre-wrap min-h-[4.5rem] cursor-text hover:border-ring/50 transition-colors"
              >
                <RichText>{form.values.description}</RichText>
              </button>
            ) : (
              <textarea
                ref={descriptionRef}
                value={form.values.description}
                onChange={(e) => {
                  form.handlers.onDescriptionChange(e.target.value);
                  form.markDirty();
                }}
                onPaste={handleDescriptionPaste}
                onFocus={() => setDescriptionFocused(true)}
                onBlur={() => setDescriptionFocused(false)}
                placeholder="Add notes..."
                rows={descriptionFocused || form.values.description ? 3 : 1}
                className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-[13px] outline-none resize-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring transition-all"
                data-vaul-no-drag
              />
            )}
          </div>
        </div>

        {/* Batch complete past instances */}
        {form.isEdit && task?.is_recurring && form.pendingPastCount > 0 && (
          <div className="pt-2 border-t border-border/30">
            <Button
              variant="outline"
              size="sm"
              className="text-xs w-full"
              disabled={form.isBatchCompleting}
              onClick={form.handleBatchComplete}
            >
              {form.isBatchCompleting && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Complete {form.pendingPastCount} past instance(s)
            </Button>
          </div>
        )}
      </div>

      {/* Sticky footer */}
      <div className="border-t bg-background px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] flex items-center gap-2">
        {form.isEdit && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0 h-10 text-[13px]"
            onClick={() => form.setShowDeleteConfirm(true)}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Delete
          </Button>
        )}

        {form.isEdit && task && (
          <Button
            variant="outline"
            size="sm"
            className="text-xs shrink-0 h-10 text-[13px] gap-1"
            onClick={() => form.handleToggleComplete(onDone)}
            disabled={form.isToggling}
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
        )}

        <Button
          className="flex-1 h-10 text-[13px] font-semibold"
          onClick={form.handleSave}
          disabled={form.isSaving || !form.values.title.trim()}
        >
          {form.isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {form.isEdit ? "Save" : "Create Task"}
        </Button>
      </div>

      {/* Nested calendar drawer */}
      <Drawer.NestedRoot open={calendarOpen} onOpenChange={setCalendarOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
          <Drawer.Content
            className={cn(
              "fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl",
              "bg-background border-t border-border",
              "max-w-lg mx-auto",
            )}
          >
            <div className="mx-auto mt-3 mb-2 h-1.5 w-12 rounded-full bg-muted-foreground/20" />
            <Drawer.Title className="sr-only">Pick a date</Drawer.Title>
            <div className="px-2 pb-8">
              <Calendar
                mode="single"
                selected={
                  form.values.scheduledDate
                    ? new Date(`${form.values.scheduledDate}T00:00:00`)
                    : undefined
                }
                onSelect={(date) => {
                  if (date) {
                    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                    form.handlers.onScheduledDateChange(iso);
                    setCalendarOpen(false);
                    form.markDirty();
                  }
                }}
                defaultMonth={
                  form.values.scheduledDate
                    ? new Date(`${form.values.scheduledDate}T00:00:00`)
                    : new Date()
                }
                className="mx-auto"
              />
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.NestedRoot>

      {/* Nested parent picker drawer (edit mode only) */}
      {form.isEdit && task && (
        <ParentPickerDrawer
          open={parentPickerOpen}
          onOpenChange={setParentPickerOpen}
          task={task}
          parentTasks={parentTasks}
          domains={domains}
          search={parentSearch}
          onSearchChange={setParentSearch}
          onParentChanged={(parentDomainId) => {
            if (parentDomainId !== null && parentDomainId !== form.values.domainId) {
              form.handlers.onDomainChange(parentDomainId);
              setDomainFlash(true);
              setTimeout(() => setDomainFlash(false), 800);
              form.markDirty();
            }
          }}
        />
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={form.showDeleteConfirm} onOpenChange={form.setShowDeleteConfirm}>
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
            <Button variant="outline" onClick={() => form.setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={form.handleDelete} disabled={form.isDeleting}>
              {form.isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  ParentPickerDrawer — nested drawer for parent task selection       */
/* ------------------------------------------------------------------ */

function ParentPickerDrawer({
  open,
  onOpenChange,
  task,
  parentTasks,
  domains,
  search,
  onSearchChange,
  onParentChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: TaskResponse;
  parentTasks: TaskResponse[];
  domains: DomainResponse[];
  search: string;
  onSearchChange: (s: string) => void;
  onParentChanged: (parentDomainId: number | null) => void;
}) {
  const queryClient = useQueryClient();
  const updateTask = useUpdateTaskApiV1TasksTaskIdPut();

  const [currentParentId, setCurrentParentId] = useState<number | null>(task.parent_id);
  useEffect(() => {
    setCurrentParentId(task.parent_id);
  }, [task.parent_id]);

  const taskGroups = useMemo(
    () => groupParentTasks(parentTasks, task.domain_id, search, task.id),
    [parentTasks, task.id, task.domain_id, search],
  );

  const totalFiltered = taskGroups.reduce((n, g) => n + g.tasks.length, 0);
  const showLabels = !search && taskGroups.length > 1;

  const handleSelect = (newParentId: number | null) => {
    if (newParentId === currentParentId) {
      onOpenChange(false);
      onSearchChange("");
      return;
    }

    const prevParentId = currentParentId;
    const previousTasks = queryClient.getQueryData<TaskResponse[]>(dashboardTasksKey());

    setCurrentParentId(newParentId);
    onOpenChange(false);
    onSearchChange("");

    // Notify parent for domain auto-sync
    if (newParentId !== null) {
      const parent = parentTasks.find((t) => t.id === newParentId);
      onParentChanged(parent?.domain_id ?? null);
    } else {
      onParentChanged(null);
    }

    // Optimistic cache update
    if (newParentId !== null) {
      const newSubtask: SubtaskResponse = {
        id: task.id,
        title: task.title,
        description: task.description ?? null,
        duration_minutes: task.duration_minutes ?? null,
        impact: task.impact,
        clarity: task.clarity ?? null,
        scheduled_date: task.scheduled_date ?? null,
        scheduled_time: task.scheduled_time ?? null,
        status: task.status ?? "pending",
        position: 9999,
      };

      queryClient.setQueryData<TaskResponse[]>(dashboardTasksKey(), (old) => {
        if (!old) return old;
        return old
          .filter((t) => t.id !== task.id)
          .map((t) => {
            if (prevParentId && t.id === prevParentId) {
              return { ...t, subtasks: t.subtasks?.filter((st) => st.id !== task.id) };
            }
            if (t.id === newParentId) {
              return { ...t, subtasks: [...(t.subtasks ?? []), newSubtask] };
            }
            return t;
          });
      });
      useUIStore.getState().expandSubtask(newParentId);
    } else {
      const promoted: TaskResponse = { ...task, parent_id: null, subtasks: [] };
      queryClient.setQueryData<TaskResponse[]>(dashboardTasksKey(), (old) => {
        if (!old) return old;
        return [
          ...old.map((t) =>
            t.id === prevParentId
              ? { ...t, subtasks: t.subtasks?.filter((st) => st.id !== task.id) }
              : t,
          ),
          promoted,
        ];
      });
    }

    const parentTitle =
      newParentId !== null ? parentTasks.find((t) => t.id === newParentId)?.title : null;

    updateTask.mutate(
      { taskId: task.id, data: { parent_id: newParentId } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: dashboardTasksKey() });
          const msg =
            newParentId !== null
              ? `Made "${task.title}" a subtask of "${parentTitle}"`
              : `Promoted "${task.title}" to top-level`;
          announce(newParentId !== null ? "Task nested as subtask" : "Task promoted to top-level");
          toast.success(msg, {
            id: `reparent-${task.id}`,
            action: {
              label: "Undo",
              onClick: () => {
                setCurrentParentId(prevParentId);
                queryClient.setQueryData(dashboardTasksKey(), previousTasks);
                updateTask.mutate(
                  { taskId: task.id, data: { parent_id: prevParentId } },
                  {
                    onSuccess: () =>
                      queryClient.invalidateQueries({ queryKey: dashboardTasksKey() }),
                    onError: () => {
                      queryClient.invalidateQueries({ queryKey: dashboardTasksKey() });
                      toast.error("Undo failed");
                    },
                  },
                );
              },
            },
          });
        },
        onError: () => {
          setCurrentParentId(prevParentId);
          queryClient.setQueryData(dashboardTasksKey(), previousTasks);
          toast.error("Failed to change parent task", { id: `reparent-err-${task.id}` });
        },
      },
    );
  };

  return (
    <Drawer.NestedRoot open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Drawer.Content
          className={cn(
            "fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl",
            "bg-background border-t border-border",
            "max-w-lg mx-auto max-h-[70vh] flex flex-col",
          )}
        >
          <div className="mx-auto mt-3 mb-2 h-1.5 w-12 rounded-full bg-muted-foreground/20" />
          <Drawer.Title className="px-4 text-sm font-semibold mb-2">
            Select parent task
          </Drawer.Title>

          {/* Search */}
          <div className="flex items-center gap-2 px-4 pb-2">
            <div className="flex-1 flex items-center gap-2 rounded-lg bg-secondary px-3 py-2">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search tasks..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => onSearchChange("")}
                  className="p-1 text-muted-foreground active:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Task list */}
          <div className="overflow-y-auto px-2 pb-8 space-y-0.5">
            <button
              type="button"
              className={cn(
                "w-full px-3 py-2.5 text-left text-sm rounded-lg transition-colors",
                currentParentId === null && "bg-accent font-medium",
              )}
              onClick={() => handleSelect(null)}
            >
              None (top-level)
            </button>

            {totalFiltered > 0 && <div className="h-px bg-border mx-2 my-1" />}

            {taskGroups.map((group, gi) => (
              <div key={group.label}>
                {gi > 0 && <div className="h-px bg-border mx-2 my-1" />}
                {showLabels && (
                  <div className="px-3 pt-2 pb-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    {group.label}
                  </div>
                )}
                {group.tasks.map((t) => {
                  const domain = t.domain_id ? domains.find((d) => d.id === t.domain_id) : null;
                  const subtaskCount = t.subtasks?.length ?? 0;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={cn(
                        "w-full px-3 py-2.5 text-left text-sm rounded-lg flex items-center gap-2 transition-colors",
                        currentParentId === t.id && "bg-accent font-medium",
                      )}
                      onClick={() => handleSelect(t.id)}
                    >
                      {domain?.icon && <span className="shrink-0">{domain.icon}</span>}
                      <span className="truncate">{t.title}</span>
                      {subtaskCount > 0 && (
                        <span className="shrink-0 text-[10px] text-muted-foreground ml-auto">
                          ·{subtaskCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}

            {totalFiltered === 0 && search && (
              <div className="px-3 py-2 text-sm text-muted-foreground">No matching tasks</div>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.NestedRoot>
  );
}
