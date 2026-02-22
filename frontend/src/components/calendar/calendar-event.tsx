import { Calendar, ExternalLink } from "lucide-react";
import type { PositionedItem } from "@/lib/calendar-utils";

interface CalendarEventProps {
  item: PositionedItem;
  summary: string;
  timeLabel: string;
  htmlLink?: string | null;
  backgroundColor?: string;
  dimmed?: boolean;
}

export function CalendarEventCard({
  item,
  summary,
  timeLabel,
  htmlLink,
  backgroundColor,
  dimmed,
}: CalendarEventProps) {
  const width = `${100 / item.totalColumns}%`;
  const left = `${(item.column / item.totalColumns) * 100}%`;
  const calColor = backgroundColor ?? "#6B7385";

  const handleClick = () => {
    if (htmlLink) {
      window.open(htmlLink, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`absolute rounded-md px-1.5 py-0.5 overflow-hidden text-xs cursor-pointer hover:shadow-sm transition-all text-left ${dimmed ? "opacity-50" : ""}`}
      style={{
        top: `${item.top}px`,
        height: `${Math.max(item.height, 18)}px`,
        width,
        left,
        borderLeft: `3px solid color-mix(in srgb, ${calColor} 40%, #cbd5e1)`,
        backgroundColor: `color-mix(in srgb, var(--card) 99%, ${calColor})`,
      }}
      title={`${summary}\n${timeLabel}\nClick to open in Google Calendar`}
    >
      <div className="flex items-center gap-1 truncate">
        <Calendar className="h-3 w-3 flex-shrink-0 text-muted-foreground/60" />
        <span className="truncate font-medium text-foreground/80">{summary}</span>
        <ExternalLink className="h-2.5 w-2.5 flex-shrink-0 text-muted-foreground/40" />
      </div>
      {item.height > 32 && (
        <div className="truncate text-muted-foreground text-[10px]">{timeLabel}</div>
      )}
    </button>
  );
}
