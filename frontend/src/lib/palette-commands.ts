import { useNavigate } from "@tanstack/react-router";
import {
  ArrowUpDown,
  BarChart3,
  Calendar,
  CalendarDays,
  CheckCircle,
  Download,
  HardDrive,
  Keyboard,
  LayoutDashboard,
  Lightbulb,
  Monitor,
  Moon,
  Plus,
  RefreshCw,
  Settings,
  Sun,
  Zap,
} from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { useUIStore } from "@/stores/ui-store";

export interface PaletteCommand {
  id: string;
  label: string;
  keywords: string[];
  category: string;
  icon?: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  handler: () => void;
}

/** Category display order */
export const COMMAND_CATEGORIES = [
  "Navigation",
  "Tasks",
  "Appearance",
  "Filters",
  "Data",
  "Help",
] as const;

export function usePaletteCommands(): PaletteCommand[] {
  const navigate = useNavigate();
  const setTheme = useUIStore((s) => s.setTheme);
  const setEnergyLevel = useUIStore((s) => s.setEnergyLevel);
  const toggleShowScheduled = useUIStore((s) => s.toggleShowScheduled);
  const toggleShowCompleted = useUIStore((s) => s.toggleShowCompleted);
  const toggleSort = useUIStore((s) => s.toggleSort);
  const searchOpen = useUIStore((s) => s.searchOpen);
  const setSearchOpen = useUIStore((s) => s.setSearchOpen);
  const setShortcutsHelpOpen = useUIStore((s) => s.setShortcutsHelpOpen);

  return useMemo(
    () => [
      // ── Navigation ──
      {
        id: "nav-dashboard",
        label: "Go to Dashboard",
        keywords: ["tasks", "home", "main"],
        category: "Navigation",
        icon: LayoutDashboard,
        handler: () => navigate({ to: "/dashboard" }),
      },
      {
        id: "nav-thoughts",
        label: "Go to Thoughts",
        keywords: ["ideas", "brainstorm", "capture"],
        category: "Navigation",
        icon: Lightbulb,
        handler: () => navigate({ to: "/thoughts" }),
      },
      {
        id: "nav-analytics",
        label: "Go to Analytics",
        keywords: ["stats", "statistics", "chart", "progress"],
        category: "Navigation",
        icon: BarChart3,
        handler: () => navigate({ to: "/analytics" }),
      },
      {
        id: "nav-settings",
        label: "Go to Settings",
        keywords: ["preferences", "config", "account"],
        category: "Navigation",
        icon: Settings,
        handler: () => navigate({ to: "/settings" }),
      },

      // ── Tasks ──
      {
        id: "task-new",
        label: "New task",
        keywords: ["create task", "add task", "quick add"],
        category: "Tasks",
        icon: Plus,
        shortcut: "Q",
        handler: () => {
          // Palette is now the unified creation surface
          if (!searchOpen) setSearchOpen(true);
        },
      },
      {
        id: "task-thought",
        label: "New thought",
        keywords: ["capture thought", "idea", "brainstorm"],
        category: "Tasks",
        icon: Lightbulb,
        handler: () => {
          setSearchOpen(false);
          navigate({ to: "/thoughts" });
        },
      },
      {
        id: "task-plan",
        label: "Plan My Day",
        keywords: ["schedule", "auto schedule", "plan day", "auto plan"],
        category: "Tasks",
        icon: CalendarDays,
        handler: () => {
          setSearchOpen(false);
          navigate({ to: "/dashboard" });
          toast.info("Tap the Plan My Day button on the calendar to start");
        },
      },

      // ── Appearance ──
      {
        id: "theme-light",
        label: "Switch to light theme",
        keywords: ["light mode", "bright", "white"],
        category: "Appearance",
        icon: Sun,
        handler: () => setTheme("light"),
      },
      {
        id: "theme-dark",
        label: "Switch to dark theme",
        keywords: ["dark mode", "night", "black"],
        category: "Appearance",
        icon: Moon,
        handler: () => setTheme("dark"),
      },
      {
        id: "theme-system",
        label: "Switch to system theme",
        keywords: ["auto theme", "os theme", "default theme"],
        category: "Appearance",
        icon: Monitor,
        handler: () => setTheme("system"),
      },

      // ── Filters ──
      {
        id: "energy-high",
        label: "Set energy to High",
        keywords: ["energy 3", "high energy", "max energy", "full energy"],
        category: "Filters",
        icon: Zap,
        handler: () => setEnergyLevel(3),
      },
      {
        id: "energy-medium",
        label: "Set energy to Medium",
        keywords: ["energy 2", "medium energy", "mid energy"],
        category: "Filters",
        icon: Zap,
        handler: () => setEnergyLevel(2),
      },
      {
        id: "energy-low",
        label: "Set energy to Low",
        keywords: ["energy 1", "low energy", "min energy", "tired"],
        category: "Filters",
        icon: Zap,
        handler: () => setEnergyLevel(1),
      },
      {
        id: "filter-scheduled",
        label: "Toggle show scheduled",
        keywords: ["show scheduled", "hide scheduled", "scheduled filter"],
        category: "Filters",
        icon: Calendar,
        handler: () => toggleShowScheduled(),
      },
      {
        id: "filter-completed",
        label: "Toggle show completed",
        keywords: ["show completed", "hide completed", "done filter"],
        category: "Filters",
        icon: CheckCircle,
        handler: () => toggleShowCompleted(),
      },
      {
        id: "sort-impact",
        label: "Sort by impact",
        keywords: ["sort impact", "order impact", "priority sort"],
        category: "Filters",
        icon: ArrowUpDown,
        handler: () => toggleSort("impact"),
      },
      {
        id: "sort-duration",
        label: "Sort by duration",
        keywords: ["sort duration", "order time", "time sort"],
        category: "Filters",
        icon: ArrowUpDown,
        handler: () => toggleSort("duration"),
      },
      {
        id: "sort-clarity",
        label: "Sort by clarity",
        keywords: ["sort clarity", "order clarity", "clarity sort"],
        category: "Filters",
        icon: ArrowUpDown,
        handler: () => toggleSort("clarity"),
      },

      // ── Data ──
      {
        id: "data-export",
        label: "Export backup",
        keywords: ["download backup", "export data", "save backup", "json"],
        category: "Data",
        icon: Download,
        handler: () => {
          window.open("/api/v1/backup/export", "_blank");
        },
      },
      {
        id: "data-snapshot",
        label: "Create snapshot",
        keywords: ["manual snapshot", "backup snapshot", "save snapshot"],
        category: "Data",
        icon: HardDrive,
        handler: async () => {
          try {
            const { createManualSnapshotApiV1BackupSnapshotsPost } = await import(
              "@/api/queries/backup/backup"
            );
            await createManualSnapshotApiV1BackupSnapshotsPost();
            toast.success("Snapshot created");
          } catch {
            toast.error("Failed to create snapshot");
          }
        },
      },
      {
        id: "data-sync-gcal",
        label: "Sync Google Calendar",
        keywords: ["google calendar", "gcal sync", "calendar sync", "refresh calendar"],
        category: "Data",
        icon: RefreshCw,
        handler: async () => {
          try {
            const { fullSyncApiV1GcalSyncFullSyncPost } = await import(
              "@/api/queries/gcal-sync/gcal-sync"
            );
            await fullSyncApiV1GcalSyncFullSyncPost();
            toast.success("Google Calendar synced");
          } catch {
            toast.error("Failed to sync — is Google Calendar connected?");
          }
        },
      },

      // ── Help ──
      {
        id: "help-shortcuts",
        label: "Keyboard shortcuts",
        keywords: ["hotkeys", "keybindings", "keys", "help"],
        category: "Help",
        icon: Keyboard,
        shortcut: "?",
        handler: () => {
          setSearchOpen(false);
          setShortcutsHelpOpen(true);
        },
      },
    ],
    [
      navigate,
      setTheme,
      setEnergyLevel,
      toggleShowScheduled,
      toggleShowCompleted,
      toggleSort,
      searchOpen,
      setSearchOpen,
      setShortcutsHelpOpen,
    ],
  );
}
