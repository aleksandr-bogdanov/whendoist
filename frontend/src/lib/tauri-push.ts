/**
 * Push notification token management for Tauri mobile apps.
 *
 * Handles registering/unregistering the device's FCM/APNs push token
 * with the Whendoist backend, and persisting it locally for change detection.
 *
 * v0.61.0: Phase 2 — Push Notifications / Remote Reminders
 */

import { isTauri } from "@/hooks/use-device";
import { apiClient } from "@/lib/api-client";

const PUSH_TOKEN_KEY = "push_token";

// ── Backend registration ────────────────────────────────────────────

/** Register a push token with the backend. */
export async function registerPushTokenWithBackend(
  token: string,
  platform: "ios" | "android",
): Promise<void> {
  await apiClient({ method: "POST", url: "/api/v1/push/token", data: { token, platform } });
}

/** Unregister a push token from the backend (e.g. on logout). */
export async function unregisterPushTokenFromBackend(token: string): Promise<void> {
  await apiClient({
    method: "DELETE",
    url: "/api/v1/push/token",
    params: { token },
  });
}

// ── Local token persistence (LazyStore) ─────────────────────────────

async function getStore() {
  const { LazyStore } = await import("@tauri-apps/plugin-store");
  return new LazyStore("credentials.json");
}

/** Get the locally stored push token (for change detection). */
export async function getStoredPushToken(): Promise<string | null> {
  if (!isTauri) return null;
  try {
    const store = await getStore();
    return (await store.get<string>(PUSH_TOKEN_KEY)) ?? null;
  } catch {
    return null;
  }
}

/** Store the push token locally. */
export async function storePushToken(token: string): Promise<void> {
  if (!isTauri) return;
  const store = await getStore();
  await store.set(PUSH_TOKEN_KEY, token);
  await store.save();
}

/** Clear the locally stored push token. */
export async function clearPushToken(): Promise<void> {
  if (!isTauri) return;
  try {
    const store = await getStore();
    await store.delete(PUSH_TOKEN_KEY);
    await store.save();
  } catch {
    // Store may not exist — that's fine
  }
}

// ── Rust command wrapper ────────────────────────────────────────────

/** Get the push token from Rust managed state (set during app setup). */
export async function getPushTokenFromRust(): Promise<string | null> {
  if (!isTauri) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<string | null>("get_push_token");
  } catch {
    return null;
  }
}
