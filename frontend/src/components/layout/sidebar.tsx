import { Link, useRouterState } from "@tanstack/react-router";
import { BarChart3, LayoutDashboard, Lightbulb, Settings } from "lucide-react";
import type { DomainResponse } from "@/api/model";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/thoughts", label: "Thoughts", icon: Lightbulb },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

interface SidebarProps {
  domains?: DomainResponse[];
}

export function Sidebar({ domains }: SidebarProps) {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  return (
    <aside className="hidden md:flex md:w-60 md:flex-col border-r bg-sidebar">
      <ScrollArea className="flex-1 py-4">
        <nav className="flex flex-col gap-1 px-3">
          {navItems.map((item) => {
            const isActive = currentPath.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {domains && domains.length > 0 && (
          <>
            <Separator className="my-4" />
            <div className="px-3">
              <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                Domains
              </h3>
              <div className="flex flex-col gap-0.5">
                {domains
                  .filter((d) => !d.is_archived)
                  .sort((a, b) => a.position - b.position)
                  .map((domain) => (
                    <div
                      key={domain.id}
                      className="flex items-center gap-3 rounded-md px-3 py-1.5 text-sm text-sidebar-foreground/70"
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: domain.color ?? "#6D5EF6" }}
                      />
                      <span className="truncate">
                        {domain.icon ? `${domain.icon} ` : ""}
                        {domain.name}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </>
        )}
      </ScrollArea>
    </aside>
  );
}
