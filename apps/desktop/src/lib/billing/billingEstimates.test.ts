/**
 * Purpose: the estimate shown under each feature must come from the learner's own recorded
 * usage once there is enough of it, and fall back to the measured catalogue otherwise —
 * these lock in the switchover threshold, the fallback, and that recorded cache hits are
 * priced at the cache rate.
 */
import type { PurposeAverageUsage } from "@breadcrumb/core-db";
import type { ModelRates } from "@breadcrumb/core-llm";
import { describe, expect, it } from "vitest";
import { estimateFeatureCost, LEDGER_MIN_SAMPLES } from "./billingEstimates";

/** Own rates so the assertions don't move with the off-peak clock. */
const RATES: ModelRates = {
  currency: "CNY",
  inputPerMillionTokens: 3,
  cachedInputPerMillionTokens: 0.1,
  outputPerMillionTokens: 9,
};

const PRICING = { model: "deepseek-v4-flash", currency: "CNY" as const, override: RATES };

function ledger(...rows: PurposeAverageUsage[]): ReadonlyMap<string, PurposeAverageUsage> {
  return new Map(rows.map((row) => [row.purpose, row]));
}

function average(purpose: string, samples: number, input: number, output: number, cached = 0) {
  return {
    purpose,
    samples,
    inputTokens: input,
    outputTokens: output,
    cachedInputTokens: cached,
  };
}

describe("estimateFeatureCost", () => {
  it("prices from the account's own average once there are enough recorded calls", () => {
    const estimate = estimateFeatureCost(
      ["knowledge-tree"],
      PRICING,
      ledger(average("knowledge-tree", LEDGER_MIN_SAMPLES, 1400, 2000)),
    );

    // 1400 × ¥3/M + 2000 × ¥9/M = ¥0.0222 — the catalogue's 64-token reply would say ¥0.0046.
    expect(estimate).toEqual({
      kind: "estimate",
      cost: "¥0.0222",
      cadence: "per-round",
      source: "ledger",
      samples: LEDGER_MIN_SAMPLES,
    });
  });

  it("falls back to the catalogue while the purpose has too few recorded calls", () => {
    const estimate = estimateFeatureCost(
      ["knowledge-tree"],
      PRICING,
      ledger(average("knowledge-tree", LEDGER_MIN_SAMPLES - 1, 1400, 2000)),
    );

    expect(estimate).toEqual({
      kind: "estimate",
      cost: "¥0.0046",
      cadence: "per-round",
      source: "catalogue",
      samples: 0,
    });
  });

  it("uses the catalogue when the account has no record of the purpose at all", () => {
    const withEmptyLedger = estimateFeatureCost(["knowledge-tree"], PRICING, ledger());
    const withNoLedger = estimateFeatureCost(["knowledge-tree"], PRICING);

    expect(withEmptyLedger).toEqual(withNoLedger);
    expect(withNoLedger).toMatchObject({ cost: "¥0.0046", source: "catalogue" });
  });

  it("prices the recorded cache hits at the cache rate", () => {
    const fresh = estimateFeatureCost(
      ["knowledge-tree"],
      PRICING,
      ledger(average("knowledge-tree", 4, 1400, 2000, 0)),
    );
    const cached = estimateFeatureCost(
      ["knowledge-tree"],
      PRICING,
      ledger(average("knowledge-tree", 4, 1400, 2000, 1400)),
    );

    expect(fresh).toMatchObject({ cost: "¥0.0222" });
    // 1400 × ¥0.1/M + 2000 × ¥9/M = ¥0.01814.
    expect(cached).toMatchObject({ cost: "¥0.0181" });
  });

  it("adds up a row's purposes, taking each from whichever source it has", () => {
    const estimate = estimateFeatureCost(
      ["interest", "self-report-mapping"],
      PRICING,
      ledger(average("interest", 5, 900, 500)),
    );

    // ledger interest ¥0.0072 + catalogue self-report-mapping ¥0.001986.
    expect(estimate).toEqual({
      kind: "estimate",
      cost: "¥0.0092",
      cadence: "per-round",
      source: "ledger",
      samples: 5,
    });
  });

  it("reports the smallest sample count when several purposes come from the ledger", () => {
    const estimate = estimateFeatureCost(
      ["interest", "self-report-mapping"],
      PRICING,
      ledger(average("interest", 9, 900, 500), average("self-report-mapping", 3, 500, 50)),
    );

    expect(estimate).toMatchObject({ source: "ledger", samples: 3 });
  });

  it("still says free and unknown-model regardless of the ledger", () => {
    expect(estimateFeatureCost([], PRICING, ledger(average("chat", 9, 1, 1)))).toEqual({
      kind: "free",
    });
    expect(
      estimateFeatureCost(["chat"], { model: "no-such-model" }, ledger(average("chat", 9, 1, 1))),
    ).toEqual({ kind: "unknown-model" });
  });

  it("says unmeasured for a purpose with no cadence, even with recorded calls", () => {
    expect(
      estimateFeatureCost(
        ["companion-chat"],
        PRICING,
        ledger(average("companion-chat", 9, 1000, 1000)),
      ),
    ).toEqual({ kind: "unmeasured" });
  });
});
