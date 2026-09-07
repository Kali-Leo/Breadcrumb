/**
 * Purpose: the emotion panel's data — per day, the average valence and the emotion mix of what
 * the feed showed (`expose`) versus what the learner actually opened (`engage`). Two lines, not
 * one, because the gap between them is the only thing here that says anything: it separates the
 * mood of what a recommender pushes from the mood of what a person chooses.
 *
 * Ported from Kali-Leo/feed-mode (`interest-model/daemon/app.py:293-323` — `CAT_SQL` and
 * `emotion_series`), GPL-3.0, same copyright holder (SQL GROUP BY → a pure function over rows,
 * so the aggregation is testable without a database). One deliberate numerical change: the
 * reference averages valence per (day, emotion) group and then re-weights by the group size;
 * summing the valences directly is the same quantity with one rounding step fewer.
 *
 * The `gent` category filters on `valence >= 0.5` and then charts valence. Its curve is
 * therefore a consequence of its own filter and is not evidence about anything; a caller
 * offering that category owes the reader that sentence.
 * Main exports: emotionSeries, EmotionCategory.
 */
import type { BrowsingEventRow } from "../events";
import type { EmotionPoint, EmotionSeries } from "../schemas";
import { EMOTION_COUNT, EMOTION_NAMES, EMOTION_VALENCES, PRO_TOPIC_INDICES } from "../taxonomy";

const SECONDS_PER_DAY = 86400;

/** Category filter of the emotion curves — the four buttons above the chart. */
export type EmotionCategory = "all" | "pro" | "ent" | "gent";

/** app.py:293-300. A NULL topic satisfies none of the topic filters, exactly as SQL's
 * three-valued `IN` does — an unclassified row is not silently counted as entertainment. */
function matchesCategory(row: BrowsingEventRow, category: EmotionCategory): boolean {
  if (category === "all") return true;
  if (row.topic === null) return false;
  const isPro = PRO_TOPIC_INDICES.has(row.topic);
  if (category === "pro") return isPro;
  if (category === "ent") return !isPro;
  return !isPro && (row.valence ?? 0) >= 0.5;
}

interface DayAccumulator {
  n: number;
  valenceSum: number;
  mix: number[];
}

function accumulate(rows: readonly BrowsingEventRow[]): Map<number, DayAccumulator> {
  const days = new Map<number, DayAccumulator>();
  for (const row of rows) {
    if (row.valence === null) continue;
    const day = Math.trunc(row.ts / SECONDS_PER_DAY) * SECONDS_PER_DAY;
    let bucket = days.get(day);
    if (bucket === undefined) {
      bucket = { n: 0, valenceSum: 0, mix: new Array<number>(EMOTION_COUNT).fill(0) };
      days.set(day, bucket);
    }
    bucket.n += 1;
    bucket.valenceSum += row.valence;
    if (row.emo !== null && row.emo >= 0 && row.emo < EMOTION_COUNT)
      bucket.mix[row.emo] = (bucket.mix[row.emo] ?? 0) + 1;
  }
  return days;
}

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

function points(rows: readonly BrowsingEventRow[]): EmotionPoint[] {
  return [...accumulate(rows).entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, bucket]) => ({
      day,
      valence: round3(bucket.valenceSum / bucket.n),
      n: bucket.n,
      mix: bucket.mix.map((count) => round3(count / bucket.n)),
    }));
}

export interface EmotionSeriesOptions {
  /** Window width. Rows outside it are ignored, so a caller may pass a wider selection. */
  readonly days: number;
  readonly category: EmotionCategory;
  /** Seconds since the epoch — the same clock the events were stamped with. */
  readonly now: number;
}

/**
 * Rows with no valence (nothing classified their emotion) contribute to neither line. That is
 * why the panel can be empty while the profile is not: an emotion model is a separate thing
 * from the topic model, and the topic model alone leaves `valence` null.
 */
export function emotionSeries(
  rows: readonly BrowsingEventRow[],
  options: EmotionSeriesOptions,
): EmotionSeries {
  const since = options.now - options.days * SECONDS_PER_DAY;
  const inWindow = rows.filter(
    (row) => row.ts >= since && row.valence !== null && matchesCategory(row, options.category),
  );
  return {
    emotions: [...EMOTION_NAMES],
    valences: [...EMOTION_VALENCES],
    expose: points(inWindow.filter((row) => row.etype === "expose")),
    engage: points(inWindow.filter((row) => row.etype !== "expose")),
  };
}
