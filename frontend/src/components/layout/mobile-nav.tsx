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
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t backdrop-blur-md bg-background/80 md:hidden">
      <div className="flex h-14 items-center justify-around">
        {leftNav.map(renderLink)}
        <button
          type="button"
          onClick={() => setQuickAddOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md -mt-5 transition-transform active:scale-95"
        >
          <Plus className="h-5 w-5" />
        </button>
        {rightNav.map(renderLink)}
      </div>
    </nav>
  );
}
