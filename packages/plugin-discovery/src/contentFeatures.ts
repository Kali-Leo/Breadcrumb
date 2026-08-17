/**
 * Purpose: the ranking features that come from the item itself rather than from the reader's
 * history (spec 053 §4) — how much of a crowd it drew upstream, whether it can be shown with a
 * real cover, how fresh it is, and the batch quality check's verdict. The bonus and the quality
 * demotion are handed back separately because they are sized differently: rankingScore.ts scales
 * the bonus down to a tie-breaker, while the demotion keeps its full weight (spec 053 §5 — the
 * check may only ever push an item down). Pure math, no DB, no I/O.
 * Main exports: ContentSignals, ContentFeatureWeights, defaultContentFeatureWeights,
 * ContentFeatureParts, contentFeatureParts.
 */

/** What one candidate carries in its own right. Every field is nullable because most plain RSS
 * feeds publish none of them, and a feed that publishes nothing must not be penalized for it. */
export interface ContentSignals {
  /** Crowd signal from upstream, already normalized to 0..1 by the channel layer. */
  upstreamSignal: number | null;
  /** A real cover image is available — the card can be shown as a picture, not as text. */
  hasCover: boolean;
  /** Upstream publication instant, ISO 8601. Null when the channel published no date. */
  publishedAt: string | null;
  /** The batch quality check's substance rating, 0..1. Null = unrated, which is neutral. */
  qualityScore: number | null;
}

export interface ContentFeatureWeights {
  /** Full weight of a saturated upstream signal (a front-page story, a megathread). */
  upstreamSignal: number;
  /** Flat bonus for an item that has a real cover image. */
  cover: number;
  /** Full weight of a brand-new item, decaying by half every `freshnessHalfLifeHours`. */
  freshness: number;
  freshnessHalfLifeHours: number;
  /** Ratings at or above this are left alone; below it the item is demoted, proportionally. */
  qualityDemotionThreshold: number;
  /** The demotion a rating of exactly 0 earns. Nothing is ever hidden (spec 053 §5). */
  maximumQualityDemotion: number;
}

/**
 * The RELATIVE shape of the three bonuses — a saturated crowd signal is worth about three covers,
 * freshness a little less than the crowd. Their absolute size against the interest score is not
 * set here: rankingScore.ts scales the whole bonus down to a tie-breaker, because sizing it here
 * is exactly what let flat features outvote the reader's own history for a month (spec 053 T9
 * finding #8). The 72-hour half-life matches how these channels actually read — a two-day-old
 * forum thread is still live, a two-week-old one is not. The 0.35 quality floor is where the
 * prompt's own scale stops promising anything checkable, and the 0.40 demotion is applied at full
 * size, unscaled.
 */
export const defaultContentFeatureWeights: ContentFeatureWeights = {
  upstreamSignal: 0.25,
  cover: 0.08,
  freshness: 0.2,
  freshnessHalfLifeHours: 72,
  qualityDemotionThreshold: 0.35,
  maximumQualityDemotion: 0.4,
};

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

/** 1 for something published this instant, halving every half-life. An item with no date and
 * one with an unreadable date both score 0: no boost, no penalty. Items dated in the future
 * (clock skew, feeds that schedule ahead) are treated as brand new rather than boosted past 1. */
function freshnessFactor(
  publishedAt: string | null,
  nowIso: string,
  halfLifeHours: number,
): number {
  if (publishedAt === null || halfLifeHours <= 0) return 0;
  const published = Date.parse(publishedAt);
  const now = Date.parse(nowIso);
  if (Number.isNaN(published) || Number.isNaN(now)) return 0;
  const ageHours = Math.max(0, (now - published) / MILLISECONDS_PER_HOUR);
  return 0.5 ** (ageHours / halfLifeHours);
}

/**
 * How far below the quality floor the rating fell, as a 0..1 fraction. Unrated items — which is
 * every item when the 发现 · 质检 switch is off, and every item the model skipped — return 0,
 * because "we did not ask" must never read as "we asked and it was bad" (spec 053 §5).
 */
function qualityShortfall(qualityScore: number | null, threshold: number): number {
  if (qualityScore === null || threshold <= 0) return 0;
  if (qualityScore >= threshold) return 0;
  return Math.min(1, (threshold - Math.max(0, qualityScore)) / threshold);
}

export interface ContentFeatureParts {
  /** Crowd signal + cover + freshness, all non-negative. Scaled by the caller. */
  bonus: number;
  /** How far the quality check pushes the item down, 0 upward. Never scaled. */
  demotion: number;
}

/**
 * The item's own contribution to its ranking, in two parts. The bonus comes from the crowd
 * signal, a real cover and freshness; the demotion is the quality check's, and it is the only
 * negative one — a high rating buys an item nothing, so an unrated batch ranks exactly as it
 * would have with the check switched off.
 */
export function contentFeatureParts(
  signals: ContentSignals,
  nowIso: string,
  weights: ContentFeatureWeights = defaultContentFeatureWeights,
): ContentFeatureParts {
  const upstream = Math.min(1, Math.max(0, signals.upstreamSignal ?? 0)) * weights.upstreamSignal;
  const cover = signals.hasCover ? weights.cover : 0;
  const freshness =
    freshnessFactor(signals.publishedAt, nowIso, weights.freshnessHalfLifeHours) *
    weights.freshness;
  return {
    bonus: upstream + cover + freshness,
    demotion:
      qualityShortfall(signals.qualityScore, weights.qualityDemotionThreshold) *
      weights.maximumQualityDemotion,
  };
}
