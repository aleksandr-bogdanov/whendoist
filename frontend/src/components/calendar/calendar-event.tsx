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
  const calColor = backgroundColor ?? "#6B7385";

  const handleClick = () => {
    if (htmlLink) {
      window.open(htmlLink, "_blank", "noopener,noreferrer");
    }
  };

  // ── Style A: Outline — card bg, colored border all sides, thicker left accent ──
  if (cardStyle === "outline") {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`absolute rounded-md px-1.5 py-0.5 overflow-hidden text-xs cursor-pointer hover:shadow-sm transition-all text-left bg-card ${dimmed ? "opacity-50" : ""}`}
        style={{
          top: `${item.top}px`,
          height: `${Math.max(item.height, 18)}px`,
          width,
          left,
          border: `1.5px solid ${calColor}50`,
          borderLeftWidth: 3,
          borderLeftColor: `${calColor}90`,
        }}
        title={`${summary}\n${timeLabel}\nClick to open in Google Calendar`}
      >
        <div className="flex items-center gap-1 truncate">
          <Calendar className="h-3 w-3 flex-shrink-0 text-muted-foreground/60" />
          <span className="truncate font-medium text-foreground">{summary}</span>
          <ExternalLink className="h-2.5 w-2.5 flex-shrink-0 text-muted-foreground/40" />
        </div>
        {item.height > 32 && (
          <div className="truncate text-muted-foreground text-[10px]">{timeLabel}</div>
        )}
      </button>
    );
  }

  // ── Style B: Full-border box — subtle tint, border all sides, NO left accent ──
  if (cardStyle === "full-border") {
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
          border: `1px solid ${calColor}40`,
          backgroundColor: `${calColor}0A`,
        }}
        title={`${summary}\n${timeLabel}\nClick to open in Google Calendar`}
      >
        <div className="flex items-center gap-1 truncate">
          <Calendar className="h-3 w-3 flex-shrink-0 text-muted-foreground/60" />
          <span className="truncate font-medium text-foreground">{summary}</span>
          <ExternalLink className="h-2.5 w-2.5 flex-shrink-0 text-muted-foreground/40" />
        </div>
        {item.height > 32 && (
          <div className="truncate text-muted-foreground text-[10px]">{timeLabel}</div>
        )}
      </button>
    );
  }

  // ── Style C: Dashed left border — left accent but dashed, minimal tint ──
  if (cardStyle === "dashed") {
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
          borderLeft: `3px dashed ${calColor}70`,
          backgroundColor: `${calColor}08`,
        }}
        title={`${summary}\n${timeLabel}\nClick to open in Google Calendar`}
      >
        <div className="flex items-center gap-1 truncate">
          <Calendar className="h-3 w-3 flex-shrink-0 text-muted-foreground/60" />
          <span className="truncate font-medium text-foreground">{summary}</span>
          <ExternalLink className="h-2.5 w-2.5 flex-shrink-0 text-muted-foreground/40" />
        </div>
        {item.height > 32 && (
          <div className="truncate text-muted-foreground text-[10px]">{timeLabel}</div>
        )}
      </button>
    );
  }

  // ── Style D: Strip — top color stripe, compact, small radius, no left accent ──
  return (
    <button
      type="button"
      onClick={handleClick}
      className={`absolute rounded-sm px-1.5 py-0.5 overflow-hidden text-xs cursor-pointer hover:shadow-sm transition-all text-left ${dimmed ? "opacity-50" : ""}`}
      style={{
        top: `${item.top}px`,
        height: `${Math.max(item.height, 18)}px`,
        width,
        left,
        borderTop: `2px solid ${calColor}`,
        backgroundColor: `${calColor}0A`,
      }}
      title={`${summary}\n${timeLabel}\nClick to open in Google Calendar`}
    >
      <div className="flex items-center gap-1 truncate">
        <Calendar className="h-3 w-3 flex-shrink-0 text-muted-foreground/60" />
        <span className="truncate font-medium text-foreground">{summary}</span>
        <ExternalLink className="h-2.5 w-2.5 flex-shrink-0 text-muted-foreground/40" />
      </div>
      {item.height > 32 && (
        <div className="truncate text-muted-foreground text-[10px]">{timeLabel}</div>
      )}
    </button>
  );
}
