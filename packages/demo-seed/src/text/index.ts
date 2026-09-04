/**
 * Purpose: picks the demo learner's words for the language the reader is using. A newcomer
 * who set the interface to Bahasa Indonesia and asked to see an example used to get a
 * Chinese one: 39 Chinese concept names on the map, four Chinese conversation titles, and a
 * dialogue they could not read — on the very first screen, in the one place the product is
 * supposed to be explaining itself.
 * Main exports: DEMO_TEXT_BY_LANGUAGE, demoTextFor.
 */
import { DEMO_TEXT_AR } from "./ar";
import { DEMO_TEXT_BN } from "./bn";
import type { DemoText } from "./demoText";
import { DEMO_TEXT_EN } from "./en";
import { DEMO_TEXT_ES } from "./es";
import { DEMO_TEXT_FR } from "./fr";
import { DEMO_TEXT_HI } from "./hi";
import { DEMO_TEXT_ID } from "./id";
import { DEMO_TEXT_PT } from "./pt";
import { DEMO_TEXT_RU } from "./ru";
import { DEMO_TEXT_SW } from "./sw";
import { DEMO_TEXT_ZH_CN } from "./zh-CN";

/** One entry per language the interface ships in. The keys are the same BCP-47 tags the
 * language table uses; a coverage test in apps/desktop compares the two lists. */
export const DEMO_TEXT_BY_LANGUAGE: Readonly<Record<string, DemoText>> = {
  "zh-CN": DEMO_TEXT_ZH_CN,
  en: DEMO_TEXT_EN,
  es: DEMO_TEXT_ES,
  fr: DEMO_TEXT_FR,
  pt: DEMO_TEXT_PT,
  ru: DEMO_TEXT_RU,
  ar: DEMO_TEXT_AR,
  hi: DEMO_TEXT_HI,
  id: DEMO_TEXT_ID,
  bn: DEMO_TEXT_BN,
  sw: DEMO_TEXT_SW,
};

const FALLBACK_LANGUAGE = "en";
const DEFAULT_LANGUAGE = "zh-CN";

/**
 * Exact tag first, then the bare language ("pt-BR" -> "pt"), then English. English rather
 * than the app's own default: a reader whose language we have no demo for is far more likely
 * to read some English than to read Chinese, and the seed must always produce something —
 * every row it writes is required, and there is no such thing as a node without a name.
 */
export function demoTextFor(languageCode: string | undefined): DemoText {
  const requested = languageCode ?? DEFAULT_LANGUAGE;
  const exact = DEMO_TEXT_BY_LANGUAGE[requested];
  if (exact !== undefined) return exact;
  const base = requested.toLowerCase().split("-")[0] ?? "";
  const byBase = DEMO_TEXT_BY_LANGUAGE[base];
  if (byBase !== undefined) return byBase;
  // Present by construction; the fallback keeps the return type honest without a cast.
  return DEMO_TEXT_BY_LANGUAGE[FALLBACK_LANGUAGE] ?? DEMO_TEXT_EN;
}
