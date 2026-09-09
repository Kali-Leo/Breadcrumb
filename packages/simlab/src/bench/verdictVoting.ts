/**
 * Purpose: how several free judges' answers become one verdict — the vote itself, and which
 * panels a comparison table should contain. Kept apart from the scoring in verdictEnsemble.ts:
 * this file is the rule, that file is the measurement, and the rule is the part a person argues
 * about.
 *
 * Two rules, both deliberately biased towards saying nothing:
 *  - unanimous: all voters must land on the same label, otherwise `insufficient`. Disagreement
 *    between judges IS the evidence being unclear.
 *  - majority: the label with more than half the votes, otherwise `insufficient`.
 * A voter whose call failed or whose reply is missing votes `insufficient`, which is what
 * production would do with that call anyway — a lost verdict is an abstention, not a free pass.
 *
 * Main exports: VerdictCall, EnsembleRule, EnsembleConfig, ensembleLabel, dedupeCalls,
 * panelConfigs.
 */
import type { VerdictRelationship } from "@breadcrumb/feature-factcheck";
import type { VerdictReply } from "./scenarios/verdictTruth";

/** One model's answer to one scenario, as read back off a finished run. */
export interface VerdictCall {
  scenarioId: string;
  modelId: string;
  /** Null when the call failed or its reply never satisfied the schema. */
  reply: VerdictReply | null;
  latencyMs: number;
}

export type EnsembleRule = "single" | "unanimous" | "majority";

export interface EnsembleConfig {
  /** How the row is labelled in the table. */
  name: string;
  /** The voters, in a stable order. One model with rule "single" is the baseline row. */
  modelIds: readonly string[];
  rule: EnsembleRule;
}

/**
 * The combined label. Missing votes are already `insufficient` by the time they get here, so a
 * three-voter unanimity with one failed call can only ever come out `insufficient` — the safe
 * direction, and the honest one.
 */
export function ensembleLabel(
  votes: readonly VerdictRelationship[],
  rule: EnsembleRule,
): VerdictRelationship {
  if (votes.length === 0) return "insufficient";
  const first = votes[0] ?? "insufficient";
  if (rule === "single") return first;
  const counts = new Map<VerdictRelationship, number>();
  for (const vote of votes) counts.set(vote, (counts.get(vote) ?? 0) + 1);
  if (rule === "unanimous") return counts.size === 1 ? first : "insufficient";
  for (const [label, count] of counts) {
    if (count * 2 > votes.length) return label;
  }
  return "insufficient";
}

/**
 * The configurations a table compares: every model on its own (the baseline rows), the whole
 * panel under both rules, and each pair under the stricter rule — a pair is the cheaper
 * ensemble and worth knowing about if it holds up.
 */
export function panelConfigs(modelIds: readonly string[]): EnsembleConfig[] {
  const configs: EnsembleConfig[] = modelIds.map((modelId) => ({
    name: modelId,
    modelIds: [modelId],
    rule: "single",
  }));
  if (modelIds.length >= 3) {
    // Below three voters the two rules are the same question, so only add them where they differ.
    configs.push({ name: `全票 ${modelIds.length} 模型`, modelIds, rule: "unanimous" });
    configs.push({ name: `多数 ${modelIds.length} 模型`, modelIds, rule: "majority" });
  }
  for (let first = 0; first < modelIds.length; first += 1) {
    for (let second = first + 1; second < modelIds.length; second += 1) {
      const pair = [modelIds[first] ?? "", modelIds[second] ?? ""];
      configs.push({ name: `全票 ${pair.join(" + ")}`, modelIds: pair, rule: "unanimous" });
    }
  }
  return configs;
}

/**
 * One call per (scenario, model), later runs winning. A provider with a one-call-at-a-time rate
 * limit has to be measured in its own process, so a panel is often assembled from several runs;
 * re-measuring one model must replace its own older answers rather than let it vote twice.
 */
export function dedupeCalls(calls: readonly VerdictCall[]): VerdictCall[] {
  const byKey = new Map<string, VerdictCall>();
  for (const call of calls) byKey.set(`${call.scenarioId}|${call.modelId}`, call);
  return [...byKey.values()];
}
