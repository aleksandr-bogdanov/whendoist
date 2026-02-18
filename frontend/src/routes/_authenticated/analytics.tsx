import { createFileRoute } from "@tanstack/react-router";
import { Activity, CheckCircle2, Clock, Flame, Loader2, Percent, Trophy } from "lucide-react";
import { useState } from "react";
import type { RecentCompletionItem } from "@/api/model";
import {
  useGetAnalyticsApiV1AnalyticsGet,
  useGetRecentCompletionsApiV1AnalyticsRecentCompletionsGet,
} from "@/api/queries/analytics/analytics";
import { DailyChart } from "@/components/analytics/daily-chart";
import { DayOfWeekChart } from "@/components/analytics/day-of-week-chart";
import { DomainBreakdown } from "@/components/analytics/domain-breakdown";
import { Heatmap } from "@/components/analytics/heatmap";
import { ImpactChart } from "@/components/analytics/impact-chart";
import { RecurringList } from "@/components/analytics/recurring-list";
import { StatCard } from "@/components/analytics/stat-card";
import { VelocityChart } from "@/components/analytics/velocity-chart";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

export const Route = createFileRoute("/_authenticated/analytics")({
  component: AnalyticsPage,
});

const RANGE_OPTIONS = [
  { label: "7d", value: 7 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
] as const;

function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useGetAnalyticsApiV1AnalyticsGet({ days });

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-muted-foreground">Failed to load analytics</p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Analytics</h1>
          <div className="flex gap-1 rounded-lg border p-0.5">
            {RANGE_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant={days === opt.value ? "default" : "ghost"}
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={() => setDays(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard title="Completed" value={data.total_completed} icon={CheckCircle2} />
          <StatCard title="Completion Rate" value={`${data.completion_rate}%`} icon={Percent} />
          <StatCard
            title="Current Streak"
            value={`${data.streaks.current}d`}
            subtitle={`Longest: ${data.streaks.longest}d`}
            icon={Flame}
          />
          <StatCard
            title="This Week"
            value={data.week_comparison.this_week}
            icon={data.week_comparison.change_pct >= 0 ? Trophy : Activity}
            trend={{
              value: data.week_comparison.change_pct,
              label: "vs last week",
            }}
          />
        </div>

        {/* Daily completions */}
        <DailyChart data={data.daily_completions} />

        {/* Two-column layout */}
        <div className="grid gap-6 sm:grid-cols-2">
          <DomainBreakdown data={data.by_domain} />
          <DayOfWeekChart data={data.by_day_of_week} />
        </div>

        {/* Heatmap */}
        <Heatmap data={data.heatmap_data} />

        {/* Two-column layout */}
        <div className="grid gap-6 sm:grid-cols-2">
          <ImpactChart data={data.impact_distribution} />
          <RecurringList data={data.recurring_stats} />
        </div>

        {/* Recent completions + Velocity */}
        <div className="grid gap-6 sm:grid-cols-2">
          <RecentCompletions />
          <VelocityChart data={data.velocity_data} />
        </div>

        {/* Aging stats */}
        <AgingStats
          buckets={data.aging_stats.buckets}
          avgDays={data.aging_stats.avg_days}
          medianDays={data.aging_stats.median_days}
        />
      </div>
    </ScrollArea>
  );
}

function AgingStats({
  buckets,
  avgDays,
  medianDays,
}: {
  buckets: { same_day: number; within_week: number; within_month: number; over_month: number };
  avgDays: number;
  medianDays: number;
}) {
  const total = buckets.same_day + buckets.within_week + buckets.within_month + buckets.over_month;
  if (total === 0) return null;

  const segments = [
    { label: "Same day", count: buckets.same_day, color: "bg-green-500" },
    { label: "Within week", count: buckets.within_week, color: "bg-blue-500" },
    { label: "Within month", count: buckets.within_month, color: "bg-yellow-500" },
    { label: "Over month", count: buckets.over_month, color: "bg-red-500" },
  ];

  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
      <h3 className="font-semibold">Resolution Time</h3>
      {/* Stacked bar */}
      <div className="flex h-4 overflow-hidden rounded-full">
        {segments.map(
          (s) =>
            s.count > 0 && (
              <div
                key={s.label}
                className={`${s.color} transition-all`}
                style={{ width: `${(s.count / total) * 100}%` }}
              />
            ),
        )}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <div className={`h-2 w-2 rounded-full ${s.color}`} />
            <span>
              {s.label}: {s.count}
            </span>
          </div>
        ))}
      </div>
      {/* Averages */}
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
  );
}

function RecentCompletions() {
  const { data, isLoading } = useGetRecentCompletionsApiV1AnalyticsRecentCompletionsGet({
    limit: 20,
  });

  const items = (data ?? []) as RecentCompletionItem[];

  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm space-y-3">
      <h3 className="font-semibold flex items-center gap-2">
        <Clock className="h-4 w-4 text-muted-foreground" />
        Recent Completions
      </h3>
      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No recent completions</p>
      ) : (
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {items.map((item) => (
            <div key={`${item.id}-${item.is_instance}`} className="flex items-center gap-2 py-1">
              <span className="text-sm flex-shrink-0">{item.domain_icon || "📁"}</span>
              <span className="text-sm truncate flex-1">{item.title}</span>
              <span className="text-[11px] text-muted-foreground flex-shrink-0">
                {item.completed_at_display}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
