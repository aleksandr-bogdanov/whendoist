import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * Hook that monitors network connectivity and shows persistent toasts
 * when the user goes offline/online.
 */
export function useNetworkStatus() {
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    const handleOffline = () => {
      wasOfflineRef.current = true;
      toast.error("No internet connection", {
        id: "network-status",
        duration: Number.POSITIVE_INFINITY,
        description: "Changes will sync when you're back online.",
      });
    };

    const handleOnline = () => {
      if (wasOfflineRef.current) {
        wasOfflineRef.current = false;
        toast.success("Back online", {
          id: "network-status",
        });
      }
    };

    // Check initial state
    if (!navigator.onLine) {
      handleOffline();
    }

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);
}
