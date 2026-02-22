import { Link, useRouterState } from "@tanstack/react-router";
import { LogOut, Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";

const navTabs = [
  { to: "/thoughts", label: "THOUGHTS" },
  { to: "/dashboard", label: "TASKS" },
  { to: "/analytics", label: "ANALYTICS" },
  { to: "/settings", label: "SETTINGS" },
] as const;

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
}

export function Header({ userName: _userName, userEmail: _userEmail }: HeaderProps) {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  const ThemeIcon = themeIcons[theme];

  return (
    <header className="relative flex flex-col backdrop-blur-md bg-background/85">
      {/* iOS PWA: notch spacer — background fills notch area, content below it */}
      <div className="pt-safe" />

      {/* Content row */}
      <div className="relative flex h-14 items-center px-5 md:px-6 md:h-20">
        {/* Gradient bar at bottom of content row */}
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#167BFF] via-[#6D5EF6] to-[#A020C0] opacity-35" />

        {/* W Icon */}
        <Link to="/dashboard" className="flex items-center" aria-label="Home">
          <WIcon className="h-[28px] w-[30px]" />
        </Link>

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
        <div className="ml-auto md:ml-3 flex items-center gap-1">
          <button
            type="button"
            onClick={() => setTheme(themeCycle[theme])}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors"
            title={`Theme: ${theme}`}
          >
            <ThemeIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              window.location.href = "/auth/logout";
            }}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors"
            title="Logout"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
