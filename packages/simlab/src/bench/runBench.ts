/**
 * Purpose: runs the whole suite — the reference model first, then every candidate, scoring
 * each candidate's reply against the reference it now has in hand. Concurrency comes from the
 * existing session pool and the budget from the existing cost guard, so a bench run stops
 * launching calls on the same rule a simulation run does.
 *
 * The reference model going first is not an optimisation: without its answers there is no
 * agreement column, so a run that cannot reach it still produces every reference-free number
 * (schema pass, gold accuracy, latency, tokens) and simply reports agreement as absent.
 *
 * Each model's outcomes are handed to `onModelOutcomes` the moment that model finishes, so a
 * caller can put them on disk before the next one starts. A free-tier suite runs for an hour;
 * a run that only wrote its results at the very end threw away every finished model when the
 * process died, which is exactly what happened on 2026-09-09 and why this hook exists.
 *
 * Main exports: runBench, BenchRunResult, ScoredOutcome, BenchRunOptions.
 */
import type { TokenUsage } from "@breadcrumb/core-llm";
import { createCostGuard } from "../runner/costGuard";
import { runPool } from "../runner/pool";
import { type BenchOutcome, runScenarioCall } from "./benchCall";
import { ratesForBenchModel } from "./costEstimate";
import { concurrencyCapFor, type ResolvedBenchModel } from "./providers";
import type { BenchScenario } from "./scenarioTypes";
import { diceBigram } from "./scoring/textSimilarity";

export interface ScoredOutcome extends BenchOutcome {
  /** 0..1 against the reference model's reply, or null when there is nothing to compare to
   * (this IS the reference, the reference failed here, or the comparison itself threw). */
  agreement: number | null;
}

export interface BenchRunOptions {
  scenarios: readonly BenchScenario[];
  /** The model every other one is compared against. Null runs candidates only. */
  reference: ResolvedBenchModel | null;
  subjects: readonly ResolvedBenchModel[];
  concurrency: number;
  /** Soft ceiling in CNY across the whole run. Reaching it stops new calls being launched;
   * calls already in flight always finish. */
  budgetCny: number;
  onProgress?: (line: string) => void;
  /** Called once per model, with everything that model produced, before the next model starts. */
  onModelOutcomes?: (modelId: string, outcomes: readonly ScoredOutcome[]) => void;
}

export interface BenchRunResult {
  startedAt: string;
  finishedAt: string;
  referenceModelId: string | null;
  outcomes: ScoredOutcome[];
  spentCny: number;
  stoppedOnBudget: boolean;
}

function agreementOf(
  scenario: BenchScenario,
  reference: BenchOutcome | undefined,
  candidate: BenchOutcome,
): number | null {
  if (reference === undefined || !reference.ok || !candidate.ok) return null;
  if (scenario.kind === "prose") {
    if (reference.reply === undefined || candidate.reply === undefined) return null;
    // Two prose answers are never equal; bigram similarity says whether they are about the
    // same thing at the same length, which is as much as a mechanical judge should claim.
    return diceBigram(reference.reply, candidate.reply);
  }
  if (reference.parsed === undefined || candidate.parsed === undefined) return null;
  try {
    return scenario.agree(reference.parsed, candidate.parsed);
  } catch {
    // A comparator that throws means one side did not fit the schema after all — treat it as
    // incomparable rather than as disagreement, and let the schema column carry the failure.
    return null;
  }
}

async function runOneModel(
  model: ResolvedBenchModel,
  scenarios: readonly BenchScenario[],
  options: {
    concurrency: number;
    record: (model: string, usage: TokenUsage) => void;
    stop: () => boolean;
    onProgress?: (line: string) => void;
  },
): Promise<BenchOutcome[]> {
  let done = 0;
  const results = await runPool(
    scenarios,
    // A provider whose own limit is lower gets its own limit: 429s measure the rate limiter,
    // not the model.
    concurrencyCapFor(model.providerId, options.concurrency),
    async (scenario) => {
      const outcome = await runScenarioCall(scenario, model);
      options.record(model.model, outcome.usage);
      done += 1;
      if (done % 25 === 0) {
        options.onProgress?.(`  ${model.id}: ${done}/${scenarios.length} calls`);
      }
      return outcome;
    },
    options.stop,
  );
  return results.filter((outcome): outcome is BenchOutcome => outcome !== null);
}

export async function runBench(options: BenchRunOptions): Promise<BenchRunResult> {
  const startedAt = new Date().toISOString();
  // Every candidate is priced: the catalogue covers DeepSeek, the provider file covers the
  // rest, so the ceiling caps the whole run rather than only the one model core-llm knows.
  const ratesByModelName = new Map(
    [options.reference, ...options.subjects]
      .filter((model): model is ResolvedBenchModel => model !== null)
      .map((model) => [model.model, ratesForBenchModel(model)]),
  );
  const guard = createCostGuard(options.budgetCny, (model) => ratesByModelName.get(model));
  const scenarioById = new Map(options.scenarios.map((scenario) => [scenario.id, scenario]));
  const shared = {
    concurrency: options.concurrency,
    record: (model: string, usage: TokenUsage) => {
      guard.recordCall(model, usage);
    },
    stop: () => guard.isOverBudget(),
    onProgress: options.onProgress,
  };

  const outcomes: ScoredOutcome[] = [];
  const referenceById = new Map<string, BenchOutcome>();
  if (options.reference !== null) {
    options.onProgress?.(
      `reference model ${options.reference.id}: ${options.scenarios.length} calls`,
    );
    const scored: ScoredOutcome[] = [];
    for (const outcome of await runOneModel(options.reference, options.scenarios, shared)) {
      referenceById.set(outcome.scenarioId, outcome);
      scored.push({ ...outcome, agreement: null });
    }
    outcomes.push(...scored);
    options.onModelOutcomes?.(options.reference.id, scored);
  }

  for (const subject of options.subjects) {
    options.onProgress?.(`model ${subject.id}: ${options.scenarios.length} calls`);
    const scored: ScoredOutcome[] = [];
    for (const outcome of await runOneModel(subject, options.scenarios, shared)) {
      const scenario = scenarioById.get(outcome.scenarioId);
      const agreement =
        scenario === undefined
          ? null
          : agreementOf(scenario, referenceById.get(outcome.scenarioId), outcome);
      scored.push({ ...outcome, agreement });
    }
    outcomes.push(...scored);
    options.onModelOutcomes?.(subject.id, scored);
  }

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    referenceModelId: options.reference?.id ?? null,
    outcomes,
    spentCny: guard.totalCny(),
    stoppedOnBudget: guard.isOverBudget(),
  };
}
