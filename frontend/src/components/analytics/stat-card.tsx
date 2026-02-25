import type { LucideIcon } from "lucide-react";
import { animate } from "motion";
import { useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { value: number; label: string };
}

function useAnimatedValue(value: string | number) {
  const ref = useRef<HTMLParagraphElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || hasAnimated.current) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    const str = String(value);
    const match = str.match(/^(-?\d+(?:\.\d+)?)(.*)/);
    if (!match) return;

    const target = Number.parseFloat(match[1]);
    const suffix = match[2];
    const isFloat = match[1].includes(".");

    hasAnimated.current = true;
    animate(0, target, {
      duration: 0.6,
      ease: "easeOut",
      onUpdate(v) {
        if (el) el.textContent = `${isFloat ? v.toFixed(1) : Math.round(v)}${suffix}`;
      },
    });
  }, [value]);

  return ref;
}

export function StatCard({ title, value, subtitle, icon: Icon, trend }: StatCardProps) {
  const valueRef = useAnimatedValue(value);

  return (
    <Card className="h-full py-4">
      <CardContent className="flex h-full items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/10">
          <Icon className="h-5 w-5 text-brand" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{title}</p>
          <p ref={valueRef} className="text-2xl font-bold tabular-nums">
            {value}
          </p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          {trend && (
            <p
              className={`text-xs font-medium ${trend.value > 0 ? "text-green-500" : trend.value < 0 ? "text-red-500" : "text-muted-foreground"}`}
            >
              {trend.value > 0 ? "+" : ""}
              {trend.value}% {trend.label}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
