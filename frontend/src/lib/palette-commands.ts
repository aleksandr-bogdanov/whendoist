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
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import i18n from "@/lib/i18n";
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

/** Category display order — values are i18n keys */
export const COMMAND_CATEGORY_KEYS = [
  "palette.category.navigation",
  "palette.category.tasks",
  "palette.category.appearance",
  "palette.category.filters",
  "palette.category.data",
  "palette.category.help",
] as const;

/** Translated category names in display order. */
export const COMMAND_CATEGORIES = COMMAND_CATEGORY_KEYS.map((k) => i18n.t(k));

export function usePaletteCommands(): PaletteCommand[] {
  const { t } = useTranslation();
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
        label: t("palette.goToDashboard"),
        keywords: ["tasks", "home", "main"],
        category: t("palette.category.navigation"),
        icon: LayoutDashboard,
        handler: () => navigate({ to: "/dashboard" }),
      },
      {
        id: "nav-thoughts",
        label: t("palette.goToThoughts"),
        keywords: ["ideas", "brainstorm", "capture"],
        category: t("palette.category.navigation"),
        icon: Lightbulb,
        handler: () => navigate({ to: "/thoughts" }),
      },
      {
        id: "nav-analytics",
        label: t("palette.goToAnalytics"),
        keywords: ["stats", "statistics", "chart", "progress"],
        category: t("palette.category.navigation"),
        icon: BarChart3,
        handler: () => navigate({ to: "/analytics" }),
      },
      {
        id: "nav-settings",
        label: t("palette.goToSettings"),
        keywords: ["preferences", "config", "account"],
        category: t("palette.category.navigation"),
        icon: Settings,
        handler: () => navigate({ to: "/settings" }),
      },

      // ── Tasks ──
      {
        id: "task-new",
        label: t("palette.newTask"),
        keywords: ["create task", "add task", "quick add"],
        category: t("palette.category.tasks"),
        icon: Plus,
        shortcut: "Q",
        handler: () => {
          // Palette is now the unified creation surface
          if (!searchOpen) setSearchOpen(true);
        },
      },
      {
        id: "task-thought",
        label: t("palette.newThought"),
        keywords: ["capture thought", "idea", "brainstorm"],
        category: t("palette.category.tasks"),
        icon: Lightbulb,
        handler: () => {
          setSearchOpen(false);
          navigate({ to: "/thoughts" });
        },
      },
      {
        id: "task-plan",
        label: t("palette.planMyDay"),
        keywords: ["schedule", "auto schedule", "plan day", "auto plan"],
        category: t("palette.category.tasks"),
        icon: CalendarDays,
        handler: () => {
          setSearchOpen(false);
          navigate({ to: "/dashboard" });
          toast.info(t("calendar.dragHint"));
        },
      },

      // ── Appearance ──
      {
        id: "theme-light",
        label: t("palette.lightTheme"),
        keywords: ["light mode", "bright", "white"],
        category: t("palette.category.appearance"),
        icon: Sun,
        handler: () => setTheme("light"),
      },
      {
        id: "theme-dark",
        label: t("palette.darkTheme"),
        keywords: ["dark mode", "night", "black"],
        category: t("palette.category.appearance"),
        icon: Moon,
        handler: () => setTheme("dark"),
      },
      {
        id: "theme-system",
        label: t("palette.systemTheme"),
        keywords: ["auto theme", "os theme", "default theme"],
        category: t("palette.category.appearance"),
        icon: Monitor,
        handler: () => setTheme("system"),
      },

      // ── Filters ──
      {
        id: "energy-high",
        label: t("palette.energyHigh"),
        keywords: ["energy 3", "high energy", "max energy", "full energy"],
        category: t("palette.category.filters"),
        icon: Zap,
        handler: () => setEnergyLevel(3),
      },
      {
        id: "energy-medium",
        label: t("palette.energyMedium"),
        keywords: ["energy 2", "medium energy", "mid energy"],
        category: t("palette.category.filters"),
        icon: Zap,
        handler: () => setEnergyLevel(2),
      },
      {
        id: "energy-low",
        label: t("palette.energyLow"),
        keywords: ["energy 1", "low energy", "min energy", "tired"],
        category: t("palette.category.filters"),
        icon: Zap,
        handler: () => setEnergyLevel(1),
      },
      {
        id: "filter-scheduled",
        label: t("palette.toggleScheduled"),
        keywords: ["show scheduled", "hide scheduled", "scheduled filter"],
        category: t("palette.category.filters"),
        icon: Calendar,
        handler: () => toggleShowScheduled(),
      },
      {
        id: "filter-completed",
        label: t("palette.toggleCompleted"),
        keywords: ["show completed", "hide completed", "done filter"],
        category: t("palette.category.filters"),
        icon: CheckCircle,
        handler: () => toggleShowCompleted(),
      },
      {
        id: "sort-impact",
        label: t("palette.sortByImpact"),
        keywords: ["sort impact", "order impact", "priority sort"],
        category: t("palette.category.filters"),
        icon: ArrowUpDown,
        handler: () => toggleSort("impact"),
      },
      {
        id: "sort-duration",
        label: t("palette.sortByDuration"),
        keywords: ["sort duration", "order time", "time sort"],
        category: t("palette.category.filters"),
        icon: ArrowUpDown,
        handler: () => toggleSort("duration"),
      },
      {
        id: "sort-clarity",
        label: t("palette.sortByClarity"),
        keywords: ["sort clarity", "order clarity", "clarity sort"],
        category: t("palette.category.filters"),
        icon: ArrowUpDown,
        handler: () => toggleSort("clarity"),
      },

      // ── Data ──
      {
        id: "data-export",
        label: t("palette.exportBackup"),
        keywords: ["download backup", "export data", "save backup", "json"],
        category: t("palette.category.data"),
        icon: Download,
        handler: () => {
          window.open("/api/v1/backup/export", "_blank");
        },
      },
      {
        id: "data-snapshot",
        label: t("palette.createSnapshot"),
        keywords: ["manual snapshot", "backup snapshot", "save snapshot"],
        category: t("palette.category.data"),
        icon: HardDrive,
        handler: async () => {
          try {
            const { createManualSnapshotApiV1BackupSnapshotsPost } = await import(
              "@/api/queries/backup/backup"
            );
            await createManualSnapshotApiV1BackupSnapshotsPost();
            toast.success(t("settings.data.snapshotCreated"));
          } catch {
            toast.error(t("settings.data.failedToCreateSnapshot"));
          }
        },
      },
      {
        id: "data-sync-gcal",
        label: t("palette.syncGcal"),
        keywords: ["google calendar", "gcal sync", "calendar sync", "refresh calendar"],
        category: t("palette.category.data"),
        icon: RefreshCw,
        handler: async () => {
          try {
            const { fullSyncApiV1GcalSyncFullSyncPost } = await import(
              "@/api/queries/gcal-sync/gcal-sync"
            );
            await fullSyncApiV1GcalSyncFullSyncPost();
            toast.success(t("settings.gcalSync.fullSyncStarted"));
          } catch {
            toast.error(t("settings.gcalSync.failedToStartSync"));
          }
        },
      },

      // ── Help ──
      {
        id: "help-shortcuts",
        label: t("palette.keyboardShortcuts"),
        keywords: ["hotkeys", "keybindings", "keys", "help"],
        category: t("palette.category.help"),
        icon: Keyboard,
        shortcut: "?",
        handler: () => {
          setSearchOpen(false);
          setShortcutsHelpOpen(true);
        },
      },
    ],
    [
      t,
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
