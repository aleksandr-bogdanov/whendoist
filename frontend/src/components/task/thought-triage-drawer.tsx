/**
 * ThoughtTriageDrawer — mobile bottom drawer for thought → task conversion.
 *
 * This is a thin layout shell. All form logic lives in useTriageForm.
 */

import { ArrowRight, ChevronRight, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Drawer } from "vaul";
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
import { type ConvertData, useTriageForm } from "@/hooks/use-triage-form";
import { groupParentTasks } from "@/lib/task-utils";
import { cn } from "@/lib/utils";

// Re-export for consumers that imported ConvertData from this file
export type { ConvertData };

/* ------------------------------------------------------------------ */
/*  Drawer                                                             */
/* ------------------------------------------------------------------ */

interface ThoughtTriageDrawerProps {
  thought: TaskResponse | null;
  domains: DomainResponse[];
  parentTasks: TaskResponse[];
  onConvert: (thought: TaskResponse, data: ConvertData) => void;
  onDelete: (thought: TaskResponse) => void;
  onOpenChange: (open: boolean) => void;
}

export function ThoughtTriageDrawer({
  thought,
  domains,
  parentTasks,
  onConvert,
  onDelete,
  onOpenChange,
}: ThoughtTriageDrawerProps) {
  return (
    <Drawer.Root open={!!thought} onOpenChange={onOpenChange} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Drawer.Content
          className={cn(
            "fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-2xl",
            "bg-background border-t border-border",
            "max-h-[85vh] max-w-lg mx-auto",
          )}
        >
          <div className="mx-auto mt-3 mb-1 h-1.5 w-12 rounded-full bg-muted-foreground/20" />
          <Drawer.Title className="sr-only">Triage thought</Drawer.Title>

          {thought && (
            <DrawerBody
              key={thought.id}
              thought={thought}
              domains={domains}
              parentTasks={parentTasks}
              onConvert={onConvert}
              onDelete={onDelete}
            />
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/* ------------------------------------------------------------------ */
/*  DrawerBody — thin layout shell powered by useTriageForm            */
/* ------------------------------------------------------------------ */

function DrawerBody({
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

  // Drawer-specific state for nested parent picker
  const [parentPickerOpen, setParentPickerOpen] = useState(false);
  const [parentSearch, setParentSearch] = useState("");

  return (
    <>
      {/* Scrollable body */}
      <div className="overflow-y-auto px-4 pb-2 space-y-2">
        {/* Title */}
        <textarea
          ref={form.inputRef}
          value={form.displayTitle}
          onChange={form.handleTitleEdit}
          onKeyDown={form.handleKeyDown}
          placeholder="What's the task?"
          className="w-full text-base bg-transparent outline-none caret-primary placeholder:text-muted-foreground py-1.5 resize-none overflow-hidden border-b border-border/40 focus:border-primary transition-colors"
          rows={1}
        />

        {/* Domain */}
        <div
          className={cn(
            "relative pl-16 rounded-lg transition-all duration-300",
            form.domainFlash && "bg-primary/20",
          )}
        >
          <span className="absolute left-0 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            Domain
          </span>
          <div className="-mr-4 pr-4 overflow-x-auto scrollbar-hide touch-pan-x">
            <DomainChipRow
              domains={domains}
              selectedId={form.parsed.domainId}
              onSelect={form.handleDomainSelect}
            />
          </div>
        </div>

        {/* Parent task */}
        {parentTasks.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0 w-14">Parent</span>
            <button
              type="button"
              className={cn(
                "flex-1 flex items-center justify-between rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors active:scale-95",
                form.parentId !== null
                  ? "bg-primary/10 text-primary"
                  : "bg-secondary text-secondary-foreground active:bg-secondary/80",
              )}
              onClick={() => {
                setParentSearch("");
                setParentPickerOpen(true);
              }}
            >
              <span className="flex items-center gap-1.5 truncate min-w-0">
                {form.parentId !== null ? (
                  (() => {
                    const p = parentTasks.find((t) => t.id === form.parentId);
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
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0 w-14">Impact</span>
          <div className="flex-1">
            <ImpactButtonRow value={form.parsed.impact} onChange={form.handleImpactChange} />
          </div>
        </div>

        {/* Schedule */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0 w-14">When</span>
          <div className="flex-1">
            <ScheduleButtonRow
              selectedDate={form.parsed.scheduledDate}
              onSelectDate={form.handleDateSelect}
              onClear={() => form.clearTokenType("date")}
              onCalendarOpen={() => form.setCalendarOpen(true)}
            />
          </div>
        </div>

        {/* Duration */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0 w-14">Duration</span>
          <div className="flex-1">
            <DurationPickerRow
              value={form.parsed.durationMinutes}
              showCustom
              onChange={form.handleDurationChange}
            />
          </div>
        </div>

        {/* Time */}
        {form.parsed.scheduledDate && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0 w-14">Time</span>
            <div className="flex-1">
              <TimePickerField
                value={form.parsed.scheduledTime ?? ""}
                visible
                onChange={form.handleTimeChange}
              />
            </div>
          </div>
        )}

        {/* Recurrence */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0 w-14">Repeat</span>
          <div className="flex-1">
            <RecurrencePresetRow value={form.recurrence} onChange={form.setRecurrence} />
          </div>
        </div>

        {/* Clarity */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0 w-14">Clarity</span>
          <div className="flex-1">
            <ClarityChipRow value={form.parsed.clarity} onChange={form.handleClarityChange} />
          </div>
        </div>

        {/* Notes */}
        <div className="flex items-start gap-2 pt-1 border-t border-border/30">
          <span className="text-xs text-muted-foreground shrink-0 w-14 pt-2">Notes</span>
          <div className="flex-1">
            <textarea
              value={form.description}
              onChange={(e) => form.setDescription(e.target.value)}
              onFocus={() => form.setDescriptionFocused(true)}
              onBlur={() => form.setDescriptionFocused(false)}
              placeholder="Add notes..."
              rows={form.descriptionFocused || form.description ? 3 : 1}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-[13px] outline-none resize-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring transition-all"
              data-vaul-no-drag
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t bg-background px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0 h-10 text-[13px]"
          onClick={() => onDelete(thought)}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1" />
          Delete
        </Button>

        <Button
          className="flex-1 h-10 text-[13px] font-semibold transition-colors duration-200"
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

      {/* Nested parent-task picker drawer */}
      <ParentPickerDrawer
        open={parentPickerOpen}
        onOpenChange={setParentPickerOpen}
        parentTasks={parentTasks}
        domains={domains}
        selectedId={form.parentId}
        currentDomainId={form.parsed.domainId}
        search={parentSearch}
        onSearchChange={setParentSearch}
        onSelect={(id) => {
          form.handleParentSelect(id);
          setParentPickerOpen(false);
        }}
      />

      {/* Nested calendar drawer */}
      <Drawer.NestedRoot open={form.calendarOpen} onOpenChange={form.setCalendarOpen}>
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
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.NestedRoot>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  ParentPickerDrawer — nested drawer for parent task selection       */
/* ------------------------------------------------------------------ */

function ParentPickerDrawer({
  open,
  onOpenChange,
  parentTasks,
  domains,
  selectedId,
  currentDomainId,
  search,
  onSearchChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentTasks: TaskResponse[];
  domains: DomainResponse[];
  selectedId: number | null;
  currentDomainId: number | null;
  search: string;
  onSearchChange: (s: string) => void;
  onSelect: (id: number | null) => void;
}) {
  const taskGroups = useMemo(
    () => groupParentTasks(parentTasks, currentDomainId, search),
    [parentTasks, currentDomainId, search],
  );

  const totalFiltered = taskGroups.reduce((n, g) => n + g.tasks.length, 0);
  const showLabels = !search && taskGroups.length > 1;

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
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.NestedRoot>
  );
}
