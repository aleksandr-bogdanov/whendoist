/**
 * TaskEditor — Sheet (slide-over) for creating and editing tasks.
 *
 * All form state + save/delete/complete logic lives in useTaskForm.
 * This component handles: Sheet UI, smart input (Approach A), and
 * field rendering with EditorFieldRow layout.
 */

import { CheckCircle, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DomainResponse, TaskResponse } from "@/api/model";
import { useListTasksApiV1TasksGet } from "@/api/queries/tasks/tasks";
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
import { useSmartInputConsumer } from "@/hooks/use-smart-input-consumer";
import { useTaskForm } from "@/hooks/use-task-form";
import { DASHBOARD_TASKS_PARAMS } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { ParentTaskPicker } from "./parent-task-picker";
import { ParentTaskSelect } from "./parent-task-select";
import { RecurrencePicker } from "./recurrence-picker";

interface TaskEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: TaskResponse | null;
  domains: DomainResponse[];
  parentTasks?: TaskResponse[];
}

export function TaskEditor({ open, onOpenChange, task, domains, parentTasks }: TaskEditorProps) {
  const { t } = useTranslation();
  const form = useTaskForm({ task: task ?? null, onDone: () => onOpenChange(false) });

  const [calendarOpen, setCalendarOpen] = useState(false);
  const [descriptionFocused, setDescriptionFocused] = useState(false);
  const [domainFlash, setDomainFlash] = useState(false);

  // Smart input consumer (Approach A) — tokens in title are detected and consumed
  const smartCallbacks = useMemo(
    () => ({
      onDomain: (id: number) => {
        form.handlers.onDomainChange(id);
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
      onParent: (id: number) => {
        form.handlers.onParentChange(id);
        // Auto-sync domain to parent's domain
        const parent = parentTasks?.find((t) => t.id === id);
        if (parent?.domain_id != null && parent.domain_id !== form.values.domainId) {
          form.handlers.onDomainChange(parent.domain_id);
          setDomainFlash(true);
          setTimeout(() => setDomainFlash(false), 650);
        }
        form.markDirty();
      },
    }),
    [form.handlers, form.markDirty, form.values.domainId, parentTasks],
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
  } = useSmartInputConsumer(
    domains,
    smartCallbacks,
    task?.title,
    parentTasks,
    form.values.domainId,
  );

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

  const handleClose = () => {
    if (form.dirty) {
      if (!window.confirm(t("task.unsavedChanges"))) return;
    }
    onOpenChange(false);
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const cleaned = processTitle(e.target.value);
    form.handlers.onTitleChange(cleaned);
    form.markDirty();
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (handleSmartKeyDown(e)) {
      // Autocomplete consumed the event — if it was Enter/Tab, apply the selection
      if ((e.key === "Enter" || e.key === "Tab") && acSuggestions[acSelectedIndex]) {
        const cleaned = handleAcSelect(acSuggestions[acSelectedIndex], form.values.title);
        form.handlers.onTitleChange(cleaned);
        form.markDirty();
      }
      return;
    }
    // Don't submit on Enter in editor — allow multiline
  };

  return (
    <>
      <Sheet open={open} onOpenChange={handleClose}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto" showCloseButton>
          <SheetHeader>
            <SheetTitle>{form.isEdit ? t("task.editTask") : t("task.newTask")}</SheetTitle>
            <SheetDescription>
              {form.isEdit ? t("task.updateDetails") : t("task.createDetails")}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 px-4 pb-4">
            {/* Title — smart input (Approach A: tokens consumed) */}
            <div className="space-y-1.5">
              <Label htmlFor="task-title" className="text-xs font-medium">
                {t("task.field.title")}
              </Label>
              <div className="relative">
                <textarea
                  ref={titleRef}
                  id="task-title"
                  value={form.values.title}
                  onChange={handleTitleChange}
                  onKeyDown={handleTitleKeyDown}
                  placeholder={t("task.field.titlePlaceholder")}
                  className="w-full text-sm bg-transparent outline-none caret-primary placeholder:text-muted-foreground py-2 px-3 resize-none overflow-hidden rounded-md border border-input focus:ring-1 focus:ring-ring transition-colors"
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
            </div>

            {/* Domain */}
            <EditorFieldRow
              label={t("task.field.domain")}
              flash={flashTarget === "domain" || domainFlash}
            >
              <DomainChipRow
                domains={domains}
                selectedId={form.values.domainId}
                onSelect={(id) => {
                  form.handlers.onDomainChange(form.values.domainId === id ? null : id);
                  form.markDirty();
                }}
              />
            </EditorFieldRow>

            {/* Parent task — edit mode: immediate apply; create mode: form state */}
            {parentTasks && parentTasks.length > 0 && (
              <EditorFieldRow label={t("task.field.parent")} flash={flashTarget === "parent"}>
                {form.isEdit && task ? (
                  <ParentTaskPicker
                    task={task}
                    parentTasks={parentTasks}
                    domains={domains}
                    onParentChanged={(parentDomainId) => {
                      // Auto-sync domain to match parent's domain
                      if (parentDomainId !== null && parentDomainId !== form.values.domainId) {
                        form.handlers.onDomainChange(parentDomainId);
                        setDomainFlash(true);
                        setTimeout(() => setDomainFlash(false), 650);
                        form.markDirty();
                      }
                    }}
                  />
                ) : (
                  <ParentTaskSelect
                    selectedId={form.values.parentId}
                    parentTasks={parentTasks}
                    domains={domains}
                    onChange={(parentId) => {
                      form.handlers.onParentChange(parentId);
                      // Auto-sync domain to parent's domain
                      if (parentId !== null) {
                        const parent = parentTasks?.find((t) => t.id === parentId);
                        if (
                          parent?.domain_id != null &&
                          parent.domain_id !== form.values.domainId
                        ) {
                          form.handlers.onDomainChange(parent.domain_id);
                          setDomainFlash(true);
                          setTimeout(() => setDomainFlash(false), 650);
                        }
                      }
                      form.markDirty();
                    }}
                  />
                )}
              </EditorFieldRow>
            )}

            {/* Impact */}
            <EditorFieldRow label={t("task.field.impact")} flash={flashTarget === "impact"}>
              <ImpactButtonRow
                value={form.values.impact}
                onChange={(v) => {
                  form.handlers.onImpactChange(form.values.impact === v ? 4 : v);
                  form.markDirty();
                }}
              />
            </EditorFieldRow>

            {/* Clarity */}
            <EditorFieldRow label={t("task.field.clarity")} flash={flashTarget === "clarity"}>
              <ClarityChipRow
                value={form.values.clarity}
                onChange={(v) => {
                  form.handlers.onClarityChange(form.values.clarity === v ? "normal" : v);
                  form.markDirty();
                }}
              />
            </EditorFieldRow>

            {/* Duration */}
            <EditorFieldRow label={t("task.field.duration")} flash={flashTarget === "duration"}>
              <DurationPickerRow
                value={form.values.durationMinutes}
                showCustom
                onChange={(m) => {
                  form.handlers.onDurationChange(m);
                  form.markDirty();
                }}
              />
            </EditorFieldRow>

            {/* Schedule */}
            <EditorFieldRow label={t("task.field.when")} flash={flashTarget === "schedule"}>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <div>
                    <ScheduleButtonRow
                      selectedDate={form.values.scheduledDate || null}
                      onSelectDate={(iso) => {
                        form.handlers.onScheduledDateChange(
                          form.values.scheduledDate === iso ? "" : iso,
                        );
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
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start" sideOffset={8}>
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
                </PopoverContent>
              </Popover>
            </EditorFieldRow>

            {/* Time — progressive disclosure: only when date is set */}
            <EditorFieldRow label={t("task.field.time")}>
              <TimePickerField
                value={form.values.scheduledTime}
                visible={!!form.values.scheduledDate}
                onChange={(t) => {
                  form.handlers.onScheduledTimeChange(t);
                  form.markDirty();
                }}
              />
            </EditorFieldRow>

            {/* Recurrence */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-medium">{t("task.field.repeat")}</Label>
                <Button
                  type="button"
                  variant={form.values.isRecurring ? "default" : "outline"}
                  size="sm"
                  className="h-6 text-[10px] px-2"
                  onClick={() => {
                    const next = !form.values.isRecurring;
                    form.handlers.onRecurringChange(next);
                    if (!next) {
                      form.handlers.onRecurrenceRuleChange(null);
                      form.handlers.onRecurrenceStartChange(null);
                      form.handlers.onRecurrenceEndChange(null);
                    } else if (!form.values.recurrenceRule) {
                      form.handlers.onRecurrenceRuleChange({ freq: "daily", interval: 1 });
                    }
                    form.markDirty();
                  }}
                >
                  {form.values.isRecurring ? t("task.field.on") : t("task.field.off")}
                </Button>
              </div>
              {form.values.isRecurring && (
                <RecurrencePicker
                  rule={form.values.recurrenceRule}
                  recurrenceStart={form.values.recurrenceStart}
                  recurrenceEnd={form.values.recurrenceEnd}
                  onChange={(rule, start, end) => {
                    form.handlers.onRecurrenceRuleChange(rule);
                    form.handlers.onRecurrenceStartChange(start);
                    form.handlers.onRecurrenceEndChange(end);
                    if (!rule) form.handlers.onRecurringChange(false);
                    form.markDirty();
                  }}
                />
              )}
            </div>

            {/* Notes / Description */}
            <EditorFieldRow label={t("task.field.notes")} flash={flashTarget === "description"}>
              <textarea
                value={form.values.description}
                onChange={(e) => {
                  form.handlers.onDescriptionChange(e.target.value);
                  form.markDirty();
                }}
                onFocus={() => setDescriptionFocused(true)}
                onBlur={() => setDescriptionFocused(false)}
                placeholder={t("task.field.notesPlaceholder")}
                rows={descriptionFocused || form.values.description ? 3 : 1}
                className="w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-[13px] outline-none resize-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring transition-all"
              />
            </EditorFieldRow>

            {/* Batch complete past instances */}
            {form.isEdit && task?.is_recurring && form.pendingPastCount > 0 && (
              <div className="pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs w-full"
                  disabled={form.isBatchCompleting}
                  onClick={form.handleBatchComplete}
                >
                  {form.isBatchCompleting && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                  {t("task.completePastInstances", { count: form.pendingPastCount })}
                </Button>
              </div>
            )}

            {/* Editor actions: complete / reopen */}
            {form.isEdit && task && (
              <div className="flex gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1"
                  onClick={() => form.handleToggleComplete(() => onOpenChange(false))}
                  disabled={form.isToggling}
                >
                  {task.status === "completed" || task.completed_at ? (
                    <>
                      <RotateCcw className="h-3.5 w-3.5" />
                      {t("task.action.reopen")}
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-3.5 w-3.5" />
                      {t("task.action.complete")}
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Metadata timestamps */}
            {form.isEdit && task && (
              <div className="text-[11px] text-muted-foreground pt-2 border-t">
                {task.created_at && (
                  <span>
                    {t("task.createdDate", {
                      date: new Date(task.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      }),
                    })}
                  </span>
                )}
                {task.completed_at && (
                  <span>
                    {" · "}
                    {t("task.completedDate", {
                      date: new Date(task.completed_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      }),
                    })}
                  </span>
                )}
              </div>
            )}

            {/* Save / Delete */}
            <div className="flex gap-2 pt-2 border-t">
              <Button
                onClick={form.handleSave}
                disabled={form.isSaving || !form.values.title.trim()}
                className="flex-1"
              >
                {form.isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {form.isEdit ? t("task.action.save") : t("task.action.createTask")}
              </Button>
              {form.isEdit && (
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={() => form.setShowDeleteConfirm(true)}
                  title={t("task.action.deleteTooltip")}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <Dialog open={form.showDeleteConfirm} onOpenChange={form.setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("task.deleteDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("task.deleteDialog.message", { title: task?.title })}
              {(task?.subtasks?.length ?? 0) > 0 &&
                ` ${t("task.deleteDialog.subtaskWarning", { count: task!.subtasks!.length })}`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => form.setShowDeleteConfirm(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={form.handleDelete} disabled={form.isDeleting}>
              {form.isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("common.delete")}
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
      <div className={cn("rounded-lg", flash && "animate-field-flash")}>{children}</div>
    </div>
  );
}
