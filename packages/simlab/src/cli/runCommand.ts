/**
 * Purpose: implements `sim run` — launches an async pool of simulated journeys against
 * DeepSeek, bounded by --workers and the cost guard, running the T4 tripwire suite
 * (invariants after every conversation, pressure-lexicon scan, per-purpose call ledger) and
 * writing the four-feature-plus-crossCutting metrics.json.
 * Main exports: runCommand.
 */
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { createCallLedger } from "../judges/callLedger";
import type { Violation } from "../judges/invariants";
import { runInvariantsFromRepos } from "../judges/invariantsFromRepos";
import { buildRunMetrics } from "../judges/metrics";
import { loadPressureLexicon } from "../judges/pressureLexicon";
import type { PressureHitSample, RunTelemetry } from "../judges/telemetry";
import type { Persona } from "../persona/schema";
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

  const ledger = createCallLedger();
  const pressureHits: PressureHitSample[] = [];
  const invariantViolations: Violation[] = [];
  let invariantRunCount = 0;
  const telemetry: RunTelemetry = {
    ledger,
    pressureLexicon: loadPressureLexicon(),
    onPressureHit: (sample) => {
      pressureHits.push(sample);
      artifacts.writeFlagged(
        `pressure-${sample.source}-day${sample.day}-${randomUUID().slice(0, 8)}.json`,
        sample,
      );
    },
  };

  console.log(
    `simlab run ${runId}: ${flags.journeys} journeys, ${flags.workers} workers, ` +
      `days=${flags.days}, budget=¥${flags.budgetCny}`,
  );

  const personaByJourneyIndex = new Map<number, Persona>();
  const results = await runPool(
    personas,
    flags.workers,
    async (persona, index) => {
      personaByJourneyIndex.set(index, persona);
      const log = artifacts.openSessionLog(index);
      const result = await runJourney({
        persona,
        journeyIndex: index,
        days: flags.days,
        llmConfig,
        costGuard,
        log,
        telemetry,
        onConversationComplete: async (repos, day) => {
          invariantRunCount += 1;
          const violations = await runInvariantsFromRepos(repos, new Date().toISOString());
          if (violations.length > 0) {
            invariantViolations.push(...violations);
            artifacts.writeFlagged(
              `invariants-journey${index}-day${day}-${randomUUID().slice(0, 8)}.json`,
              {
                day,
                violations,
              },
            );
          }
        },
      });
      console.log(
        `  journey ${index} (${persona.name}): ${result.days} days, ` +
          `${result.totalConversations} conversations, ¥${result.totalCostCny.toFixed(4)} cumulative`,
      );
      return result;
    },
    () => costGuard.isOverBudget(),
  );

  const completed = results
    .map((result, index) =>
      result === null ? null : { result, persona: personaByJourneyIndex.get(index) },
    )
    .filter(
      (entry): entry is { result: JourneyResult; persona: Persona } =>
        entry !== null && entry.persona !== undefined,
    );

  const metrics = buildRunMetrics({
    runId,
    requestedJourneys: flags.journeys,
    budgetCny: flags.budgetCny,
    totalCostCny: costGuard.totalCny(),
    completed,
    callTallies: ledger.snapshot(),
    pressureHits,
    invariantViolations,
    invariantRunCount,
  });
  artifacts.writeMetrics(metrics);

  console.log(
    `simlab run ${runId} done: ${completed.length}/${flags.journeys} journeys, ` +
      `total ¥${costGuard.totalCny().toFixed(4)}`,
  );
  console.log(
    `  planner tripwires: ${metrics.planner.hardGateViolationCount} hard-gate violations, ` +
      `${metrics.planner.reasonMismatchCount} reason mismatches`,
  );
  console.log(
    `  pressure-lexicon hits: ${metrics.crossCutting.pressureLexiconHits.tutor} tutor, ` +
      `${metrics.crossCutting.pressureLexiconHits.trailSummary} trail-summary`,
  );
  console.log(`artifacts: ${artifacts.dir}`);
}
