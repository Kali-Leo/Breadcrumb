/**
 * Purpose: the live smoke test for the bench's call layer — proves that a real provider, a
 * real prompt and the product's own schema still fit together, without running the whole
 * suite (that is `sim bench`, which sends hundreds of calls and costs money).
 *
 * Skipped cleanly when no provider catalogue or no key is configured, so `pnpm test` is green
 * on a machine with neither. Keys come from the environment only; see bench/providers.ts.
 */
import { describe, expect, it } from "vitest";
import { resolveRepoRoot } from "../runner/config";
import { runScenarioCall } from "./benchCall";
import { loadProviderCatalogue, resolveBenchModels } from "./providers";
import { buildBenchScenarios, filterScenarios } from "./scenarios/index";

const roster = resolveBenchModels(resolveRepoRoot(), loadProviderCatalogue());
const model = roster.available[0];

describe.skipIf(model === undefined)("bench call layer (live)", () => {
  it("gets a schema-valid reply for one real scenario", async () => {
    if (model === undefined) throw new Error("unreachable: skipped without a model");
    const [scenario] = filterScenarios(buildBenchScenarios(), {
      purposes: ["trail-summary"],
      limitPerPurpose: 1,
    });
    if (scenario === undefined) throw new Error("no trail-summary scenario");
    const outcome = await runScenarioCall(scenario, model);
    // No pass threshold on the model's judgement — this asserts the wiring, not the answer.
    expect(outcome.attempts).toBeGreaterThan(0);
    expect(outcome.latencyMs).toBeGreaterThan(0);
    if (!outcome.ok) throw new Error(`live call failed: ${outcome.failure?.message ?? "unknown"}`);
    expect(outcome.usage.inputTokens).toBeGreaterThan(0);
  }, 120_000);
});
