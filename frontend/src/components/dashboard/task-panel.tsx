import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DomainResponse, TaskResponse } from "@/api/model";
import { getListTasksApiV1TasksGetQueryKey } from "@/api/queries/tasks/tasks";
import { StickyDomainHeader } from "@/components/mobile/sticky-domain";
import { CompletedSection } from "@/components/task/completed-section";
import { DeletedSection } from "@/components/task/deleted-section";
import { ScheduledSection } from "@/components/task/scheduled-section";
import { TaskList } from "@/components/task/task-list";
import { Button } from "@/components/ui/button";
import { decryptDomain, decryptTask } from "@/hooks/use-crypto";
import { useDevice } from "@/hooks/use-device";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { categorizeTasks, filterByEnergy, groupByDomain, sortTasks } from "@/lib/task-utils";
import { useCryptoStore } from "@/stores/crypto-store";
import { useUIStore } from "@/stores/ui-store";
import { EnergySelector } from "./energy-selector";
import { FilterBar } from "./filter-bar";
import { PendingPastBanner } from "./pending-past-banner";
import { SettingsPanel } from "./settings-panel";
import { SortControls } from "./sort-controls";

interface TaskPanelProps {
  tasks: TaskResponse[] | undefined;
  domains: DomainResponse[] | undefined;
  isLoading: boolean;
  onNewTask?: () => void;
  onQuickAdd?: () => void;
  onEditTask?: (task: TaskResponse) => void;
}

export function TaskPanel({
  tasks,
  domains,
  isLoading,
  onNewTask,
  onQuickAdd,
  onEditTask,
}: TaskPanelProps) {
  const { sortField, sortDirection, energyLevel } = useUIStore();
  const { derivedKey, encryptionEnabled, isUnlocked } = useCryptoStore();
  const queryClient = useQueryClient();
  const { prefersTouch, hasTouch } = useDevice();
  const isTouchDevice = prefersTouch || hasTouch;

  const handlePullRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
  }, [queryClient]);

  const pullRefreshRef = usePullToRefresh({
    onRefresh: handlePullRefresh,
    disabled: !isTouchDevice,
  });
  const canDecrypt = encryptionEnabled && isUnlocked && derivedKey !== null;

  const [decryptedTasks, setDecryptedTasks] = useState<TaskResponse[]>([]);
  const [decryptedDomains, setDecryptedDomains] = useState<DomainResponse[]>([]);
  const [decryptionComplete, setDecryptionComplete] = useState(false);

  // Decrypt tasks when data or crypto state changes
  useEffect(() => {
    if (!tasks) {
      setDecryptedTasks([]);
      setDecryptionComplete(false);
      return;
    }
    if (!canDecrypt || !derivedKey) {
      setDecryptedTasks(tasks);
      setDecryptionComplete(true);
      return;
    }
    setDecryptionComplete(false);
    let cancelled = false;
    Promise.all(tasks.map((t) => decryptTask(t, derivedKey))).then((result) => {
      if (!cancelled) {
        setDecryptedTasks(result.map(([t]) => t));
        setDecryptionComplete(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [tasks, canDecrypt, derivedKey]);

  useEffect(() => {
    if (!domains) {
      setDecryptedDomains([]);
      return;
    }
    if (!canDecrypt || !derivedKey) {
      setDecryptedDomains(domains);
      return;
    }
    let cancelled = false;
    Promise.all(domains.map((d) => decryptDomain(d, derivedKey))).then((result) => {
      if (!cancelled) setDecryptedDomains(result.map(([d]) => d));
    });
    return () => {
      cancelled = true;
    };
  }, [domains, canDecrypt, derivedKey]);

  // Process tasks: categorize -> filter -> sort -> group
  const { pendingGroups, scheduledTasks, completedTasks } = useMemo(() => {
    // Exclude thoughts (domain_id=null) from dashboard — they belong on the Thoughts page
    const dashboardTasks = decryptedTasks.filter((t) => t.domain_id !== null);
    const { pending, scheduled, completed } = categorizeTasks(dashboardTasks);

    // Filter by energy level
    const filteredPending = filterByEnergy(pending, energyLevel);

    // Sort pending tasks
    const sortedPending = sortTasks(filteredPending, sortField, sortDirection);

    // Group by domain
    const groups = groupByDomain(sortedPending, decryptedDomains);

    // Sort within each group
    const sortedGroups = groups.map((g) => ({
      ...g,
      tasks: sortTasks(g.tasks, sortField, sortDirection),
    }));

    return {
      pendingGroups: sortedGroups,
      scheduledTasks: scheduled,
      completedTasks: completed,
    };
  }, [decryptedTasks, decryptedDomains, sortField, sortDirection, energyLevel]);

  // Prevent ciphertext flash: show loading while decryption is pending
  const decryptionPending = canDecrypt && (tasks?.length ?? 0) > 0 && !decryptionComplete;

  if (isLoading || decryptionPending) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Panel header with controls */}
      <div
        data-task-panel-header
        className="relative flex flex-col gap-2 px-2 sm:px-4 py-2 border-b backdrop-blur-md bg-muted/30"
      >
        {/* Spectrum bar */}
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#167BFF] via-[#6D5EF6] to-[#A020C0] opacity-35" />

        {/* Row 1: energy + actions */}
        <div className="flex items-center justify-between gap-2">
          <EnergySelector />
          <div className="flex items-center gap-1">
            {onQuickAdd && (
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={onQuickAdd}>
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Quick</span>
              </Button>
            )}
            {onNewTask && (
              <Button variant="default" size="sm" className="h-7 text-xs gap-1" onClick={onNewTask}>
                <Plus className="h-3.5 w-3.5" />
                New Task
              </Button>
            )}
            <SettingsPanel />
          </div>
        </div>

        {/* Row 2: filter toggles + sort controls (right-aligned to match task columns) */}
        <div className="flex items-center justify-between gap-2">
          <FilterBar />
          <SortControls />
        </div>
      </div>

      {/* Task list */}
      <div ref={pullRefreshRef} className="flex-1 min-h-0 flex flex-col relative">
        <div
          className="flex-1 min-h-0 overflow-y-auto relative sm:px-2 lg:px-4"
          data-task-scroll-area
        >
          <StickyDomainHeader />
          <div className="p-2 sm:p-4 pb-nav-safe md:pb-4 space-y-2">
            <PendingPastBanner />
            <TaskList groups={pendingGroups} onEditTask={onEditTask} />
            <ScheduledSection tasks={scheduledTasks} onEditTask={onEditTask} />
            <CompletedSection tasks={completedTasks} onEditTask={onEditTask} />
            <DeletedSection />
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background/50 to-transparent md:h-16 md:from-background" />
      </div>
    </div>
  );
}
