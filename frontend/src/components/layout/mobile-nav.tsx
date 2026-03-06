import { Link, useRouterState } from "@tanstack/react-router";
import { BarChart3, LayoutDashboard, Lightbulb, Plus, Search, Settings } from "lucide-react";
import { isNativeTabBarAvailable } from "@/lib/tauri-native-tabbar";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";

const navItems = [
  { to: "/thoughts", label: "Thoughts", icon: Lightbulb },
  { to: "/dashboard", label: "Tasks", icon: LayoutDashboard },
  // Plus button rendered separately in center
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

/** Shared glass material — blur + tint + border. -webkit- prefix for WKWebView. */
const glass = cn(
  "[backdrop-filter:blur(25px)_saturate(1.5)] [-webkit-backdrop-filter:blur(25px)_saturate(1.5)]",
  "bg-white/75 dark:bg-neutral-900/70",
  "border border-black/[0.08] dark:border-white/[0.12]",
  "shadow-sm shadow-black/[0.04] dark:shadow-black/30",
);

export function MobileNav() {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const setSearchOpen = useUIStore((s) => s.setSearchOpen);

  // Native UITabBar replaces this component on iOS Tauri
  if (isNativeTabBarAvailable()) return null;

  return (
    <>
      {/* ── Fade-out gradient — content fades before reaching the bar ── */}
      <div
        className="fixed z-40 md:hidden inset-x-0 bottom-0 h-24 pointer-events-none"
        style={{
          background: "linear-gradient(to bottom, transparent, var(--background))",
          WebkitMaskImage: "linear-gradient(to bottom, transparent, black)",
          maskImage: "linear-gradient(to bottom, transparent, black)",
        }}
      />

      {/* ── Tab bar container ── */}
      <div className="fixed z-50 md:hidden left-[var(--nav-pill-mx)] right-[var(--nav-pill-mx)] bottom-[calc(var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px))+var(--nav-pill-mb))] flex items-end gap-2">
        {/* ── Main pill: 4 equal-width tabs + center plus ── */}
        <nav className={cn("flex-1 rounded-[var(--nav-pill-radius)]", glass)}>
          <div className="flex h-[var(--nav-pill-height)] items-stretch">
            {navItems.slice(0, 2).map((item) => (
              <NavLink key={item.to} item={item} currentPath={currentPath} />
            ))}

            {/* Center plus button — fixed width, vertically centered */}
            <div className="flex w-14 items-center justify-center shrink-0">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-background transition-transform active:scale-95"
              >
                <Plus className="h-5 w-5" strokeWidth={2.5} />
              </button>
            </div>

            {navItems.slice(2).map((item) => (
              <NavLink key={item.to} item={item} currentPath={currentPath} />
            ))}
          </div>
        </nav>

        {/* ── Search circle — separate element like Telegram ── */}
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className={cn(
            "flex h-[var(--nav-pill-height)] w-[var(--nav-pill-height)] shrink-0 items-center justify-center rounded-full",
            glass,
            "text-muted-foreground active:text-foreground transition-colors",
          )}
        >
          <Search className="h-[22px] w-[22px]" strokeWidth={2} />
        </button>
      </div>
    </>
  );
}

function NavLink({ item, currentPath }: { item: (typeof navItems)[number]; currentPath: string }) {
  const isActive = currentPath.startsWith(item.to);
  return (
    <Link
      to={item.to}
      className={cn(
        // flex-1 = all 4 tabs get identical width regardless of label length
        "relative flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
        isActive ? "text-brand" : "text-muted-foreground",
      )}
    >
      {/* Active indicator — same size on every tab because flex-1 makes them equal */}
      {isActive && (
        <div className="absolute inset-x-1.5 inset-y-1 rounded-2xl bg-foreground/[0.07] dark:bg-white/[0.12]" />
      )}
      <item.icon className="relative h-[22px] w-[22px]" strokeWidth={isActive ? 2.2 : 1.5} />
      <span className="relative leading-none">{item.label}</span>
    </Link>
  );
}
