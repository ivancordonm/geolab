import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type Language = "es" | "en";
const STORAGE_KEY = "geolab-language";

function readStoredLanguage(): Language {
  try { return window.sessionStorage.getItem(STORAGE_KEY) === "es" ? "es" : "en"; }
  catch { return "en"; }
}

type LanguageContextValue = { language: Language; setLanguage: (language: Language) => void; t: (es: string, en: string) => string };
const fallbackContext: LanguageContextValue = { language: "en", setLanguage: () => undefined, t: (_es, en) => en };
const LanguageContext = createContext<LanguageContextValue>(fallbackContext);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>(readStoredLanguage);
  useEffect(() => {
    document.documentElement.lang = language;
    try { window.sessionStorage.setItem(STORAGE_KEY, language); } catch { /* Storage may be disabled. */ }
  }, [language]);
  const value = useMemo(() => ({ language, setLanguage, t: (es: string, en: string) => language === "es" ? es : en }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}
