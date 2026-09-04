/**
 * Purpose: fog aggregation — mean retention over a place's member nodes. Unknown
 * members count as fully remembered so missing data never summons fog.
 * Main exports: averageRetention.
 *
 * "Unknown" includes unusable: a NaN or an Infinity in the map poisons the whole mean, and the
 * mean drives alphas that Pixi takes on trust — one bad row and an island's name stops drawing
 * (bug hunt 2026-09-03). The answer is the same one a missing row gets, for the same reason:
 * fog is a claim about the learner, and a number nobody can read is not grounds to make it.
 */

/** A retrievability in [0, 1], or 1 when there is nothing usable to go on. */
function readRetention(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

export function averageRetention(
  memberNodeIds: readonly string[],
  retentionByNode: ReadonlyMap<string, number>,
): number {
  if (memberNodeIds.length === 0) return 1;
  let sum = 0;
  for (const nodeId of memberNodeIds) {
    sum += readRetention(retentionByNode.get(nodeId));
  }
  return sum / memberNodeIds.length;
}
