/**
 * Purpose: zero-LLM guess grading (spec 033) — the user's guess at a woven word's meaning is
 * graded against the original word and its dictionary synonyms (correct), a morphological
 * overlap test (close), and an embedding cosine supplied by the caller (close). Character
 * overlap as a stand-in for meaning was removed: on CJK it graded 父亲→母亲, 敌人→朋友 and
 * 昨天→明天 as "close", because Chinese antonyms share morphemes (audit 2026-08-28 #4).
 * Pure and deterministic; the embedding I/O lives in the app layer.
 * Main exports: gradeGuess, GuessSemantics, SEMANTIC_CLOSE_THRESHOLD.
 */
import type { DiglotGuessGrade } from "@breadcrumb/core-db";
import { type LoadedLanguagePack, resolveLemma } from "./packSchema";

/** Semantic evidence about one guess, computed by the caller (local e5 embeddings). */
export interface GuessSemantics {
  /** Cosine similarity between the guess and the original word, or null when embeddings are
   * unavailable — in which case grading degrades to correct/wrong only. Withholding "close"
   * is the safe error: telling someone their answer was near when it was not is the kind of
   * misleading feedback the product may not produce. */
  similarity: number | null;
}

/** Cosine above which a guess counts as semantically close. Deliberately high and TENTATIVE:
 * multilingual-e5 puts unrelated words of one language in the 0.7–0.85 band and places
 * antonyms close to each other, so a low threshold would recreate the very bug this replaces.
 * Needs calibration on the real machine against 父亲/母亲, 敌人/朋友, 男孩/女孩, 昨天/明天. */
export const SEMANTIC_CLOSE_THRESHOLD = 0.92;

/** Shortest overlap that may count as morphological, and the share of the longer string it
 * must cover — "友" inside "友情" is not evidence of anything. */
const MIN_OVERLAP_CHARS = 2;
const MIN_OVERLAP_SHARE = 0.5;
/** Edit similarity that counts as the same word misspelled or inflected (alphabetic
 * scripts). Two-character CJK words can never reach it without being identical. */
const MORPHOLOGICAL_EDIT_SIMILARITY = 0.7;

/** Lowercases, trims and strips surrounding punctuation/whitespace from a guess. */
function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, "");
}

/** Levenshtein distance — small inputs only (guesses are single words). */
function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const distance = Array.from({ length: rows }, (_, row) => {
    const line = new Array<number>(cols).fill(0);
    line[0] = row;
    return line;
  });
  for (let col = 0; col < cols; col += 1) {
    const firstLine = distance[0];
    if (firstLine !== undefined) firstLine[col] = col;
  }
  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const substitutionCost = a[row - 1] === b[col - 1] ? 0 : 1;
      const line = distance[row];
      const previousLine = distance[row - 1];
      if (line === undefined || previousLine === undefined) continue;
      line[col] = Math.min(
        (line[col - 1] ?? 0) + 1,
        (previousLine[col] ?? 0) + 1,
        (previousLine[col - 1] ?? 0) + substitutionCost,
      );
    }
  }
  return distance[rows - 1]?.[cols - 1] ?? Math.max(a.length, b.length);
}

/** Same word in another shape: one string contains the other (compound or affix), or they
 * are within an edit or two of each other. Form only — never a claim about meaning. */
function isMorphologicallyClose(guess: string, reference: string): boolean {
  const [shorter, longer] =
    guess.length <= reference.length ? [guess, reference] : [reference, guess];
  if (
    shorter.length >= MIN_OVERLAP_CHARS &&
    shorter.length / longer.length >= MIN_OVERLAP_SHARE &&
    longer.includes(shorter)
  ) {
    return true;
  }
  return 1 - editDistance(guess, reference) / longer.length >= MORPHOLOGICAL_EDIT_SIMILARITY;
}

/**
 * Grades a guess about the woven word whose original was `originalSurface` (lemma `lemma`).
 * Correct = the original word itself or any source lemma sharing the same target translation
 * (dictionary synonyms). A guess that is itself a DIFFERENT dictionary word is wrong, never
 * close — it is a substantive mix-up, and the confusion miner is the place that uses it.
 * (This also grades a near-synonym the pack does not list under the same target as wrong —
 * unchanged from the character-overlap era, and the safe direction to err in.)
 * Otherwise close = a morphological variant, or an embedding cosine over the threshold.
 */
export function gradeGuess(
  guessRaw: string,
  originalSurface: string,
  lemma: string,
  loaded: LoadedLanguagePack,
  semantics?: GuessSemantics,
): DiglotGuessGrade {
  const guess = normalize(guessRaw);
  if (guess.length === 0) return "wrong";
  const references = new Set<string>([normalize(originalSurface), normalize(lemma)]);
  const entry = loaded.pack.entries[lemma];
  if (entry !== undefined) {
    for (const synonym of loaded.lemmasByTarget.get(entry.target.toLowerCase()) ?? []) {
      references.add(normalize(synonym));
    }
  }
  for (const reference of references) {
    if (reference.length > 0 && guess === reference) return "correct";
  }
  const guessedLemma = resolveLemma(guessRaw.trim(), loaded);
  if (guessedLemma !== null && guessedLemma !== lemma) return "wrong";
  for (const reference of references) {
    if (reference.length === 0) continue;
    if (isMorphologicallyClose(guess, reference)) return "close";
  }
  const similarity = semantics?.similarity ?? null;
  return similarity !== null && similarity >= SEMANTIC_CLOSE_THRESHOLD ? "close" : "wrong";
}
