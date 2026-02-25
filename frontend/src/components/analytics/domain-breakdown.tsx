import { Cell, Label, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { DomainBreakdownItem } from "@/api/model";
import { TOOLTIP_STYLE } from "@/components/analytics/tooltip-style";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface DomainBreakdownProps {
  data: DomainBreakdownItem[];
  className?: string;
}

const COLORS = [
  "var(--color-brand)",
  "#f97316",
  "#22c55e",
  "#eab308",
  "#06b6d4",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
];

export function DomainBreakdown({ data, className }: DomainBreakdownProps) {
  if (data.length === 0) {
    return (
      <Card className={cn(className)}>
        <CardHeader>
          <CardTitle>By Domain</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">No domain data yet</p>
        </CardContent>
      </Card>
    );
  }

  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle>By Domain</CardTitle>
        <p className="text-xs text-muted-foreground">
          {total} tasks across {data.length} domains
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-4">
          <div className="w-[180px] h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="count"
                  nameKey="domain_name"
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={72}
                  paddingAngle={2}
                >
                  {data.map((entry, i) => (
                    <Cell key={entry.domain_id} fill={COLORS[i % COLORS.length]} />
                  ))}
                  <Label
                    value={total}
                    position="center"
                    className="fill-foreground"
                    style={{ fontSize: 20, fontWeight: 700 }}
                  />
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-sm">
            {data.map((d, i) => (
              <div key={d.domain_id} className="flex items-center gap-1.5">
                <div
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
                <span className="text-muted-foreground">
                  {d.domain_icon} {d.domain_name}
                </span>
                <span className="font-medium tabular-nums">{d.count}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
