/**
 * Purpose: "系统仪表" — the FSRS true-retention gauge; measures how well the scheduling
 * system is calibrated (never the learner) by comparing the target retention against
 * retention observed at real reencounter and guess moments (spec 035 #6).
 * Main exports: TARGET_RETENTION, MINIMUM_SAMPLE_SIZE, SystemGaugeResult,
 * computeSystemGauge.
 */
import type { DiglotWordGuessRow, NodeSightingRow } from "@breadcrumb/core-db";
import { computeNodeRetention } from "@breadcrumb/plugin-memory";

/** FSRS true-retention target the product schedules toward (spec 035 #6). */
export const TARGET_RETENTION = 0.9;

/** Below this many samples the measured rate is too noisy to publish as a number — the UI
 * falls back to "still calibrating" copy instead. */
export const MINIMUM_SAMPLE_SIZE = 5;

const DEFAULT_WINDOW_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface SystemGaugeResult {
  targetRetention: number;
  nodeMeasured: number | null;
  nodeSampleSize: number;
  wordMeasured: number | null;
  wordSampleSize: number;
}

/** Node side: for every reencounter (a sighting that isn't a node's first) inside the
 * window, replays that node's sighting sequence up to (not including) that moment through
 * computeNodeRetention with the reencounter instant as `now` — this is what the schedule
 * "predicted" recall was right before the reencounter happened — then averages across all
 * such samples. Word side: correct+close share of guesses inside the window. */
export function computeSystemGauge(input: {
  sightings: readonly NodeSightingRow[];
  guesses: readonly DiglotWordGuessRow[];
  nowIso: string;
  windowDays?: number;
}): SystemGaugeResult {
  const windowDays = input.windowDays ?? DEFAULT_WINDOW_DAYS;
  const windowStartMs = Date.parse(input.nowIso) - windowDays * MS_PER_DAY;

  const sightingTimesByNode = new Map<string, string[]>();
  const sortedSightings = [...input.sightings].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  for (const sighting of sortedSightings) {
    const times = sightingTimesByNode.get(sighting.node_id) ?? [];
    times.push(sighting.created_at);
    sightingTimesByNode.set(sighting.node_id, times);
  }

  const nodeSamples: number[] = [];
  for (const times of sightingTimesByNode.values()) {
    for (let index = 1; index < times.length; index += 1) {
      const reencounterTime = times[index];
      if (reencounterTime === undefined || Date.parse(reencounterTime) < windowStartMs) continue;
      const priorTimes = times.slice(0, index);
      nodeSamples.push(computeNodeRetention(priorTimes, reencounterTime));
    }
  }

  const windowGuesses = input.guesses.filter(
    (guess) => Date.parse(guess.created_at) >= windowStartMs,
  );
  const wordSampleSize = windowGuesses.length;
  const correctOrCloseCount = windowGuesses.filter(
    (guess) => guess.grade === "correct" || guess.grade === "close",
  ).length;

  const nodeMeasured =
    nodeSamples.length >= MINIMUM_SAMPLE_SIZE
      ? nodeSamples.reduce((sum, value) => sum + value, 0) / nodeSamples.length
      : null;
  const wordMeasured =
    wordSampleSize >= MINIMUM_SAMPLE_SIZE ? correctOrCloseCount / wordSampleSize : null;

  return {
    targetRetention: TARGET_RETENTION,
    nodeMeasured,
    nodeSampleSize: nodeSamples.length,
    wordMeasured,
    wordSampleSize,
  };
}
