import { en } from "./locales/en";
import { es } from "./locales/es";

export const languages = [
  { code: "en", nativeName: "English", translation: en },
  { code: "es", nativeName: "Español", translation: es },
] as const;

export type Language = (typeof languages)[number]["code"];

export const defaultLanguage: Language = "en";

export function isLanguage(value: unknown): value is Language {
  return languages.some(({ code }) => code === value);
}
