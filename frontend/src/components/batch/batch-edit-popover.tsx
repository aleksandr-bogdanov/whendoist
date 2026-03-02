import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import type { DomainResponse, TaskResponse } from "@/api/model";
import { useListDomainsApiV1DomainsGet } from "@/api/queries/domains/domains";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { batchEdit } from "@/lib/batch-mutations";
import { CLARITY_OPTIONS, IMPACT_OPTIONS } from "@/lib/task-utils";

/* ------------------------------------------------------------------ */
/*  Duration input parser: "30" | "30m" | "1h" | "1.5h" → minutes     */
/* ------------------------------------------------------------------ */

function parseDuration(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  const hMatch = s.match(/^(\d+(?:\.\d+)?)h$/);
  if (hMatch) return Math.round(Number.parseFloat(hMatch[1]) * 60);
  const mMatch = s.match(/^(\d+)m?$/);
  if (mMatch) {
    const n = Number.parseInt(mMatch[1], 10);
    return n > 0 && n <= 1440 ? n : null;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Unset sentinel for Select components                               */
/* ------------------------------------------------------------------ */

const UNSET = "__unset__";

/* ------------------------------------------------------------------ */
/*  BatchEditForm                                                       */
/* ------------------------------------------------------------------ */

interface BatchEditFormProps {
  tasks: TaskResponse[];
  onDone: () => void;
}

export function BatchEditForm({ tasks, onDone }: BatchEditFormProps) {
  const queryClient = useQueryClient();
  const count = tasks.length;
  const noun = count === 1 ? "task" : "tasks";

  // Field state — undefined = unset ("—"), not touched
  const [impact, setImpact] = useState<string>(UNSET);
  const [clarity, setClarity] = useState<string>(UNSET);
  const [durationInput, setDurationInput] = useState("");
  const [domainId, setDomainId] = useState<string>(UNSET);

  // Fetch domains
  const { data: domains = [] } = useListDomainsApiV1DomainsGet({});
  const activeDomains = domains.filter((d: DomainResponse) => !d.is_archived);

  // Reset form when selection count changes (taskCount used as trigger)
  const taskCount = tasks.length;
  useEffect(() => {
    if (taskCount >= 0) {
      setImpact(UNSET);
      setClarity(UNSET);
      setDurationInput("");
      setDomainId(UNSET);
    }
  }, [taskCount]);

  const hasChanges =
    impact !== UNSET || clarity !== UNSET || durationInput.trim() !== "" || domainId !== UNSET;

  const handleApply = useCallback(async () => {
    const fields: Record<string, unknown> = {};

    if (impact !== UNSET) fields.impact = Number(impact);
    if (clarity !== UNSET) fields.clarity = clarity;
    if (durationInput.trim()) {
      const parsed = parseDuration(durationInput);
      if (parsed !== null) fields.duration_minutes = parsed;
    }
    if (domainId !== UNSET) fields.domain_id = Number(domainId);

    if (Object.keys(fields).length === 0) return;

    await batchEdit(queryClient, tasks, fields);
    onDone();
  }, [impact, clarity, durationInput, domainId, tasks, queryClient, onDone]);

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <p className="text-sm font-medium">
        Edit {count} {noun}
      </p>

      {/* Impact (Priority) */}
      <FieldRow label="Impact">
        <Select value={impact} onValueChange={setImpact}>
          <SelectTrigger size="sm" className="w-full">
            <SelectValue placeholder="\u2014" />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            <SelectItem value={UNSET}>&mdash;</SelectItem>
            {IMPACT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={String(opt.value)}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>

      {/* Clarity */}
      <FieldRow label="Clarity">
        <Select value={clarity} onValueChange={setClarity}>
          <SelectTrigger size="sm" className="w-full">
            <SelectValue placeholder="\u2014" />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            <SelectItem value={UNSET}>&mdash;</SelectItem>
            {CLARITY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>

      {/* Duration */}
      <FieldRow label="Duration">
        <input
          type="text"
          value={durationInput}
          onChange={(e) => setDurationInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && hasChanges) {
              e.preventDefault();
              handleApply();
            }
          }}
          placeholder="\u2014"
          className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
        />
      </FieldRow>

      {/* Domain */}
      <FieldRow label="Domain">
        <Select value={domainId} onValueChange={setDomainId}>
          <SelectTrigger size="sm" className="w-full">
            <SelectValue placeholder="\u2014" />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            <SelectItem value={UNSET}>&mdash;</SelectItem>
            {activeDomains.map((d: DomainResponse) => (
              <SelectItem key={d.id} value={String(d.id)}>
                {d.icon ? `${d.icon} ${d.name}` : d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onDone}
          className="px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleApply}
          disabled={!hasChanges}
          className="px-3 py-1.5 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FieldRow — label + control layout                                   */
/* ------------------------------------------------------------------ */

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[80px_1fr] items-center gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
