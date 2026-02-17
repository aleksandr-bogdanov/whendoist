import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getRegisteredShortcuts } from "@/hooks/use-shortcuts";

interface ShortcutsHelpProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const KEY_LABELS: Record<string, string> = {
  Escape: "Esc",
  Enter: "Enter",
  " ": "Space",
  ArrowUp: "\u2191",
  ArrowDown: "\u2193",
  ArrowLeft: "\u2190",
  ArrowRight: "\u2192",
};

export function ShortcutsHelp({ open, onOpenChange }: ShortcutsHelpProps) {
  const grouped = useMemo(() => {
    const all = getRegisteredShortcuts();
    const map = new Map<string, { key: string; description: string }[]>();
    for (const s of all) {
      const cat = s.category;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push({
        key: s.key,
        description: s.description,
      });
    }
    return map;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- recalc when opened

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {[...grouped.entries()].map(([category, shortcuts]) => (
            <div key={category}>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {category}
              </h3>
              <div className="space-y-1">
                {shortcuts.map((s) => (
                  <div key={s.key} className="flex items-center justify-between py-1">
                    <span className="text-sm">{s.description}</span>
                    <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded border border-border bg-muted text-xs font-mono text-muted-foreground">
                      {KEY_LABELS[s.key] ?? s.key.toUpperCase()}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
