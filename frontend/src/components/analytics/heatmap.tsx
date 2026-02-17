import { useMemo } from "react";
import type { HeatmapItem } from "@/api/model";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface HeatmapProps {
  data: HeatmapItem[];
}

function getIntensity(count: number, max: number): string {
  if (count === 0) return "bg-muted";
  const ratio = count / max;
  if (ratio < 0.25) return "bg-primary/20";
  if (ratio < 0.5) return "bg-primary/40";
  if (ratio < 0.75) return "bg-primary/60";
  return "bg-primary";
}

export function Heatmap({ data }: HeatmapProps) {
  const { weeks, max } = useMemo(() => {
    const max = Math.max(...data.map((d) => d.y), 1);
    // Group into weeks (7 days each)
    const weeks: HeatmapItem[][] = [];
    for (let i = 0; i < data.length; i += 7) {
      weeks.push(data.slice(i, i + 7));
    }
    return { weeks, max };
  }, [data]);

  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <TooltipProvider delayDuration={100}>
          <div className="flex gap-0.5">
            {/* Day-of-week labels */}
            <div className="flex flex-col gap-0.5 mr-1 pt-0">
              {dayLabels.map((label) => (
                <div
                  key={label}
                  className="h-3 w-3 flex items-center justify-center text-[8px] text-muted-foreground"
                >
                  {label.charAt(0)}
                </div>
              ))}
            </div>
            {/* Heatmap grid */}
            {weeks.map((week) => (
              <div key={week[0]?.x} className="flex flex-col gap-0.5">
                {week.map((day) => (
                  <Tooltip key={day.x}>
                    <TooltipTrigger asChild>
                      <div className={`h-3 w-3 rounded-[2px] ${getIntensity(day.y, max)}`} />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {day.y} completions on{" "}
                      {new Date(`${day.x}T12:00:00`).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            ))}
          </div>
        </TooltipProvider>
        {/* Legend */}
        <div className="flex items-center gap-1 mt-3 text-[10px] text-muted-foreground">
          <span>Less</span>
          <div className="h-2.5 w-2.5 rounded-[2px] bg-muted" />
          <div className="h-2.5 w-2.5 rounded-[2px] bg-primary/20" />
          <div className="h-2.5 w-2.5 rounded-[2px] bg-primary/40" />
          <div className="h-2.5 w-2.5 rounded-[2px] bg-primary/60" />
          <div className="h-2.5 w-2.5 rounded-[2px] bg-primary" />
          <span>More</span>
        </div>
      </CardContent>
    </Card>
  );
}
