import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import en from "./en";
import fr from "./fr";

export const LANGUAGES = [
  { code: "fr", short: "FR", name: "Français" },
  { code: "en", short: "EN", name: "English" },
] as const;
export type Language = (typeof LANGUAGES)[number]["code"];

const STORAGE_KEY = "cab-lang";

// The parent's explicit choice (selector) wins, else the browser's preferred
// languages; anything other than French falls back to English.
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { fr: { translation: fr }, en: { translation: en } },
    supportedLngs: ["fr", "en"],
    nonExplicitSupportedLngs: true,
    load: "languageOnly",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    detection: { order: ["localStorage", "navigator"], lookupLocalStorage: STORAGE_KEY, caches: [] },
  });

const syncHtmlLang = () => (document.documentElement.lang = i18n.resolvedLanguage ?? "en");
syncHtmlLang();
i18n.on("languageChanged", syncHtmlLang);

export function setLanguage(language: Language) {
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {}
  return i18n.changeLanguage(language);
}

// BCP 47 locale for Intl dates and times: fr-FR, or the browser's English variant.
export function locale() {
  if (i18n.resolvedLanguage === "fr") return "fr-FR";
  return navigator.languages.find((l) => l.startsWith("en")) ?? "en-US";
}

// The API answers in French (Zod messages, HTTPException): show its known
// messages in the current language, anything else as is.
const SERVER_ERRORS: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^Adresse de site invalide/, () => i18n.t("errors.invalidSite")],
  [/^Heure invalide/, () => i18n.t("errors.invalidTime")],
  [/^La fin d'une plage doit être après son début/, () => i18n.t("errors.windowOrder")],
  [/^(.+) est un programme système/, (m) => i18n.t("errors.systemProgram", { exe: m[1] })],
  [/^Les inscriptions sont fermées/, () => i18n.t("errors.signupClosed")],
  [/^device not found$/, () => i18n.t("errors.deviceNotFound")],
  [/^rule not found$/, () => i18n.t("errors.ruleNotFound")],
  [/^internal error$/, () => i18n.t("errors.internal")],
];

export function translateServerError(message: string) {
  for (const [pattern, text] of SERVER_ERRORS) {
    const match = pattern.exec(message);
    if (match) return text(match);
  }
  return message;
}

export default i18n;
