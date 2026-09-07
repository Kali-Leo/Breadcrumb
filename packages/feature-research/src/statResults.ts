/**
 * Purpose: the shape statistic calls return — aggregate-only values aligned by
 * index with a task's call list, including an explicit "not enough data" outcome
 * distinct from the number 0.
 * Main exports: StatResult, SUPPRESSED_RESULT, MIN_SAMPLE_SIZE.
 */
import type { CopyMessage } from "@breadcrumb/core-i18n";

/**
 * Fewest observations a summary statistic may be computed from. Below it the call reports
 * `suppressed` — a sample-size floor, deliberately NOT k-anonymity cell suppression:
 * small-cell suppression is a disclosure control
 * for *published* data, and it protects nobody in results that never leave the device.
 * If v2 ever adds the DAP upload path, per-bucket suppression and DP noise
 * belong there — not here on the local display path.
 */
export const MIN_SAMPLE_SIZE = 5;

/**
 * A statistic that was not computed because the data does not support it. Its own variant,
 * never a value: 0 is a perfectly good correlation coefficient and a perfectly good mean, so
 * returning 0 for "we don't know" prints a fabricated finding.
 */
export type SuppressedStat = {
  kind: "suppressed";
  /** Observations actually available, for the caller that wants to say how far off it is. */
  n: number;
};

export type StatResult =
  | { kind: "number"; value: number; n: number }
  | { kind: "bars"; bars: Array<{ label: CopyMessage; value: number }> }
  | SuppressedStat;

export function suppressed(n: number): SuppressedStat {
  return { kind: "suppressed", n };
}
