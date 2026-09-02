/**
 * Purpose: fog aggregation — mean retention over a place's member nodes. Unknown
 * members count as fully remembered so missing data never summons fog.
 * Main exports: averageRetention.
 */

export function averageRetention(
  memberNodeIds: readonly string[],
  retentionByNode: ReadonlyMap<string, number>,
): number {
  if (memberNodeIds.length === 0) return 1;
  let sum = 0;
  for (const nodeId of memberNodeIds) {
    sum += retentionByNode.get(nodeId) ?? 1;
  }
  return sum / memberNodeIds.length;
}
