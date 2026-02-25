import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DayOfWeekItem } from "@/api/model";
import { TOOLTIP_STYLE } from "@/components/analytics/tooltip-style";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface DayOfWeekChartProps {
  data: DayOfWeekItem[];
  className?: string;
}

export function DayOfWeekChart({ data, className }: DayOfWeekChartProps) {
  const best = data.reduce((a, b) => (b.count > a.count ? b : a), data[0]);

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle>By Day of Week</CardTitle>
        {best && (
          <p className="text-xs text-muted-foreground">
            Most productive: {best.day} ({best.count} tasks)
          </p>
        )}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} layout="vertical">
            <XAxis
              type="number"
              tick={{ fontSize: 11 }}
              className="fill-muted-foreground"
              allowDecimals={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="day"
              tick={{ fontSize: 11 }}
              className="fill-muted-foreground"
              width={36}
              tickLine={false}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value) => [`${value} tasks`, "Completed"]}
            />
            <Bar dataKey="count" fill="var(--color-brand)" radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
