/**
 * Purpose: what one configuration scores over one purpose's gold items — a single model, or a
 * panel of them voting by the rules in verdictVoting.ts. A run has already asked every model
 * every scenario, so a voting row costs no new calls: it is a second reading of the same
 * results file.
 *
 * Every row, panel or single, is scored by the same functions the per-call bench uses, because
 * a table whose rows were measured differently cannot be read against itself.
 *
 * Main exports: scoreEnsemble, ensembleRows, EnsembleRow, indexCalls.
 */
import type { VerdictRelationship } from "@breadcrumb/feature-factcheck";
import { meanChecks } from "./aggregate";
import {
  scoreLabel,
  scoreVerdict,
  type VerdictTruth,
  verdictLabel,
} from "./scenarios/verdictTruth";
import {
  type EnsembleConfig,
  type EnsembleRule,
  ensembleLabel,
  type VerdictCall,
} from "./verdictVoting";

export interface EnsembleRow {
  purpose: string;
  config: string;
  rule: EnsembleRule;
  models: readonly string[];
  /** Gold items scored (one per scenario of this purpose). */
  items: number;
  /** LLM calls the configuration costs per claim — the voter count. */
  callsPerClaim: number;
  /** Votes that were missing or unusable, over every item and voter. */
  missingVotes: number;
  checks: Record<string, number>;
  /** Per-item wall clock if the voters run one after another, p50 over the items. */
  latencySequentialP50Ms: number;
  /** ...and if they run at the same time (the slowest voter decides). */
  latencyParallelP50Ms: number;
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))] ?? 0;
}

/** Calls keyed by scenario, then by model — the shape voting needs. */
export function indexCalls(calls: readonly VerdictCall[]): Map<string, Map<string, VerdictCall>> {
  const byScenario = new Map<string, Map<string, VerdictCall>>();
  for (const call of calls) {
    const bucket = byScenario.get(call.scenarioId) ?? new Map<string, VerdictCall>();
    bucket.set(call.modelId, call);
    byScenario.set(call.scenarioId, bucket);
  }
  return byScenario;
}

/**
 * One row of the comparison table: the configuration's own metrics over every scenario of one
 * purpose. A panel row is scored from its combined label; a one-voter row is scored from its
 * own reply, which answers the same questions and a few more.
 */
export function scoreEnsemble(
  purpose: string,
  truths: readonly VerdictTruth[],
  byScenario: ReadonlyMap<string, ReadonlyMap<string, VerdictCall>>,
  config: EnsembleConfig,
): EnsembleRow {
  const scored: Record<string, number>[] = [];
  const sequential: number[] = [];
  const parallel: number[] = [];
  let missingVotes = 0;
  for (const truth of truths) {
    const perModel = byScenario.get(truth.scenarioId);
    const votes: VerdictRelationship[] = [];
    const latencies: number[] = [];
    for (const modelId of config.modelIds) {
      const call = perModel?.get(modelId);
      if (call === undefined || call.reply === null) {
        missingVotes += 1;
        votes.push("insufficient");
        if (call !== undefined) latencies.push(call.latencyMs);
        continue;
      }
      votes.push(verdictLabel(truth, call.reply));
      latencies.push(call.latencyMs);
    }
    // A one-voter configuration is one reply, so it can answer the questions only a reply can
    // answer too — did it cite the decisive passage, did its quote survive the gate, what did it
    // claim before the gate. Those are exactly the columns that say WHY a panel row moved.
    const single =
      config.modelIds.length === 1 ? perModel?.get(config.modelIds[0] ?? "") : undefined;
    scored.push(
      single?.reply != null
        ? { ...scoreVerdict(truth, single.reply) }
        : { ...scoreLabel(truth, ensembleLabel(votes, config.rule)) },
    );
    sequential.push(latencies.reduce((total, value) => total + value, 0));
    parallel.push(latencies.length === 0 ? 0 : Math.max(...latencies));
  }
  return {
    purpose,
    config: config.name,
    rule: config.rule,
    models: config.modelIds,
    items: truths.length,
    callsPerClaim: config.modelIds.length,
    missingVotes,
    checks: meanChecks(scored),
    latencySequentialP50Ms: Math.round(percentile(sequential, 0.5)),
    latencyParallelP50Ms: Math.round(percentile(parallel, 0.5)),
  };
}

/**
 * Every configuration × every purpose the run actually measured, in table order.
 *
 * A configuration is skipped for a purpose unless every one of its voters produced at least one
 * usable reply there. Without that rule a model the run never reached — or one that failed every
 * single call — comes out as a perfect 0% false support at 100% abstention: a row that reads like
 * a measurement and is really an absence, which is the one mistake this table exists to avoid.
 * A voter that answered some of the items and failed others is measured, and those failures show
 * up as missing votes.
 */
export function ensembleRows(
  truths: readonly VerdictTruth[],
  calls: readonly VerdictCall[],
  configs: readonly EnsembleConfig[],
): EnsembleRow[] {
  const byScenario = indexCalls(calls);
  const purposes = [...new Set(truths.map((truth) => truth.purpose))];
  const rows: EnsembleRow[] = [];
  for (const purpose of purposes) {
    const forPurpose = truths.filter(
      (truth) => truth.purpose === purpose && byScenario.has(truth.scenarioId),
    );
    if (forPurpose.length === 0) continue;
    const answered = new Set<string>();
    for (const truth of forPurpose) {
      for (const [modelId, call] of byScenario.get(truth.scenarioId) ?? []) {
        if (call.reply !== null) answered.add(modelId);
      }
    }
    for (const config of configs) {
      if (!config.modelIds.every((modelId) => answered.has(modelId))) continue;
      rows.push(scoreEnsemble(purpose, forPurpose, byScenario, config));
    }
  }
  return rows;
}
