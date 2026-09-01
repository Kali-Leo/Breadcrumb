/**
 * Purpose: which knowledge nodes the paid anchor sweep should stop asking about (spec 025's
 * own walkthrough note, backlog "锚定清扫休眠计数"). A node the judge has already told us is
 * unlike several different canonical concepts is almost certainly the learner's own idea —
 * something nobody's curriculum has a name for — and every later sweep would re-ask about it
 * with a fresh top-k, paying again for the same answer.
 *
 * Dormancy is derived from the verdicts already stored, not recorded anywhere: nothing to
 * migrate, nothing to keep in sync, and a merge or a re-judgement lifts it by itself. It only
 * stops the *paid* path — the free alias pass still runs, so a concept added tomorrow whose
 * name matches exactly is still found.
 * Main exports: DORMANT_AFTER_DIFFERENT_VERDICTS, dormantNodeIds.
 */

/** How many "different" verdicts make a node dormant. Six is two full sweeps' worth of top-3
 * candidates: enough that the answer is unlikely to be an accident of one recall list. */
export const DORMANT_AFTER_DIFFERENT_VERDICTS = 6;

export interface AnchorVerdictRow {
  node_id: string;
  verdict: string;
}

/**
 * Nodes that have collected enough "different" verdicts and never a "same". A node with any
 * "same" is anchored and skipped for a better reason already; a node below the threshold is
 * still worth asking about.
 */
export function dormantNodeIds(
  anchors: readonly AnchorVerdictRow[],
  threshold: number = DORMANT_AFTER_DIFFERENT_VERDICTS,
): Set<string> {
  const differentCounts = new Map<string, number>();
  const anchored = new Set<string>();
  for (const row of anchors) {
    if (row.verdict === "same") anchored.add(row.node_id);
    else if (row.verdict === "different") {
      differentCounts.set(row.node_id, (differentCounts.get(row.node_id) ?? 0) + 1);
    }
  }
  const dormant = new Set<string>();
  for (const [nodeId, count] of differentCounts) {
    if (count >= threshold && !anchored.has(nodeId)) dormant.add(nodeId);
  }
  return dormant;
}
