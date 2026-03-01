/**
 * TaskInspector — desktop right-pane for thought → task triage.
 *
 * This is a thin layout shell. All form logic lives in useTriageForm.
 */

import { ArrowRight, ChevronRight, MousePointerClick, Search, Trash2, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { DomainResponse, TaskResponse } from "@/api/model";
import {
  ClarityChipRow,
  DomainChipRow,
  DurationPickerRow,
  ImpactButtonRow,
  RecurrencePresetRow,
  ScheduleButtonRow,
  TimePickerField,
} from "@/components/task/field-pickers";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RichText } from "@/components/ui/rich-text";
import { usePasteUrl } from "@/hooks/use-paste-url";
import type { ConvertData } from "@/hooks/use-triage-form";
import { useTriageForm } from "@/hooks/use-triage-form";
import { hasLinks } from "@/lib/rich-text-parser";
import { groupParentTasks } from "@/lib/task-utils";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  TaskInspector — desktop right-pane for triage                      */
/* ------------------------------------------------------------------ */

interface TaskInspectorProps {
  thought: TaskResponse | null;
  domains: DomainResponse[];
  parentTasks: TaskResponse[];
  onConvert: (thought: TaskResponse, data: ConvertData) => void;
  onDelete: (thought: TaskResponse) => void;
}

export function TaskInspector({
  thought,
  domains,
  parentTasks,
  onConvert,
  onDelete,
}: TaskInspectorProps) {
  if (!thought) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <MousePointerClick className="h-8 w-8 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">Select a thought to triage</p>
          <p className="text-xs text-muted-foreground/60">
            <kbd className="px-1 py-0.5 rounded border border-border text-[10px]">j</kbd>{" "}
            <kbd className="px-1 py-0.5 rounded border border-border text-[10px]">k</kbd> to
            navigate
          </p>
        </div>
      </div>
    );
  }

  return (
    <InspectorBody
      key={thought.id}
      thought={thought}
      domains={domains}
      parentTasks={parentTasks}
      onConvert={onConvert}
      onDelete={onDelete}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  InspectorBody — thin layout shell powered by useTriageForm         */
/* ------------------------------------------------------------------ */

function InspectorBody({
  thought,
  domains,
  parentTasks,
  onConvert,
  onDelete,
}: {
  thought: TaskResponse;
  domains: DomainResponse[];
  parentTasks: TaskResponse[];
  onConvert: (thought: TaskResponse, data: ConvertData) => void;
  onDelete: (thought: TaskResponse) => void;
}) {
  const form = useTriageForm({ thought, domains, parentTasks, onConvert });
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  const { onPaste: handleDescriptionPaste } = usePasteUrl({
    getValue: () => form.description,
    setValue: form.setDescription,
    textareaRef: descriptionRef,
  });

  return (
    <div className="flex flex-col h-full">
      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        {/* Title */}
        <textarea
          ref={form.inputRef}
          value={form.displayTitle}
          onChange={form.handleTitleEdit}
          onKeyDown={form.handleKeyDown}
          placeholder="What's the task?"
          className="w-full text-base font-medium bg-transparent outline-none caret-primary placeholder:text-muted-foreground py-1.5 resize-none overflow-hidden border-b border-border/40 focus:border-primary transition-colors"
          rows={1}
        />

        {/* Domain */}
        <FieldRow label="Domain">
          <div
            className={cn(
              "rounded-lg transition-all duration-300",
              form.domainFlash && "bg-primary/20",
            )}
          >
            <DomainChipRow
              domains={domains}
              selectedId={form.parsed.domainId}
              onSelect={form.handleDomainSelect}
            />
          </div>
        </FieldRow>

        {/* Parent */}
        {parentTasks.length > 0 && (
          <FieldRow label="Parent">
            <ParentPickerPopover
              parentTasks={parentTasks}
              domains={domains}
              selectedId={form.parentId}
              currentDomainId={form.parsed.domainId}
              onSelect={(id) => {
                form.handleParentSelect(id);
              }}
            />
          </FieldRow>
        )}

        {/* Impact */}
        <FieldRow label="Impact">
          <ImpactButtonRow value={form.parsed.impact} onChange={form.handleImpactChange} />
        </FieldRow>

        {/* When */}
        <FieldRow label="When">
          <Popover open={form.calendarOpen} onOpenChange={form.setCalendarOpen}>
            <PopoverTrigger asChild>
              <div>
                <ScheduleButtonRow
                  selectedDate={form.parsed.scheduledDate}
                  onSelectDate={form.handleDateSelect}
                  onClear={() => form.clearTokenType("date")}
                  onCalendarOpen={() => form.setCalendarOpen(true)}
                />
              </div>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start" sideOffset={8}>
              <Calendar
                mode="single"
                selected={
                  form.parsed.scheduledDate
                    ? new Date(`${form.parsed.scheduledDate}T00:00:00`)
                    : undefined
                }
                onSelect={(date) => {
                  if (date) {
                    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                    form.handleDateSelect(iso);
                    form.setCalendarOpen(false);
                  }
                }}
                defaultMonth={
                  form.parsed.scheduledDate
                    ? new Date(`${form.parsed.scheduledDate}T00:00:00`)
                    : new Date()
                }
                className="mx-auto"
              />
            </PopoverContent>
          </Popover>
        </FieldRow>

        {/* Duration */}
        <FieldRow label="Duration">
          <DurationPickerRow
            value={form.parsed.durationMinutes}
            showCustom
            onChange={form.handleDurationChange}
          />
        </FieldRow>

        {/* Time */}
        <FieldRow label="Time">
          <TimePickerField
            value={form.parsed.scheduledTime ?? ""}
            visible={!!form.parsed.scheduledDate}
            onChange={form.handleTimeChange}
          />
        </FieldRow>

        {/* Recurrence */}
        <FieldRow label="Repeat">
          <RecurrencePresetRow value={form.recurrence} onChange={form.setRecurrence} />
        </FieldRow>

        {/* Clarity */}
        <FieldRow label="Clarity">
          <ClarityChipRow value={form.parsed.clarity} onChange={form.handleClarityChange} />
        </FieldRow>

        {/* Notes */}
        <FieldRow label="Notes">
          {!form.descriptionFocused && form.description && hasLinks(form.description) ? (
            <button
              type="button"
              onClick={() => {
                form.setDescriptionFocused(true);
                requestAnimationFrame(() => descriptionRef.current?.focus());
              }}
              className="w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-[13px] text-left whitespace-pre-wrap min-h-[4.5rem] cursor-text hover:border-ring/50 transition-colors"
            >
              <RichText>{form.description}</RichText>
            </button>
          ) : (
            <textarea
              ref={descriptionRef}
              value={form.description}
              onChange={(e) => form.setDescription(e.target.value)}
              onPaste={handleDescriptionPaste}
              onFocus={() => form.setDescriptionFocused(true)}
              onBlur={() => form.setDescriptionFocused(false)}
              placeholder="Add notes..."
              rows={form.descriptionFocused || form.description ? 3 : 1}
              className="w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-[13px] outline-none resize-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring transition-all"
            />
          )}
        </FieldRow>
      </div>

      {/* Footer */}
      <div className="border-t bg-background px-5 py-3 flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0 h-9 text-[13px]"
          onClick={() => onDelete(thought)}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1" />
          Delete
        </Button>

        <Button
          className="flex-1 h-9 text-[13px] font-semibold transition-colors duration-200"
          disabled={!form.canConvert}
          onClick={form.handleSubmit}
        >
          {form.parsed.domainId === null ? (
            <>
              Pick a domain
              <ChevronRight className="h-3.5 w-3.5 ml-1 -rotate-90" />
            </>
          ) : (
            <>
              Convert to Task
              <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FieldRow — label + content layout helper                           */
/* ------------------------------------------------------------------ */

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-xs text-muted-foreground shrink-0 w-16 pt-2 md:pt-1">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ParentPickerPopover — desktop parent task picker in a popover      */
/* ------------------------------------------------------------------ */

function ParentPickerPopover({
  parentTasks,
  domains,
  selectedId,
  currentDomainId,
  onSelect,
}: {
  parentTasks: TaskResponse[];
  domains: DomainResponse[];
  selectedId: number | null;
  currentDomainId: number | null;
  onSelect: (id: number | null) => void;
}) {
  const [search, setSearch] = useState("");

  const selectedParent = useMemo(
    () => parentTasks.find((t) => t.id === selectedId) ?? null,
    [parentTasks, selectedId],
  );
  const selectedDomain = useMemo(
    () =>
      selectedParent?.domain_id ? domains.find((d) => d.id === selectedParent.domain_id) : null,
    [selectedParent, domains],
  );

  const taskGroups = useMemo(
    () => groupParentTasks(parentTasks, currentDomainId, search),
    [parentTasks, currentDomainId, search],
  );

  const totalFiltered = taskGroups.reduce((n, g) => n + g.tasks.length, 0);
  const showLabels = !search && taskGroups.length > 1;

  return (
    <Popover onOpenChange={() => setSearch("")}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center justify-between w-full rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
            "md:rounded-md md:px-2 md:py-1",
            selectedParent
              ? "bg-primary/10 text-primary"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
          )}
        >
          <span className="flex items-center gap-1.5 truncate min-w-0">
            {selectedParent ? (
              <>
                {selectedDomain?.icon && <span className="shrink-0">{selectedDomain.icon}</span>}
                <span className="truncate">{selectedParent.title}</span>
              </>
            ) : (
              <span>None</span>
            )}
          </span>
          <ChevronRight className="h-3 w-3 opacity-50 shrink-0 ml-1.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start" sideOffset={8}>
        <div className="p-2 border-b">
          <div className="flex items-center gap-2 rounded-md bg-secondary px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        <div className="max-h-56 overflow-y-auto py-1">
          <button
            type="button"
            className={cn(
              "w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors",
              selectedId === null && "bg-accent font-medium",
            )}
            onClick={() => onSelect(null)}
          >
            None (top-level)
          </button>

          {totalFiltered > 0 && <div className="h-px bg-border mx-2 my-1" />}

          {taskGroups.map((group, gi) => (
            <div key={group.label}>
              {gi > 0 && <div className="h-px bg-border mx-2 my-1" />}
              {showLabels && (
                <div className="px-3 pt-1.5 pb-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
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
                      "w-full px-3 py-1.5 text-left text-sm hover:bg-accent transition-colors flex items-center gap-1.5",
                      selectedId === t.id && "bg-accent font-medium",
                    )}
                    onClick={() => onSelect(t.id)}
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
      </PopoverContent>
    </Popover>
  );
}
