import { useRegisterSW } from "virtual:pwa-register/react";
import { useEffect } from "react";
import { toast } from "sonner";

export function PwaReloadPrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (needRefresh) {
      toast("New version available", {
        description: "Reload to get the latest update.",
        action: {
          label: "Reload",
          onClick: () => updateServiceWorker(true),
        },
        duration: Number.POSITIVE_INFINITY,
      });
    }
  }, [needRefresh, updateServiceWorker]);

  return null;
}
