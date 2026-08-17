/**
 * Purpose: unit tests for contentFeatureAdjustment — the quality check demotes and never
 * promotes, an unrated item is exactly neutral, freshness halves on schedule, and a feed that
 * publishes no crowd numbers, no cover and no date is not penalized for it.
 */
import { describe, expect, it } from "vitest";
import {
  type ContentSignals,
  contentFeatureAdjustment,
  defaultContentFeatureWeights,
} from "./contentFeatures";

const NOW = "2026-08-17T00:00:00.000Z";

function signals(overrides: Partial<ContentSignals> = {}): ContentSignals {
  return {
    upstreamSignal: null,
    hasCover: false,
    publishedAt: null,
    qualityScore: null,
    ...overrides,
  };
}

function hoursBefore(hours: number): string {
  return new Date(Date.parse(NOW) - hours * 60 * 60 * 1000).toISOString();
}

describe("contentFeatureAdjustment", () => {
  it("scores a bare feed item — no crowd number, no cover, no date — at exactly zero", () => {
    expect(contentFeatureAdjustment(signals(), NOW)).toBe(0);
  });

  it("adds the crowd signal in proportion to how saturated it is", () => {
    const half = contentFeatureAdjustment(signals({ upstreamSignal: 0.5 }), NOW);
    const full = contentFeatureAdjustment(signals({ upstreamSignal: 1 }), NOW);
    expect(half).toBeCloseTo(defaultContentFeatureWeights.upstreamSignal / 2, 5);
    expect(full).toBeCloseTo(defaultContentFeatureWeights.upstreamSignal, 5);
  });

  it("gives a real cover a small, flat boost", () => {
    expect(contentFeatureAdjustment(signals({ hasCover: true }), NOW)).toBeCloseTo(
      defaultContentFeatureWeights.cover,
      5,
    );
  });

  it("halves the freshness contribution every half-life", () => {
    const brandNew = contentFeatureAdjustment(signals({ publishedAt: NOW }), NOW);
    const oneHalfLife = contentFeatureAdjustment(
      signals({ publishedAt: hoursBefore(defaultContentFeatureWeights.freshnessHalfLifeHours) }),
      NOW,
    );
    expect(brandNew).toBeCloseTo(defaultContentFeatureWeights.freshness, 5);
    expect(oneHalfLife).toBeCloseTo(defaultContentFeatureWeights.freshness / 2, 5);
  });

  it("treats a future publication date as brand new rather than boosting past the cap", () => {
    const future = new Date(Date.parse(NOW) + 5 * 60 * 60 * 1000).toISOString();
    expect(contentFeatureAdjustment(signals({ publishedAt: future }), NOW)).toBeCloseTo(
      defaultContentFeatureWeights.freshness,
      5,
    );
  });

  it("leaves an unrated item exactly where an unchecked batch would leave it", () => {
    const unrated = contentFeatureAdjustment(signals({ upstreamSignal: 0.4 }), NOW);
    const checkedAndFine = contentFeatureAdjustment(
      signals({ upstreamSignal: 0.4, qualityScore: 0.9 }),
      NOW,
    );
    expect(unrated).toBeCloseTo(checkedAndFine, 10);
  });

  it("never promotes on a high rating, only demotes on a low one", () => {
    const neutral = contentFeatureAdjustment(signals(), NOW);
    const excellent = contentFeatureAdjustment(signals({ qualityScore: 1 }), NOW);
    const poor = contentFeatureAdjustment(signals({ qualityScore: 0 }), NOW);
    expect(excellent).toBe(neutral);
    expect(poor).toBeCloseTo(-defaultContentFeatureWeights.maximumQualityDemotion, 5);
  });

  it("demotes proportionally to how far below the floor the rating fell", () => {
    const threshold = defaultContentFeatureWeights.qualityDemotionThreshold;
    const justUnder = contentFeatureAdjustment(signals({ qualityScore: threshold - 0.01 }), NOW);
    const wellUnder = contentFeatureAdjustment(signals({ qualityScore: threshold / 2 }), NOW);
    expect(justUnder).toBeLessThan(0);
    expect(wellUnder).toBeLessThan(justUnder);
    expect(wellUnder).toBeCloseTo(-defaultContentFeatureWeights.maximumQualityDemotion / 2, 5);
  });
});
