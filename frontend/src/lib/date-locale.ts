import type { Locale } from "date-fns";
import { de, enUS, es, fr, it, pt, ru } from "date-fns/locale";
import i18n from "@/lib/i18n";

const LOCALE_MAP: Record<string, Locale> = {
  en: enUS,
  de,
  fr,
  es,
  it,
  pt,
  ru,
};

/** Returns the date-fns locale matching the current i18n language. */
export function getDateLocale(): Locale {
  return LOCALE_MAP[i18n.resolvedLanguage ?? "en"] ?? enUS;
}
