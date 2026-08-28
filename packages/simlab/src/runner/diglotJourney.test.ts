/**
 * Purpose: acceptance-6 assertions over the 30-day diglot journey — meetable review debt
 * converges, due words are re-encountered promptly (no starvation), density and new-word
 * throttles hold, intake is not choked by unpayable debt (audit 2026-08-28 #3), and the run
 * is deterministic (spec 033).
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

  it("holds the meetable debt — the throttle's own input — in a flat band", () => {
    // Debt outside the window is unpayable by construction (those words left the chat); what
    // must stay bounded is the part the conversation can still deliver.
    const lastFortnight = report.meetableDebtByDay.slice(-14);
    expect(Math.max(...lastFortnight)).toBeLessThanOrEqual(35);
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

  it("keeps taking new words in instead of locking up on unpayable debt", () => {
    // Measured 2026-08-28: 61 words introduced, 20 of them held (FSRS stability ≥ 7 days).
    // With the debt counted unfiltered — the behaviour before this fix — the same corpus and
    // seed give 42/17, and by day 90 intake stops entirely (78 words vs 139 here).
    expect(report.totalWordsLearning).toBeGreaterThanOrEqual(50);
    expect(report.wordsHeld).toBeGreaterThanOrEqual(10);
    // Intake must still be alive at the end of the run, not just during the ramp-up.
    expect(report.newWordsByDay.slice(-7).reduce((sum, day) => sum + day, 0)).toBeGreaterThan(2);
  });

  it("is fully deterministic for the same seed", () => {
    const rerun = simulateDiglotJourney(BASE);
    expect(rerun).toEqual(report);
  });
});
