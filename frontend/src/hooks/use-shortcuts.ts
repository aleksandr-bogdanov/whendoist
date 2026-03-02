import { useEffect, useRef } from "react";

interface ShortcutDef {
  key: string;
  description: string;
  category: string;
  handler: (e: KeyboardEvent) => void;
  /** Don't trigger when user is typing in an input/textarea */
  excludeInputs?: boolean;
  /** Don't show in help modal */
  showInHelp?: boolean;
  /** Prevent default browser behavior (default: true) */
  preventDefault?: boolean;
  /** Requires Cmd (Mac) or Ctrl (Windows/Linux) modifier */
  meta?: boolean;
  /** Display label for the help modal (e.g. "⌘K") — derived automatically if omitted */
  displayKey?: string;
}

const registeredShortcuts: ShortcutDef[] = [];

/**
 * Register keyboard shortcuts that are active while the component is mounted.
 * Shortcuts are automatically cleaned up on unmount.
 */
export function useShortcuts(shortcuts: ShortcutDef[]) {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    const defs = shortcutsRef.current;
    for (const s of defs) {
      registeredShortcuts.push(s);
    }
    return () => {
      for (const s of defs) {
        const idx = registeredShortcuts.indexOf(s);
        if (idx !== -1) registeredShortcuts.splice(idx, 1);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- stable refs
}

/** Get all shortcuts for the help modal */
export function getRegisteredShortcuts(): ShortcutDef[] {
  return registeredShortcuts.filter((s) => s.showInHelp !== false);
}

/**
 * Global keyboard listener — mount once at the app root.
 * Dispatches to whichever shortcuts are registered.
 */
export function useGlobalKeyHandler() {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const hasMeta = e.ctrlKey || e.metaKey;
      const hasAlt = e.altKey;

      const inInput = (e.target as HTMLElement)?.matches?.(
        'input, textarea, select, [contenteditable="true"]',
      );

      for (const shortcut of registeredShortcuts) {
        if (shortcut.key !== e.key) continue;

        // Modifier matching: meta shortcuts require Cmd/Ctrl,
        // plain shortcuts reject any modifier
        if (shortcut.meta) {
          if (!hasMeta) continue;
        } else {
          if (hasMeta || hasAlt) continue;
        }

        if (shortcut.excludeInputs && inInput) continue;

        if (shortcut.preventDefault !== false) {
          e.preventDefault();
        }
        shortcut.handler(e);
        return;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);
}
