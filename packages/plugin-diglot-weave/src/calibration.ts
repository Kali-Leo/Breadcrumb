/**
 * Purpose: optional vocabulary calibration (spec 033 增补) — a yes/no word-sampling
 * estimate (LexTALE / frequency-band tradition): sample target words across frequency
 * bands of the introduction queue, the learner self-reports which they know, and the
 * result sets where new-word introduction starts (i+1). Pure and deterministic.
 * Main exports: sampleCalibrationWords, estimateCalibration, CalibrationWord.
 */
import type { LoadedLanguagePack } from "./packSchema";

export interface CalibrationWord {
  /** Source lemma (the introduction-queue entry). */
  lemma: string;
  /** The target-language word shown to the learner. */
  target: string;
  /** Index in the introduction queue (introduction rank). */
  rank: number;
  /** Which frequency band this sample belongs to (0 = most frequent). */
  band: number;
}

/** Known-rate below this ends the "already known" region — introduction starts there. */
const KNOWN_RATE_FLOOR = 0.6;

/** Evenly samples `perBand` words from each of `bands` equal slices of the introduction
 * queue. Deterministic (no RNG): even spacing inside a band is unbiased enough for an
 * estimate and keeps repeat calibrations comparable. */
export function sampleCalibrationWords(
  loaded: LoadedLanguagePack,
  bands: number,
  perBand: number,
): CalibrationWord[] {
  const queue = loaded.introductionQueue;
  if (queue.length === 0 || bands <= 0 || perBand <= 0) return [];
  const bandSize = queue.length / bands;
  const samples: CalibrationWord[] = [];
  for (let band = 0; band < bands; band += 1) {
    const start = band * bandSize;
    for (let i = 0; i < perBand; i += 1) {
      const rank = Math.min(queue.length - 1, Math.floor(start + ((i + 0.5) * bandSize) / perBand));
      const lemma = queue[rank];
      if (lemma === undefined) continue;
      const entry = loaded.pack.entries[lemma];
      if (entry === undefined) continue;
      samples.push({ lemma, target: entry.target, rank, band });
    }
  }
  return samples;
}

export interface CalibrationResult {
  /** Rough count of already-known words within the introduction queue. */
  estimatedKnownCount: number;
  /** New-word introduction starts at this queue rank (0 = no head start). */
  introductionRankFloor: number;
}

/** Turns the learner's yes/no answers into an estimate: per-band known rates weighted by
 * band size give the known count; the floor is the start of the first band whose known
 * rate drops below KNOWN_RATE_FLOOR (never past the last band's start). */
export function estimateCalibration(
  answers: ReadonlyArray<CalibrationWord & { known: boolean }>,
  queueLength: number,
): CalibrationResult {
  if (answers.length === 0 || queueLength === 0) {
    return { estimatedKnownCount: 0, introductionRankFloor: 0 };
  }
  const bandCount = Math.max(...answers.map((answer) => answer.band)) + 1;
  const bandSize = queueLength / bandCount;
  let estimatedKnownCount = 0;
  let introductionRankFloor = 0;
  let floorFound = false;
  for (let band = 0; band < bandCount; band += 1) {
    const inBand = answers.filter((answer) => answer.band === band);
    const knownRate =
      inBand.length === 0 ? 0 : inBand.filter((answer) => answer.known).length / inBand.length;
    estimatedKnownCount += knownRate * bandSize;
    if (!floorFound && knownRate < KNOWN_RATE_FLOOR) {
      introductionRankFloor = Math.floor(band * bandSize);
      floorFound = true;
    }
  }
  if (!floorFound) {
    // Every band well known: start at the final band rather than skipping the whole queue.
    introductionRankFloor = Math.floor((bandCount - 1) * bandSize);
  }
  return {
    estimatedKnownCount: Math.round(estimatedKnownCount),
    introductionRankFloor,
  };
}
