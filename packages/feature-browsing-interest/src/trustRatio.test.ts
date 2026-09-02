/**
 * Purpose: tests for the hindsight trust ratio (spec 060 §5) — guardrails first: too few
 * outcomes keep the default, an unskilled interest yardstick keeps the default, the clamp
 * holds at both ends, ties land at chance in the percentile.
 */
import { describe, expect, it } from "vitest";
import {
  BROWSING_TRUST_DEFAULT,
  BROWSING_TRUST_MAX,
  BROWSING_TRUST_MIN,
  type HindsightEvent,
  hindsightTrustRatio,
  MIN_OUTCOME_EVENTS,
  midrankPercentile,
} from "./trustRatio";

function events(count: number, interest: number, browsing: number): HindsightEvent[] {
  return Array.from({ length: count }, () => ({
    interestPercentile: interest,
    browsingPercentile: browsing,
  }));
}

describe("midrankPercentile", () => {
  it("puts an all-zero signal at chance, not at the top", () => {
    expect(midrankPercentile([0, 0, 0], 0)).toBe(0.5);
  });

  it("ranks a clear winner near the top and a clear loser near the bottom", () => {
    expect(midrankPercentile([0.1, 0.2, 0.3], 0.9)).toBeGreaterThan(0.7);
    expect(midrankPercentile([0.5, 0.6, 0.7], 0.1)).toBeLessThan(0.3);
  });
});

describe("hindsightTrustRatio", () => {
  it("keeps the default below the outcome-count floor", () => {
    expect(hindsightTrustRatio(events(MIN_OUTCOME_EVENTS - 1, 0.9, 0.9))).toBe(
      BROWSING_TRUST_DEFAULT,
    );
    expect(hindsightTrustRatio([])).toBe(BROWSING_TRUST_DEFAULT);
  });

  it("keeps the default when interest itself shows no predictive skill", () => {
    expect(hindsightTrustRatio(events(40, 0.5, 0.9))).toBe(BROWSING_TRUST_DEFAULT);
  });

  it("caps at the ceiling even when browsing out-predicts conversation", () => {
    // Product stance: platform-fed signal never outvotes what the learner said.
    expect(hindsightTrustRatio(events(40, 0.6, 0.95))).toBe(BROWSING_TRUST_MAX);
  });

  it("floors when browsing predicts nothing", () => {
    expect(hindsightTrustRatio(events(40, 0.9, 0.5))).toBe(BROWSING_TRUST_MIN);
    expect(hindsightTrustRatio(events(40, 0.9, 0.2))).toBe(BROWSING_TRUST_MIN);
  });

  it("lands between the clamps when both signals carry real, unequal skill", () => {
    // interest skill 0.4, browsing skill 0.2 → ratio 0.5.
    expect(hindsightTrustRatio(events(40, 0.9, 0.7))).toBeCloseTo(0.5);
  });
});
