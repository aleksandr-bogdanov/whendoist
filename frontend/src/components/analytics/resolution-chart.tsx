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

const SEGMENTS = [
  { key: "same_day" as const, label: "Same day", color: "#6D5EF6" },
  { key: "within_week" as const, label: "Within week", color: "#06B6D4" },
  { key: "within_month" as const, label: "Within month", color: "#EAB308" },
  { key: "over_month" as const, label: "Over month", color: "#DC2626" },
];

export function ResolutionChart({ buckets, avgDays, medianDays, className }: ResolutionChartProps) {
  const total = buckets.same_day + buckets.within_week + buckets.within_month + buckets.over_month;
  if (total === 0) return null;

  const data = SEGMENTS.map((s) => ({
    name: s.label,
    value: buckets[s.key],
    color: s.color,
  })).filter((d) => d.value > 0);

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle>Resolution Time</CardTitle>
        <p className="text-xs text-muted-foreground">How quickly tasks get completed</p>
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
                    value={`${medianDays}d`}
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
              {SEGMENTS.filter((s) => buckets[s.key] > 0).map((s) => (
                <div key={s.label} className="flex items-center gap-1.5">
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
                <span className="text-muted-foreground">Avg: </span>
                <span className="font-medium">{avgDays}d</span>
              </div>
              <div>
                <span className="text-muted-foreground">Median: </span>
                <span className="font-medium">{medianDays}d</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
