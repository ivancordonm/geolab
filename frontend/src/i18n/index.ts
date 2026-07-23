import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { defaultLanguage, isLanguage, languages } from "./languages";

export const LANGUAGE_STORAGE_KEY = "geolab-language";

export function readStoredLanguage() {
  if (typeof window === "undefined") return defaultLanguage;
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(stored) ? stored : defaultLanguage;
  } catch {
    return defaultLanguage;
  }
}

void i18n.use(initReactI18next).init({
  resources: Object.fromEntries(languages.map(({ code, translation }) => [code, { translation }])),
  lng: readStoredLanguage(),
  fallbackLng: defaultLanguage,
  supportedLngs: languages.map(({ code }) => code),
  interpolation: { escapeValue: false },
  initAsync: false,
});

export function syncLanguage(language: string) {
  const resolved = isLanguage(language) ? language : defaultLanguage;
  if (typeof document !== "undefined") document.documentElement.lang = resolved;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, resolved);
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

syncLanguage(i18n.resolvedLanguage ?? i18n.language);
i18n.on("languageChanged", syncLanguage);

export { i18n };
export { languages } from "./languages";
export type { Language } from "./languages";
