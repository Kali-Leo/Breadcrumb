/**
 * Purpose: "讲解模式记录" — a zero-LLM tally of how many assistant messages were sent in
 * each teaching mode (spec 038 §2.5), record only, never a comparison of which is better.
 * Main exports: TeachingModeUsage, computeTeachingModeUsage.
 */

export interface TeachingModeUsage {
  adaptive: number;
  direct: number;
  guided: number;
  total: number;
}

/** Sums per-mode counts into the three known teaching modes; any unrecognized mode value
 * is ignored entirely (not counted anywhere, including total). */
export function computeTeachingModeUsage(
  rows: readonly { teaching_mode: string; count: number }[],
): TeachingModeUsage {
  let adaptive = 0;
  let direct = 0;
  let guided = 0;

  for (const row of rows) {
    if (row.teaching_mode === "adaptive") {
      adaptive += row.count;
    } else if (row.teaching_mode === "direct") {
      direct += row.count;
    } else if (row.teaching_mode === "guided") {
      guided += row.count;
    }
  }

  return { adaptive, direct, guided, total: adaptive + direct + guided };
}
