/**
 * Purpose: how one candidate's ranking number is put together (spec 053 §4). The reader's own
 * history is the primary axis — where the card's topic stands among the topics they read, plus
 * the embedding centroid similarity — and the item's own flat features (crowd signal, cover,
 * freshness) are tie-breakers scaled well below it. Before this the two were simply added in
 * units that were never comparable: the interest term moved in hundredths while the flat features
 * handed out up to 0.53, so thirty days of opens, finishes and saves moved the feed no further
 * than a cover image did (spec 053 T9 findings #7/#8). Pure math, no DB, no I/O.
 * Main exports: RankingWeights, defaultRankingWeights, topicAffinities, establishedTopicAffinity,
 * establishedTopics, RankingInput, rankingScore.
 */
import type { TopicEvidence, TopicWeight } from "./interestModel";

export interface RankingWeights {
  /** Full value of a topic that stands well above the reader's average interest (or, negated,
   * well below it). */
  topicAffinity: number;
  /** Full value of a candidate sitting exactly on the positive centroid. */
  centroidSimilarity: number;
  /** What one item's whole flat-feature bonus is worth at its maximum. */
  maximumContentBonus: number;
}

/**
 * The numbers, and why these: a topic the reader clearly reads is worth up to 1.0 and a topic
 * they clearly refuse −1.0, the embedding centroid adds up to 0.35 on top (it separates items
 * INSIDE a topic, and can lift a good item out of an unfamiliar one), and everything the item
 * carries on its own is capped at 0.12 — about an eighth of what the reader's own history says:
 * enough to order two cards they would be equally happy with, never enough to reorder topics. The
 * quality demotion is not scaled: it keeps its full 0.40 (spec 053 §5), which is the one flat
 * feature allowed to outweigh a mild interest.
 */
export const defaultRankingWeights: RankingWeights = {
  topicAffinity: 1.0,
  centroidSimilarity: 0.35,
  maximumContentBonus: 0.12,
};

/**
 * Folded weights are unbounded and they inflate: a feed that shows two hundred cards a day
 * records two hundred impressions a day, so after a month EVERY topic on the grid carries a
 * weight in the hundreds and an absolute cutoff cannot tell them apart. What matters is where a
 * topic stands against the others, so each weight is read against the average size of the
 * reader's weights and squashed into −1..1. Scale-free by construction: doubling every weight
 * changes nothing, and the average (rather than the maximum) keeps one runaway topic from
 * flattening the rest into a tie.
 */
export function topicAffinities(weights: readonly TopicWeight[]): Map<string, number> {
  const affinities = new Map<string, number>();
  if (weights.length === 0) return affinities;
  const total = weights.reduce((sum, entry) => sum + Math.abs(entry.weight), 0);
  const reference = total / weights.length;
  for (const entry of weights) {
    affinities.set(entry.topicLabel, reference > 0 ? Math.tanh(entry.weight / reference) : 0);
  }
  return affinities;
}

/**
 * Where a topic has to stand before the feed treats it as part of what the reader reads. Half of
 * a full affinity is "clearly above their own average interest", which is a different question
 * from "have they ever touched it": one curious open does not make a topic part of anybody's
 * reading, and neither does the feed having shown it two hundred times (spec 053 T9 finding #3 —
 * the exploration lane emptied within a week because both of those counted).
 */
export const establishedTopicAffinity = 0.5;

/**
 * The topics the reader has actually made part of their reading: engaged with at least once AND
 * standing clearly above their own average. Everything else — never touched, touched once, or
 * merely shown a lot — is what the feed's exploration positions are for, minus the topics the
 * reader refused, which belong in neither place.
 */
export function establishedTopics(
  affinities: ReadonlyMap<string, number>,
  evidence: TopicEvidence,
  bar: number = establishedTopicAffinity,
): Set<string> {
  const established = new Set<string>();
  for (const topicLabel of evidence.engaged) {
    if ((affinities.get(topicLabel) ?? 0) >= bar) established.add(topicLabel);
  }
  return established;
}

export interface RankingInput {
  /** The card's topic standing, −1..1, from topicAffinities; 0 for a topic with no history. */
  topicAffinity: number;
  /** scoreByCentroids' output, or 0 for a card with no embedding yet. */
  centroidScore: number;
  /** contentFeatureParts().bonus — 0 upward, before scaling. */
  contentBonus: number;
  /** contentFeatureParts().demotion — 0 upward, applied at full size. */
  qualityDemotion: number;
}

/** The unscaled maximum of contentFeatures' bonus (crowd signal + cover + freshness), used to
 * turn that bonus into a share of `maximumContentBonus` rather than a raw addition. */
export const maximumRawContentBonus = 0.53;

/** Both history terms are already bounded, but a stray vector or an unreadable number must not
 * be allowed to outweigh the rest of the formula. */
function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(-1, value));
}

export function rankingScore(
  input: RankingInput,
  weights: RankingWeights = defaultRankingWeights,
): number {
  const interest =
    weights.topicAffinity * clampUnit(input.topicAffinity) +
    weights.centroidSimilarity * clampUnit(input.centroidScore);
  const bonusShare = Math.min(1, Math.max(0, input.contentBonus) / maximumRawContentBonus);
  return interest + bonusShare * weights.maximumContentBonus - Math.max(0, input.qualityDemotion);
}
