import { useSyncExternalStore } from "react";

let message = "";
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

export function announce(text: string) {
  // Clear first to ensure re-announcement of identical messages
  message = "";
  notify();
  requestAnimationFrame(() => {
    message = text;
    notify();
    setTimeout(() => {
      message = "";
      notify();
    }, 1000);
  });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot() {
  return message;
}

export function LiveAnnouncer() {
  const text = useSyncExternalStore(subscribe, getSnapshot, () => "");

  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {text}
    </div>
  );
}
