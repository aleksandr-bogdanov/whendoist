import { Calendar } from "lucide-react";
import type { PositionedItem } from "@/lib/calendar-utils";

interface CalendarEventProps {
  item: PositionedItem;
  summary: string;
  timeLabel: string;
  backgroundColor?: string;
}

export function CalendarEventCard({
  item,
  summary,
  timeLabel,
  backgroundColor,
}: CalendarEventProps) {
  const width = `${100 / item.totalColumns}%`;
  const left = `${(item.column / item.totalColumns) * 100}%`;

  return (
    <div
      className="absolute rounded-md px-1.5 py-0.5 overflow-hidden border border-transparent text-xs cursor-default"
      style={{
        top: `${item.top}px`,
        height: `${Math.max(item.height, 18)}px`,
        width,
        left,
        backgroundColor: backgroundColor ?? "hsl(var(--muted))",
        color: backgroundColor ? "#fff" : undefined,
        opacity: 0.9,
      }}
      title={`${summary}\n${timeLabel}`}
    >
      <div className="flex items-center gap-1 truncate">
        <Calendar className="h-3 w-3 flex-shrink-0 opacity-60" />
        <span className="truncate font-medium">{summary}</span>
      </div>
      {item.height > 30 && <div className="truncate opacity-70 text-[10px]">{timeLabel}</div>}
    </div>
  );
}
