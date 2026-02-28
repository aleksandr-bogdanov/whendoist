/**
 * TaskFieldsBody — shared field layout for task editing across surfaces.
 *
 * Used by:
 * - TaskEditor (Sheet) — "edit" and "create" modes
 * - TaskDetailPanel (dashboard right pane) — "edit" mode, inline
 *
 * This component renders all task fields with shared components:
 * DomainChipRow, ImpactButtonRow, ClarityChipRow, DurationPickerRow,
 * ScheduleButtonRow, TimePickerField, RecurrencePicker, and Notes textarea.
 *
 * The title field uses Approach A (token consumer): tokens typed in the title
 * are detected, consumed (stripped), and pushed into the corresponding field
 * setters. The title stays clean.
 */

import { useCallback, useEffect, useState } from "react";
import type { DomainResponse, TaskResponse } from "@/api/model";
import {
  ClarityChipRow,
  DomainChipRow,
  DurationPickerRow,
  ImpactButtonRow,
  ScheduleButtonRow,
  TimePickerField,
} from "@/components/task/field-pickers";
import { SmartInputAutocomplete } from "@/components/task/smart-input-autocomplete";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSmartInputConsumer } from "@/hooks/use-smart-input-consumer";
import { cn } from "@/lib/utils";
import { ParentTaskPicker } from "./parent-task-picker";
import { RecurrencePicker, type RecurrenceRule } from "./recurrence-picker";

export interface TaskFieldValues {
  title: string;
  description: string;
  domainId: number | null;
  impact: number;
  clarity: string;
  durationMinutes: number | null;
  scheduledDate: string;
  scheduledTime: string;
  isRecurring: boolean;
  recurrenceRule: RecurrenceRule | null;
  recurrenceStart: string | null;
  recurrenceEnd: string | null;
}

export interface TaskFieldHandlers {
  onTitleChange: (title: string) => void;
  onDescriptionChange: (description: string) => void;
  onDomainChange: (domainId: number | null) => void;
  onImpactChange: (impact: number) => void;
  onClarityChange: (clarity: string) => void;
  onDurationChange: (minutes: number | null) => void;
  onScheduledDateChange: (date: string) => void;
  onScheduledTimeChange: (time: string) => void;
  onRecurringChange: (isRecurring: boolean) => void;
  onRecurrenceRuleChange: (rule: RecurrenceRule | null) => void;
  onRecurrenceStartChange: (start: string | null) => void;
  onRecurrenceEndChange: (end: string | null) => void;
}

interface TaskFieldsBodyProps {
  values: TaskFieldValues;
  handlers: TaskFieldHandlers;
  domains: DomainResponse[];
  /** Task being edited (for parent picker). Null = create mode. */
  task?: TaskResponse | null;
  parentTasks?: TaskResponse[];
  /** Called when any field changes — for dirty tracking. */
  onDirty?: () => void;
}

export function TaskFieldsBody({
  values,
  handlers,
  domains,
  task,
  parentTasks,
  onDirty,
}: TaskFieldsBodyProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [descriptionFocused, setDescriptionFocused] = useState(false);
  const [domainFlash, setDomainFlash] = useState(false);

  const markDirty = useCallback(() => onDirty?.(), [onDirty]);

  // Smart input consumer (Approach A)
  const smartCallbacks = {
    onDomain: (id: number) => {
      handlers.onDomainChange(id);
      markDirty();
    },
    onImpact: (v: number) => {
      handlers.onImpactChange(v);
      markDirty();
    },
    onClarity: (v: string) => {
      handlers.onClarityChange(v);
      markDirty();
    },
    onDuration: (m: number) => {
      handlers.onDurationChange(m);
      markDirty();
    },
    onScheduledDate: (d: string) => {
      handlers.onScheduledDateChange(d);
      markDirty();
    },
    onScheduledTime: (t: string) => {
      handlers.onScheduledTimeChange(t);
      markDirty();
    },
    onDescription: (d: string) => {
      handlers.onDescriptionChange(d);
      markDirty();
    },
  };

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
  // biome-ignore lint/correctness/useExhaustiveDependencies: title change triggers resize
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.style.height = "0";
      el.style.height = `${el.scrollHeight}px`;
    });
  }, [values.title, titleRef]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const cleaned = processTitle(e.target.value);
    handlers.onTitleChange(cleaned);
    markDirty();
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (handleSmartKeyDown(e)) {
      if ((e.key === "Enter" || e.key === "Tab") && acSuggestions[acSelectedIndex]) {
        const cleaned = handleAcSelect(acSuggestions[acSelectedIndex], values.title);
        handlers.onTitleChange(cleaned);
        markDirty();
      }
      return;
    }
  };

  return (
    <div className="space-y-4">
      {/* Title — smart input (Approach A) */}
      <div className="space-y-1.5">
        <Label htmlFor="task-title" className="text-xs font-medium">
          Title
        </Label>
        <div className="relative">
          <textarea
            ref={titleRef}
            id="task-title"
            value={values.title}
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
              const cleaned = handleAcSelect(s, values.title);
              handlers.onTitleChange(cleaned);
              markDirty();
            }}
          />
        </div>
      </div>

      {/* Domain */}
      <FieldRow label="Domain" flash={flashTarget === "domain" || domainFlash}>
        <DomainChipRow
          domains={domains}
          selectedId={values.domainId}
          onSelect={(id) => {
            handlers.onDomainChange(values.domainId === id ? null : id);
            markDirty();
          }}
        />
      </FieldRow>

      {/* Parent task (edit mode only) */}
      {task && parentTasks && parentTasks.length > 0 && (
        <FieldRow label="Parent">
          <ParentTaskPicker
            task={task}
            parentTasks={parentTasks}
            domains={domains}
            onParentChanged={(parentDomainId) => {
              if (parentDomainId !== null && parentDomainId !== values.domainId) {
                handlers.onDomainChange(parentDomainId);
                setDomainFlash(true);
                setTimeout(() => setDomainFlash(false), 800);
                markDirty();
              }
            }}
          />
        </FieldRow>
      )}

      {/* Impact */}
      <FieldRow label="Impact" flash={flashTarget === "impact"}>
        <ImpactButtonRow
          value={values.impact}
          onChange={(v) => {
            handlers.onImpactChange(values.impact === v ? 4 : v);
            markDirty();
          }}
        />
      </FieldRow>

      {/* Clarity */}
      <FieldRow label="Clarity" flash={flashTarget === "clarity"}>
        <ClarityChipRow
          value={values.clarity}
          onChange={(v) => {
            handlers.onClarityChange(values.clarity === v ? "normal" : v);
            markDirty();
          }}
        />
      </FieldRow>

      {/* Duration */}
      <FieldRow label="Duration" flash={flashTarget === "duration"}>
        <DurationPickerRow
          value={values.durationMinutes}
          showCustom
          onChange={(m) => {
            handlers.onDurationChange(m);
            markDirty();
          }}
        />
      </FieldRow>

      {/* Schedule */}
      <FieldRow label="When" flash={flashTarget === "schedule"}>
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <div>
              <ScheduleButtonRow
                selectedDate={values.scheduledDate || null}
                onSelectDate={(iso) => {
                  handlers.onScheduledDateChange(values.scheduledDate === iso ? "" : iso);
                  markDirty();
                }}
                onClear={() => {
                  handlers.onScheduledDateChange("");
                  handlers.onScheduledTimeChange("");
                  markDirty();
                }}
                onCalendarOpen={() => setCalendarOpen(true)}
              />
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start" sideOffset={8}>
            <Calendar
              mode="single"
              selected={
                values.scheduledDate ? new Date(`${values.scheduledDate}T00:00:00`) : undefined
              }
              onSelect={(date) => {
                if (date) {
                  const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                  handlers.onScheduledDateChange(iso);
                  setCalendarOpen(false);
                  markDirty();
                }
              }}
              defaultMonth={
                values.scheduledDate ? new Date(`${values.scheduledDate}T00:00:00`) : new Date()
              }
              className="mx-auto"
            />
          </PopoverContent>
        </Popover>
      </FieldRow>

      {/* Time — progressive disclosure */}
      <FieldRow label="Time">
        <TimePickerField
          value={values.scheduledTime}
          visible={!!values.scheduledDate}
          onChange={(t) => {
            handlers.onScheduledTimeChange(t);
            markDirty();
          }}
        />
      </FieldRow>

      {/* Recurrence */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Label className="text-xs font-medium">Repeat</Label>
          <button
            type="button"
            className={cn(
              "h-6 text-[10px] px-2 rounded-md font-medium transition-colors",
              values.isRecurring
                ? "bg-primary text-primary-foreground"
                : "border border-input bg-background hover:bg-accent",
            )}
            onClick={() => {
              const next = !values.isRecurring;
              handlers.onRecurringChange(next);
              if (!next) {
                handlers.onRecurrenceRuleChange(null);
                handlers.onRecurrenceStartChange(null);
                handlers.onRecurrenceEndChange(null);
              } else if (!values.recurrenceRule) {
                handlers.onRecurrenceRuleChange({ freq: "daily", interval: 1 });
              }
              markDirty();
            }}
          >
            {values.isRecurring ? "On" : "Off"}
          </button>
        </div>
        {values.isRecurring && (
          <RecurrencePicker
            rule={values.recurrenceRule}
            recurrenceStart={values.recurrenceStart}
            recurrenceEnd={values.recurrenceEnd}
            onChange={(rule, start, end) => {
              handlers.onRecurrenceRuleChange(rule);
              handlers.onRecurrenceStartChange(start);
              handlers.onRecurrenceEndChange(end);
              if (!rule) handlers.onRecurringChange(false);
              markDirty();
            }}
          />
        )}
      </div>

      {/* Notes / Description */}
      <FieldRow label="Notes" flash={flashTarget === "description"}>
        <textarea
          value={values.description}
          onChange={(e) => {
            handlers.onDescriptionChange(e.target.value);
            markDirty();
          }}
          onFocus={() => setDescriptionFocused(true)}
          onBlur={() => setDescriptionFocused(false)}
          placeholder="Add notes..."
          rows={descriptionFocused || values.description ? 3 : 1}
          className="w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-[13px] outline-none resize-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring transition-all"
        />
      </FieldRow>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FieldRow — label + content + optional flash                        */
/* ------------------------------------------------------------------ */

function FieldRow({
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
