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
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const formatted = data.map((d) => ({
    ...d,
    name: `P${d.impact} ${d.label}`,
  }));

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle>Impact Distribution</CardTitle>
        <p className="text-xs text-muted-foreground">{total} tasks by priority level</p>
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
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value) => [`${value} tasks`, "Count"]}
            />
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
