import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { DomainBreakdownItem } from "@/api/model";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface DomainBreakdownProps {
  data: DomainBreakdownItem[];
}

const COLORS = [
  "hsl(var(--primary))",
  "#f97316",
  "#22c55e",
  "#eab308",
  "#06b6d4",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
];

export function DomainBreakdown({ data }: DomainBreakdownProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>By Domain</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">No domain data yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>By Domain</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <ResponsiveContainer width="100%" height={200} className="max-w-[200px]">
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                nameKey="domain_name"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
              >
                {data.map((entry, i) => (
                  <Cell key={entry.domain_id} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  borderColor: "hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
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
