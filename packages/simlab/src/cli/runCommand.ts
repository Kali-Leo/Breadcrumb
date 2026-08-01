/**
 * Purpose: implements `sim run` — launches an async pool of simulated journeys against
 * DeepSeek, bounded by --workers and the cost guard, running the T4 tripwire suite
 * (invariants after every conversation, pressure-lexicon scan, per-purpose call ledger) and
 * writing the four-feature-plus-crossCutting metrics.json.
 * Main exports: runCommand.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createCallLedger } from "../judges/callLedger";
import type { Violation } from "../judges/invariants";
import { runInvariantsFromRepos } from "../judges/invariantsFromRepos";
import {
  countDegenerateTurns,
  countParentLabelViolations,
  countUsageContractViolations,
  type JourneyLogRecord,
} from "../judges/logTripwires";
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
  const logPathByJourneyIndex = new Map<number, string>();
  const results = await runPool(
    personas,
    flags.workers,
    async (persona, index) => {
      personaByJourneyIndex.set(index, persona);
      const log = artifacts.openJourneyLog(index);
      logPathByJourneyIndex.set(index, log.path);
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

  // New-tripwire batch (first sim hunt): degenerate-turn, usage-contract and parentLabel
  // violations are scanned from each completed journey's own JSONL log after the fact —
  // they aren't part of JourneyResult itself, so this is the one place that reads the
  // artifact back rather than accumulating during the run.
  let degenerateTurnCount = 0;
  let usageContractViolationCount = 0;
  let parentLabelViolationCount = 0;
  for (let index = 0; index < results.length; index += 1) {
    if (results[index] === null) continue;
    const logPath = logPathByJourneyIndex.get(index);
    if (logPath === undefined) continue;
    const records = readJourneyLogRecords(logPath);
    degenerateTurnCount += countDegenerateTurns(records);
    usageContractViolationCount += countUsageContractViolations(records);
    parentLabelViolationCount += countParentLabelViolations(records);
  }

  const metrics = buildRunMetrics({
    runId,
    requestedJourneys: flags.journeys,
    budgetCny: flags.budgetCny,
    totalCostCny: costGuard.totalCny(),
    completed,
    callTallies: ledger.snapshot(),
    degenerateTurnCount,
    usageContractViolationCount,
    parentLabelViolationCount,
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
  console.log(
    `  new tripwires: ${metrics.crossCutting.degenerateTurnCount} degenerate turns, ` +
      `${metrics.crossCutting.usageContractViolationCount} usage-contract violations, ` +
      `${metrics.crossCutting.parentLabelViolationCount} parentLabel violations, ` +
      `${metrics.crossCutting.digestReconciliationViolationCount} digest mismatches, ` +
      `${metrics.crossCutting.frontierStalenessWarnJourneyCount} journeys with a stale frontier (WARN), ` +
      `${metrics.crossCutting.duplicateGoalTitleCount} duplicate goal titles`,
  );
  console.log(`artifacts: ${artifacts.dir}`);
}

/** Reads one journey's JSONL log back into parsed records for the post-run log tripwires.
 * Skips any line that fails to parse rather than failing the whole metrics build — a
 * malformed line would already show up elsewhere (it'd break `sim summarize` too). */
function readJourneyLogRecords(path: string): JourneyLogRecord[] {
  const lines = readFileSync(path, "utf-8")
    .split("\n")
    .filter((line) => line.trim() !== "");
  const records: JourneyLogRecord[] = [];
  for (const line of lines) {
    try {
      records.push(JSON.parse(line) as JourneyLogRecord);
    } catch {
      // malformed line: skip, don't fail metrics for it
    }
  }
  return records;
}
