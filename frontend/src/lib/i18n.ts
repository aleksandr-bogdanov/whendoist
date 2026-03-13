import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import en from "@/locales/en.json";

export interface LanguageOption {
  code: string;
  name: string;
  nativeName: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "de", name: "German", nativeName: "Deutsch" },
  { code: "fr", name: "French", nativeName: "Français" },
  { code: "es", name: "Spanish", nativeName: "Español" },
  { code: "it", name: "Italian", nativeName: "Italiano" },
  { code: "pt", name: "Portuguese", nativeName: "Português" },
  { code: "ru", name: "Russian", nativeName: "Русский" },
];

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]["code"];

/** Locale loaders — lazy-loaded on demand. English is always inline. */
const LOCALE_LOADERS: Record<string, () => Promise<{ default: Record<string, string> }>> = {
  de: () => import("@/locales/de.json"),
  fr: () => import("@/locales/fr.json"),
  es: () => import("@/locales/es.json"),
  it: () => import("@/locales/it.json"),
  pt: () => import("@/locales/pt.json"),
  ru: () => import("@/locales/ru.json"),
};

/** Load a locale's translations into i18n if not already loaded. */
async function loadLocale(lang: string): Promise<void> {
  if (lang === "en") return; // always inline
  if (i18n.hasResourceBundle(lang, "translation")) return;
  const loader = LOCALE_LOADERS[lang];
  if (!loader) return;
  const mod = await loader();
  i18n.addResourceBundle(lang, "translation", mod.default, true, true);
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
    },
    fallbackLng: "en",
    interpolation: {
      escapeValue: false, // React handles XSS
    },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "whendoist-locale",
      caches: ["localStorage"],
    },
  });

// After init, eagerly load the detected language (if not English)
const detectedLang = i18n.resolvedLanguage ?? i18n.language;
if (detectedLang && detectedLang !== "en") {
  loadLocale(detectedLang);
}

// Lazy-load when user switches language
i18n.on("languageChanged", (lang) => {
  loadLocale(lang);
});

export default i18n;
