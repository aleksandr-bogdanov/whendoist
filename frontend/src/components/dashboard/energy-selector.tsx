import { Battery, BatteryFull, BatteryLow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";

const ENERGY_LEVELS = [
  { level: 1 as const, label: "Zombie", icon: BatteryLow },
  { level: 2 as const, label: "Normal", icon: Battery },
  { level: 3 as const, label: "Focus", icon: BatteryFull },
] as const;

export function EnergySelector() {
  const { energyLevel, setEnergyLevel } = useUIStore();

  return (
    <div className="flex items-center gap-1">
      {ENERGY_LEVELS.map(({ level, label, icon: Icon }) => {
        const isActive = energyLevel === level;
        return (
          <Button
            key={level}
            variant={isActive ? "default" : "outline"}
            size="sm"
            className={cn(
              "h-7 text-xs px-2 gap-1",
              isActive && level === 1 && "bg-orange-500 hover:bg-orange-600 border-orange-500",
              isActive && level === 2 && "bg-blue-500 hover:bg-blue-600 border-blue-500",
              isActive && level === 3 && "bg-purple-500 hover:bg-purple-600 border-purple-500",
            )}
            onClick={() => setEnergyLevel(level)}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </Button>
        );
      })}
    </div>
  );
}
