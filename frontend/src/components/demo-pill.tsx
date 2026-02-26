import { useQueryClient } from "@tanstack/react-query";
import { RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useDemoResetAuthDemoResetPost } from "@/api/queries/auth/auth";
import { useGetMeApiV1MeGet } from "@/api/queries/me/me";

const DISMISSED_KEY = "demo-pill-dismissed";

export function DemoPill() {
  const meQuery = useGetMeApiV1MeGet();
  const demoReset = useDemoResetAuthDemoResetPost();
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === "true");
  const [expanded, setExpanded] = useState(false);

  if (!meQuery.data?.is_demo_user || dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "true");
    setDismissed(true);
  };

  const handleReset = () => {
    demoReset.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries();
        toast.success("Demo data reset");
        setExpanded(false);
      },
      onError: () => toast.error("Failed to reset demo data"),
    });
  };

  return (
    <div>
      {expanded ? (
        <div className="flex items-center gap-2 rounded-full bg-purple-600 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
          <button
            type="button"
            onClick={handleReset}
            disabled={demoReset.isPending}
            className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 hover:bg-white/30 disabled:opacity-50"
          >
            <RotateCcw className="h-3 w-3" />
            Reset data
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 hover:bg-white/30"
          >
            <X className="h-3 w-3" />
            Dismiss
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded-full bg-purple-600 px-3 py-1 text-xs font-semibold text-white shadow-lg hover:bg-purple-700"
        >
          Demo
        </button>
      )}
    </div>
  );
}
