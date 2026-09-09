/**
 * Purpose: implements `sim ensemble <artifacts-dir>... [--models a,b]` — reads one or more
 * finished bench runs and answers the question a run itself does not: what would several free
 * judges have decided together, and what did the anchor gate change. No provider is called; the
 * replies are already on disk, so every row costs nothing and is exactly reproducible.
 *
 * More than one directory is accepted because a provider with a one-call-at-a-time rate limit
 * has to be measured in its own process — the panel it belongs to is then assembled here, from
 * whichever runs asked the same scenarios.
 * Main exports: ensembleCommand.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { VERDICT_RELATIONSHIPS } from "@breadcrumb/feature-factcheck";
import { z } from "zod";
import { verdictTruths } from "../bench/scenarios/verdict";
import { ensembleRows } from "../bench/verdictEnsemble";
import { renderEnsembleReport } from "../bench/verdictEnsembleReport";
import { dedupeCalls, panelConfigs, type VerdictCall } from "../bench/verdictVoting";

/** Only the fields voting reads. Lenient on the rest: a results file is allowed to grow. */
const replySchema = z.object({
  relationship: z.enum(VERDICT_RELATIONSHIPS),
  quote: z.string().default(""),
  supportingEvidence: z.array(z.number().int()).default([]),
});

const replyLineSchema = z.object({
  scenarioId: z.string(),
  modelId: z.string(),
  parsed: z.unknown(),
});

const outcomeSchema = z.object({
  scenarioId: z.string(),
  modelId: z.string(),
  latencyMs: z.number(),
});

const resultsSchema = z.object({ runId: z.string(), outcomes: z.array(outcomeSchema) });

/** Every call the run made, from results.json where the run finished and from the per-model
 * outcomes.jsonl where it did not. A run killed mid-suite still has every model it completed,
 * and reading that back is the difference between losing an hour of calls and losing none. */
function readOutcomes(dir: string): { runId: string; outcomes: z.infer<typeof outcomeSchema>[] } {
  const resultsPath = join(dir, "results.json");
  if (existsSync(resultsPath)) {
    const parsed = resultsSchema.parse(JSON.parse(readFileSync(resultsPath, "utf-8")));
    return { runId: parsed.runId, outcomes: parsed.outcomes };
  }
  const lines = readFileSync(join(dir, "outcomes.jsonl"), "utf-8").split("\n");
  return {
    runId: `${basename(dir)} (unfinished)`,
    outcomes: lines
      .filter((line) => line.trim().length > 0)
      .map((line) => outcomeSchema.parse(JSON.parse(line))),
  };
}

/** One call per (scenario, model): latency from results.json, the verdict from replies.jsonl.
 * A call with no usable reply keeps its latency and votes `insufficient`. */
function loadCalls(dir: string): { runId: string; calls: VerdictCall[] } {
  const results = readOutcomes(dir);
  const replies = new Map<string, z.infer<typeof replySchema>>();
  for (const line of readFileSync(join(dir, "replies.jsonl"), "utf-8").split("\n")) {
    if (line.trim().length === 0) continue;
    const entry = replyLineSchema.parse(JSON.parse(line));
    const reply = replySchema.safeParse(entry.parsed);
    if (reply.success) replies.set(`${entry.scenarioId} ${entry.modelId}`, reply.data);
  }
  const calls = results.outcomes.map((outcome) => ({
    scenarioId: outcome.scenarioId,
    modelId: outcome.modelId,
    reply: replies.get(`${outcome.scenarioId} ${outcome.modelId}`) ?? null,
    latencyMs: outcome.latencyMs,
  }));
  return { runId: results.runId, calls };
}

/** Restricts the panel to the models named after --models; empty = every model in the run. A
 * run that also measured paid or broken models should not have them voting in a free-tier
 * panel, and re-reading a finished run is the only way to ask that question. */
function wantedModels(argv: readonly string[]): string[] {
  const index = argv.indexOf("--models");
  if (index < 0) return [];
  return (argv[index + 1] ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function ensembleCommand(argv: readonly string[]): void {
  // Every argument before the first flag is a run to read; --models and its value follow.
  const firstFlag = argv.findIndex((arg) => arg.startsWith("--"));
  const dirs = [...new Set(firstFlag < 0 ? argv : argv.slice(0, firstFlag))];
  if (dirs.length === 0) {
    console.log(
      "usage: sim ensemble <artifacts-dir>... [--models a,b]  (directories holding results.json)",
    );
    return;
  }
  const wanted = wantedModels(argv);
  const loaded = dirs.map((entry) => loadCalls(entry));
  const runId = loaded.map((entry) => entry.runId).join(" + ");
  const calls = loaded.flatMap((entry) => entry.calls);
  const truths = [...verdictTruths().values()];
  const known = new Set(truths.map((truth) => truth.scenarioId));
  // The later directory wins where two runs measured the same model on the same scenario.
  const verdictCalls = dedupeCalls(calls.filter((call) => known.has(call.scenarioId)));
  if (verdictCalls.length === 0) {
    console.log("sim ensemble: this run holds no verdict scenarios to combine.");
    return;
  }
  const modelIds = [...new Set(verdictCalls.map((call) => call.modelId))]
    .filter((modelId) => wanted.length === 0 || wanted.includes(modelId))
    .sort();
  if (modelIds.length === 0) {
    console.log(`sim ensemble: none of ${wanted.join(", ")} answered in this run.`);
    return;
  }
  const report = renderEnsembleReport(
    ensembleRows(truths, verdictCalls, panelConfigs(modelIds)),
    runId,
  );
  const target = join(dirs.at(-1) ?? ".", "ensemble.md");
  writeFileSync(target, report);
  console.log(report);
  console.log(`written: ${target}`);
}
