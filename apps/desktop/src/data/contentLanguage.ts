/**
 * Purpose: the bundled reference material (ESCO occupations, the canonical concept set, the
 * MDN and senior-maths curricula) is written in one language. It is *content*, not interface
 * copy: translating it is a separate job with its own sources, so instead of showing a
 * reader Chinese material inside an English interface, the app simply does not offer it
 * (spec 058 §3). Everything that does not depend on that material keeps working.
 * Main exports: BUNDLED_CONTENT_LANGUAGE, bundledContentMatches.
 */
import i18next from "i18next";

export const BUNDLED_CONTENT_LANGUAGE = "zh-CN";

/** True when the reader's interface language is the one the bundled material is written in. */
export function bundledContentMatches(language: string = i18next.language): boolean {
  return language === BUNDLED_CONTENT_LANGUAGE;
}
