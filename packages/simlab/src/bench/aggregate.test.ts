/**
 * Purpose: the aggregation rules the whole report rests on — a check is averaged only over
 * the calls that reported it, a failed call still contributes its latency and its tokens, and
 * agreement ignores the scenarios nothing could be compared on.
 */

import type { ModelRates } from "@breadcrumb/core-llm";
import { describe, expect, it } from "vitest";
import { aggregateRun } from "./aggregate";
import { renderBenchReport } from "./report";
import type { ScoredOutcome } from "./runBench";

const RATES: ModelRates = {
  currency: "CNY",
  inputPerMillionTokens: 3,
  outputPerMillionTokens: 9,
};

function outcome(overrides: Partial<ScoredOutcome>): ScoredOutcome {
  return {
    scenarioId: "interest/en/0",
    purpose: "interest",
    language: "en",
    modelId: "vendor:model",
    ok: true,
    firstTry: true,
    attempts: 1,
    latencyMs: 1000,
    usage: { inputTokens: 900, outputTokens: 100 },
    failure: null,
    checks: {},
    agreement: null,
    compatFolded: false,
    ...overrides,
  };
}

describe("aggregateRun", () => {
  it("averages a check only over the calls that reported it", () => {
    const run = aggregateRun(
      [
        outcome({ checks: { labelCoverage: 1 } }),
        outcome({ scenarioId: "interest/en/1", checks: { labelCoverage: 0 } }),
        // Reports no labelCoverage at all: it must not be read as a zero.
        outcome({ scenarioId: "interest/en/2", checks: { labelGrounded: 1 } }),
      ],
      new Map([["vendor:model", RATES]]),
      null,
    );
    expect(run.models[0]?.overall.checks.labelCoverage).toBe(0.5);
    expect(run.models[0]?.overall.checks.labelGrounded).toBe(1);
  });

  it("keeps a failed call's latency and tokens, and counts it against the pass rate", () => {
    const run = aggregateRun(
      [
        outcome({}),
        outcome({
          scenarioId: "interest/en/1",
          ok: false,
          firstTry: false,
          latencyMs: 3000,
          usage: { inputTokens: 900, outputTokens: 0 },
          failure: { kind: "schema", message: "invalid_enum_value" },
        }),
      ],
      new Map([["vendor:model", RATES]]),
      null,
    );
    const overall = run.models[0]?.overall;
    expect(overall?.schemaPass).toBe(0.5);
    expect(overall?.failures.schema).toBe(1);
    expect(overall?.meanInputTokens).toBe(900);
    expect(overall?.latencyP90Ms).toBe(3000);
  });

  it("prices a thousand calls from the mean usage", () => {
    const run = aggregateRun([outcome({})], new Map([["vendor:model", RATES]]), null);
    // 900k input at ¥3/M plus 100k output at ¥9/M = ¥2.70 + ¥0.90.
    expect(run.models[0]?.overall.costPer1000Micros).toBe(3_600_000);
  });

  it("averages agreement over the comparable calls only", () => {
    const run = aggregateRun(
      [outcome({ agreement: 1 }), outcome({ scenarioId: "interest/en/1", agreement: null })],
      new Map([["vendor:model", RATES]]),
      null,
    );
    expect(run.models[0]?.overall.agreement).toBe(1);
  });
});

describe("renderBenchReport", () => {
  it("renders one row per model and marks the reference", () => {
    const run = aggregateRun(
      [outcome({ modelId: "a:ref" }), outcome({ modelId: "b:candidate", agreement: 0.5 })],
      new Map([
        ["a:ref", RATES],
        ["b:candidate", RATES],
      ]),
      "a:ref",
    );
    const markdown = renderBenchReport(
      run,
      new Map([
        ["a:ref", RATES],
        ["b:candidate", RATES],
      ]),
      {
        runId: "bench-test",
        startedAt: "2026-09-08T00:00:00.000Z",
        finishedAt: "2026-09-08T00:01:00.000Z",
        spentCny: 0.12,
        stoppedOnBudget: false,
      },
    );
    expect(markdown).toContain("a:ref *(参考)*");
    expect(markdown).toContain("b:candidate");
    expect(markdown).toContain("interest");
  });
});
