/**
 * Purpose: the mechanical pressure-language scan (docs/testing/simlab-评审协议.md) — a hit
 * on any lexicon entry is a red flag with no AI judgment involved. Loads the human-maintained
 * lexicon from data/pressure-lexicon.json and scans arbitrary user-visible text against it.
 * Main exports: loadPressureLexicon, findPressureLexiconHits, PRESSURE_LEXICON_PATH.
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

const lexiconFileSchema = z.object({ entries: z.array(z.string().min(1)) });

export function loadPressureLexicon(path: string = PRESSURE_LEXICON_PATH): string[] {
  const raw = readFileSync(path, "utf-8");
  return lexiconFileSchema.parse(JSON.parse(raw)).entries;
}

/** Every lexicon entry that appears as a substring of `text`, in lexicon order. Plain
 * substring matching — the lexicon entries are themselves already the exact red-flag
 * phrases, no NLP needed for a mechanical first-pass gate. */
export function findPressureLexiconHits(text: string, lexicon: readonly string[]): string[] {
  return lexicon.filter((entry) => text.includes(entry));
}
