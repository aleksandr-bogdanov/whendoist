import { Settings2 } from "lucide-react";
import { toast } from "sonner";
import {
  useGetPreferencesApiV1PreferencesGet,
  useUpdatePreferencesApiV1PreferencesPut,
} from "@/api/queries/preferences/preferences";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const RETENTION_OPTIONS = [
  { days: 1, label: "1d" },
  { days: 3, label: "3d" },
  { days: 7, label: "7d" },
];

export function SettingsPanel() {
  const { data: preferences } = useGetPreferencesApiV1PreferencesGet();
  const updatePrefs = useUpdatePreferencesApiV1PreferencesPut();

  const retentionDays = preferences?.completed_retention_days ?? 7;
  const hideRecurring = preferences?.hide_recurring_after_completion ?? false;

  const updatePref = (key: string, value: unknown) => {
    updatePrefs.mutate(
      { data: { [key]: value } as never },
      {
        onError: () => toast.error("Failed to save preference"),
      },
    );
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" title="Dashboard settings">
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="end">
        <div className="space-y-3">
          <div className="text-xs font-medium">Dashboard Settings</div>

          <Separator />

          {/* Retention days */}
          <div className="space-y-1.5">
            <Label className="text-xs">Keep completed visible for</Label>
            <div className="flex gap-1">
              {RETENTION_OPTIONS.map((opt) => (
                <Button
                  key={opt.days}
                  variant={retentionDays === opt.days ? "default" : "outline"}
                  size="sm"
                  className={cn("h-6 text-[11px] px-2 flex-1")}
                  onClick={() => updatePref("completed_retention_days", opt.days)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Hide recurring */}
          <div className="flex items-center justify-between">
            <Label className="text-xs" htmlFor="hide-recurring">
              Hide recurring after done
            </Label>
            <Switch
              id="hide-recurring"
              checked={hideRecurring}
              onCheckedChange={(v) => updatePref("hide_recurring_after_completion", v)}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
