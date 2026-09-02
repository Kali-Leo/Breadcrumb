/**
 * Purpose: the shape statistic calls return (spec 036) — aggregate-only values aligned by
 * index with a task's call list, including the explicit "not enough data" outcome that used
 * to masquerade as the number 0.
 * Main exports: StatResult, SUPPRESSED_RESULT, MIN_SAMPLE_SIZE.
 */
import type { CopyMessage } from "@breadcrumb/core-i18n";

/**
 * Fewest observations a summary statistic may be computed from. Below it the call reports
 * `suppressed` — a sample-size floor, deliberately NOT the k-anonymity cell suppression this
 * constant used to also drive on histograms: small-cell suppression is a disclosure control
 * for *published* data, it protects nobody in results that never leave the device, and it
 * cost this panel its arithmetic (深度设计审计 2026-08-28, 统计分报告差距 4). If v2 ever adds
 * the DAP upload path, per-bucket suppression belongs there, alongside the DP noise ADR-0020
 * calls for — not here on the local display path.
 */
export const MIN_SAMPLE_SIZE = 5;

/**
 * A statistic that was not computed because the data does not support it. Its own variant,
 * never a value: 0 is a perfectly good correlation coefficient and a perfectly good mean, so
 * returning 0 for "we don't know" prints a fabricated finding (统计分报告差距 3).
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
