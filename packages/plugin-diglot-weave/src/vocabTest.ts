/**
 * Purpose: the two-minute vocabulary check that gives the weave a starting point (Leo
 * 2026-09-01 ruled it in). Without it the introduction floor starts at zero for everyone and
 * can only move once words have been introduced — the self-locking cold start the 2026-08-28
 * audit diagnosed (B3), which left an advanced learner meeting "water" and "book" for weeks.
 *
 * Form: thirty four-option meaning-recognition items sampled across the frequency-ordered
 * introduction queue, the standard shape of a vocabulary-size test (Nation & Beglar 2007's
 * Vocabulary Size Test, and the same family as LexCHI for Chinese). Multiple choice rather
 * than yes/no-plus-pseudowords: it needs no invented non-words (which have to be built per
 * language and per script), and guessing is bounded at one in four instead of unbounded
 * over-claiming.
 *
 * The score is deliberately conservative — one band below where the answers stop holding up
 * — because a floor set too high silently skips words the learner never knew, while a floor
 * set too low only costs them a few easy encounters.
 * Main exports: VOCAB_TEST_ITEM_COUNT, buildVocabTest, scoreVocabTest, VocabTestItem.
 */
import type { LoadedLanguagePack } from "./packSchema";

export const VOCAB_TEST_ITEM_COUNT = 30;
/** Items are grouped into bands by depth; a band is the unit the score reasons about. */
const BAND_COUNT = 6;
const OPTIONS_PER_ITEM = 4;
/** A band counts as known when this share of its items is right — above the one-in-four a
 * pure guesser would reach, below a standard demanding perfection. */
const BAND_PASS_RATIO = 0.6;

export interface VocabTestItem {
  /** The source-language lemma whose translation is being asked about. */
  lemma: string;
  /** The word in the language being learned — what the learner is shown. */
  target: string;
  /** Position in the introduction queue: how deep into the frequency order this word sits. */
  queueRank: number;
  /** Four candidate meanings, in the source language; one of them is `lemma`. */
  options: string[];
  correctIndex: number;
}

/** Deterministic small hash — the test must be the same test if it is reopened. */
function hashToInt(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

/**
 * Thirty items spread evenly over the whole queue, one per equal slice, so the test covers
 * everyday words and rare ones alike. Distractors are drawn from other slices, which keeps
 * them plausible without ever being near-synonyms of the answer.
 */
export function buildVocabTest(
  loaded: LoadedLanguagePack,
  itemCount: number = VOCAB_TEST_ITEM_COUNT,
): VocabTestItem[] {
  const queue = loaded.introductionQueue;
  if (queue.length < itemCount * OPTIONS_PER_ITEM) return [];
  const step = Math.floor(queue.length / itemCount);
  const items: VocabTestItem[] = [];

  for (let index = 0; index < itemCount; index += 1) {
    const queueRank = Math.min(index * step + Math.floor(step / 2), queue.length - 1);
    const lemma = queue[queueRank];
    if (lemma === undefined) continue;
    const entry = loaded.pack.entries[lemma];
    if (entry === undefined) continue;

    const distractors: string[] = [];
    let offset = 1;
    while (distractors.length < OPTIONS_PER_ITEM - 1 && offset < queue.length) {
      // Walk outward through the queue in deterministic strides; anything that is not this
      // item's own lemma and not already picked becomes a distractor.
      const candidateRank: number = (queueRank + offset * step + hashToInt(lemma)) % queue.length;
      const candidate: string | undefined = queue[candidateRank];
      offset += 1;
      if (candidate === undefined || candidate === lemma || distractors.includes(candidate)) {
        continue;
      }
      distractors.push(candidate);
    }
    if (distractors.length < OPTIONS_PER_ITEM - 1) continue;

    const correctIndex = hashToInt(`${lemma}:${entry.target}`) % OPTIONS_PER_ITEM;
    const options = [...distractors];
    options.splice(correctIndex, 0, lemma);
    items.push({ lemma, target: entry.target, queueRank, options, correctIndex });
  }
  return items;
}

/**
 * The introduction floor these answers support: the deepest band the learner passed, taken
 * one band back. Zero when even the first band fails, which is also what an untaken test
 * leaves behind — a beginner and a skipped test should be treated the same way.
 * `answers[i]` is the option index the learner chose, or null for a skipped item.
 */
export function scoreVocabTest(
  items: readonly VocabTestItem[],
  answers: readonly (number | null)[],
): number {
  if (items.length === 0) return 0;
  const bandSize = Math.max(1, Math.ceil(items.length / BAND_COUNT));
  let deepestPassedBand = -1;

  // Bands are walked from the top, and the walk stops at the first one that does not hold
  // up — an unbroken run, not the deepest lucky band. One band passing by chance is common
  // enough (three right out of five, one guess in four); a run of them is not, which is what
  // keeps a guesser from being declared advanced.
  for (let band = 0; band * bandSize < items.length; band += 1) {
    const start = band * bandSize;
    const bandItems = items.slice(start, start + bandSize);
    const correct = bandItems.filter(
      (item, offset) => answers[start + offset] === item.correctIndex,
    ).length;
    if (correct / bandItems.length < BAND_PASS_RATIO) break;
    deepestPassedBand = band;
  }

  if (deepestPassedBand <= 0) return 0;
  // One band back from where the run ended: the floor claims only what the answers carried
  // comfortably, and the words in between are cheap to meet again.
  const floorItem = items[Math.max(0, deepestPassedBand * bandSize - bandSize)];
  return floorItem?.queueRank ?? 0;
}
