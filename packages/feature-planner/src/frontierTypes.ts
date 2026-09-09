/**
 * Purpose: the frontier query's data shapes — what a caller feeds frontier() and what it gets
 * back. Split out of frontier.ts purely for the file-size ceiling; the contract they describe
 * is documented here and nowhere else. No logic, no imports beyond row types.
 * Main exports: FrontierReason, FrontierCandidate, FrontierInput.
 */

import type { KnowledgeEdgeRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import type { FrontierWeights } from "./frontierScore";

export interface FrontierReason {
  /** Labels of this node's requires-prerequisites that ARE satisfied — lit now, or lit at
   * some point before (see FrontierInput's previouslyLitNodeIds). */
  litPrerequisiteLabels: string[];
  /** Labels of this node's requires-prerequisites that are NOT satisfied. Non-empty means the
   * candidate is still shown but was demoted for it (see UNMET_PREREQUISITE_PENALTY): a
   * requires edge is a soft ordering preference, not a lock, because the edge itself is only
   * as trustworthy as the model that drew it. Callers that present a candidate to the learner
   * should say what is still missing rather than hide the entry. */
  unlitPrerequisiteLabels: string[];
  /** Lit nodes whose helps edge points at this candidate, with that edge's weight. Unlike the
   * prerequisite labels this one stays on CURRENTLY lit: a helps source is live support the
   * learner can actually lean on right now. */
  litHelpsSources: { label: string; weight: number }[];
  /** True when this node has any sighting/claim evidence at all — it was seen or claimed
   * before and has since decayed back under the lit threshold. Distinguishes "review" from
   * "brand new" so callers don't present a decayed-back-in node as fresh material. */
  wasLitBefore: boolean;
  /** Set when this candidate's interest score was raised by one-hop reverse propagation
   * (propagate.ts) from a locked-but-interesting dependent — lets the UI explain
   * "this gets you closer to X" instead of a bare interest number. Absent when the caller
   * didn't run propagation, or this candidate's interest wasn't propagated. */
  gatewayTo?: { label: string };
  /** True when this candidate is inside the caller-supplied goalGapNodeIds set (ranked mode)
   * — lets the UI show a "目标内" tag. Absent when the caller didn't supply one. */
  inGoalGap?: boolean;
}

export interface FrontierCandidate {
  nodeId: string;
  label: string;
  /** Node kind, echoed so callers can tell a method suggestion from a concept one without a
   * second lookup — and so the concept/method bucketing stays inspectable. */
  kind: KnowledgeNodeRow["kind"];
  score: number;
  reason: FrontierReason;
  /** This node's interest evidenceWeight (aggregateInterest's shrinkage mass), when the
   * caller supplies one. UI uses < 1 to show a subtle "依据尚少" (thin evidence) tag. */
  evidenceWeight?: number;
}

export interface FrontierInput {
  nodes: readonly KnowledgeNodeRow[];
  edges: readonly KnowledgeEdgeRow[];
  masteryByNode: ReadonlyMap<string, number>;
  interestByNode: ReadonlyMap<string, number>;
  /** Mastery value at/above which a node counts as lit. Caller-supplied so this package
   * never imports feature-memory's threshold constant (keeps the mastery/planner layers
   * independent). */
  litThreshold: number;
  /** Node ids with any sighting/claim evidence ever recorded, regardless of current mastery.
   * Two jobs: it drives FrontierReason.wasLitBefore, and it decides whether a
   * requires-prerequisite counts as satisfied — satisfied if it is lit now OR listed here.
   * Mastery is a retention estimate that expires in days; reading structure off it alone
   * would mean a deep node needs all its prerequisites mentioned inside the same short
   * window, which almost never happens. Caller-supplied for the same layering reason as
   * litThreshold. */
  previouslyLitNodeIds: ReadonlySet<string>;
  /** nodeId -> id of the dependent node whose locked interest propagated into it
   * (propagate.ts's gatewaySourceByNode). Optional — omit when the caller didn't run
   * propagation; interestByNode is then read as-is with no gatewayTo reasons attached. */
  interestGatewayByNode?: ReadonlyMap<string, string>;
  /** nodeId -> interest evidenceWeight, surfaced on the candidate for the "依据尚少" UI tag,
   * and the signal the exploration slot ranks on. */
  evidenceWeightByNode?: ReadonlyMap<string, number>;
  /** Ranked-mode-only: the selected goal's gap node ids. A candidate in this set
   * scores the goalGap component and gets reason.inGoalGap = true. Omit in casual mode or when
   * no goal is selected. */
  goalGapNodeIds?: ReadonlySet<string>;
  /** nodeId -> browsing-affinity score in [0,1] from watched professional content. A plain
   * number: which video produced the score deliberately never leaves the
   * affinity computation. Omit (or pass empty)
   * when the interest service is absent — the component then carries no information and
   * cannot move the order. */
  browsingAffinityByNode?: ReadonlyMap<string, number>;
  /** User-tuned component weights (the palace's 推荐偏好 panel). Omit for the
   * FRONTIER_WEIGHTS defaults — pre-060 behaviour exactly. */
  weights?: FrontierWeights;
}
