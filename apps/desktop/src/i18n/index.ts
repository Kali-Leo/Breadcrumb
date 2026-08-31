/**
 * Purpose: starts i18next with the bundled message catalogues and keeps the document in
 * step with the chosen language — the html lang/dir attributes and the font stack for that
 * language's script. Import once from main.tsx, before anything renders.
 * Main exports: initI18n, applyLanguageToDocument, changeLanguage.
 */
import { DEFAULT_LANGUAGE_CODE, fontStackFor, languageOf } from "@breadcrumb/core-i18n";
import i18next, { type FormatFunction, type Resource, type ResourceLanguage } from "i18next";
import { initReactI18next } from "react-i18next";
import zhChat from "../locales/zh-CN/chat.json";
import zhCommon from "../locales/zh-CN/common.json";
import zhDiscovery from "../locales/zh-CN/discovery.json";
import zhLearning from "../locales/zh-CN/learning.json";
import zhOnboarding from "../locales/zh-CN/onboarding.json";
import zhPalace from "../locales/zh-CN/palace.json";
import zhSettings from "../locales/zh-CN/settings.json";
import { buildPseudoCatalogue, isPseudoLocale, PSEUDO_LOCALE_CODE } from "./pseudoLocale";

/** The Chinese catalogue is the source language: it defines which keys exist, and t() is
 * type-checked against it (see i18next.d.ts). Every other language is discovered from the
 * filesystem below, so adding one is a folder plus a row in the language table — no code. */
const SOURCE_CATALOGUE = {
  common: zhCommon,
  chat: zhChat,
  settings: zhSettings,
  palace: zhPalace,
  learning: zhLearning,
  discovery: zhDiscovery,
  onboarding: zhOnboarding,
} as const;

export type MessageCatalogue = typeof SOURCE_CATALOGUE;

/** Eager on purpose: all languages together are ~50 KB, and the desktop app's "loading" is a
 * local disk read. Splitting them per language would buy nothing and cost a await on first
 * paint (audit 2026-08-28, "verified good" §6). */
const catalogueModules = import.meta.glob<{ default: ResourceLanguage }>("../locales/*/*.json", {
  eager: true,
});

const LOCALE_PATH = /\/locales\/([^/]+)\/([^/]+)\.json$/;

function discoverCatalogues(): Resource {
  const found: Resource = {};
  for (const [path, module] of Object.entries(catalogueModules)) {
    const match = LOCALE_PATH.exec(path);
    if (match === null) continue;
    const [, code, namespace] = match as unknown as [string, string, string];
    const language = found[code] ?? {};
    language[namespace] = module.default;
    found[code] = language;
  }
  return found;
}

export const resources: Resource = discoverCatalogues();

/** Development builds get one extra, deliberately unreadable locale for layout testing. */
export const DEV_LOCALES: Resource = import.meta.env.DEV
  ? {
      [PSEUDO_LOCALE_CODE]: Object.fromEntries(
        Object.entries(resources.en ?? {}).map(([namespace, catalogue]) => [
          namespace,
          buildPseudoCatalogue(catalogue as never) as ResourceLanguage,
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

/** Unicode bidirectional isolates. In a left-to-right interface they are zero-width and
 * change nothing; in Arabic or Hebrew they stop an interpolated value — a number, a concept
 * label, a url — from reordering the sentence around it (W3C: isolate every run whose
 * direction you do not control). i18next has no built-in switch for this, so every
 * interpolated value goes through the formatter below. */
const FIRST_STRONG_ISOLATE = "⁨";
const POP_DIRECTIONAL_ISOLATE = "⁩";

function isolateBidi(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return text === "" ? text : `${FIRST_STRONG_ISOLATE}${text}${POP_DIRECTIONAL_ISOLATE}`;
}

/** i18next replaces whatever `interpolation.format` was passed to init with its own
 * Formatter, so the isolation is layered on afterwards, around the interpolator that actually
 * runs for every {{value}}. Wrapping rather than replacing keeps i18next's built-in
 * number/date/list formats working. `Interpolator`'s published interface does not name
 * `format`, hence the one cast; the field itself is what the library calls on every
 * interpolation. */
function isolateInterpolatedValues(): void {
  const interpolator = i18next.services.interpolator as unknown as
    | { format: FormatFunction }
    | undefined;
  if (interpolator === undefined) return;
  const inner = interpolator.format;
  interpolator.format = (value, format, lng, options) =>
    isolateBidi(inner(value, format, lng, options));
}

/** Called once at startup; the stored language arrives later and calls changeLanguage. */
export async function initI18n(): Promise<void> {
  if (i18next.isInitialized) return;
  await i18next.use(initReactI18next).init({
    resources: { ...resources, ...DEV_LOCALES },
    lng: DEFAULT_LANGUAGE_CODE,
    fallbackLng: DEFAULT_LANGUAGE_CODE,
    defaultNS: "common",
    ns: NAMESPACES,
    // alwaysFormat sends every {{value}} through the formatter, isolation included.
    interpolation: { escapeValue: false, alwaysFormat: true },
    returnNull: false,
  });
  isolateInterpolatedValues();
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
