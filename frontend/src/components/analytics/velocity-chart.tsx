import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { VelocityItem } from "@/api/model";
import { TOOLTIP_STYLE } from "@/components/analytics/tooltip-style";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface VelocityChartProps {
  data: VelocityItem[];
  className?: string;
}

export function VelocityChart({ data, className }: VelocityChartProps) {
  const formatted = data.map((d) => ({
    ...d,
    label: new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
  }));

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle>Velocity Trend</CardTitle>
        <p className="text-xs text-muted-foreground">
          Daily completions with 7-day rolling average
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={formatted}>
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
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: "var(--foreground)" }} />
            <Legend verticalAlign="top" height={28} iconSize={10} wrapperStyle={{ fontSize: 11 }} />
            <Line
              type="monotone"
              dataKey="count"
              stroke="var(--color-brand-light)"
              strokeWidth={1.5}
              strokeOpacity={0.5}
              dot={false}
              name="Daily"
            />
            <Line
              type="monotone"
              dataKey="avg"
              stroke="var(--color-brand)"
              strokeWidth={2}
              dot={false}
              name="7-day avg"
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
