import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ImpactDistributionItem } from "@/api/model";
import { TOOLTIP_STYLE } from "@/components/analytics/tooltip-style";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ImpactChartProps {
  data: ImpactDistributionItem[];
  className?: string;
}

export function ImpactChart({ data, className }: ImpactChartProps) {
  const { t } = useTranslation();

  const total = data.reduce((sum, d) => sum + d.count, 0);
  const formatted = data.map((d) => ({
    ...d,
    name: `P${d.impact} ${d.label}`,
  }));

  const tooltipFormatter = useCallback(
    (value: number | string | undefined) => [
      t("analytics.tooltip.tasksCount", { value }),
      t("analytics.tooltip.count"),
    ],
    [t],
  );

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle>{t("analytics.impact.title")}</CardTitle>
        <p className="text-xs text-muted-foreground">{t("analytics.impact.summary", { total })}</p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={formatted}>
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11 }}
              className="fill-muted-foreground"
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              className="fill-muted-foreground"
              allowDecimals={false}
              tickLine={false}
              width={32}
            />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={tooltipFormatter} />
            <Bar dataKey="count" radius={[3, 3, 0, 0]}>
              {formatted.map((entry) => (
                <Cell key={entry.impact} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
