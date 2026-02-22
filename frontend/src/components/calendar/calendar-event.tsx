import { Calendar, ExternalLink } from "lucide-react";
import type { PositionedItem } from "@/lib/calendar-utils";
import { useUIStore } from "@/stores/ui-store";

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
  const cardStyle = useUIStore((s) => s.cardStyle);
  const width = `${100 / item.totalColumns}%`;
  const left = `${(item.column / item.totalColumns) * 100}%`;

  const handleClick = () => {
    if (htmlLink) {
      window.open(htmlLink, "_blank", "noopener,noreferrer");
    }
  };

  // Style variations per card style approach
  const isDashed = cardStyle === "bordered";
  const hasTintBg = cardStyle === "all-colored" && backgroundColor;
  const isMuted = cardStyle === "colored" || cardStyle === "bordered";

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`absolute rounded-md px-1.5 py-0.5 overflow-hidden text-xs cursor-pointer hover:shadow-sm transition-all text-left border border-border/60 border-l-[3px] ${hasTintBg ? "" : "bg-card"}`}
      style={{
        top: `${item.top}px`,
        height: `${Math.max(item.height, 18)}px`,
        width,
        left,
        ...(backgroundColor && {
          borderLeftColor: backgroundColor,
          ...(isDashed && { borderLeftStyle: "dashed" }),
        }),
        ...(hasTintBg && { backgroundColor: `${backgroundColor}0F` }),
        opacity: dimmed ? 0.5 : isMuted ? 0.85 : 0.95,
      }}
      title={`${summary}\n${timeLabel}\nClick to open in Google Calendar`}
    >
      <div className="flex items-center gap-1 truncate">
        <Calendar className="h-3 w-3 flex-shrink-0 text-muted-foreground/60" />
        <span className={`truncate font-medium ${isMuted ? "text-muted-foreground" : ""}`}>
          {summary}
        </span>
        <ExternalLink className="h-2.5 w-2.5 flex-shrink-0 text-muted-foreground/40" />
      </div>
      {item.height > 32 && (
        <div className="truncate text-muted-foreground text-[10px]">{timeLabel}</div>
      )}
    </button>
  );
}
