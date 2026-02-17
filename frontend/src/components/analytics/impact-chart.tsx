import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ImpactDistributionItem } from "@/api/model";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ImpactChartProps {
  data: ImpactDistributionItem[];
}

export function ImpactChart({ data }: ImpactChartProps) {
  const formatted = data.map((d) => ({
    ...d,
    name: `P${d.impact} ${d.label}`,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Impact Distribution</CardTitle>
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
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                borderColor: "hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
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
