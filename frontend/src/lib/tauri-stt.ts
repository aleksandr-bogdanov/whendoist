/**
 * Thin wrapper around tauri-plugin-stt-api.
 *
 * Isolates the hook from the plugin's API surface and combines
 * result/error/state listeners into a single session lifecycle.
 * Only imported on Tauri mobile where Web Speech API is unavailable.
 */

import type { PluginListener } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import type { PermissionStatus } from "tauri-plugin-stt-api";

export interface SttSessionCallbacks {
  onResult: (transcript: string, isFinal: boolean) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}

/** Check + request permissions. Returns true if both mic and speech are granted. */
export async function ensureSttPermission(): Promise<boolean> {
  const { checkPermission, requestPermission } = await import("tauri-plugin-stt-api");

  let perm = await checkPermission();
  if (needsRequest(perm.microphone) || needsRequest(perm.speechRecognition)) {
    perm = await requestPermission();
  }
  return perm.microphone === "granted" && perm.speechRecognition === "granted";
}

/** Check if native STT is available on this device. */
export async function isSttAvailable(): Promise<boolean> {
  const { isAvailable } = await import("tauri-plugin-stt-api");
  const res = await isAvailable();
  return res.available;
}

/**
 * Start a recognition session. Returns a cleanup function that
 * removes all listeners and stops recognition.
 */
export async function startSttSession(
  lang: string,
  callbacks: SttSessionCallbacks,
): Promise<() => Promise<void>> {
  const { startListening, stopListening, onResult, onError, onStateChange } = await import(
    "tauri-plugin-stt-api"
  );

  const unlistenResult = await onResult((result) => {
    callbacks.onResult(result.transcript, result.isFinal);
  });

  const unlistenError = await onError((error) => {
    callbacks.onError(error.message || "Voice input failed.");
  });

  const unlistenState = await onStateChange((event) => {
    if (event.state === "idle") {
      callbacks.onEnd();
    }
  });

  try {
    await startListening({
      language: lang,
      interimResults: true,
      continuous: false,
    });
  } catch (e) {
    // Clean up listeners that were registered before startListening failed
    await removeListener(unlistenResult);
    await removeListener(unlistenError);
    await removeListener(unlistenState);
    throw e;
  }

  return async () => {
    // Best-effort cleanup — any step can throw if already stopped
    try {
      await stopListening();
    } catch {
      /* already stopped */
    }
    await removeListener(unlistenResult);
    await removeListener(unlistenError);
    await removeListener(unlistenState);
  };
}

function needsRequest(status: PermissionStatus): boolean {
  return status !== "granted";
}

/** Remove a listener — handles both PluginListener (.unregister()) and UnlistenFn (callable). */
async function removeListener(listener: PluginListener | UnlistenFn): Promise<void> {
  if (typeof listener === "function") {
    listener();
  } else {
    await listener.unregister();
  }
}
