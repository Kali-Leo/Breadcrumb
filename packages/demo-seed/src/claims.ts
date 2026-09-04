/**
 * Purpose: the demo seed's 6 mastery claims (spec 035 T7b) — a learned/taught_principled/
 * taught_surface mix spread over the past ~8 weeks, raw material for the understanding curve.
 * Main exports: buildClaimSeed.
 */
import type { MasteryClaimLevel, MasteryClaimRow, MasteryClaimSource } from "@breadcrumb/core-db";
import { demoId, isoAt } from "./shared";
import type { ConceptId } from "./text/demoText";

interface ClaimSpec {
  id: ConceptId;
  level: MasteryClaimLevel;
  source: MasteryClaimSource;
  daysAgo: number;
}

// One claim per node it's about (all reference nodes concepts.ts also seeds), oldest first.
const CLAIM_SPECS: readonly ClaimSpec[] = [
  { id: "parallax", level: "learned", source: "self-report", daysAgo: 55 },
  { id: "promise-chains", level: "taught_surface", source: "teach-back", daysAgo: 40 },
  { id: "stellar-spectra", level: "taught_principled", source: "teach-back", daysAgo: 30 },
  { id: "array-higher-order", level: "learned", source: "self-report", daysAgo: 20 },
  { id: "transits", level: "taught_surface", source: "teach-back", daysAgo: 15 },
  // Matches the demo teach conversation (conversations.ts) word for word in timing.
  { id: "closures", level: "taught_principled", source: "teach-back", daysAgo: 10 },
];

/** Skips a claim if its node was skipped in concepts.ts (its name already existed in the
 * DB) — a claim about a node that was never inserted would violate the FK. */
export function buildClaimSeed(
  now: Date,
  nodeIdById: ReadonlyMap<ConceptId, string>,
): MasteryClaimRow[] {
  const claims: MasteryClaimRow[] = [];
  CLAIM_SPECS.forEach((spec, index) => {
    const nodeId = nodeIdById.get(spec.id);
    if (nodeId === undefined) return;
    claims.push({
      id: demoId("claim", index),
      node_id: nodeId,
      level: spec.level,
      source: spec.source,
      created_at: isoAt(now, spec.daysAgo, 19, 30),
    });
  });
  return claims;
}
