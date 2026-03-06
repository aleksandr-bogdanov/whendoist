import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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

function formatDurationValue(minutes: number): string {
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

/* ------------------------------------------------------------------ */
/*  Unset / Mixed sentinels for Select components                      */
/* ------------------------------------------------------------------ */

const UNSET = "__unset__";
const MIXED = "__mixed__";

/* ------------------------------------------------------------------ */
/*  Compute intersection of a field across tasks                       */
/* ------------------------------------------------------------------ */

/** Returns the common value if all tasks share it, MIXED if they differ, or UNSET if all null/undefined */
function computeFieldValue<T>(tasks: TaskResponse[], getter: (t: TaskResponse) => T): string {
  if (tasks.length === 0) return UNSET;
  const values = tasks.map(getter);
  const nonNull = values.filter((v) => v != null);
  if (nonNull.length === 0) return UNSET;
  const first = nonNull[0];
  if (nonNull.length === values.length && nonNull.every((v) => v === first)) {
    return String(first);
  }
  return MIXED;
}

/* ------------------------------------------------------------------ */
/*  BatchEditForm                                                       */
/* ------------------------------------------------------------------ */

interface BatchEditFormProps {
  tasks: TaskResponse[];
  /** Number of instances in the selection (for messaging) */
  instanceCount?: number;
  onDone: () => void;
}

export function BatchEditForm({ tasks, instanceCount = 0, onDone }: BatchEditFormProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const count = tasks.length;
  const instanceOnly = count === 0 && instanceCount > 0;

  // Compute intersection values for pre-filling
  const defaults = useMemo(
    () => ({
      impact: computeFieldValue(tasks, (t) => t.impact),
      clarity: computeFieldValue(tasks, (t) => t.clarity),
      duration: computeFieldValue(tasks, (t) => t.duration_minutes),
      domain: computeFieldValue(tasks, (t) => t.domain_id),
    }),
    [tasks],
  );

  // Field state — initialized from intersection
  const [impact, setImpact] = useState<string>(UNSET);
  const [clarity, setClarity] = useState<string>(UNSET);
  const [durationInput, setDurationInput] = useState("");
  const [domainId, setDomainId] = useState<string>(UNSET);

  // Fetch domains
  const { data: domains = [] } = useListDomainsApiV1DomainsGet({});
  const activeDomains = domains.filter((d: DomainResponse) => !d.is_archived);

  // Track which fields the user has explicitly interacted with
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const markTouched = useCallback(
    (field: string) => setTouched((prev) => (prev.has(field) ? prev : new Set(prev).add(field))),
    [],
  );

  // Reset form when selection changes — pre-fill from intersection
  useEffect(() => {
    setImpact(defaults.impact !== MIXED ? defaults.impact : UNSET);
    setClarity(defaults.clarity !== MIXED ? defaults.clarity : UNSET);
    setDurationInput(
      defaults.duration !== MIXED && defaults.duration !== UNSET
        ? formatDurationValue(Number(defaults.duration))
        : "",
    );
    setDomainId(defaults.domain !== MIXED ? defaults.domain : UNSET);
    setTouched(new Set());
  }, [defaults]);

  // Only enable Apply when at least one touched field has a meaningful (non-UNSET) value
  const hasChanges = useMemo(() => {
    if (touched.size === 0) return false;
    if (touched.has("impact") && impact !== UNSET) return true;
    if (touched.has("clarity") && clarity !== UNSET) return true;
    if (touched.has("duration") && durationInput.trim() !== "") return true;
    if (touched.has("domain") && domainId !== UNSET) return true;
    return false;
  }, [touched, impact, clarity, durationInput, domainId]);

  const handleApply = useCallback(() => {
    const fields: Record<string, unknown> = {};

    if (touched.has("impact") && impact !== UNSET) fields.impact = Number(impact);
    if (touched.has("clarity") && clarity !== UNSET) fields.clarity = clarity;
    if (touched.has("duration") && durationInput.trim()) {
      const parsed = parseDuration(durationInput);
      if (parsed !== null) fields.duration_minutes = parsed;
    }
    if (touched.has("domain") && domainId !== UNSET) fields.domain_id = Number(domainId);

    if (Object.keys(fields).length === 0) return;

    batchEdit(queryClient, tasks, fields);
    onDone();
  }, [impact, clarity, durationInput, domainId, touched, tasks, queryClient, onDone]);

  // Instance-only selection: fields can't be edited
  if (instanceOnly) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">
          {t("batch.instancesSelected", { count: instanceCount })}
        </p>
        <p className="text-xs text-muted-foreground">{t("batch.instancesSkipped")}</p>
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onDone}
            className="px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    );
  }

  const noun = count === 1 ? t("common.task") : t("common.tasks");

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <p className="text-sm font-medium">{t("batch.editCount", { count, noun })}</p>

      {/* Note when mixed selection includes instances */}
      {instanceCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("batch.appliedNote", { count, noun, instanceCount })}
        </p>
      )}

      {/* Impact (Priority) */}
      <FieldRow label={t("task.field.impact")}>
        <Select
          value={impact}
          onValueChange={(v) => {
            markTouched("impact");
            setImpact(v);
          }}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue placeholder={defaults.impact === MIXED ? t("common.mixed") : "\u2014"} />
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
      <FieldRow label={t("task.field.clarity")}>
        <Select
          value={clarity}
          onValueChange={(v) => {
            markTouched("clarity");
            setClarity(v);
          }}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue placeholder={defaults.clarity === MIXED ? t("common.mixed") : "\u2014"} />
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
      <FieldRow label={t("task.field.duration")}>
        <input
          type="text"
          value={durationInput}
          onChange={(e) => {
            markTouched("duration");
            setDurationInput(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && hasChanges) {
              e.preventDefault();
              handleApply();
            }
          }}
          placeholder={defaults.duration === MIXED ? t("common.mixed") : "\u2014"}
          className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
        />
      </FieldRow>

      {/* Domain */}
      <FieldRow label={t("task.field.domain")}>
        <Select
          value={domainId}
          onValueChange={(v) => {
            markTouched("domain");
            setDomainId(v);
          }}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue placeholder={defaults.domain === MIXED ? t("common.mixed") : "\u2014"} />
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
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={handleApply}
          disabled={!hasChanges}
          className="px-3 py-1.5 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t("common.apply")}
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
