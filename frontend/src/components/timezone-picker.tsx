import Fuse from "fuse.js";
import { ChevronsUpDown, Search, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatTimezoneOffset } from "@/lib/timezone";

interface TimezonePickerProps {
  value: string | null | undefined;
  onChange: (tz: string | null) => void;
  /** Show a "None" / clear option */
  allowClear?: boolean;
  placeholder?: string;
}

interface TimezoneItem {
  tz: string;
  label: string;
  offset: string;
}

/** Get all IANA timezones with formatted labels and UTC offsets */
function getAllTimezones(): TimezoneItem[] {
  // Intl.supportedValuesOf is available in all modern browsers (Chrome 93+, FF 93+, Safari 15.4+)
  const zones =
    typeof Intl.supportedValuesOf === "function"
      ? (Intl.supportedValuesOf("timeZone") as string[])
      : FALLBACK_TIMEZONES;

  const now = new Date();
  return zones.map((tz) => ({
    tz,
    label: tz.replace(/_/g, " "),
    offset: formatTimezoneOffset(tz, now),
  }));
}

const FALLBACK_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires",
  "America/Mexico_City",
  "America/Phoenix",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Europe/Istanbul",
  "Europe/Warsaw",
  "Europe/Rome",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Seoul",
  "Asia/Bangkok",
  "Asia/Kathmandu",
  "Asia/Karachi",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
  "Africa/Cairo",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "UTC",
];

export function TimezonePicker({
  value,
  onChange,
  allowClear = false,
  placeholder = "Select timezone...",
}: TimezonePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const allTimezones = useMemo(() => getAllTimezones(), []);

  const fuse = useMemo(
    () =>
      new Fuse(allTimezones, {
        keys: ["label", "tz", "offset"],
        threshold: 0.4,
      }),
    [allTimezones],
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return allTimezones;
    return fuse.search(search).map((r) => r.item);
  }, [search, fuse, allTimezones]);

  const displayValue = useMemo(() => {
    if (!value) return null;
    const item = allTimezones.find((t) => t.tz === value);
    return item ? `${item.label} (${item.offset})` : value.replace(/_/g, " ");
  }, [value, allTimezones]);

  const handleSelect = useCallback(
    (tz: string | null) => {
      onChange(tz);
      setOpen(false);
      setSearch("");
    },
    [onChange],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between font-normal text-sm h-9">
          <span className={displayValue ? "" : "text-muted-foreground"}>
            {displayValue ?? placeholder}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 flex-shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="flex items-center border-b px-3 py-2 gap-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <Input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search timezones..."
            className="h-7 border-0 p-0 focus-visible:ring-0 text-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <ScrollArea className="h-[280px]">
          <div className="p-1">
            {allowClear && (
              <button
                type="button"
                className="w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent text-muted-foreground italic"
                onClick={() => handleSelect(null)}
              >
                None
              </button>
            )}
            {filtered.length === 0 && (
              <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                No timezones found
              </div>
            )}
            {filtered.map((item) => (
              <button
                type="button"
                key={item.tz}
                className={`w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent flex justify-between items-center gap-2 ${
                  item.tz === value ? "bg-accent font-medium" : ""
                }`}
                onClick={() => handleSelect(item.tz)}
              >
                <span className="truncate">{item.label}</span>
                <span className="text-xs text-muted-foreground flex-shrink-0">{item.offset}</span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
