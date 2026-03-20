import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import ru from "./locales/ru.json";

export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "ru", name: "Russian", nativeName: "Русский" },
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]["code"];

export const LANGUAGE_FALLBACKS: Record<string, string[]> = {
  uk: ["ru", "en"],
  be: ["ru", "en"],
};

export function getLanguageWithFallback(systemLocale: string): string {
  const baseLanguage = systemLocale.split(/[-_]/)[0].toLowerCase();

  if (SUPPORTED_LANGUAGES.some((lang) => lang.code === baseLanguage)) {
    return baseLanguage;
  }

  if (LANGUAGE_FALLBACKS[systemLocale]) {
    return LANGUAGE_FALLBACKS[systemLocale][0];
  }

  if (LANGUAGE_FALLBACKS[baseLanguage]) {
    return LANGUAGE_FALLBACKS[baseLanguage][0];
  }

  return "en";
}

const resources = {
  en: { translation: en },
  ru: { translation: ru },
};

i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});

export default i18n;
