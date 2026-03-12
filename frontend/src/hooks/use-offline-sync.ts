/**
 * Offline sync orchestrator for Tauri native app.
 *
 * Responsibilities:
 * 1. Cold start hydration — populate TanStack Query from SQLite cache
 * 2. Cache persistence — write API responses to SQLite after successful fetches
 * 3. Periodic sync — check data_version every 2min, refetch if changed
 * 4. Write queue drain — replay queued mutations on reconnect, then resync
 *
 * Only active when isTauri is true. No-op on web.
 *
 * v0.62.0: Phase 3 — Offline SQLite Cache
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { DomainResponse, TaskResponse } from "@/api/model";
import { getListDomainsApiV1DomainsGetQueryKey } from "@/api/queries/domains/domains";
import { getGetMeApiV1MeGetQueryKey } from "@/api/queries/me/me";
import { getListTasksApiV1TasksGetQueryKey } from "@/api/queries/tasks/tasks";
import { isTauri } from "@/hooks/use-device";
import { axios } from "@/lib/api-client";
import i18n from "@/lib/i18n";
import { queryClient } from "@/lib/query-client";
import { DASHBOARD_TASKS_PARAMS } from "@/lib/query-keys";

const SYNC_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

interface MeResponseWithVersion {
  data_version: number;
  [key: string]: unknown;
}

/**
 * Hook that manages the offline SQLite cache lifecycle.
 * Call once in the authenticated layout.
 */
export function useOfflineSync() {
  const [pendingWrites, setPendingWrites] = useState(0);
  const hydratedRef = useRef(false);
  const drainInProgressRef = useRef(false);

  // --- 1. Cold start hydration + 2. Cache persistence ---
  useEffect(() => {
    if (!isTauri) return;

    let mounted = true;

    async function hydrate() {
      try {
        const { initCache, getCachedData } = await import("@/lib/tauri-cache");
        await initCache();

        // Hydrate TanStack Query from cache (before network requests)
        const [cachedTasks, cachedDomains, cachedMe] = await Promise.all([
          getCachedData<TaskResponse[]>("tasks"),
          getCachedData<DomainResponse[]>("domains"),
          getCachedData<MeResponseWithVersion>("me"),
        ]);

        if (!mounted) return;

        if (cachedTasks) {
          queryClient.setQueryData(
            getListTasksApiV1TasksGetQueryKey(DASHBOARD_TASKS_PARAMS),
            cachedTasks,
          );
        }
        if (cachedDomains) {
          queryClient.setQueryData(getListDomainsApiV1DomainsGetQueryKey(), cachedDomains);
        }
        if (cachedMe) {
          queryClient.setQueryData(getGetMeApiV1MeGetQueryKey(), cachedMe);
        }

        hydratedRef.current = true;
      } catch (e) {
        // Cache hydration failure is non-fatal — network fetch will take over
        console.warn("[offline-sync] Cache hydration failed:", e);
      }
    }

    hydrate();
    return () => {
      mounted = false;
    };
  }, []);

  // --- 2. Cache persistence: write to SQLite when TanStack Query data changes ---
  useEffect(() => {
    if (!isTauri) return;

    // Subscribe to TanStack Query cache updates
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || event.action.type !== "success") return;

      const key = event.query.queryKey;
      const data = event.query.state.data;
      if (!data) return;

      // Persist tasks, domains, and me responses
      persistToCache(key, data);
    });

    return unsubscribe;
  }, []);

  // --- 3. Periodic data_version sync ---
  useEffect(() => {
    if (!isTauri) return;

    const interval = setInterval(async () => {
      if (!navigator.onLine) return;

      try {
        const { getCachedDataVersion } = await import("@/lib/tauri-cache");
        const cachedVersion = await getCachedDataVersion();
        if (cachedVersion === null) return;

        // Lightweight check: just fetch /me to compare data_version
        const { data: me } = await axios.get<MeResponseWithVersion>("/api/v1/me");
        if (me.data_version !== cachedVersion) {
          // Data changed — invalidate all queries to trigger refetch
          queryClient.invalidateQueries();
        }
      } catch {
        // Sync check failure is non-fatal
      }
    }, SYNC_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  const updatePendingCount = useCallback(async () => {
    try {
      const { getPendingWriteCount } = await import("@/lib/tauri-cache");
      const count = await getPendingWriteCount();
      setPendingWrites(count);
    } catch {
      // Non-fatal
    }
  }, []);

  const drainWriteQueue = useCallback(async () => {
    if (drainInProgressRef.current) return;
    drainInProgressRef.current = true;

    try {
      const { getPendingWrites, removePendingWrite } = await import("@/lib/tauri-cache");
      const entries = await getPendingWrites();
      if (entries.length === 0) {
        drainInProgressRef.current = false;
        return;
      }

      let succeeded = 0;
      let failed = 0;
      const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
      const now = Date.now();

      for (const entry of entries) {
        // Skip and discard entries older than 24 hours
        if (now - entry.created_at > TTL_MS) {
          console.warn(
            `[offline-sync] Discarding stale mutation (${Math.round((now - entry.created_at) / 3600000)}h old): ${entry.method} ${entry.url}`,
          );
          await removePendingWrite(entry.id);
          failed++;
          continue;
        }
        try {
          await axios({
            method: entry.method,
            url: entry.url,
            data: entry.body ? JSON.parse(entry.body) : undefined,
          });
          await removePendingWrite(entry.id);
          succeeded++;
        } catch (e: unknown) {
          const status = (e as { response?: { status?: number } })?.response?.status;
          if (status && status >= 400 && status < 500 && status !== 429) {
            // Permanent failure (4xx) — discard, won't succeed on retry
            console.warn(
              `[offline-sync] Discarding failed mutation (${status}): ${entry.method} ${entry.url}`,
            );
            await removePendingWrite(entry.id);
            failed++;
          } else {
            // Transient failure (5xx, network) — keep in queue for next drain
            console.warn(
              `[offline-sync] Transient failure, will retry: ${entry.method} ${entry.url}`,
              e,
            );
            failed++;
          }
        }
      }

      if (succeeded > 0) {
        toast.success(i18n.t("crypto.offlineSynced", { count: succeeded }), {
          id: "offline-sync-drain",
        });
      }
      if (failed > 0) {
        toast.warning(i18n.t("crypto.offlineSyncFailed", { count: failed }), {
          id: "offline-sync-fail",
        });
      }

      // After drain, invalidate all queries to get fresh server state
      queryClient.invalidateQueries();
      await updatePendingCount();
    } catch (e) {
      console.warn("[offline-sync] Write queue drain failed:", e);
    } finally {
      drainInProgressRef.current = false;
    }
  }, [updatePendingCount]);

  // --- Widget refresh on app backgrounding ---
  useEffect(() => {
    if (!isTauri) return;

    const handleVisibilityChange = async () => {
      if (document.visibilityState !== "hidden") return;
      try {
        const { updateWidgetData } = await import("@/lib/tauri-widgets");
        const { useCryptoStore } = await import("@/stores/crypto-store");
        const tasks = queryClient.getQueryData<TaskResponse[]>(
          getListTasksApiV1TasksGetQueryKey(DASHBOARD_TASKS_PARAMS),
        );
        if (!tasks) return;
        const encryptionEnabled = useCryptoStore.getState().encryptionEnabled;
        await updateWidgetData(tasks, encryptionEnabled);
      } catch {
        // Non-fatal
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  // --- 4. Write queue drain on reconnect ---
  useEffect(() => {
    if (!isTauri) return;

    // Update pending count on mount
    updatePendingCount();

    const handleOnline = () => drainWriteQueue();

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [updatePendingCount, drainWriteQueue]);

  return { pendingWrites };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TASKS_KEY_PREFIX = "/api/v1/tasks";
const DOMAINS_KEY_PREFIX = "/api/v1/domains";
const ME_KEY_PREFIX = "/api/v1/me";

/** Persist TanStack Query cache data to SQLite based on query key. */
async function persistToCache(queryKey: readonly unknown[], data: unknown) {
  try {
    const { setCachedData } = await import("@/lib/tauri-cache");
    const keyStr = String(queryKey[0] ?? "");

    if (keyStr === TASKS_KEY_PREFIX) {
      // Only persist dashboard tasks — filtered/search queries should not
      // overwrite the cache used for cold-start hydration
      const dashboardKey = JSON.stringify(DASHBOARD_TASKS_PARAMS);
      if (queryKey.length > 1 && JSON.stringify(queryKey[1]) !== dashboardKey) return;
      await setCachedData("tasks", data);
      // Push updated task data to native home screen widgets
      try {
        const { updateWidgetData } = await import("@/lib/tauri-widgets");
        const { useCryptoStore } = await import("@/stores/crypto-store");
        const encryptionEnabled = useCryptoStore.getState().encryptionEnabled;
        await updateWidgetData(data as TaskResponse[], encryptionEnabled);
      } catch {
        // Widget update failure is non-fatal
      }
    } else if (keyStr === DOMAINS_KEY_PREFIX) {
      await setCachedData("domains", data);
    } else if (keyStr === ME_KEY_PREFIX) {
      const me = data as MeResponseWithVersion | undefined;
      await setCachedData("me", data, me?.data_version);
    }
  } catch {
    // Cache persistence failure is non-fatal
  }
}
