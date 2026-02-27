import { createLazyFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Drawer } from "vaul";
import { cn } from "@/lib/utils";

export const Route = createLazyFileRoute("/_authenticated/test-dropdown")({
  component: TestDropdownPage,
});

/* ------------------------------------------------------------------ */
/*  Fake data                                                          */
/* ------------------------------------------------------------------ */

const FAKE_PARENTS = [
  { id: 1, title: "Build landing page", icon: "🎨" },
  { id: 2, title: "Fix auth bugs", icon: "🔐" },
  { id: 3, title: "Write API docs", icon: "📝" },
  { id: 4, title: "Deploy to prod", icon: "🚀" },
  { id: 5, title: "Refactor database layer", icon: "🗄️" },
  { id: 6, title: "Design new icons", icon: "✨" },
];

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

function TestDropdownPage() {
  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto pb-safe">
      <h1 className="text-lg font-bold">Dropdown in Drawer — Test Approaches</h1>
      <p className="text-sm text-muted-foreground">
        Tap each to open a drawer. Try selecting a parent task. The goal: selection sticks, drawer
        stays open.
      </p>

      <ApproachCard
        label="A"
        title="Nested Drawer"
        desc="Parent picker opens as a nested bottom sheet (like the calendar)"
        Component={ApproachNestedDrawer}
      />
      <ApproachCard
        label="B"
        title="onOpenChange guard"
        desc="Portal to body, suppress drawer close via onOpenChange when dropdown is open"
        Component={ApproachOnOpenChangeGuard}
      />
      <ApproachCard
        label="C"
        title="onPointerDownOutside (current)"
        desc="Portal inside Content + onPointerDownOutside e.preventDefault()"
        Component={ApproachPointerDownOutside}
      />
      <ApproachCard
        label="D"
        title="Inline list (no dropdown)"
        desc="Scrollable list of parent tasks directly in the drawer body"
        Component={ApproachInlineList}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared card wrapper                                                */
/* ------------------------------------------------------------------ */

function ApproachCard({
  label,
  title,
  desc,
  Component,
}: {
  label: string;
  title: string;
  desc: string;
  Component: React.ComponentType;
}) {
  return (
    <div className="rounded-xl border p-4 space-y-2">
      <div className="flex items-center gap-2">
        <span className="bg-primary text-primary-foreground text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
          {label}
        </span>
        <span className="font-semibold text-sm">{title}</span>
      </div>
      <p className="text-xs text-muted-foreground">{desc}</p>
      <Component />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Result display                                                     */
/* ------------------------------------------------------------------ */

function ResultBadge({ selected }: { selected: string | null }) {
  return (
    <div className="text-xs mt-2">
      Selected: <span className="font-semibold">{selected ?? "None"}</span>
    </div>
  );
}

/* ================================================================== */
/*  APPROACH A — Nested Drawer                                         */
/* ================================================================== */

function ApproachNestedDrawer() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        className="w-full rounded-lg bg-secondary px-3 py-2 text-sm font-medium"
        onClick={() => setDrawerOpen(true)}
      >
        Open Drawer A
      </button>
      <ResultBadge selected={selected} />

      <Drawer.Root open={drawerOpen} onOpenChange={setDrawerOpen} repositionInputs={false}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-2xl bg-background border-t max-h-[85vh] max-w-lg mx-auto">
            <div className="mx-auto mt-3 mb-1 h-1.5 w-12 rounded-full bg-muted-foreground/20" />
            <Drawer.Title className="px-4 font-semibold">Approach A: Nested Drawer</Drawer.Title>

            <div className="px-4 py-3 space-y-3">
              <div className="text-sm text-muted-foreground">
                Parent: <span className="font-medium text-foreground">{selected ?? "None"}</span>
              </div>
              <button
                type="button"
                className="w-full rounded-lg bg-secondary px-3 py-2 text-sm font-medium"
                onClick={() => setPickerOpen(true)}
              >
                Pick parent task...
              </button>
            </div>

            <div className="border-t px-4 py-3 pb-safe">
              <button
                type="button"
                className="w-full rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-semibold"
                onClick={() => setDrawerOpen(false)}
              >
                Done
              </button>
            </div>

            {/* Nested drawer for parent picker */}
            <Drawer.NestedRoot open={pickerOpen} onOpenChange={setPickerOpen}>
              <Drawer.Portal>
                <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
                <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-background border-t max-w-lg mx-auto">
                  <div className="mx-auto mt-3 mb-2 h-1.5 w-12 rounded-full bg-muted-foreground/20" />
                  <Drawer.Title className="px-4 text-sm font-semibold mb-2">
                    Select parent task
                  </Drawer.Title>
                  <div className="px-2 pb-8 space-y-1">
                    <button
                      type="button"
                      className={cn(
                        "w-full px-3 py-2.5 text-left text-sm rounded-lg",
                        selected === null && "bg-accent font-medium",
                      )}
                      onClick={() => {
                        setSelected(null);
                        setPickerOpen(false);
                      }}
                    >
                      None (top-level)
                    </button>
                    {FAKE_PARENTS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={cn(
                          "w-full px-3 py-2.5 text-left text-sm rounded-lg flex items-center gap-2",
                          selected === p.title && "bg-accent font-medium",
                        )}
                        onClick={() => {
                          setSelected(p.title);
                          setPickerOpen(false);
                        }}
                      >
                        <span>{p.icon}</span>
                        <span>{p.title}</span>
                      </button>
                    ))}
                  </div>
                </Drawer.Content>
              </Drawer.Portal>
            </Drawer.NestedRoot>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
}

/* ================================================================== */
/*  APPROACH B — onOpenChange guard                                    */
/* ================================================================== */

function ApproachOnOpenChangeGuard() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const dropdownOpenRef = useRef(false);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open && dropdownOpenRef.current) {
      // Suppress drawer close — the tap was on the dropdown
      return;
    }
    setDrawerOpen(open);
  }, []);

  return (
    <>
      <button
        type="button"
        className="w-full rounded-lg bg-secondary px-3 py-2 text-sm font-medium"
        onClick={() => setDrawerOpen(true)}
      >
        Open Drawer B
      </button>
      <ResultBadge selected={selected} />

      <Drawer.Root open={drawerOpen} onOpenChange={handleOpenChange} repositionInputs={false}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-2xl bg-background border-t max-h-[85vh] max-w-lg mx-auto">
            <div className="mx-auto mt-3 mb-1 h-1.5 w-12 rounded-full bg-muted-foreground/20" />
            <Drawer.Title className="px-4 font-semibold">
              Approach B: onOpenChange guard
            </Drawer.Title>

            <div className="px-4 py-3 space-y-3">
              <PortaledDropdown
                selected={selected}
                onSelect={setSelected}
                onOpenChange={(open) => {
                  dropdownOpenRef.current = open;
                }}
                portalTarget={null}
              />
            </div>

            <div className="border-t px-4 py-3 pb-safe">
              <button
                type="button"
                className="w-full rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-semibold"
                onClick={() => setDrawerOpen(false)}
              >
                Done
              </button>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
}

/* ================================================================== */
/*  APPROACH C — onPointerDownOutside (current implementation)         */
/* ================================================================== */

function ApproachPointerDownOutside() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [portalEl, setPortalEl] = useState<HTMLDivElement | null>(null);

  return (
    <>
      <button
        type="button"
        className="w-full rounded-lg bg-secondary px-3 py-2 text-sm font-medium"
        onClick={() => setDrawerOpen(true)}
      >
        Open Drawer C
      </button>
      <ResultBadge selected={selected} />

      <Drawer.Root open={drawerOpen} onOpenChange={setDrawerOpen} repositionInputs={false}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
          <Drawer.Content
            className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-2xl bg-background border-t max-h-[85vh] max-w-lg mx-auto"
            onPointerDownOutside={(e) => {
              const target = (e as unknown as CustomEvent<{ originalEvent: PointerEvent }>).detail
                ?.originalEvent?.target as HTMLElement | null;
              if (target?.closest?.("[data-vaul-no-drag]")) {
                e.preventDefault();
              }
            }}
            onInteractOutside={(e) => {
              const target = (e as unknown as CustomEvent<{ originalEvent: Event }>).detail
                ?.originalEvent?.target as HTMLElement | null;
              if (target?.closest?.("[data-vaul-no-drag]")) {
                e.preventDefault();
              }
            }}
          >
            <div className="mx-auto mt-3 mb-1 h-1.5 w-12 rounded-full bg-muted-foreground/20" />
            <Drawer.Title className="px-4 font-semibold">
              Approach C: onPointerDownOutside
            </Drawer.Title>

            <div className="px-4 py-3 space-y-3">
              <PortaledDropdown
                selected={selected}
                onSelect={setSelected}
                portalTarget={portalEl}
              />
            </div>

            <div className="border-t px-4 py-3 pb-safe">
              <button
                type="button"
                className="w-full rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-semibold"
                onClick={() => setDrawerOpen(false)}
              >
                Done
              </button>
            </div>

            {/* Portal target inside Drawer.Content */}
            <div ref={setPortalEl} />
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
}

/* ================================================================== */
/*  APPROACH D — Inline list (no dropdown at all)                      */
/* ================================================================== */

function ApproachInlineList() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        className="w-full rounded-lg bg-secondary px-3 py-2 text-sm font-medium"
        onClick={() => setDrawerOpen(true)}
      >
        Open Drawer D
      </button>
      <ResultBadge selected={selected} />

      <Drawer.Root open={drawerOpen} onOpenChange={setDrawerOpen} repositionInputs={false}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-2xl bg-background border-t max-h-[85vh] max-w-lg mx-auto">
            <div className="mx-auto mt-3 mb-1 h-1.5 w-12 rounded-full bg-muted-foreground/20" />
            <Drawer.Title className="px-4 font-semibold">Approach D: Inline list</Drawer.Title>

            <div className="overflow-y-auto px-4 py-3 space-y-1">
              <div className="text-xs text-muted-foreground mb-1">Select parent task:</div>
              <button
                type="button"
                className={cn(
                  "w-full px-3 py-2 text-left text-sm rounded-lg transition-colors",
                  selected === null ? "bg-primary/10 text-primary font-medium" : "bg-secondary",
                )}
                onClick={() => setSelected(null)}
              >
                None (top-level)
              </button>
              {FAKE_PARENTS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={cn(
                    "w-full px-3 py-2 text-left text-sm rounded-lg flex items-center gap-2 transition-colors",
                    selected === p.title
                      ? "bg-primary/10 text-primary font-medium"
                      : "bg-secondary",
                  )}
                  onClick={() => setSelected(p.title)}
                >
                  <span>{p.icon}</span>
                  <span>{p.title}</span>
                </button>
              ))}
            </div>

            <div className="border-t px-4 py-3 pb-safe">
              <button
                type="button"
                className="w-full rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-semibold"
                onClick={() => setDrawerOpen(false)}
              >
                Done
              </button>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
}

/* ================================================================== */
/*  Shared: PortaledDropdown (used by approaches B and C)              */
/* ================================================================== */

function PortaledDropdown({
  selected,
  onSelect,
  onOpenChange,
  portalTarget,
}: {
  selected: string | null;
  onSelect: (title: string | null) => void;
  onOpenChange?: (open: boolean) => void;
  portalTarget?: HTMLElement | null;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});

  const handleOpen = useCallback(
    (next: boolean) => {
      setOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  const handleSelect = (title: string | null) => {
    onSelect(title);
    handleOpen(false);
  };

  // Position dropdown below trigger
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setStyle({
      position: "fixed",
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
    });
  }, [open]);

  // Close on tap outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(t) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(t)
      ) {
        handleOpen(false);
      }
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [open, handleOpen]);

  const dropdown = (
    <div
      ref={dropdownRef}
      data-vaul-no-drag
      className="rounded-md border bg-popover text-popover-foreground shadow-md overflow-hidden"
      style={style}
      onTouchMove={(e) => e.stopPropagation()}
    >
      <div
        className="max-h-48 overflow-y-auto py-1"
        style={{ touchAction: "pan-y", overscrollBehaviorY: "contain" }}
      >
        <button
          type="button"
          className={cn(
            "w-full px-3 py-2 text-left text-sm",
            selected === null && "bg-accent font-medium",
          )}
          onClick={() => handleSelect(null)}
        >
          None (top-level)
        </button>
        <div className="h-px bg-border mx-2 my-1" />
        {FAKE_PARENTS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={cn(
              "w-full px-3 py-2 text-left text-sm flex items-center gap-2",
              selected === p.title && "bg-accent font-medium",
            )}
            onClick={() => handleSelect(p.title)}
          >
            <span>{p.icon}</span>
            <span>{p.title}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">Parent task:</div>
      <button
        ref={triggerRef}
        type="button"
        className="w-full rounded-lg bg-secondary px-3 py-2 text-sm font-medium text-left flex items-center justify-between"
        onClick={() => handleOpen(!open)}
      >
        <span>{selected ?? "None"}</span>
        <span className={cn("text-xs opacity-50 transition-transform", open && "rotate-180")}>
          ▼
        </span>
      </button>
      {open && createPortal(dropdown, portalTarget ?? document.body)}
    </div>
  );
}
