/**
 * Purpose: what the right answer is for one verdict scenario, and every number derived from a
 * model's reply to it. Split out of verdict.ts because two very different callers need exactly
 * the same scoring: the per-call `check` closure the bench runs, and the ensemble analysis that
 * later combines several models' replies to the same scenario. One copy of the scoring means a
 * voting table and a single-model table cannot quietly measure different things.
 *
 * The gated label is the product's own: gateVerdict from feature-factcheck, not a
 * reimplementation. A configuration whose numbers look good here is therefore a configuration
 * the shipped code can actually reproduce.
 * Main exports: VerdictTruth, VerdictReply, verdictLabel, scoreLabel, scoreVerdict.
 */
import {
  type EvidenceItem,
  gateVerdict,
  quoteIsGrounded,
  type VerdictRelationship,
} from "@breadcrumb/feature-factcheck";
import type { CheckScores } from "../scenarioTypes";

/** One scenario's ground truth plus everything the scoring needs about how it was asked. */
export interface VerdictTruth {
  scenarioId: string;
  purpose: string;
  itemId: string;
  language: string;
  gold: VerdictRelationship;
  /** A hard negative: on-topic, lexically overlapping evidence that still does not support. */
  hard: boolean;
  /** True when this configuration asked for a quote and puts the anchor gate in front of the
   * label — i.e. when a verdict the gate refuses counts as `insufficient`. */
  gated: boolean;
  /** Exactly the list the prompt showed, in the order it showed them. */
  evidence: readonly EvidenceItem[];
  /** 1-based index of the passage the gold label rests on, or null (every `insufficient`). */
  decisiveIndex: number | null;
}

/** The fields of a verdict reply that scoring reads — structurally what createVerdictSchema
 * produces, named here so the ensemble can pass a reply it re-read from a results file. */
export interface VerdictReply {
  relationship: VerdictRelationship;
  quote: string;
  supportingEvidence: readonly number[];
}

/** The label this configuration actually acts on: the gate's verdict where the gate is on, the
 * model's own where it is off. */
export function verdictLabel(truth: VerdictTruth, reply: VerdictReply): VerdictRelationship {
  if (!truth.gated) return reply.relationship;
  return gateVerdict(reply, truth.evidence).relationship;
}

function citedItems(truth: VerdictTruth, reply: VerdictReply): EvidenceItem[] {
  return reply.supportingEvidence
    .map((index) => truth.evidence[index - 1])
    .filter((item): item is EvidenceItem => item !== undefined);
}

/** The quote columns, reported only for a configuration that asked for a quote AND only on the
 * replies where a quote was required (a decided label) — a rate over a question nobody asked is
 * an absence, not a zero. */
function quoteScores(truth: VerdictTruth, reply: VerdictReply): CheckScores {
  if (!truth.gated || reply.relationship === "insufficient") return {};
  const grounded = quoteIsGrounded(reply.quote, truth.evidence);
  return {
    // Did the model copy a sentence that is really in the material?
    quoteGrounded: grounded ? 1 : 0,
    // ...and is it in one of the passages it also cited? A quote grounded somewhere else means
    // the citation and the reasoning point at different pages.
    quoteInCited: quoteIsGrounded(reply.quote, citedItems(truth, reply)) ? 1 : 0,
    // How often the gate had to step in and cancel a decided verdict.
    gateDowngrade: grounded ? 0 : 1,
  };
}

/** The same accuracy questions asked of the label BEFORE the gate — this is what separates
 * "asking for a quote made the model more careful" from "the gate caught what it did anyway". */
function rawScores(truth: VerdictTruth, reply: VerdictReply): CheckScores {
  if (!truth.gated) return {};
  const raw = reply.relationship;
  const scores: Record<string, number> = {
    rawVerdictAccuracy: raw === truth.gold ? 1 : 0,
    rawAbstentionRate: raw === "insufficient" ? 1 : 0,
  };
  if (truth.gold !== "supported") scores.rawFalseSupportRate = raw === "supported" ? 1 : 0;
  return scores;
}

/**
 * Every number that depends only on the label a configuration ended up acting on. Split from
 * scoreVerdict because a voting configuration has a label but no single reply: the ensemble
 * table and the single-model table must be computed by the same function or they are not
 * comparable.
 */
export function scoreLabel(truth: VerdictTruth, said: VerdictRelationship): CheckScores {
  const scores: Record<string, number> = {
    verdictAccuracy: said === truth.gold ? 1 : 0,
    // How often the judge declines to decide, over every item. Read next to the two rates
    // below: abstention is only a virtue where the evidence really is short.
    abstentionRate: said === "insufficient" ? 1 : 0,
  };
  if (truth.gold !== "supported") {
    // THE number. One of these going to 1 is one learner told a wrong thing was verified.
    scores.falseSupportRate = said === "supported" ? 1 : 0;
    if (truth.hard) scores.hardFalseSupportRate = said === "supported" ? 1 : 0;
  }
  if (truth.gold === "supported") {
    // The price of caution: a real citation the learner never got to see.
    scores.supportRecall = said === "supported" ? 1 : 0;
  }
  if (said === "insufficient") {
    // Of the times it abstained, how often it should have.
    scores.abstentionPrecision = truth.gold === "insufficient" ? 1 : 0;
  }
  if (truth.gold === "insufficient") {
    // Of the times it should have abstained, how often it did.
    scores.abstentionRecall = said === "insufficient" ? 1 : 0;
  }
  if (truth.gold === "contradicted") {
    scores.contradictionRecall = said === "contradicted" ? 1 : 0;
  }
  return scores;
}

/** Every reference-free number for one model's reply: the label questions, plus the two things
 * only a single reply can answer — did it cite the passage its label rests on, and did its
 * quote survive the gate. */
export function scoreVerdict(truth: VerdictTruth, reply: VerdictReply): CheckScores {
  const said = verdictLabel(truth, reply);
  const scores: Record<string, number> = { ...scoreLabel(truth, said) };
  if (truth.decisiveIndex !== null && said === truth.gold) {
    // Right answer for the right reason: the citation points at the passage the label actually
    // rests on, rather than at whatever was in slot one.
    scores.citedDecisive = reply.supportingEvidence.includes(truth.decisiveIndex) ? 1 : 0;
  }
  return { ...scores, ...quoteScores(truth, reply), ...rawScores(truth, reply) };
}
