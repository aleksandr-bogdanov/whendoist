import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DailyCompletionItem } from "@/api/model";
import { TOOLTIP_STYLE } from "@/components/analytics/tooltip-style";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface DailyChartProps {
  data: DailyCompletionItem[];
  className?: string;
}

export function DailyChart({ data, className }: DailyChartProps) {
  const { t, i18n } = useTranslation();

  const total = data.reduce((sum, d) => sum + d.count, 0);
  const formatted = data.map((d) => ({
    ...d,
    label: new Date(`${d.date}T12:00:00`).toLocaleDateString(i18n.language, {
      month: "short",
      day: "numeric",
    }),
  }));

  const tooltipFormatter = useCallback(
    (value: number | string | undefined) => [
      t("analytics.tooltip.tasksCount", { value }),
      t("analytics.tooltip.completed"),
    ],
    [t],
  );

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle>{t("analytics.daily.title")}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {t("analytics.daily.summary", { total, days: data.length })}
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={formatted}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11 }}
              className="fill-muted-foreground"
              interval="preserveStartEnd"
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              className="fill-muted-foreground"
              allowDecimals={false}
              tickLine={false}
              width={32}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ color: "var(--foreground)" }}
              formatter={tooltipFormatter}
            />
            <Bar dataKey="count" fill="var(--color-brand)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
