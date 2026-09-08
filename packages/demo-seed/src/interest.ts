/**
 * Purpose: the demo learner's interest signals — what they keep coming back to on their own.
 * This is the other half of what makes the palace's 休闲/目标 switch legible: 休闲 mode ranks
 * by curiosity, and with no signals at all every candidate tied at zero and the "casual"
 * recommendation degenerated into alphabetical order.
 *
 * The shape of the data is the point. Curiosity sits on the astronomy side — compact objects
 * and bent light, the reading this learner does for pleasure — while the JavaScript side
 * carries confusion and mild boredom instead. The goal's own remaining nodes carry no signal
 * at all, because they are nodes the goal decomposition surfaced and no conversation has
 * reached yet. So 休闲 recommends what the learner wants and 目标 recommends what the goal
 * needs, and the two lists genuinely disagree.
 * Main exports: buildInterestSeed.
 */
import type { InterestSignalRow } from "@breadcrumb/core-db";
import { ALL_CONCEPT_SPECS } from "./conceptSpecs";
import type { DemoConversationRef } from "./conversations";
import { demoId, safeIsoAt } from "./shared";
import type { ConceptId } from "./text/demoText";

interface InterestSpec {
  id: ConceptId;
  /** 0~1, the dimension the frontier and the route both rank on. */
  curiosity: number;
  confusion: number;
  boredom: number;
  /** How sure the extraction pass was: 0.3 低 / 0.6 中 / 0.9 高 — the same three values the
   * real interest extractor emits. */
  confidence: number;
  daysAgo: number;
}

/**
 * Oldest last. Nodes with more than one row are the ones the learner actually circled back
 * to; a single row leaves the shrinkage prior dominant, which is the honest reading of one
 * observation. Read as a whole this says: black holes and lensing pull hard and recently,
 * the older astronomy is warm, the JavaScript line is duty with real confusion in it, and
 * 星等标尺 is the one thing they were visibly bored by.
 */
const INTEREST_SPECS: readonly InterestSpec[] = [
  // The pull: astronomy, recent and repeated.
  { id: "event-horizon", curiosity: 0.95, confusion: 0.2, boredom: 0, confidence: 0.9, daysAgo: 2 },
  { id: "event-horizon", curiosity: 0.9, confusion: 0.3, boredom: 0, confidence: 0.9, daysAgo: 11 },
  {
    id: "event-horizon",
    curiosity: 0.85,
    confusion: 0.35,
    boredom: 0,
    confidence: 0.6,
    daysAgo: 34,
  },
  {
    id: "gravitational-lensing",
    curiosity: 0.9,
    confusion: 0.15,
    boredom: 0,
    confidence: 0.9,
    daysAgo: 0,
  },
  {
    id: "gravitational-lensing",
    curiosity: 0.8,
    confusion: 0.25,
    boredom: 0,
    confidence: 0.6,
    daysAgo: 16,
  },
  { id: "neutron-star", curiosity: 0.8, confusion: 0.2, boredom: 0, confidence: 0.9, daysAgo: 6 },
  {
    id: "neutron-star",
    curiosity: 0.75,
    confusion: 0.2,
    boredom: 0.05,
    confidence: 0.6,
    daysAgo: 24,
  },
  { id: "cmb", curiosity: 0.7, confusion: 0.4, boredom: 0, confidence: 0.6, daysAgo: 11 },
  {
    id: "white-dwarf",
    curiosity: 0.65,
    confusion: 0.15,
    boredom: 0.05,
    confidence: 0.9,
    daysAgo: 3,
  },
  {
    id: "tidal-locking",
    curiosity: 0.45,
    confusion: 0.2,
    boredom: 0.1,
    confidence: 0.6,
    daysAgo: 70,
  },
  {
    id: "kepler-laws",
    curiosity: 0.35,
    confusion: 0.3,
    boredom: 0.15,
    confidence: 0.6,
    daysAgo: 74,
  },
  {
    id: "magnitude-scale",
    curiosity: 0.15,
    confusion: 0.25,
    boredom: 0.5,
    confidence: 0.6,
    daysAgo: 78,
  },
  // The duty: JavaScript, more confusion than curiosity.
  {
    id: "event-loop",
    curiosity: 0.55,
    confusion: 0.35,
    boredom: 0.05,
    confidence: 0.9,
    daysAgo: 9,
  },
  { id: "async-await", curiosity: 0.5, confusion: 0.6, boredom: 0.1, confidence: 0.9, daysAgo: 68 },
  {
    id: "array-higher-order",
    curiosity: 0.4,
    confusion: 0.3,
    boredom: 0.1,
    confidence: 0.9,
    daysAgo: 20,
  },
  {
    id: "prototype-chain",
    curiosity: 0.3,
    confusion: 0.7,
    boredom: 0.2,
    confidence: 0.6,
    daysAgo: 72,
  },
  {
    id: "destructuring",
    curiosity: 0.25,
    confusion: 0.1,
    boredom: 0.3,
    confidence: 0.6,
    daysAgo: 76,
  },
];

/** Which domain conversation a signal is attributed to — read off the node specs rather than
 * repeated here, so a concept that moves domain cannot leave its signals behind. */
const DOMAIN_BY_CONCEPT = new Map(ALL_CONCEPT_SPECS.map((spec) => [spec.id, spec.domain]));

/**
 * Builds the interest signals, skipping any whose node concepts.ts did not insert (its label
 * already existed in the user's own tree) — the same foreign-key rule claims.ts follows.
 *
 * styles_json is deliberately an empty list. A style tag is free text the extractor writes in
 * whatever language the conversation ran in, and it is fed straight back into a later prompt;
 * inventing eleven translations of "analogy" for a fixture would put words in the demo
 * learner's mouth that no demo conversation ever said.
 */
export function buildInterestSeed(
  now: Date,
  nodeIdById: ReadonlyMap<ConceptId, string>,
  conversations: DemoConversationRef,
): InterestSignalRow[] {
  const signals: InterestSignalRow[] = [];
  INTEREST_SPECS.forEach((spec, index) => {
    const nodeId = nodeIdById.get(spec.id);
    const domain = DOMAIN_BY_CONCEPT.get(spec.id);
    if (nodeId === undefined || domain === undefined) return;
    signals.push({
      id: demoId("interest", index),
      node_id: nodeId,
      conversation_id: conversations.conversationIdByDomain[domain],
      curiosity: spec.curiosity,
      confusion: spec.confusion,
      boredom: spec.boredom,
      confidence: spec.confidence,
      styles_json: "[]",
      created_at: safeIsoAt(now, spec.daysAgo, 20, 40),
    });
  });
  return signals;
}
