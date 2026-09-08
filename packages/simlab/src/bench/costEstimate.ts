/**
 * Purpose: what a bench run will cost, worked out BEFORE anything is sent. Two numbers per
 * model: the expected spend, and a ceiling that assumes every JSON call also needs
 * jsonClient's one corrective retry. Input tokens are the real prompts (measured from the
 * message list, not guessed); output tokens come from the purpose catalogue's measured
 * profiles, which is the same basis the spending page quotes to a learner.
 *
 * Prices come from core-llm's catalogue where it has the model (DeepSeek, whose entry carries
 * the peak/off-peak schedule) and from the external provider catalogue otherwise. A free tier
 * therefore prices at zero because it IS zero, not because nobody looked.
 * Main exports: estimateRun, RunEstimate, ModelEstimate, formatEstimate.
 */
import {
  calculateCostMicros,
  estimateMessageTokens,
  formatCost,
  type ModelRates,
  PURPOSE_USAGE,
  resolveModelRates,
  type TokenUsage,
} from "@breadcrumb/core-llm";
import { type BenchModel, benchRatesFor } from "./providers";
import type { BenchScenario } from "./scenarioTypes";

/** Output-token guess for a purpose the catalogue has no measured row for — the two
 * conversational purposes and the focus station. Taken from `chat`'s measured profile, which
 * is the longest reply the product produces. */
const PROSE_OUTPUT_TOKENS = 324;

/** Catalogue first, provider file second — the one place the bench decides whose price list
 * applies to a model, so the estimate and the running cost guard cannot disagree. */
export function ratesForBenchModel(model: BenchModel): ModelRates {
  return resolveModelRates(model.model, { currency: "CNY" }) ?? benchRatesFor(model);
}

export interface ModelEstimate {
  modelId: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** Expected spend, formatted in the rate card's currency. */
  cost: string;
  /** Spend if every JSON call also needs its one corrective retry. */
  ceiling: string;
}

export interface RunEstimate {
  scenarios: number;
  callsPerModel: number;
  models: ModelEstimate[];
}

function usageOf(scenarios: readonly BenchScenario[]): TokenUsage {
  let inputTokens = 0;
  let outputTokens = 0;
  for (const scenario of scenarios) {
    inputTokens += estimateMessageTokens(scenario.messages);
    outputTokens += PURPOSE_USAGE[scenario.purpose]?.outputTokens ?? PROSE_OUTPUT_TOKENS;
  }
  return { inputTokens, outputTokens };
}

export function estimateRun(
  scenarios: readonly BenchScenario[],
  models: readonly BenchModel[],
): RunEstimate {
  const base = usageOf(scenarios);
  // Only JSON purposes can be charged twice; prose never retries.
  const retryable = usageOf(scenarios.filter((scenario) => scenario.kind === "json"));
  return {
    scenarios: scenarios.length,
    callsPerModel: scenarios.length,
    models: models.map((model) => {
      const rates = ratesForBenchModel(model);
      const expected = calculateCostMicros(base, rates);
      return {
        modelId: model.id,
        calls: scenarios.length,
        inputTokens: base.inputTokens,
        outputTokens: base.outputTokens,
        cost: formatCost(expected, rates.currency),
        ceiling: formatCost(expected + calculateCostMicros(retryable, rates), rates.currency),
      };
    }),
  };
}

/** The lines printed before a run starts — the cost discipline is that nobody presses go
 * without having read this. */
export function formatEstimate(estimate: RunEstimate): string[] {
  const lines = [
    `scenarios: ${estimate.scenarios}, calls per model: ${estimate.callsPerModel}`,
    `models: ${estimate.models.length} (total calls ${estimate.callsPerModel * estimate.models.length})`,
  ];
  for (const model of estimate.models) {
    lines.push(
      `  ${model.modelId}: ~${model.inputTokens} in / ~${model.outputTokens} out tokens — ` +
        `${model.cost} expected, up to ${model.ceiling} with corrective retries`,
    );
  }
  return lines;
}
