import { useEffect, useRef } from "react";
import {
  useGetPreferencesApiV1PreferencesGet,
  useUpdatePreferencesApiV1PreferencesPut,
} from "@/api/queries/preferences/preferences";
import { useUIStore } from "@/stores/ui-store";

/**
 * Syncs calendarHourHeight between the Zustand store and server preferences.
 * - On mount: reads server preference and initializes the store.
 * - On change: debounce-writes updated value to the server.
 */
export function useSyncCalendarHourHeight() {
  const { data: prefs } = useGetPreferencesApiV1PreferencesGet();
  const updatePrefs = useUpdatePreferencesApiV1PreferencesPut();
  const { calendarHourHeight, setCalendarHourHeight } = useUIStore();
  const initializedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mutateRef = useRef(updatePrefs.mutate);
  mutateRef.current = updatePrefs.mutate;

  // Initialize from server on first load
  useEffect(() => {
    if (prefs && !initializedRef.current) {
      initializedRef.current = true;
      if (prefs.calendar_hour_height != null && prefs.calendar_hour_height !== calendarHourHeight) {
        setCalendarHourHeight(prefs.calendar_hour_height);
      }
    }
  }, [prefs, calendarHourHeight, setCalendarHourHeight]);

  // Debounce-write to server when store value changes
  useEffect(() => {
    if (!initializedRef.current) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      mutateRef.current({ data: { calendar_hour_height: calendarHourHeight } });
    }, 1000);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [calendarHourHeight]);
}
