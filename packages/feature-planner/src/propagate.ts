/**
 * Purpose: one-hop reverse interest propagation — an unlit node the learner is genuinely
 * curious about, but can't reach yet, lends some of that interest to its own unlit
 * requires-prerequisites, so frontier() can surface "this gets you closer to X" candidates.
 * Pure function, no DB, no I/O.
 * Main exports: propagateInterestToPrerequisites, PropagatedInterest,
 * PROPAGATION_INTEREST_THRESHOLD, PROPAGATION_INHERIT_FACTOR.
 */
import type { KnowledgeEdgeRow } from "@breadcrumb/core-db";

/** An unlit node needs at least this much of its own interest score before it can lend any
 * to its prerequisites — mild curiosity shouldn't ripple the whole tree. */
export const PROPAGATION_INTEREST_THRESHOLD = 0.3;

/** A qualifying prerequisite inherits this fraction of its locked dependent's interest —
 * wanting X is a real but weaker reason to want X's prerequisite than wanting the
 * prerequisite itself. */
export const PROPAGATION_INHERIT_FACTOR = 0.5;

export interface PropagatedInterest {
  /** Every input node id, with unlit requires-prerequisites of a sufficiently-interesting
   * locked dependent bumped up to max(their own interest, dependent interest x factor). */
  interestByNode: Map<string, number>;
  /** nodeId -> id of the single dependent node whose interest propagation actually raised
   * this node's score (present only where propagation changed something). When several
   * dependents qualify, the one contributing the highest inherited value wins — sources
   * never stack. */
  gatewaySourceByNode: Map<string, string>;
}

/** One hop only: a prerequisite's own prerequisites never inherit further — this models
 * "you might want to learn this because it gets you closer to X", not a transitive flood. */
export function propagateInterestToPrerequisites(
  edges: readonly KnowledgeEdgeRow[],
  interestByNode: ReadonlyMap<string, number>,
  masteryByNode: ReadonlyMap<string, number>,
  litThreshold: number,
): PropagatedInterest {
  const isLit = (nodeId: string) => (masteryByNode.get(nodeId) ?? 0) >= litThreshold;
  const interestResult = new Map(interestByNode);
  const gatewaySourceByNode = new Map<string, string>();

  for (const edge of edges) {
    if (edge.edge_type !== "requires") continue;
    const dependentId = edge.target_id;
    const prerequisiteId = edge.source_id;
    if (isLit(dependentId) || isLit(prerequisiteId)) continue;

    const dependentInterest = interestByNode.get(dependentId) ?? 0;
    if (dependentInterest < PROPAGATION_INTEREST_THRESHOLD) continue;

    const inherited = dependentInterest * PROPAGATION_INHERIT_FACTOR;
    const current = interestResult.get(prerequisiteId) ?? 0;
    if (inherited > current) {
      interestResult.set(prerequisiteId, inherited);
      gatewaySourceByNode.set(prerequisiteId, dependentId);
    }
  }

  return { interestByNode: interestResult, gatewaySourceByNode };
}
