import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DAYS_OF_WEEK = [
  { key: "MO", label: "M" },
  { key: "TU", label: "T" },
  { key: "WE", label: "W" },
  { key: "TH", label: "T" },
  { key: "FR", label: "F" },
  { key: "SA", label: "S" },
  { key: "SU", label: "S" },
] as const;

const WEEKDAY_KEYS = ["MO", "TU", "WE", "TH", "FR"];

export interface RecurrenceRule {
  freq: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  days_of_week?: string[];
  day_of_month?: number;
  week_of_month?: number;
  month_of_year?: number;
}

type Preset = "none" | "daily" | "weekdays" | "weekly" | "monthly" | "custom";

interface RecurrencePickerProps {
  rule: RecurrenceRule | null;
  recurrenceStart: string | null;
  recurrenceEnd: string | null;
  onChange: (rule: RecurrenceRule | null, start: string | null, end: string | null) => void;
}

function detectPreset(rule: RecurrenceRule | null): Preset {
  if (!rule) return "none";
  if (
    rule.freq === "daily" &&
    (rule.interval === 1 || !rule.interval) &&
    !rule.days_of_week?.length
  )
    return "daily";
  if (
    rule.freq === "weekly" &&
    (rule.interval === 1 || !rule.interval) &&
    rule.days_of_week?.length === 5 &&
    WEEKDAY_KEYS.every((d) => rule.days_of_week!.includes(d))
  )
    return "weekdays";
  if (
    rule.freq === "weekly" &&
    (rule.interval === 1 || !rule.interval) &&
    (!rule.days_of_week || rule.days_of_week.length === 0)
  )
    return "weekly";
  if (rule.freq === "monthly" && (rule.interval === 1 || !rule.interval) && !rule.day_of_month)
    return "monthly";
  return "custom";
}

function presetToRule(preset: Preset): RecurrenceRule | null {
  switch (preset) {
    case "none":
      return null;
    case "daily":
      return { freq: "daily", interval: 1 };
    case "weekdays":
      return { freq: "weekly", interval: 1, days_of_week: [...WEEKDAY_KEYS] };
    case "weekly":
      return { freq: "weekly", interval: 1 };
    case "monthly":
      return { freq: "monthly", interval: 1 };
    case "custom":
      return { freq: "daily", interval: 1 };
  }
}

export function RecurrencePicker({
  rule,
  recurrenceStart,
  recurrenceEnd,
  onChange,
}: RecurrencePickerProps) {
  const [preset, setPreset] = useState<Preset>(() => detectPreset(rule));
  const [customRule, setCustomRule] = useState<RecurrenceRule>(
    () => rule ?? { freq: "daily", interval: 1 },
  );
  const [start, setStart] = useState(recurrenceStart ?? "");
  const [end, setEnd] = useState(recurrenceEnd ?? "");

  // Sync incoming rule changes
  useEffect(() => {
    const detected = detectPreset(rule);
    setPreset(detected);
    if (rule) setCustomRule(rule);
  }, [rule]);

  useEffect(() => {
    setStart(recurrenceStart ?? "");
    setEnd(recurrenceEnd ?? "");
  }, [recurrenceStart, recurrenceEnd]);

  const emitChange = useCallback(
    (newRule: RecurrenceRule | null, newStart: string, newEnd: string) => {
      onChange(newRule, newStart || null, newEnd || null);
    },
    [onChange],
  );

  const handlePreset = (p: Preset) => {
    setPreset(p);
    if (p === "custom") {
      emitChange(customRule, start, end);
    } else {
      const newRule = presetToRule(p);
      if (newRule) setCustomRule(newRule);
      emitChange(newRule, start, end);
    }
  };

  const updateCustom = (patch: Partial<RecurrenceRule>) => {
    const updated = { ...customRule, ...patch };
    setCustomRule(updated);
    emitChange(updated, start, end);
  };

  const toggleDayOfWeek = (day: string) => {
    const current = customRule.days_of_week ?? [];
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
    updateCustom({ days_of_week: next });
  };

  const presets: { key: Preset; label: string }[] = [
    { key: "none", label: "None" },
    { key: "daily", label: "Daily" },
    { key: "weekdays", label: "Weekdays" },
    { key: "weekly", label: "Weekly" },
    { key: "monthly", label: "Monthly" },
    { key: "custom", label: "Custom" },
  ];

  return (
    <div className="space-y-3">
      {/* Preset pills */}
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <Button
            key={p.key}
            type="button"
            variant={preset === p.key ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs px-2.5"
            onClick={() => handlePreset(p.key)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {/* Custom panel */}
      {preset === "custom" && (
        <div className="space-y-3 rounded-md border p-3">
          <div className="flex items-center gap-2">
            <Label className="text-xs whitespace-nowrap">Every</Label>
            <Input
              type="number"
              min={1}
              max={99}
              value={customRule.interval}
              onChange={(e) =>
                updateCustom({
                  interval: Math.max(1, Math.min(99, Number(e.target.value) || 1)),
                })
              }
              className="h-7 w-16 text-xs"
            />
            <Select
              value={customRule.freq}
              onValueChange={(v) => updateCustom({ freq: v as RecurrenceRule["freq"] })}
            >
              <SelectTrigger className="h-7 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">day(s)</SelectItem>
                <SelectItem value="weekly">week(s)</SelectItem>
                <SelectItem value="monthly">month(s)</SelectItem>
                <SelectItem value="yearly">year(s)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Days of week (weekly) */}
          {customRule.freq === "weekly" && (
            <div className="space-y-1.5">
              <Label className="text-xs">On days</Label>
              <div className="flex gap-1">
                {DAYS_OF_WEEK.map((d, i) => (
                  <Button
                    key={`${d.key}-${i}`}
                    type="button"
                    variant={customRule.days_of_week?.includes(d.key) ? "default" : "outline"}
                    size="sm"
                    className="h-7 w-7 p-0 text-xs"
                    onClick={() => toggleDayOfWeek(d.key)}
                  >
                    {d.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Day of month (monthly) */}
          {customRule.freq === "monthly" && (
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">On day</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={customRule.day_of_month ?? ""}
                onChange={(e) =>
                  updateCustom({
                    day_of_month: e.target.value
                      ? Math.max(1, Math.min(31, Number(e.target.value)))
                      : undefined,
                  })
                }
                placeholder="1-31"
                className="h-7 w-20 text-xs"
              />
            </div>
          )}
        </div>
      )}

      {/* Bounds: start/end date */}
      {preset !== "none" && (
        <div className="flex gap-3">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Start</Label>
            <Input
              type="date"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                emitChange(
                  preset === "custom" ? customRule : presetToRule(preset),
                  e.target.value,
                  end,
                );
              }}
              className="h-7 text-xs"
            />
          </div>
          <div className="flex-1 space-y-1">
            <Label className="text-xs">End</Label>
            <Input
              type="date"
              value={end}
              onChange={(e) => {
                setEnd(e.target.value);
                emitChange(
                  preset === "custom" ? customRule : presetToRule(preset),
                  start,
                  e.target.value,
                );
              }}
              className="h-7 text-xs"
            />
          </div>
        </div>
      )}
    </div>
  );
}
