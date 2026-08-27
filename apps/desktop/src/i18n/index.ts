/**
 * Purpose: starts i18next with the bundled message catalogues and keeps the document in
 * step with the chosen language — the html lang/dir attributes and the font stack for that
 * language's script. Import once from main.tsx, before anything renders.
 * Main exports: initI18n, applyLanguageToDocument, changeLanguage.
 */
import { DEFAULT_LANGUAGE_CODE, fontStackFor, languageOf } from "@breadcrumb/core-i18n";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import enChat from "../locales/en/chat.json";
import enCommon from "../locales/en/common.json";
import enDiscovery from "../locales/en/discovery.json";
import enLearning from "../locales/en/learning.json";
import enPalace from "../locales/en/palace.json";
import enSettings from "../locales/en/settings.json";
import zhChat from "../locales/zh-CN/chat.json";
import zhCommon from "../locales/zh-CN/common.json";
import zhDiscovery from "../locales/zh-CN/discovery.json";
import zhLearning from "../locales/zh-CN/learning.json";
import zhPalace from "../locales/zh-CN/palace.json";
import zhSettings from "../locales/zh-CN/settings.json";
import { buildPseudoCatalogue, isPseudoLocale, PSEUDO_LOCALE_CODE } from "./pseudoLocale";

export const resources = {
  "zh-CN": {
    common: zhCommon,
    chat: zhChat,
    settings: zhSettings,
    palace: zhPalace,
    learning: zhLearning,
    discovery: zhDiscovery,
  },
  en: {
    common: enCommon,
    chat: enChat,
    settings: enSettings,
    palace: enPalace,
    learning: enLearning,
    discovery: enDiscovery,
  },
} as const;

/** Development builds get one extra, deliberately unreadable locale for layout testing. */
export const DEV_LOCALES: Record<string, Record<string, unknown>> = import.meta.env.DEV
  ? {
      [PSEUDO_LOCALE_CODE]: Object.fromEntries(
        Object.entries(resources.en).map(([namespace, catalogue]) => [
          namespace,
          buildPseudoCatalogue(catalogue as never),
        ]),
      ),
    }
  : {};

export const NAMESPACES = [
  "common",
  "chat",
  "settings",
  "palace",
  "learning",
  "discovery",
] as const;

/** Called once at startup; the stored language arrives later and calls changeLanguage. */
export async function initI18n(): Promise<void> {
  if (i18next.isInitialized) return;
  await i18next.use(initReactI18next).init({
    resources: { ...resources, ...DEV_LOCALES },
    lng: DEFAULT_LANGUAGE_CODE,
    fallbackLng: DEFAULT_LANGUAGE_CODE,
    defaultNS: "common",
    ns: NAMESPACES,
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  applyLanguageToDocument(DEFAULT_LANGUAGE_CODE);
}

/** Writing direction and script font follow the language; both are document-level facts.
 * No-ops where there is no document (tests, any headless use of the message catalogues). */
export function applyLanguageToDocument(code: string): void {
  if (typeof document === "undefined") return;
  const language = languageOf(code);
  const root = document.documentElement;
  root.lang = code;
  root.dir = isPseudoLocale(code) ? "rtl" : (language?.direction ?? "ltr");
  root.style.setProperty("--app-font-stack", fontStackFor(language?.script ?? "latin"));
}

export async function changeLanguage(code: string): Promise<void> {
  await i18next.changeLanguage(code);
  applyLanguageToDocument(code);
}
