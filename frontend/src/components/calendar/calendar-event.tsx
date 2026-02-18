import { Calendar, ExternalLink } from "lucide-react";
import type { PositionedItem } from "@/lib/calendar-utils";

interface CalendarEventProps {
  item: PositionedItem;
  eventId: string;
  summary: string;
  timeLabel: string;
  backgroundColor?: string;
}

export function CalendarEventCard({
  item,
  eventId,
  summary,
  timeLabel,
  backgroundColor,
}: CalendarEventProps) {
  const width = `${100 / item.totalColumns}%`;
  const left = `${(item.column / item.totalColumns) * 100}%`;

  const handleClick = () => {
    // Google Calendar event URL from event ID
    const gcalUrl = `https://www.google.com/calendar/event?eid=${btoa(eventId)}`;
    window.open(gcalUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="absolute rounded-md px-1.5 py-0.5 overflow-hidden border border-transparent text-xs cursor-pointer hover:opacity-100 transition-opacity text-left"
      style={{
        top: `${item.top}px`,
        height: `${Math.max(item.height, 18)}px`,
        width,
        left,
        backgroundColor: backgroundColor ?? "hsl(var(--muted))",
        color: backgroundColor ? "#fff" : undefined,
        opacity: 0.9,
      }}
      title={`${summary}\n${timeLabel}\nClick to open in Google Calendar`}
    >
      <div className="flex items-center gap-1 truncate">
        <Calendar className="h-3 w-3 flex-shrink-0 opacity-60" />
        <span className="truncate font-medium">{summary}</span>
        <ExternalLink className="h-2.5 w-2.5 flex-shrink-0 opacity-40" />
      </div>
      {item.height > 30 && <div className="truncate opacity-70 text-[10px]">{timeLabel}</div>}
    </button>
  );
}
