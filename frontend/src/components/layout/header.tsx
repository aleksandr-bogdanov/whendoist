import { Link, useRouterState } from "@tanstack/react-router";
import { LogOut, Monitor, Moon, Search, Sun } from "lucide-react";
import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { DemoPill } from "@/components/demo-pill";
import { isTauri } from "@/hooks/use-device";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";

const themeIcons = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const;

const themeCycle: Record<string, "light" | "dark" | "system"> = {
  light: "dark",
  dark: "system",
  system: "light",
};

function WIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="38 40 180 160" width="24" height="21" className={className} aria-hidden="true">
      <rect
        x="48"
        y="40"
        width="28"
        height="160"
        rx="14"
        fill="#167BFF"
        transform="rotate(-8 62 120)"
      />
      <rect x="114" y="72" width="28" height="127.3" rx="14" fill="#6D5EF6" />
      <rect
        x="180"
        y="40"
        width="28"
        height="160"
        rx="14"
        fill="#A020C0"
        transform="rotate(8 194 120)"
      />
    </svg>
  );
}

interface HeaderProps {
  userName?: string;
  userEmail?: string;
  onDebugToggle?: () => void;
}

export function Header({ userName: _userName, userEmail: _userEmail, onDebugToggle }: HeaderProps) {
  const { t } = useTranslation();
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navTabs = useMemo(
    () => [
      { to: "/thoughts", label: t("nav.thoughts").toUpperCase() },
      { to: "/dashboard", label: t("nav.tasks").toUpperCase() },
      { to: "/analytics", label: t("nav.analytics").toUpperCase() },
      { to: "/settings", label: t("nav.settings").toUpperCase() },
    ],
    [t],
  );

  const ThemeIcon = themeIcons[theme];

  function handleLogoPress() {
    if (!onDebugToggle) return;
    longPressTimer.current = setTimeout(() => {
      onDebugToggle();
    }, 3000);
  }

  function handleLogoRelease() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  return (
    <header className="relative flex flex-col backdrop-blur-2xl backdrop-saturate-[1.8] bg-white/60 dark:bg-[rgba(30,41,59,0.55)]">
      {/* iOS PWA: notch spacer — background fills notch area, content below it */}
      <div className="pt-safe" />

      {/* Content row */}
      <div className="relative flex h-14 items-center px-5 md:px-6 md:h-20">
        {/* Gradient bar at bottom of content row */}
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#167BFF] via-[#6D5EF6] to-[#A020C0] opacity-35" />

        {/* W Icon — long press 3s to toggle layout debug overlay */}
        <Link
          to="/dashboard"
          className="flex items-center"
          aria-label={t("nav.home")}
          onTouchStart={handleLogoPress}
          onTouchEnd={handleLogoRelease}
          onMouseDown={handleLogoPress}
          onMouseUp={handleLogoRelease}
          onMouseLeave={handleLogoRelease}
        >
          <WIcon className="h-[28px] w-[30px]" />
        </Link>

        {/* Demo pill — mobile only, centered */}
        <div className="absolute left-1/2 -translate-x-1/2 md:hidden">
          <DemoPill />
        </div>

        {/* Navigation tabs — desktop only (mobile uses bottom nav) */}
        <nav className="ml-auto hidden md:flex items-center gap-1">
          {navTabs.map((tab) => {
            const isActive = currentPath.startsWith(tab.to);
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={cn(
                  "px-3 py-1.5 text-[0.6875rem] font-semibold tracking-[0.06em] rounded-md transition-colors",
                  isActive
                    ? "text-[#5B4CF0] bg-[rgba(109,94,246,0.08)]"
                    : "text-muted-foreground hover:text-foreground hover:bg-[rgba(109,94,246,0.04)]",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        {/* Right side actions */}
        <div className="ml-auto md:ml-3 flex items-center gap-0.5 md:gap-1">
          {/* Mobile: icon-only search button */}
          <button
            type="button"
            onClick={() => useUIStore.getState().setSearchOpen(true)}
            className="p-3 rounded-md text-muted-foreground hover:text-foreground active:text-foreground transition-colors md:hidden"
            title="Search (⌘K)"
          >
            <Search className="h-5 w-5" />
          </button>
          {/* Desktop: search bar with ⌘K badge */}
          <button
            type="button"
            onClick={() => useUIStore.getState().setSearchOpen(true)}
            className="hidden md:flex items-center gap-2 h-8 pl-2.5 pr-2 rounded-lg border border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:border-border transition-colors cursor-pointer w-[180px] lg:w-[220px]"
          >
            <Search className="h-3.5 w-3.5 shrink-0 opacity-60" />
            <span className="text-xs flex-1 text-left">{t("nav.searchPlaceholder")}</span>
            <kbd className="text-[10px] font-medium bg-background/80 border border-border/50 rounded px-1.5 py-0.5 leading-none">
              {navigator.platform?.includes("Mac") ? "⌘K" : "Ctrl+K"}
            </kbd>
          </button>
          <button
            type="button"
            onClick={() => setTheme(themeCycle[theme])}
            className="p-3 md:p-1.5 rounded-md text-muted-foreground hover:text-foreground active:text-foreground transition-colors"
            title={`Theme: ${theme}`}
          >
            <ThemeIcon className="h-5 w-5 md:h-3.5 md:w-3.5" />
          </button>
          <button
            type="button"
            onClick={async () => {
              if (isTauri) {
                const { clearAllCache } = await import("@/lib/tauri-cache");
                const { clearDeviceToken } = await import("@/lib/tauri-token-store");
                const { clearWidgetData } = await import("@/lib/tauri-widgets");
                await Promise.all([clearAllCache(), clearDeviceToken(), clearWidgetData()]);
              }
              window.location.href = "/auth/logout";
            }}
            className="p-3 md:p-1.5 rounded-md text-muted-foreground hover:text-foreground active:text-foreground transition-colors"
            title={t("nav.logout")}
          >
            <LogOut className="h-5 w-5 md:h-3.5 md:w-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
