import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { isTauri } from "@/hooks/use-device";
import i18n from "@/lib/i18n";

/**
 * Hook that monitors network connectivity and shows persistent toasts
 * when the user goes offline/online.
 */
export function useNetworkStatus() {
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    const handleOffline = () => {
      wasOfflineRef.current = true;
      toast.error(i18n.t("network.offline"), {
        id: "network-status",
        duration: Number.POSITIVE_INFINITY,
        description: isTauri
          ? i18n.t("network.offlineTauriDesc")
          : i18n.t("network.offlineWebDesc"),
      });
    };

    const handleOnline = () => {
      if (wasOfflineRef.current) {
        wasOfflineRef.current = false;
        toast.success(
          isTauri ? i18n.t("network.backOnlineSyncing") : i18n.t("network.backOnline"),
          {
            id: "network-status",
          },
        );
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
