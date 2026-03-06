import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, SkipForward, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BatchActionAction } from "@/api/model";
import {
  getListInstancesApiV1InstancesGetQueryKey,
  getPendingPastCountApiV1InstancesPendingPastCountGetQueryKey,
  useBatchPastInstancesApiV1InstancesBatchPastPost,
  usePendingPastCountApiV1InstancesPendingPastCountGet,
} from "@/api/queries/instances/instances";
import { Button } from "@/components/ui/button";
import { dashboardTasksKey } from "@/lib/query-keys";

export function PendingPastBanner() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(false);
  const { data } = usePendingPastCountApiV1InstancesPendingPastCountGet();
  const batchPast = useBatchPastInstancesApiV1InstancesBatchPastPost();

  const count = (data as { count?: number } | undefined)?.count ?? 0;

  if (dismissed || count === 0) return null;

  const handleAction = (action: "complete" | "skip") => {
    batchPast.mutate(
      {
        data: {
          action: action === "complete" ? BatchActionAction.complete : BatchActionAction.skip,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getPendingPastCountApiV1InstancesPendingPastCountGetQueryKey(),
          });
          queryClient.invalidateQueries({
            queryKey: getListInstancesApiV1InstancesGetQueryKey(),
          });
          queryClient.invalidateQueries({
            queryKey: dashboardTasksKey(),
          });
          toast.success(
            action === "complete"
              ? t("toast.completedOverdueInstances", { count })
              : t("toast.skippedOverdueInstances", { count }),
          );
        },
        onError: () => toast.error(t("toast.failedToUpdateInstances")),
      },
    );
  };

  return (
    <div className="flex items-center gap-2 rounded-md border border-orange-300 bg-orange-50 dark:border-orange-700 dark:bg-orange-950/30 px-3 py-2 text-sm">
      <AlertTriangle className="h-4 w-4 text-orange-500 flex-shrink-0" />
      <span className="flex-1">{t("banner.overdueRecurring", { count })}</span>
      <div className="flex items-center gap-1 flex-shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => handleAction("complete")}
          disabled={batchPast.isPending}
        >
          <Check className="h-3 w-3" />
          {t("banner.completeAll")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => handleAction("skip")}
          disabled={batchPast.isPending}
        >
          <SkipForward className="h-3 w-3" />
          {t("banner.skipAll")}
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDismissed(true)}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
