import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { HourOfDayItem } from "@/api/model";
import { TOOLTIP_STYLE } from "@/components/analytics/tooltip-style";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ActiveHoursChartProps {
  data: HourOfDayItem[];
  className?: string;
}

function formatHour(hour: number): string {
  if (hour === 0) return "12am";
  if (hour === 12) return "12pm";
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

export function ActiveHoursChart({ data, className }: ActiveHoursChartProps) {
  if (data.length === 0) {
    return (
      <Card className={cn(className)}>
        <CardHeader>
          <CardTitle>Active Hours</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">No hourly data yet</p>
        </CardContent>
      </Card>
    );
  }

  const peak = data.reduce((a, b) => (b.count > a.count ? b : a), data[0]);

  const formatted = data.map((d) => ({
    ...d,
    label: formatHour(d.hour),
  }));

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle>Active Hours</CardTitle>
        <p className="text-xs text-muted-foreground">
          Based on task completion times. Peak: {formatHour(peak.hour)}
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={formatted}>
            <defs>
              <linearGradient id="hourGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-brand)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="var(--color-brand)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11 }}
              className="fill-muted-foreground"
              interval={3}
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
              formatter={(value) => [`${value} tasks`, "Completed"]}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke="var(--color-brand)"
              strokeWidth={2}
              fill="url(#hourGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
