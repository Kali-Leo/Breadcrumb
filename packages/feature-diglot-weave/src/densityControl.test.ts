/**
 * Purpose: tests for the density loop — it has to move in the right direction, refuse to move
 * on thin evidence, stay inside its bounds, and settle rather than oscillate.
 */
import { describe, expect, it } from "vitest";
import {
  DENSITY_MAX,
  DENSITY_MIN,
  MIN_WOVEN_WORDS_FOR_ADJUSTMENT,
  nextDensity,
  TARGET_LOOKUP_RATE_BAND,
} from "./densityControl";

const CURRENT = 0.02;

describe("nextDensity", () => {
  it("does not move on a window too thin to mean anything", () => {
    expect(
      nextDensity(CURRENT, { wovenWords: MIN_WOVEN_WORDS_FOR_ADJUSTMENT - 1, lookups: 12 }),
    ).toBe(CURRENT);
  });

  it("leaves a comfortable rate alone", () => {
    const lookups = Math.round(
      40 * ((TARGET_LOOKUP_RATE_BAND.low + TARGET_LOOKUP_RATE_BAND.high) / 2),
    );
    expect(nextDensity(CURRENT, { wovenWords: 40, lookups })).toBe(CURRENT);
  });

  it("eases off when nearly every woven word has to be looked up", () => {
    expect(nextDensity(CURRENT, { wovenWords: 40, lookups: 36 })).toBeLessThan(CURRENT);
  });

  it("offers a little more when almost nothing gets looked up", () => {
    expect(nextDensity(CURRENT, { wovenWords: 40, lookups: 1 })).toBeGreaterThan(CURRENT);
  });

  it("stays inside its bounds however extreme the window", () => {
    let density = DENSITY_MAX;
    for (let day = 0; day < 50; day += 1) {
      density = nextDensity(density, { wovenWords: 100, lookups: 100 });
    }
    expect(density).toBeGreaterThanOrEqual(DENSITY_MIN);
    density = DENSITY_MIN;
    for (let day = 0; day < 50; day += 1) {
      density = nextDensity(density, { wovenWords: 100, lookups: 0 });
    }
    expect(density).toBeLessThanOrEqual(DENSITY_MAX);
  });

  it("takes days, not one window, to travel", () => {
    const afterOneDay = nextDensity(CURRENT, { wovenWords: 100, lookups: 0 });
    expect(afterOneDay).toBeLessThan(CURRENT + (DENSITY_MAX - CURRENT) / 2);
  });

  it("settles once the rate comes back into the band", () => {
    const density = nextDensity(CURRENT, { wovenWords: 100, lookups: 0 });
    const settled = nextDensity(density, { wovenWords: 100, lookups: 25 });
    expect(settled).toBe(density);
  });
});
