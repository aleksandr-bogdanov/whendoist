import { createLazyFileRoute } from "@tanstack/react-router";
import { Activity, CheckCircle2, Clock, Flame, Loader2, Percent, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DomainBreakdownItem, RecentCompletionItem, RecurringStatItem } from "@/api/model";
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
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import { decrypt, looksEncrypted } from "@/lib/crypto";
import { useCryptoStore } from "@/stores/crypto-store";

export const Route = createLazyFileRoute("/_authenticated/analytics")({
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
  const { derivedKey, encryptionEnabled, isUnlocked } = useCryptoStore();
  const canDecrypt = encryptionEnabled && isUnlocked && derivedKey !== null;

  // Decrypt recurring task titles for encryption users
  const rawRecurring = data?.recurring_stats ?? [];
  const recurringFingerprint = useMemo(
    () => rawRecurring.map((r) => `${r.task_id}:${r.title?.slice(0, 8)}`).join(","),
    [rawRecurring],
  );
  const [decryptedRecurring, setDecryptedRecurring] = useState<RecurringStatItem[]>([]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: fingerprint tracks changes
  useEffect(() => {
    if (!canDecrypt || !derivedKey) {
      setDecryptedRecurring(rawRecurring);
      return;
    }
    let cancelled = false;
    Promise.all(
      rawRecurring.map(async (item) => {
        if (!looksEncrypted(item.title)) return item;
        try {
          return { ...item, title: await decrypt(derivedKey, item.title) };
        } catch {
          return item;
        }
      }),
    ).then((result) => {
      if (!cancelled) setDecryptedRecurring(result);
    });
    return () => {
      cancelled = true;
    };
  }, [recurringFingerprint, canDecrypt, derivedKey]);

  // Decrypt domain breakdown names for encryption users
  const rawDomainBreakdown = data?.by_domain ?? [];
  const domainFingerprint = useMemo(
    () => rawDomainBreakdown.map((d) => `${d.domain_id}:${d.domain_name?.slice(0, 8)}`).join(","),
    [rawDomainBreakdown],
  );
  const [decryptedDomains, setDecryptedDomains] = useState<DomainBreakdownItem[]>([]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: fingerprint tracks changes
  useEffect(() => {
    if (!canDecrypt || !derivedKey) {
      setDecryptedDomains(rawDomainBreakdown);
      return;
    }
    let cancelled = false;
    Promise.all(
      rawDomainBreakdown.map(async (item) => {
        if (!looksEncrypted(item.domain_name)) return item;
        try {
          return { ...item, domain_name: await decrypt(derivedKey, item.domain_name) };
        } catch {
          return item;
        }
      }),
    ).then((result) => {
      if (!cancelled) setDecryptedDomains(result);
    });
    return () => {
      cancelled = true;
    };
  }, [domainFingerprint, canDecrypt, derivedKey]);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        className="flex-1 p-8"
        illustration="/illustrations/empty-analytics.svg"
        title="Failed to load analytics"
        description="Try refreshing the page"
      />
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 pb-nav-safe md:pb-6">
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
          <DomainBreakdown data={decryptedDomains} />
          <DayOfWeekChart data={data.by_day_of_week} />
        </div>

        {/* Heatmap */}
        <Heatmap data={data.heatmap_data} />

        {/* Two-column layout */}
        <div className="grid gap-6 sm:grid-cols-2">
          <ImpactChart data={data.impact_distribution} />
          <RecurringList data={decryptedRecurring} />
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
  const { derivedKey, encryptionEnabled, isUnlocked } = useCryptoStore();
  const canDecrypt = encryptionEnabled && isUnlocked && derivedKey !== null;

  const rawItems = (data ?? []) as RecentCompletionItem[];
  const itemsFingerprint = useMemo(
    () => rawItems.map((i) => `${i.id}:${i.title?.slice(0, 8)}`).join(","),
    [rawItems],
  );
  const [items, setItems] = useState<RecentCompletionItem[]>([]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: fingerprint tracks changes
  useEffect(() => {
    if (!canDecrypt || !derivedKey) {
      setItems(rawItems);
      return;
    }
    let cancelled = false;
    Promise.all(
      rawItems.map(async (item) => {
        let { title, domain_name } = item;
        if (looksEncrypted(title)) {
          try {
            title = await decrypt(derivedKey, title);
          } catch {
            /* keep original */
          }
        }
        if (looksEncrypted(domain_name)) {
          try {
            domain_name = await decrypt(derivedKey, domain_name);
          } catch {
            /* keep original */
          }
        }
        return { ...item, title, domain_name };
      }),
    ).then((result) => {
      if (!cancelled) setItems(result);
    });
    return () => {
      cancelled = true;
    };
  }, [itemsFingerprint, canDecrypt, derivedKey]);

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
