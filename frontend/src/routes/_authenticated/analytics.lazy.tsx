import { keepPreviousData } from "@tanstack/react-query";
import { createLazyFileRoute } from "@tanstack/react-router";
import { Activity, Clock, Flame, Loader2, Percent, Trophy } from "lucide-react";
import { animate } from "motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { Line, LineChart } from "recharts";
import type { DomainBreakdownItem, RecentCompletionItem, RecurringStatItem } from "@/api/model";
import {
  useGetAnalyticsApiV1AnalyticsGet,
  useGetRecentCompletionsApiV1AnalyticsRecentCompletionsGet,
} from "@/api/queries/analytics/analytics";
import { ActiveHoursChart } from "@/components/analytics/active-hours-chart";
import { DailyChart } from "@/components/analytics/daily-chart";
import { DayOfWeekChart } from "@/components/analytics/day-of-week-chart";
import { DomainBreakdown } from "@/components/analytics/domain-breakdown";
import { Heatmap } from "@/components/analytics/heatmap";
import { ImpactChart } from "@/components/analytics/impact-chart";
import { RecurringList } from "@/components/analytics/recurring-list";
import { ResolutionChart } from "@/components/analytics/resolution-chart";
import { StatCard } from "@/components/analytics/stat-card";
import { VelocityChart } from "@/components/analytics/velocity-chart";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
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

const PANEL_HOVER =
  "transition-all duration-200 hover:-translate-y-0.5 hover:[box-shadow:var(--shadow-raised)]";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <p className="uppercase tracking-[0.14em] font-bold text-[0.62rem] text-muted-foreground shrink-0">
        {children}
      </p>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function formatDateRange(days: number): string {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);
  const fmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

/** Downsample an array to ~maxPoints evenly-spaced entries */
function downsample<T>(arr: T[], maxPoints: number): T[] {
  if (arr.length <= maxPoints) return arr;
  const step = (arr.length - 1) / (maxPoints - 1);
  const result: T[] = [];
  for (let i = 0; i < maxPoints; i++) {
    result.push(arr[Math.round(i * step)]);
  }
  return result;
}

function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const { data, isLoading, isFetching } = useGetAnalyticsApiV1AnalyticsGet(
    { days },
    { query: { placeholderData: keepPreviousData } },
  );
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

  // Sparkline: show full range, downsampled to ~15 points
  const sparkData = downsample(data.daily_completions, 15);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      {/* Sticky header — Apple glass */}
      <div className="sticky top-0 z-10 backdrop-blur-2xl backdrop-saturate-[1.8] bg-white/60 dark:bg-[rgba(30,41,59,0.55)] border-b border-border/50">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-semibold">Analytics</h1>
              <p className="text-xs text-muted-foreground">{formatDateRange(days)}</p>
            </div>
            {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
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
      </div>

      <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 pb-nav-safe md:pb-6">
        {/* ── OVERVIEW ── */}
        <SectionLabel>Overview</SectionLabel>

        {/* Hero card */}
        <HeroCard
          completed={data.total_completed}
          pending={data.total_pending}
          sparkData={sparkData}
        />

        {/* Supporting stat cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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

        {/* ── PATTERNS ── */}
        <SectionLabel>Patterns</SectionLabel>

        {/* Daily + Domain */}
        <div className="grid gap-6 sm:grid-cols-[1.4fr_1fr]">
          <DailyChart data={data.daily_completions} className={PANEL_HOVER} />
          <DomainBreakdown data={decryptedDomains} className={PANEL_HOVER} />
        </div>

        {/* DayOfWeek + ActiveHours */}
        <div className="grid gap-6 sm:grid-cols-2">
          <DayOfWeekChart data={data.by_day_of_week} className={PANEL_HOVER} />
          <ActiveHoursChart data={data.by_hour} className={PANEL_HOVER} />
        </div>

        {/* Heatmap */}
        <Heatmap data={data.heatmap_data} className={PANEL_HOVER} />

        {/* Impact + Resolution */}
        <div className="grid gap-6 sm:grid-cols-2">
          <ImpactChart data={data.impact_distribution} className={PANEL_HOVER} />
          <ResolutionChart
            buckets={data.aging_stats.buckets}
            avgDays={data.aging_stats.avg_days}
            medianDays={data.aging_stats.median_days}
            className={PANEL_HOVER}
          />
        </div>

        {/* ── DETAILS ── */}
        <SectionLabel>Details</SectionLabel>

        {/* Velocity + Recent */}
        <div className="grid gap-6 sm:grid-cols-[1.4fr_1fr]">
          <VelocityChart data={data.velocity_data} className={PANEL_HOVER} />
          <RecentCompletions />
        </div>

        {/* Recurring */}
        <RecurringList data={decryptedRecurring} className={PANEL_HOVER} />
      </div>
    </div>
  );
}

function HeroCard({
  completed,
  pending,
  sparkData,
}: {
  completed: number;
  pending: number;
  sparkData: { count: number }[];
}) {
  const valueRef = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const el = valueRef.current;
    if (!el || hasAnimated.current || completed === 0) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    hasAnimated.current = true;
    animate(0, completed, {
      duration: 0.6,
      ease: "easeOut",
      onUpdate(v) {
        if (el) el.textContent = String(Math.round(v));
      },
    });
  }, [completed]);

  return (
    <div
      className="rounded-xl px-6 py-5 text-white"
      style={{
        background: "linear-gradient(135deg, #6D5EF6 0%, #8B7CF7 50%, #A78BFA 100%)",
      }}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium text-white/70 uppercase tracking-wide">
            Tasks Completed
          </p>
          <span ref={valueRef} className="text-4xl font-bold tabular-nums leading-tight">
            {completed}
          </span>
          <p className="text-sm text-white/70">{pending} pending</p>
        </div>
        {sparkData.length > 1 && (
          <div style={{ width: 120, height: 48 }}>
            <LineChart width={120} height={48} data={sparkData}>
              <Line
                type="monotone"
                dataKey="count"
                stroke="rgba(255,255,255,0.9)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </div>
        )}
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
    <div className={`rounded-xl border bg-card p-6 shadow-sm space-y-3 ${PANEL_HOVER}`}>
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
