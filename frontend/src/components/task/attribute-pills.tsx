import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import type { AppRoutersTasksTaskResponse } from "@/api/model";
import {
  getListTasksApiV1TasksGetQueryKey,
  useUpdateTaskApiV1TasksTaskIdPut,
} from "@/api/queries/tasks/tasks";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  CLARITY_COLORS,
  CLARITY_LABELS,
  CLARITY_OPTIONS,
  DURATION_PRESETS,
  formatDuration,
  formatDurationLabel,
  IMPACT_COLORS,
  IMPACT_LABELS,
  IMPACT_OPTIONS,
} from "@/lib/task-utils";
import { cn } from "@/lib/utils";

// ── Shared optimistic mutation hook ──────────────────────────────

function useAttributeUpdate() {
  const queryClient = useQueryClient();
  const updateTask = useUpdateTaskApiV1TasksTaskIdPut();

  return useCallback(
    (
      taskId: number,
      field: "impact" | "clarity" | "duration_minutes",
      value: number | string | null,
    ) => {
      const previous = queryClient.getQueryData<AppRoutersTasksTaskResponse[]>(
        getListTasksApiV1TasksGetQueryKey(),
      );

      // Optimistic update — handles both top-level tasks and subtasks
      queryClient.setQueryData<AppRoutersTasksTaskResponse[]>(
        getListTasksApiV1TasksGetQueryKey(),
        (old) =>
          old?.map((t) => {
            if (t.id === taskId) return { ...t, [field]: value };
            return {
              ...t,
              subtasks: t.subtasks?.map((st) =>
                st.id === taskId ? { ...st, [field]: value } : st,
              ),
            };
          }),
      );

      updateTask.mutate(
        { taskId, data: { [field]: value } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({
              queryKey: getListTasksApiV1TasksGetQueryKey(),
            });
          },
          onError: () => {
            queryClient.setQueryData(getListTasksApiV1TasksGetQueryKey(), previous);
            toast.error("Failed to update task", { id: `attr-err-${taskId}` });
          },
        },
      );
    },
    [queryClient, updateTask],
  );
}

// ── Pill trigger wrapper (hover reveal + open state) ─────────────

const pillTriggerClass =
  "inline-flex items-center justify-center rounded-md px-1.5 py-0.5 text-[0.65rem] font-semibold transition-all duration-150 cursor-pointer select-none";

const pillHoverClass =
  "group-hover:bg-[rgba(109,94,246,0.06)] group-hover:ring-1 group-hover:ring-border";

const pillOpenClass = "bg-[rgba(109,94,246,0.10)] ring-1 ring-ring";

// ── Segmented control container ──────────────────────────────────

function SegmentedControl({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-secondary border border-border rounded-md p-0.5 inline-flex gap-0.5">
      {children}
    </div>
  );
}

// ── Shared popover content props ─────────────────────────────────

const popoverContentProps = {
  className: "w-auto p-1.5 bg-popover border border-border rounded-md shadow-md",
  sideOffset: 4,
  onOpenAutoFocus: (e: Event) => e.preventDefault(),
  onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
} as const;

// ── Impact Pill ──────────────────────────────────────────────────

interface PillProps {
  taskId: number;
  value: number | string | null;
  disabled?: boolean;
}

export function ImpactPill({ taskId, value, disabled }: PillProps) {
  const [open, setOpen] = useState(false);
  const update = useAttributeUpdate();
  const impact = typeof value === "number" ? value : 4;
  const color = IMPACT_COLORS[impact] ?? IMPACT_COLORS[4];

  if (disabled) {
    return (
      <span
        className="inline-flex items-center justify-center text-[0.65rem] font-semibold"
        style={{ color }}
      >
        {IMPACT_LABELS[impact] ?? "Min"}
      </span>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(pillTriggerClass, pillHoverClass, open && pillOpenClass)}
          style={{ color }}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={`Impact: ${IMPACT_LABELS[impact] ?? "Min"}`}
        >
          {IMPACT_LABELS[impact] ?? "Min"}
        </button>
      </PopoverTrigger>
      <PopoverContent {...popoverContentProps} align="center" side="bottom">
        <SegmentedControl>
          {IMPACT_OPTIONS.map((opt) => {
            const active = opt.value === impact;
            const optColor = IMPACT_COLORS[opt.value] ?? IMPACT_COLORS[4];
            return (
              <button
                key={opt.value}
                type="button"
                className={cn(
                  "h-7 px-2 rounded-[5px] text-[0.68rem] font-semibold transition-all duration-150",
                  active ? "text-white" : "hover:bg-[rgba(15,23,42,0.04)]",
                )}
                style={active ? { backgroundColor: optColor } : { color: optColor }}
                onClick={() => {
                  if (opt.value !== impact) {
                    update(taskId, "impact", opt.value);
                  }
                  setOpen(false);
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </SegmentedControl>
      </PopoverContent>
    </Popover>
  );
}

// ── Clarity Pill ─────────────────────────────────────────────────

export function ClarityPill({ taskId, value, disabled }: PillProps) {
  const [open, setOpen] = useState(false);
  const update = useAttributeUpdate();
  const clarity = typeof value === "string" ? value : "normal";
  const isNormal = clarity === "normal";
  const color = CLARITY_COLORS[clarity] ?? CLARITY_COLORS.normal;

  if (disabled) {
    return isNormal ? null : (
      <span
        className="inline-block text-[0.65rem] font-semibold px-1.5 py-0.5 rounded-full"
        style={{
          color,
          backgroundColor: `var(--${clarity}-tint)`,
        }}
      >
        {CLARITY_LABELS[clarity] ?? clarity}
      </span>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            pillTriggerClass,
            pillHoverClass,
            open && pillOpenClass,
            isNormal && "text-muted-foreground/40",
          )}
          style={
            isNormal
              ? undefined
              : { color, backgroundColor: `var(--${clarity}-tint)`, borderRadius: "9999px" }
          }
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={`Clarity: ${CLARITY_LABELS[clarity] ?? clarity}`}
        >
          {isNormal ? "\u2014" : (CLARITY_LABELS[clarity] ?? clarity)}
        </button>
      </PopoverTrigger>
      <PopoverContent {...popoverContentProps} align="center" side="bottom">
        <SegmentedControl>
          {CLARITY_OPTIONS.map((opt) => {
            const active = opt.value === clarity;
            const optColor = CLARITY_COLORS[opt.value] ?? CLARITY_COLORS.normal;
            return (
              <button
                key={opt.value}
                type="button"
                className={cn(
                  "h-7 px-2 rounded-[5px] text-[0.68rem] font-semibold transition-all duration-150",
                  active ? "ring-1" : "hover:bg-[rgba(15,23,42,0.04)]",
                )}
                style={
                  active
                    ? {
                        backgroundColor: `var(--${opt.value}-tint)`,
                        color: optColor,
                        // ring color via box-shadow to avoid needing dynamic Tailwind
                        boxShadow: `inset 0 0 0 1px ${optColor}`,
                      }
                    : { color: optColor }
                }
                onClick={() => {
                  if (opt.value !== clarity) {
                    update(taskId, "clarity", opt.value);
                  }
                  setOpen(false);
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </SegmentedControl>
      </PopoverContent>
    </Popover>
  );
}

// ── Duration Pill ────────────────────────────────────────────────

export function DurationPill({ taskId, value, disabled }: PillProps) {
  const [open, setOpen] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const update = useAttributeUpdate();
  const duration = typeof value === "number" ? value : null;

  if (disabled) {
    return (
      <span className="inline-flex items-center justify-center text-[0.65rem] font-medium tabular-nums text-muted-foreground">
        {duration ? formatDuration(duration) : <span className="opacity-30">&mdash;</span>}
      </span>
    );
  }

  const handleCustomSubmit = () => {
    const parsed = Number.parseInt(customInput, 10);
    if (parsed > 0) {
      update(taskId, "duration_minutes", parsed);
      setOpen(false);
      setCustomInput("");
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setCustomInput("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            pillTriggerClass,
            "font-medium tabular-nums text-muted-foreground",
            pillHoverClass,
            open && pillOpenClass,
          )}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={`Duration: ${duration ? formatDuration(duration) : "none"}`}
        >
          {duration ? formatDuration(duration) : "\u2014"}
        </button>
      </PopoverTrigger>
      <PopoverContent {...popoverContentProps} align="center" side="bottom">
        <div className="flex flex-col gap-1.5">
          {/* Preset buttons */}
          <SegmentedControl>
            {DURATION_PRESETS.map((preset) => {
              const active = preset === duration;
              return (
                <button
                  key={preset}
                  type="button"
                  className={cn(
                    "h-7 px-2 rounded-[5px] text-[0.68rem] font-semibold transition-all duration-150",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-[rgba(15,23,42,0.04)]",
                  )}
                  onClick={() => {
                    if (preset !== duration) {
                      update(taskId, "duration_minutes", preset);
                    }
                    setOpen(false);
                    setCustomInput("");
                  }}
                >
                  {formatDurationLabel(preset)}
                </button>
              );
            })}
          </SegmentedControl>

          {/* Custom input row */}
          <div className="flex items-center gap-1.5 px-0.5">
            <input
              ref={inputRef}
              type="number"
              min={1}
              placeholder="___"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCustomSubmit();
              }}
              className="w-12 h-7 px-1.5 rounded-[5px] border border-border bg-background text-[0.68rem] text-center tabular-nums outline-none focus:ring-1 focus:ring-ring"
            />
            <span className="text-[0.68rem] text-muted-foreground">min</span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
