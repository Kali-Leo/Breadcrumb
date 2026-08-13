/**
 * Purpose: confusion-pair mining (vision/09 #3) — the verbatim guess log already holds
 * the learner's systematic mix-ups: a non-correct guess that IS another dictionary word
 * means "A gets confused with B". Mined pairs drive targeted contrast lines on gloss
 * cards. Pure and deterministic.
 * Main exports: mineConfusionPairs, ConfusionPartner, CONFUSION_THRESHOLD.
 */
import type { DiglotWordGuessRow } from "@breadcrumb/core-db";
import type { LoadedLanguagePack } from "./packSchema";

/** A pair needs this many occurrences to count as systematic (one slip is noise). */
export const CONFUSION_THRESHOLD = 2;

export interface ConfusionPartner {
  /** The lemma the learner keeps guessing instead. */
  lemma: string;
  /** Its dictionary translation — the contrast line shows both sides. */
  target: string;
  count: number;
}

/** Resolves a guess text to a dictionary lemma (exact entry or known surface form). */
function guessAsLemma(guess: string, loaded: LoadedLanguagePack): string | null {
  const trimmed = guess.trim();
  if (trimmed.length === 0) return null;
  if (loaded.pack.entries[trimmed] !== undefined) return trimmed;
  const viaForm = loaded.pack.forms[trimmed];
  return viaForm ?? null;
}

/** Mines the guess log: for every word, its most-often-confused partner (≥ threshold).
 * Only non-correct guesses that resolve to a different dictionary word count. */
export function mineConfusionPairs(
  guesses: readonly DiglotWordGuessRow[],
  loaded: LoadedLanguagePack,
): Map<string, ConfusionPartner> {
  const counts = new Map<string, Map<string, number>>();
  for (const guess of guesses) {
    if (guess.grade === "correct") continue;
    const guessedLemma = guessAsLemma(guess.guess, loaded);
    if (guessedLemma === null || guessedLemma === guess.lemma) continue;
    const forWord = counts.get(guess.lemma) ?? new Map<string, number>();
    forWord.set(guessedLemma, (forWord.get(guessedLemma) ?? 0) + 1);
    counts.set(guess.lemma, forWord);
  }
  const partners = new Map<string, ConfusionPartner>();
  for (const [lemma, forWord] of counts) {
    const best = [...forWord.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    if (best === undefined || best[1] < CONFUSION_THRESHOLD) continue;
    const entry = loaded.pack.entries[best[0]];
    if (entry === undefined) continue;
    partners.set(lemma, { lemma: best[0], target: entry.target, count: best[1] });
  }
  return partners;
}
