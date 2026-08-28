/**
 * Purpose: the mechanical pressure-language scan (docs/testing/simlab-评审协议.md) — a hit
 * on any lexicon entry is a red flag with no AI judgment involved. Loads the human-maintained
 * lexicon from data/pressure-lexicon.json, which holds one list per interface language,
 * and scans arbitrary user-visible text against the list for the language it is written in.
 * Main exports: loadPressureLexicon, loadPressureLexicons, findPressureLexiconHits,
 * PRESSURE_LEXICON_PATH, PRESSURE_LEXICON_SOURCE_LANGUAGE.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export const PRESSURE_LEXICON_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "data",
  "pressure-lexicon.json",
);

/** The language simlab's own conversations run in, and so the default for every caller that
 * does not name one. */
export const PRESSURE_LEXICON_SOURCE_LANGUAGE = "zh-CN";

const lexiconFileSchema = z.object({
  entries: z.record(z.string(), z.array(z.string().min(1))),
});

/** Every language's list, keyed by interface language code. */
export function loadPressureLexicons(
  path: string = PRESSURE_LEXICON_PATH,
): Record<string, string[]> {
  const raw = readFileSync(path, "utf-8");
  return lexiconFileSchema.parse(JSON.parse(raw)).entries;
}

/** One language's list. An unknown language returns nothing to match on — the caller that
 * cares whether a language has a list should check for itself rather than read silence as a
 * pass (apps/desktop/src/locales/copyGate.test.ts does exactly that). */
export function loadPressureLexicon(
  language: string = PRESSURE_LEXICON_SOURCE_LANGUAGE,
  path: string = PRESSURE_LEXICON_PATH,
): string[] {
  return loadPressureLexicons(path)[language] ?? [];
}

/** Every lexicon entry that appears as a substring of `text`, in lexicon order. Plain
 * substring matching — the lexicon entries are themselves already the exact red-flag
 * phrases, no NLP needed for a mechanical first-pass gate. Case is ignored so that a phrase
 * at the start of an English sentence is still the same phrase. */
export function findPressureLexiconHits(text: string, lexicon: readonly string[]): string[] {
  const haystack = text.toLowerCase();
  return lexicon.filter((entry) => haystack.includes(entry.toLowerCase()));
}
