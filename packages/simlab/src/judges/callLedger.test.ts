/**
 * Purpose: unit tests for the per-purpose call ledger and failure-rate computation.
 */
import { describe, expect, it } from "vitest";
import { createCallLedger, purposeFailureRates } from "./callLedger";

describe("createCallLedger", () => {
  it("tallies successes and failures independently per purpose", () => {
    const ledger = createCallLedger();
    ledger.recordSuccess("knowledge-tree");
    ledger.recordSuccess("knowledge-tree");
    ledger.recordFailure("knowledge-tree");
    ledger.recordSuccess("interest");

    expect(ledger.snapshot()).toEqual({
      "knowledge-tree": { success: 2, failure: 1 },
      interest: { success: 1, failure: 0 },
    });
  });
});

describe("purposeFailureRates", () => {
  it("computes failure / total per purpose", () => {
    const rates = purposeFailureRates({
      "knowledge-tree": { success: 3, failure: 1 },
      interest: { success: 0, failure: 0 },
    });
    expect(rates["knowledge-tree"]).toBeCloseTo(0.25, 6);
    expect(rates.interest).toBe(0);
  });
});
