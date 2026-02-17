import { CheckCircle2 } from "lucide-react";
import type { PositionedItem } from "@/lib/calendar-utils";
import { IMPACT_COLORS } from "@/lib/task-utils";

interface ScheduledTaskCardProps {
  item: PositionedItem;
  title: string;
  impact: number;
  durationMinutes: number | null;
  timeLabel: string;
  onClick?: () => void;
}

export function ScheduledTaskCard({
  item,
  title,
  impact,
  durationMinutes,
  timeLabel,
  onClick,
}: ScheduledTaskCardProps) {
  const width = `${100 / item.totalColumns}%`;
  const left = `${(item.column / item.totalColumns) * 100}%`;
  const impactColor = IMPACT_COLORS[impact] ?? IMPACT_COLORS[4];

  return (
    <button
      type="button"
      className="absolute rounded-md px-1.5 py-0.5 overflow-hidden text-xs text-left cursor-pointer hover:ring-1 hover:ring-primary/50 transition-shadow"
      style={{
        top: `${item.top}px`,
        height: `${Math.max(item.height, 18)}px`,
        width,
        left,
        backgroundColor: "hsl(var(--primary) / 0.12)",
        borderLeft: `3px solid ${impactColor}`,
      }}
      onClick={onClick}
      title={`${title}\n${timeLabel}${durationMinutes ? ` (${durationMinutes}m)` : ""}`}
    >
      <div className="flex items-center gap-1 truncate">
        <CheckCircle2 className="h-3 w-3 flex-shrink-0 text-primary" />
        <span className="truncate font-medium">{title}</span>
      </div>
      {item.height > 30 && (
        <div className="truncate opacity-70 text-[10px]">
          {timeLabel}
          {durationMinutes ? ` - ${durationMinutes}m` : ""}
        </div>
      )}
    </button>
  );
}
