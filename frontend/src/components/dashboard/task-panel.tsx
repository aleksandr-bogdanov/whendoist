import { Loader2, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AppRoutersTasksTaskResponse, DomainResponse } from "@/api/model";
import { CompletedSection } from "@/components/task/completed-section";
import { ScheduledSection } from "@/components/task/scheduled-section";
import { TaskList } from "@/components/task/task-list";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { decrypt, looksEncrypted } from "@/lib/crypto";
import { categorizeTasks, filterByEnergy, groupByDomain, sortTasks } from "@/lib/task-utils";
import { useCryptoStore } from "@/stores/crypto-store";
import { useUIStore } from "@/stores/ui-store";
import { EnergySelector } from "./energy-selector";
import { FilterBar } from "./filter-bar";
import { SettingsPanel } from "./settings-panel";
import { SortControls } from "./sort-controls";

interface TaskPanelProps {
  tasks: AppRoutersTasksTaskResponse[] | undefined;
  domains: DomainResponse[] | undefined;
  isLoading: boolean;
  onNewTask?: () => void;
  onQuickAdd?: () => void;
  onEditTask?: (task: AppRoutersTasksTaskResponse) => void;
}

async function decryptTasksWithKey(
  tasks: AppRoutersTasksTaskResponse[],
  key: CryptoKey,
): Promise<AppRoutersTasksTaskResponse[]> {
  return Promise.all(
    tasks.map(async (task) => {
      const [title, description] = await Promise.all([
        task.title && looksEncrypted(task.title)
          ? decrypt(key, task.title).catch(() => task.title)
          : task.title,
        task.description && looksEncrypted(task.description)
          ? decrypt(key, task.description).catch(() => task.description)
          : task.description,
      ]);
      let subtasks = task.subtasks;
      if (subtasks?.length) {
        subtasks = await Promise.all(
          subtasks.map(async (st) => ({
            ...st,
            title:
              st.title && looksEncrypted(st.title)
                ? await decrypt(key, st.title).catch(() => st.title)
                : st.title,
          })),
        );
      }
      return { ...task, title: title ?? task.title, description: description ?? null, subtasks };
    }),
  );
}

async function decryptDomainsWithKey(
  domains: DomainResponse[],
  key: CryptoKey,
): Promise<DomainResponse[]> {
  return Promise.all(
    domains.map(async (d) => ({
      ...d,
      name:
        d.name && looksEncrypted(d.name) ? await decrypt(key, d.name).catch(() => d.name) : d.name,
    })),
  );
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
  const canDecrypt = encryptionEnabled && isUnlocked && derivedKey !== null;

  const [decryptedTasks, setDecryptedTasks] = useState<AppRoutersTasksTaskResponse[]>([]);
  const [decryptedDomains, setDecryptedDomains] = useState<DomainResponse[]>([]);

  // Decrypt tasks when data or crypto state changes
  useEffect(() => {
    if (!tasks) {
      setDecryptedTasks([]);
      return;
    }
    if (!canDecrypt || !derivedKey) {
      setDecryptedTasks(tasks);
      return;
    }
    let cancelled = false;
    decryptTasksWithKey(tasks, derivedKey).then((result) => {
      if (!cancelled) setDecryptedTasks(result);
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
    decryptDomainsWithKey(domains, derivedKey).then((result) => {
      if (!cancelled) setDecryptedDomains(result);
    });
    return () => {
      cancelled = true;
    };
  }, [domains, canDecrypt, derivedKey]);

  // Process tasks: categorize -> filter -> sort -> group
  const { pendingGroups, scheduledTasks, completedTasks } = useMemo(() => {
    const { pending, scheduled, completed } = categorizeTasks(decryptedTasks);

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

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Panel header with controls */}
      <div className="flex flex-col gap-2 px-2 sm:px-3 py-2 border-b">
        {/* Top row: energy + actions */}
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
        {/* Bottom row: sort + filter */}
        <div className="flex items-center justify-between gap-2">
          <SortControls />
          <FilterBar />
        </div>
      </div>

      {/* Task list */}
      <ScrollArea className="flex-1">
        <div className="p-2 sm:p-3 space-y-1">
          <TaskList groups={pendingGroups} onEditTask={onEditTask} />
          <ScheduledSection tasks={scheduledTasks} onEditTask={onEditTask} />
          <CompletedSection tasks={completedTasks} onEditTask={onEditTask} />
        </div>
      </ScrollArea>
    </div>
  );
}
