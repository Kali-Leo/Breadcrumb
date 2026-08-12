/**
 * Purpose: acceptance-6 assertions over the 30-day diglot journey — review debt converges,
 * due words are re-encountered promptly (no starvation), density and new-word throttles
 * hold, and the run is deterministic (spec 033).
 */
import { describe, expect, it } from "vitest";
import { simulateDiglotJourney } from "./diglotJourney";

const BASE = { days: 30, messagesPerDay: 6, seed: 42, density: 0.02, newWordDailyBase: 5 };

describe("simulateDiglotJourney", () => {
  const report = simulateDiglotJourney(BASE);

  it("keeps review debt bounded instead of growing without limit", () => {
    const firstWeekMax = Math.max(...report.debtByDay.slice(0, 7));
    const lastWeekMax = Math.max(...report.debtByDay.slice(-7));
    // Converged = the debt of the mature system stays within a small constant band,
    // not a multiple of the early ramp-up.
    expect(lastWeekMax).toBeLessThanOrEqual(Math.max(10, firstWeekMax * 3));
  });

  it("re-encounters 90% of due words within 7 days of falling due", () => {
    expect(report.overdueDaysAtReencounter.length).toBeGreaterThan(20);
    const sorted = [...report.overdueDaysAtReencounter].sort((a, b) => a - b);
    const p90 = sorted[Math.floor(sorted.length * 0.9)] ?? Number.POSITIVE_INFINITY;
    expect(p90).toBeLessThanOrEqual(7);
  });

  it("never exceeds the density ceiling in any message", () => {
    // The short-message floor allows one word on a 20-word message: 5%.
    expect(report.maxObservedDensity).toBeLessThanOrEqual(0.05 + 1e-9);
  });

  it("respects the daily new-word cap every day and still grows vocabulary", () => {
    for (const perDay of report.newWordsByDay) {
      expect(perDay).toBeLessThanOrEqual(BASE.newWordDailyBase);
    }
    expect(report.totalWordsLearning).toBeGreaterThan(20);
  });

  it("is fully deterministic for the same seed", () => {
    const rerun = simulateDiglotJourney(BASE);
    expect(rerun).toEqual(report);
  });
});
