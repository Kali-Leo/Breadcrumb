/**
 * Purpose: starts i18next with the source catalogue and keeps the document in step with the
 * chosen language — the html lang/dir attributes and the font stack for that language's
 * script. Import once from main.tsx, before anything renders; every other language is fetched
 * by changeLanguage, one language at a time (see catalogues.ts).
 * Main exports: initI18n, applyLanguageToDocument, changeLanguage.
 */
import { DEFAULT_LANGUAGE_CODE, fontStackFor, languageOf } from "@breadcrumb/core-i18n";
import i18next, { type FormatFunction, type ResourceLanguage } from "i18next";
import { initReactI18next } from "react-i18next";
import zhChat from "../locales/zh-CN/chat.json";
import zhCommon from "../locales/zh-CN/common.json";
import zhDiscovery from "../locales/zh-CN/discovery.json";
import zhLearning from "../locales/zh-CN/learning.json";
import zhOnboarding from "../locales/zh-CN/onboarding.json";
import zhPalace from "../locales/zh-CN/palace.json";
import zhSettings from "../locales/zh-CN/settings.json";
import { loadCatalogue } from "./catalogues";
import { buildPseudoCatalogue, isPseudoLocale } from "./pseudoLocale";

/** The Chinese catalogue is the source language: it defines which keys exist, and t() is
 * type-checked against it (see i18next.d.ts). Every other language is discovered from the
 * locales folder by catalogues.ts, so adding one is a folder plus a row in the language
 * table — no code. */
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

/** The one language that is always here. It is the source catalogue, the fallback behind
 * every other language, and the first paint's language, so it is worth its place in the
 * entry graph; the other ten arrive from catalogues.ts when they are actually chosen. */
const SOURCE_RESOURCES = { [DEFAULT_LANGUAGE_CODE]: SOURCE_CATALOGUE as ResourceLanguage };

export const NAMESPACES = [
  "common",
  "chat",
  "settings",
  "palace",
  "learning",
  "discovery",
  "onboarding",
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
    resources: SOURCE_RESOURCES,
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

/** English padded and flipped, built on demand so the pseudolocale costs a development
 * build one fetch and a shipped build nothing at all. */
async function buildPseudoLanguage(): Promise<ResourceLanguage> {
  const english = await loadCatalogue("en");
  return Object.fromEntries(
    Object.entries(english).map(([namespace, catalogue]) => [
      namespace,
      buildPseudoCatalogue(catalogue as never) as ResourceLanguage,
    ]),
  );
}

/** Fetches a language's catalogues the first time it is asked for and hands them to i18next.
 * Cheap on every later call: i18next already holds the bundle. */
async function ensureCatalogue(code: string): Promise<void> {
  if (code === DEFAULT_LANGUAGE_CODE) return;
  if (i18next.hasResourceBundle(code, "common")) return;
  const pseudo = isPseudoLocale(code);
  if (pseudo && !import.meta.env.DEV) return;
  const language = pseudo ? await buildPseudoLanguage() : await loadCatalogue(code);
  for (const [namespace, catalogue] of Object.entries(language)) {
    i18next.addResourceBundle(code, namespace, catalogue);
  }
}

export async function changeLanguage(code: string): Promise<void> {
  await ensureCatalogue(code);
  await i18next.changeLanguage(code);
  applyLanguageToDocument(code);
}
