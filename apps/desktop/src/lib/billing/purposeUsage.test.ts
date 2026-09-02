/**
 * Purpose: keeps core-llm's measured purpose catalogue honest. The spending page shows those
 * numbers to learners as what a feature costs, so a prompt edit that changes the size of a
 * call has to fail here and be re-measured rather than quietly turning the table into a lie.
 *
 * Tolerance is deliberately tight. Re-run the measurement and update PURPOSE_USAGE when this
 * fails — do not widen the tolerance.
 */
import { PURPOSE_CADENCE, PURPOSE_USAGE } from "@breadcrumb/core-llm";
import { describe, expect, it } from "vitest";
import { measurePurposeUsage } from "./purposeUsage.measure";

/** How far a measured figure may drift from the published one before it must be updated. */
const TOLERANCE = 0.02;

describe("the published purpose catalogue", () => {
  const measured = measurePurposeUsage();

  it("has a measured row for every purpose the harness covers", () => {
    for (const row of measured) {
      expect(
        PURPOSE_USAGE[row.purpose],
        `${row.purpose} is missing from PURPOSE_USAGE`,
      ).toBeDefined();
    }
  });

  for (const row of measured) {
    it(`still matches the real prompt for ${row.purpose}`, () => {
      const published = PURPOSE_USAGE[row.purpose];
      if (published === undefined) return; // reported by the test above
      expect(published.inputTokens).toBeGreaterThan(row.inputTokens * (1 - TOLERANCE));
      expect(published.inputTokens).toBeLessThan(row.inputTokens * (1 + TOLERANCE));
      expect(published.outputTokens).toBeGreaterThan(row.outputTokens * (1 - TOLERANCE));
      expect(published.outputTokens).toBeLessThan(row.outputTokens * (1 + TOLERANCE));
    });
  }

  it("keeps the cadence-only table clear of purposes that do have a measured profile", () => {
    // A purpose in both tables would have two cadences to disagree about; the measured row
    // is the one that carries a cadence, so the other table must not repeat it.
    for (const purpose of Object.keys(PURPOSE_CADENCE)) {
      expect(PURPOSE_USAGE[purpose], `${purpose} is in both tables`).toBeUndefined();
    }
  });

  it("never publishes a zero-token profile, which would read as free", () => {
    for (const [purpose, usage] of Object.entries(PURPOSE_USAGE)) {
      expect(usage.inputTokens, `${purpose} input`).toBeGreaterThan(0);
      expect(usage.outputTokens, `${purpose} output`).toBeGreaterThan(0);
    }
  });
});
