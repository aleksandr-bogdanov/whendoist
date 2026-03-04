import { useGetPreferencesApiV1PreferencesGet } from "@/api/queries/preferences/preferences";
import { getEffectiveTimezone } from "@/lib/timezone";

/**
 * Returns the user's effective timezone (preference if set, browser default otherwise).
 * Use this hook in any component that needs timezone-aware rendering.
 */
export function useTimezone(): string {
  const { data: prefs } = useGetPreferencesApiV1PreferencesGet();
  return getEffectiveTimezone(prefs?.timezone);
}
