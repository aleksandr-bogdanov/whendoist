import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";

const ENERGY_LEVELS = [
  { level: 1 as const, emoji: "\u{1F9DF}", color: "var(--autopilot-color)" },
  { level: 2 as const, emoji: "\u2615", color: "var(--normal-color)" },
  { level: 3 as const, emoji: "\u{1F9E0}", color: "var(--brainstorm-color)" },
] as const;

export function EnergySelector() {
  const { energyLevel, setEnergyLevel } = useUIStore();

  return (
    <div className="flex items-center gap-2">
      <span className="text-[0.5625rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
        ENERGY
      </span>
      <div className="flex items-center gap-0.5 rounded-md border bg-card px-1 py-0.5">
        {ENERGY_LEVELS.map(({ level, emoji, color }) => {
          const isActive = energyLevel === level;
          return (
            <button
              key={level}
              type="button"
              className={cn(
                "flex items-center justify-center w-[26px] h-[20px] rounded text-xs transition-all",
                "[@media(pointer:coarse)]:before:absolute [@media(pointer:coarse)]:before:inset-[-4px] [@media(pointer:coarse)]:before:content-[''] relative",
                isActive && "shadow-sm",
              )}
              style={
                isActive
                  ? {
                      backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
                      boxShadow: `0 0 0 1px ${color}33`,
                    }
                  : undefined
              }
              onClick={() => setEnergyLevel(level)}
            >
              <span className="text-[11px]">{emoji}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
