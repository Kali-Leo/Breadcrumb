/**
 * Purpose: implements `sim bench` — the model-capability bench. Builds the deterministic
 * scenario suite, prints what the run will cost BEFORE sending anything, runs the reference
 * model and then every candidate a key was found for, and writes results.json / replies.jsonl
 * / report.md into packages/simlab/artifacts/<runId>/.
 *
 * Keys and endpoints come from outside this repository; nothing here defaults to a key file
 * path. See src/bench/providers.ts for the two lines that put them in the environment.
 * Main exports: benchCommand.
 */
import { randomUUID } from "node:crypto";
import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { aggregateRun } from "../bench/aggregate";
import { estimateRun, formatEstimate, ratesForBenchModel } from "../bench/costEstimate";
import {
  loadProviderCatalogue,
  PROVIDERS_PATH_ENV,
  REFERENCE_MODEL_ID,
  type ResolvedBenchModel,
  resolveBenchModels,
} from "../bench/providers";
import { renderBenchReport } from "../bench/report";
import { runBench } from "../bench/runBench";
import { buildBenchScenarios, filterScenarios } from "../bench/scenarios/index";
import { createRunArtifacts } from "../runner/artifacts";
import { resolveRepoRoot } from "../runner/config";
import { parseBenchFlags } from "./benchFlags";

function selectModels(
  available: readonly ResolvedBenchModel[],
  wanted: readonly string[],
): ResolvedBenchModel[] {
  if (wanted.length === 0) return [...available];
  return available.filter((model) => wanted.includes(model.id));
}

export async function benchCommand(argv: readonly string[]): Promise<void> {
  const flags = parseBenchFlags(argv);
  const repoRoot = resolveRepoRoot();
  const catalogue = loadProviderCatalogue();
  const roster = resolveBenchModels(repoRoot, catalogue);
  const scenarios = filterScenarios(buildBenchScenarios(), {
    purposes: flags.purposes,
    limitPerPurpose: flags.limit,
  });

  const chosen = selectModels(roster.available, flags.models);
  const reference = chosen.find((model) => model.id === REFERENCE_MODEL_ID) ?? null;
  const subjects = chosen.filter((model) => model.id !== REFERENCE_MODEL_ID);

  console.log(`simlab bench: ${scenarios.length} scenarios`);
  for (const line of formatEstimate(
    estimateRun(scenarios, reference === null ? chosen : [reference, ...subjects]),
  )) {
    console.log(line);
  }
  for (const skip of roster.skipped) console.log(`  skipped ${skip.modelId}: ${skip.reason}`);
  if (reference === null) {
    console.log(
      "  no reference model available — reference-free metrics only (agreement will be empty)",
    );
  }

  // Node's fetch ignores HTTP(S)_PROXY unless started with NODE_USE_ENV_PROXY=1, and one of
  // the candidates is not reachable from the mainland without one. Silently timing out on
  // every call would look like the model failing.
  if (
    (process.env.HTTPS_PROXY ?? process.env.https_proxy) !== undefined &&
    process.env.NODE_USE_ENV_PROXY === undefined
  ) {
    console.log(
      "  note: a proxy is configured in the environment but Node will not use it — " +
        "re-run with NODE_USE_ENV_PROXY=1 if a provider needs it",
    );
  }

  if (chosen.length === 0) {
    console.log(
      `simlab bench: nothing to run. Set ${PROVIDERS_PATH_ENV} to a provider catalogue and ` +
        "export BENCH_KEY_<provider> for at least one of them.",
    );
    return;
  }
  if (flags.dryRun) {
    console.log("simlab bench: --dry-run, nothing sent.");
    return;
  }

  const runId = `bench-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const artifacts = createRunArtifacts(join(repoRoot, "packages/simlab/artifacts"), runId);
  console.log(`simlab bench ${runId}: budget ¥${flags.budgetCny}, ${flags.workers} in flight`);

  const result = await runBench({
    scenarios,
    reference,
    subjects,
    concurrency: flags.workers,
    budgetCny: flags.budgetCny,
    onProgress: (line) => console.log(line),
  });

  const ratesByModelId = new Map(chosen.map((model) => [model.id, ratesForBenchModel(model)]));
  const aggregated = aggregateRun(result.outcomes, ratesByModelId, result.referenceModelId);

  // Replies live in their own file: they are the bulk of the bytes and the part a human reads
  // one at a time, while results.json is the part a tool reads whole.
  const repliesPath = join(artifacts.dir, "replies.jsonl");
  writeFileSync(repliesPath, "");
  for (const outcome of result.outcomes) {
    if (outcome.reply === undefined && outcome.parsed === undefined) continue;
    appendFileSync(
      repliesPath,
      `${JSON.stringify({
        scenarioId: outcome.scenarioId,
        modelId: outcome.modelId,
        reply: outcome.reply,
        parsed: outcome.parsed,
      })}\n`,
    );
  }
  artifacts.writeJson("results.json", {
    runId,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    referenceModelId: result.referenceModelId,
    spentCny: result.spentCny,
    stoppedOnBudget: result.stoppedOnBudget,
    models: chosen.map((model) => ({ id: model.id, endpoint: model.provider.url })),
    // Replies are dropped here on purpose — they are in replies.jsonl, and a results file
    // small enough to open is worth more than one that holds everything twice.
    outcomes: result.outcomes.map(({ parsed: _parsed, reply: _reply, ...rest }) => rest),
  });
  artifacts.writeJson("summary.json", aggregated);
  artifacts.writeJson("cost-estimate.json", estimateRun(scenarios, chosen));
  const report = renderBenchReport(aggregated, ratesByModelId, {
    runId,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    spentCny: result.spentCny,
    stoppedOnBudget: result.stoppedOnBudget,
  });
  writeFileSync(join(artifacts.dir, "report.md"), report);
  console.log(report);
  console.log(`artifacts: ${artifacts.dir}`);
}
