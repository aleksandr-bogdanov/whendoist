import { Battery, BatteryFull, BatteryLow } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";

const ENERGY_LEVELS = [
  { level: 1 as const, label: "Zombie", icon: BatteryLow, color: "bg-orange-500" },
  { level: 2 as const, label: "Normal", icon: Battery, color: "bg-blue-500" },
  { level: 3 as const, label: "Focus", icon: BatteryFull, color: "bg-purple-500" },
] as const;

export function EnergySelector() {
  const { energyLevel, setEnergyLevel } = useUIStore();

  const activeIndex = ENERGY_LEVELS.findIndex((e) => e.level === energyLevel);
  const activeColor = ENERGY_LEVELS[activeIndex]?.color ?? "bg-blue-500";

  return (
    <div className="relative flex items-center rounded-full bg-muted p-0.5">
      {/* Sliding indicator */}
      <div
        className={cn(
          "absolute top-0.5 bottom-0.5 rounded-full transition-transform duration-200 ease-out",
          activeColor,
        )}
        style={{
          width: `${100 / ENERGY_LEVELS.length}%`,
          transform: `translateX(${activeIndex * 100}%)`,
        }}
      />

      {ENERGY_LEVELS.map(({ level, label, icon: Icon }) => {
        const isActive = energyLevel === level;
        return (
          <button
            key={level}
            type="button"
            className={cn(
              "relative z-10 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
              "[@media(pointer:coarse)]:before:absolute [@media(pointer:coarse)]:before:inset-[-4px] [@media(pointer:coarse)]:before:content-['']",
              isActive ? "text-white" : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setEnergyLevel(level)}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
