/** Default toast duration in milliseconds. All toasts use this unless structurally different (e.g. persistent offline notice). */
export const TOAST_DURATION = 10_000;

/** Short duration for simple confirmations (save, create, update). Errors & undo toasts keep TOAST_DURATION. */
export const TOAST_DURATION_SHORT = 4_000;
