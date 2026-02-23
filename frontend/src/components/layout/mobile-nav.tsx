import { Link, useRouterState } from "@tanstack/react-router";
import { BarChart3, LayoutDashboard, Lightbulb, Plus, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";

const leftNav = [
  { to: "/thoughts", label: "Thoughts", icon: Lightbulb },
  { to: "/dashboard", label: "Tasks", icon: LayoutDashboard },
] as const;

const rightNav = [
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function MobileNav() {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const setQuickAddOpen = useUIStore((s) => s.setQuickAddOpen);

  const renderLink = (item: (typeof leftNav)[number] | (typeof rightNav)[number]) => {
    const isActive = currentPath.startsWith(item.to);
    return (
      <Link
        key={item.to}
        to={item.to}
        className={cn(
          "flex flex-col items-center gap-0.5 px-3 py-1 text-xs transition-colors",
          isActive ? "text-brand" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <item.icon className="h-5 w-5" />
        <span>{item.label}</span>
      </Link>
    );
  };

  return (
    <nav
      className={cn(
        "fixed z-50 md:hidden",
        "left-[var(--nav-pill-mx)] right-[var(--nav-pill-mx)]",
        "bottom-[calc(env(safe-area-inset-bottom,0px)+var(--nav-pill-mb))]",
        "rounded-[var(--nav-pill-radius)]",
        // Apple Glass: saturate(180%) + heavy blur + low-opacity tint
        "backdrop-blur-2xl backdrop-saturate-[1.8]",
        "bg-white/60 dark:bg-[rgba(30,41,59,0.55)]",
        // Subtle inset ring instead of border
        "ring-1 ring-inset ring-white/25 dark:ring-white/[0.08]",
        "shadow-lg shadow-black/[0.06] dark:shadow-black/30",
      )}
    >
      <div className="flex h-[var(--nav-pill-height)] items-center justify-around">
        {leftNav.map(renderLink)}
        <button
          type="button"
          onClick={() => setQuickAddOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-cta)] transition-transform active:scale-95"
        >
          <Plus className="h-5 w-5" />
        </button>
        {rightNav.map(renderLink)}
      </div>
    </nav>
  );
}
