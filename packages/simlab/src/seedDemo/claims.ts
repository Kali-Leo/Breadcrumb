/**
 * Purpose: the demo seed's 6 mastery claims (spec 035 T7b) — a learned/taught_principled/
 * taught_surface mix spread over the past ~8 weeks, raw material for the understanding curve.
 * Main exports: buildClaimSeed.
 */
import type { MasteryClaimLevel, MasteryClaimRow, MasteryClaimSource } from "@breadcrumb/core-db";
import { demoId, isoAt } from "./shared";

interface ClaimSpec {
  label: string;
  level: MasteryClaimLevel;
  source: MasteryClaimSource;
  daysAgo: number;
}

// One claim per node it's about (all reference nodes concepts.ts also seeds), oldest first.
const CLAIM_SPECS: readonly ClaimSpec[] = [
  { label: "视差测距法", level: "learned", source: "self-report", daysAgo: 55 },
  { label: "Promise链式调用", level: "taught_surface", source: "teach-back", daysAgo: 40 },
  { label: "恒星光谱分类", level: "taught_principled", source: "teach-back", daysAgo: 30 },
  { label: "数组高阶函数", level: "learned", source: "self-report", daysAgo: 20 },
  { label: "系外行星凌日法", level: "taught_surface", source: "teach-back", daysAgo: 15 },
  // Matches the demo teach conversation (conversations.ts) word for word in timing.
  { label: "闭包与作用域链", level: "taught_principled", source: "teach-back", daysAgo: 10 },
];

/** Skips a claim if its node label was skipped in concepts.ts (label already existed in the
 * DB) — a claim about a node that was never inserted would violate the FK. */
export function buildClaimSeed(
  now: Date,
  nodeIdByLabel: ReadonlyMap<string, string>,
): MasteryClaimRow[] {
  const claims: MasteryClaimRow[] = [];
  CLAIM_SPECS.forEach((spec, index) => {
    const nodeId = nodeIdByLabel.get(spec.label);
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
