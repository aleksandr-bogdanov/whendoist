import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Cell, Label, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { TOOLTIP_STYLE } from "@/components/analytics/tooltip-style";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ResolutionChartProps {
  buckets: { same_day: number; within_week: number; within_month: number; over_month: number };
  avgDays: number;
  medianDays: number;
  className?: string;
}

const SEGMENT_KEYS = [
  { key: "same_day" as const, labelKey: "analytics.resolution.sameDay", color: "#6D5EF6" },
  { key: "within_week" as const, labelKey: "analytics.resolution.withinWeek", color: "#06B6D4" },
  { key: "within_month" as const, labelKey: "analytics.resolution.withinMonth", color: "#EAB308" },
  { key: "over_month" as const, labelKey: "analytics.resolution.overMonth", color: "#DC2626" },
];

export function ResolutionChart({ buckets, avgDays, medianDays, className }: ResolutionChartProps) {
  const { t } = useTranslation();

  const segments = useMemo(() => SEGMENT_KEYS.map((s) => ({ ...s, label: t(s.labelKey) })), [t]);

  const total = buckets.same_day + buckets.within_week + buckets.within_month + buckets.over_month;
  if (total === 0) return null;

  const data = segments
    .map((s) => ({
      name: s.label,
      value: buckets[s.key],
      color: s.color,
    }))
    .filter((d) => d.value > 0);

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle>{t("analytics.resolution.title")}</CardTitle>
        <p className="text-xs text-muted-foreground">{t("analytics.resolution.description")}</p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="w-[180px] h-[180px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={72}
                  paddingAngle={2}
                >
                  {data.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                  <Label
                    value={t("analytics.resolution.medianDaysLabel", { days: medianDays })}
                    position="center"
                    className="fill-foreground"
                    style={{ fontSize: 20, fontWeight: 700 }}
                  />
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
              {segments
                .filter((s) => buckets[s.key] > 0)
                .map((s) => (
                  <div key={s.key} className="flex items-center gap-1.5">
                    <div
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="text-muted-foreground">{s.label}</span>
                    <span className="font-medium tabular-nums">{buckets[s.key]}</span>
                  </div>
                ))}
            </div>
            <div className="flex gap-6 text-sm">
              <div>
                <span className="text-muted-foreground">{t("analytics.resolution.avg")}</span>
                <span className="font-medium">
                  {t("analytics.resolution.medianDaysLabel", { days: avgDays })}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">{t("analytics.resolution.median")}</span>
                <span className="font-medium">
                  {t("analytics.resolution.medianDaysLabel", { days: medianDays })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
