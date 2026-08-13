/**
 * Purpose: the shape statistic calls return (spec 036) — aggregate-only values aligned by
 * index with a task's call list, plus the disclosure floor shared by all bucketed outputs.
 * Main exports: StatResult, MIN_CELL_COUNT.
 */

/** Buckets with fewer than this many contributing rows are dropped before display/storage. */
export const MIN_CELL_COUNT = 5;

export type StatResult =
  | { kind: "number"; value: number; n: number }
  | { kind: "bars"; bars: Array<{ label: string; value: number }> };
