/**
 * Purpose: implements `sim run` — launches an async pool of simulated journeys against
 * DeepSeek, bounded by --workers and the cost guard, and writes artifacts/<runId>/ including
 * a basic run-level metrics.json (T4 replaces this with the full grouped judges aggregation).
 * Main exports: runCommand.
 */
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { createRunArtifacts } from "../runner/artifacts";
import { buildLlmClientConfig, loadDeepseekApiKey, resolveRepoRoot } from "../runner/config";
import { createCostGuard } from "../runner/costGuard";
import type { JourneyResult } from "../runner/journey";
import { runJourney } from "../runner/journey";
import { runPool } from "../runner/pool";
import { parseRunFlags } from "./flags";
import { selectPersonas } from "./selectPersonas";

function newRunId(): string {
  return `run-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
}

export async function runCommand(argv: readonly string[]): Promise<void> {
  const flags = parseRunFlags(argv);
  const repoRoot = resolveRepoRoot();
  const apiKey = loadDeepseekApiKey(repoRoot);
  if (apiKey === null) {
    console.error(
      "simlab: DEEPSEEK_API_KEY not found in repo-root .env — cannot run live journeys.",
    );
    process.exitCode = 1;
    return;
  }

  const llmConfig = buildLlmClientConfig(apiKey);
  const runId = newRunId();
  const artifacts = createRunArtifacts(join(repoRoot, "packages/simlab/artifacts"), runId);
  const costGuard = createCostGuard(flags.budgetCny);
  const personas = selectPersonas(flags.journeys);

  console.log(
    `simlab run ${runId}: ${flags.journeys} journeys, ${flags.workers} workers, ` +
      `days=${flags.days}, budget=¥${flags.budgetCny}`,
  );

  const results = await runPool(
    personas,
    flags.workers,
    async (persona, index) => {
      const log = artifacts.openSessionLog(index);
      const result = await runJourney({
        persona,
        journeyIndex: index,
        days: flags.days,
        llmConfig,
        costGuard,
        log,
      });
      console.log(
        `  journey ${index} (${persona.name}): ${result.days} days, ` +
          `${result.totalConversations} conversations, ¥${result.totalCostCny.toFixed(4)} cumulative`,
      );
      return result;
    },
    () => costGuard.isOverBudget(),
  );

  const completed = results.filter((result): result is JourneyResult => result !== null);
  artifacts.writeMetrics({
    runId,
    requestedJourneys: flags.journeys,
    completedJourneys: completed.length,
    totalCostCny: costGuard.totalCny(),
    budgetCny: flags.budgetCny,
    journeys: completed.map((result) => ({
      journeyId: result.journeyId,
      personaId: result.personaId,
      days: result.days,
      totalConversations: result.totalConversations,
      totalRounds: result.totalRounds,
      newNodeCount: result.newNodeLabels.length,
      rejectedCyclicEdgeCount: result.rejectedCyclicEdges.length,
      pipelineFailureCount: result.pipelineFailures.length,
    })),
  });

  console.log(
    `simlab run ${runId} done: ${completed.length}/${flags.journeys} journeys, ` +
      `total ¥${costGuard.totalCny().toFixed(4)}`,
  );
  console.log(`artifacts: ${artifacts.dir}`);
}
