import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { HeatmapItem } from "@/api/model";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface HeatmapProps {
  data: HeatmapItem[];
  className?: string;
}

function getIntensity(count: number, max: number): string {
  if (count === 0) return "bg-muted";
  const ratio = count / max;
  if (ratio < 0.25) return "bg-brand/20";
  if (ratio < 0.5) return "bg-brand/40";
  if (ratio < 0.75) return "bg-brand/60";
  return "bg-brand";
}

export function Heatmap({ data, className }: HeatmapProps) {
  const { t, i18n } = useTranslation();

  const { weeks, max } = useMemo(() => {
    const max = Math.max(...data.map((d) => d.y), 1);
    // Group into weeks (7 days each)
    const weeks: HeatmapItem[][] = [];
    for (let i = 0; i < data.length; i += 7) {
      weeks.push(data.slice(i, i + 7));
    }
    return { weeks, max };
  }, [data]);

  const dayLabels = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(i18n.language, { weekday: "short" });
    // Generate Mon–Sun labels using a known Monday (2024-01-01 is a Monday)
    return Array.from({ length: 7 }, (_, i) => formatter.format(new Date(2024, 0, 1 + i)));
  }, [i18n.language]);

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle>{t("analytics.heatmap.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto sm:overflow-visible">
          <TooltipProvider delayDuration={100}>
            <div className="flex gap-[3px] min-w-max">
              {/* Day-of-week labels */}
              <div className="flex flex-col gap-[3px] mr-1 pt-0">
                {dayLabels.map((label) => (
                  <div
                    key={label}
                    className="h-[14px] w-[14px] flex items-center justify-center text-[9px] text-muted-foreground"
                  >
                    {label.charAt(0)}
                  </div>
                ))}
              </div>
              {/* Heatmap grid */}
              {weeks.map((week) => (
                <div key={week[0]?.x} className="flex flex-col gap-[3px]">
                  {week.map((day) => (
                    <Tooltip key={day.x}>
                      <TooltipTrigger asChild>
                        <div
                          className={`h-[14px] w-[14px] rounded-[3px] ${getIntensity(day.y, max)}`}
                        />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        {t("analytics.heatmap.tooltip", {
                          count: day.y,
                          date: new Date(`${day.x}T12:00:00`).toLocaleDateString(i18n.language, {
                            month: "short",
                            day: "numeric",
                          }),
                        })}
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              ))}
            </div>
          </TooltipProvider>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-1 mt-3 text-[10px] text-muted-foreground">
          <span>{t("analytics.heatmap.less")}</span>
          <div className="h-2.5 w-2.5 rounded-[2px] bg-muted" />
          <div className="h-2.5 w-2.5 rounded-[2px] bg-brand/20" />
          <div className="h-2.5 w-2.5 rounded-[2px] bg-brand/40" />
          <div className="h-2.5 w-2.5 rounded-[2px] bg-brand/60" />
          <div className="h-2.5 w-2.5 rounded-[2px] bg-brand" />
          <span>{t("analytics.heatmap.more")}</span>
        </div>
      </CardContent>
    </Card>
  );
}
