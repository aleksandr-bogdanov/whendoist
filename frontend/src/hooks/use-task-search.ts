import Fuse, { type FuseResultMatch, type IFuseOptions } from "fuse.js";
import { useCallback, useMemo } from "react";
import type { DomainResponse, SubtaskResponse, TaskResponse } from "@/api/model";

interface FlatTask {
  task: TaskResponse;
  title: string;
  description: string;
  domainName: string | null;
  isThought: boolean;
  isCompleted: boolean;
  subtask: SubtaskResponse | null;
  parentTask: TaskResponse | null;
}

export interface SearchResult {
  task: TaskResponse;
  domain: DomainResponse | null;
  isThought: boolean;
  matches: readonly FuseResultMatch[] | undefined;
  subtask: SubtaskResponse | null;
  parentTask: TaskResponse | null;
}

const MAX_RESULTS = 30;

const fuseOptions: IFuseOptions<FlatTask> = {
  keys: [
    { name: "title", weight: 0.7 },
    { name: "description", weight: 0.3 },
  ],
  threshold: 0.35,
  ignoreLocation: true,
  includeMatches: true,
  minMatchCharLength: 2,
};

/**
 * Wraps fuse.js over decrypted tasks for fuzzy search.
 * Flattens parent + subtasks into a single searchable list.
 */
export function useTaskSearch(tasks: TaskResponse[], domains: DomainResponse[]) {
  const domainMap = useMemo(() => {
    const map = new Map<number, DomainResponse>();
    for (const d of domains) map.set(d.id, d);
    return map;
  }, [domains]);

  // Flatten all tasks (parents + their subtasks) into a single array
  const flatTasks = useMemo(() => {
    const items: FlatTask[] = [];
    for (const task of tasks) {
      items.push({
        task,
        title: task.title ?? "",
        description: task.description ?? "",
        domainName: task.domain_id ? (domainMap.get(task.domain_id)?.name ?? null) : null,
        isThought: task.domain_id === null,
        isCompleted: task.status === "completed",
        subtask: null,
        parentTask: null,
      });
      // Index each subtask as a separate entry pointing to its parent
      for (const sub of task.subtasks ?? []) {
        items.push({
          task,
          title: sub.title ?? "",
          description: sub.description ?? "",
          domainName: task.domain_id ? (domainMap.get(task.domain_id)?.name ?? null) : null,
          isThought: task.domain_id === null,
          isCompleted: sub.status === "completed",
          subtask: sub,
          parentTask: task,
        });
      }
    }
    return items;
  }, [tasks, domainMap]);

  const fuse = useMemo(() => new Fuse(flatTasks, fuseOptions), [flatTasks]);

  const search = useCallback(
    (query: string): SearchResult[] => {
      if (!query.trim()) return [];
      return fuse.search(query, { limit: MAX_RESULTS }).map((result) => ({
        task: result.item.task,
        domain: result.item.task.domain_id
          ? (domainMap.get(result.item.task.domain_id) ?? null)
          : null,
        isThought: result.item.isThought,
        matches: result.matches ?? undefined,
        subtask: result.item.subtask,
        parentTask: result.item.parentTask,
      }));
    },
    [fuse, domainMap],
  );

  return { search };
}
