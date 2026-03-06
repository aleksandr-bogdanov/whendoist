/**
 * Shared constants for Tauri IPC wrappers.
 *
 * All Tauri IPC calls use a timeout to prevent app freeze if the
 * native bridge hangs (common in iOS dev mode over WiFi).
 */

/** Default timeout for Tauri IPC calls (ms). Prevents app freeze on IPC hang. */
export const TAURI_IPC_TIMEOUT_MS = 1_500;

/** Longer timeout for biometric prompts — user may take time to authenticate. */
export const TAURI_BIOMETRIC_TIMEOUT_MS = 30_000;

/** Cooldown before retrying after circuit breaker trips (ms). */
export const TAURI_CIRCUIT_BREAKER_COOLDOWN_MS = 30_000;

/** Cache TTL — discard entries older than this on cold-start hydration (ms). */
export const TAURI_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1_000; // 7 days
