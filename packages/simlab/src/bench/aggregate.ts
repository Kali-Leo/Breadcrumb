/**
 * Purpose: turns a run's per-call outcomes into the numbers a person reads — per model, per
 * purpose: how often the reply satisfied the purpose's real schema, how often it did so
 * without a corrective retry, how far it landed from the reference model, what it cost and
 * how long it took.
 *
 * Two rules the aggregation follows and the report depends on: a check is averaged only over
 * the calls that actually reported it (a rate over a question nobody asked is an absence, not
 * a 100%), and a failed call still contributes its latency and its tokens, because the
 * provider still charged for it.
 *
 * Main exports: aggregateRun, ModelSummary, PurposeSummary, AggregatedRun.
 */
import { calculateCostMicros, type ModelRates } from "@breadcrumb/core-llm";
import type { FailureKind } from "./benchCall";
import type { ScoredOutcome } from "./runBench";

export interface PurposeSummary {
  purpose: string;
  calls: number;
  /** Fraction of calls whose reply satisfied the purpose's Zod schema (prose: was non-empty). */
  schemaPass: number;
  /** ...on the first request, with no corrective retry. */
  firstTryPass: number;
  /** Mean of each named reference-free check, over the calls that reported it. */
  checks: Record<string, number>;
  /** Mean agreement with the reference model, or null when nothing was comparable. */
  agreement: number | null;
  latencyP50Ms: number;
  latencyP90Ms: number;
  meanInputTokens: number;
  meanOutputTokens: number;
  /** What a thousand calls of this purpose would cost at this model's rates, in micro-units
   * of the rate card's currency. */
  costPer1000Micros: number;
  failures: Record<FailureKind, number>;
}

export interface ModelSummary {
  modelId: string;
  isReference: boolean;
  overall: PurposeSummary;
  byPurpose: PurposeSummary[];
}

export interface AggregatedRun {
  referenceModelId: string | null;
  models: ModelSummary[];
  purposes: string[];
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(fraction * sorted.length));
  return sorted[index] ?? 0;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Averages each check name over the outcomes that reported it — see the header note on why
 * a missing key must not count as anything. */
function meanChecks(outcomes: readonly ScoredOutcome[]): Record<string, number> {
  const sums = new Map<string, { total: number; count: number }>();
  for (const outcome of outcomes) {
    for (const [name, value] of Object.entries(outcome.checks)) {
      const entry = sums.get(name) ?? { total: 0, count: 0 };
      entry.total += value;
      entry.count += 1;
      sums.set(name, entry);
    }
  }
  const result: Record<string, number> = {};
  for (const [name, entry] of [...sums].sort(([a], [b]) => a.localeCompare(b))) {
    result[name] = entry.total / entry.count;
  }
  return result;
}

function summarise(
  purpose: string,
  outcomes: readonly ScoredOutcome[],
  rates: ModelRates,
): PurposeSummary {
  const agreements = outcomes
    .map((outcome) => outcome.agreement)
    .filter((value): value is number => value !== null);
  const latencies = outcomes.map((outcome) => outcome.latencyMs);
  const meanInput = mean(outcomes.map((outcome) => outcome.usage.inputTokens));
  const meanOutput = mean(outcomes.map((outcome) => outcome.usage.outputTokens));
  const failures: Record<FailureKind, number> = { schema: 0, transport: 0, empty: 0 };
  for (const outcome of outcomes) {
    if (outcome.failure !== null) failures[outcome.failure.kind] += 1;
  }
  return {
    purpose,
    calls: outcomes.length,
    schemaPass: outcomes.length === 0 ? 0 : outcomes.filter((o) => o.ok).length / outcomes.length,
    firstTryPass:
      outcomes.length === 0 ? 0 : outcomes.filter((o) => o.firstTry).length / outcomes.length,
    checks: meanChecks(outcomes),
    agreement: agreements.length === 0 ? null : mean(agreements),
    latencyP50Ms: Math.round(percentile(latencies, 0.5)),
    latencyP90Ms: Math.round(percentile(latencies, 0.9)),
    meanInputTokens: Math.round(meanInput),
    meanOutputTokens: Math.round(meanOutput),
    costPer1000Micros: calculateCostMicros(
      { inputTokens: meanInput * 1000, outputTokens: meanOutput * 1000 },
      rates,
    ),
    failures,
  };
}

export function aggregateRun(
  outcomes: readonly ScoredOutcome[],
  ratesByModelId: ReadonlyMap<string, ModelRates>,
  referenceModelId: string | null,
): AggregatedRun {
  const byModel = new Map<string, ScoredOutcome[]>();
  const purposes: string[] = [];
  for (const outcome of outcomes) {
    const bucket = byModel.get(outcome.modelId) ?? [];
    bucket.push(outcome);
    byModel.set(outcome.modelId, bucket);
    if (!purposes.includes(outcome.purpose)) purposes.push(outcome.purpose);
  }
  const fallbackRates: ModelRates = {
    currency: "CNY",
    inputPerMillionTokens: 0,
    outputPerMillionTokens: 0,
  };
  const models: ModelSummary[] = [...byModel].map(([modelId, modelOutcomes]) => {
    const rates = ratesByModelId.get(modelId) ?? fallbackRates;
    return {
      modelId,
      isReference: modelId === referenceModelId,
      overall: summarise("(all)", modelOutcomes, rates),
      byPurpose: purposes.map((purpose) =>
        summarise(
          purpose,
          modelOutcomes.filter((outcome) => outcome.purpose === purpose),
          rates,
        ),
      ),
    };
  });
  return { referenceModelId, models, purposes };
}
