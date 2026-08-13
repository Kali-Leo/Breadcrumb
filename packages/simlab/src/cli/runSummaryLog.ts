/**
 * Purpose: prints the human-readable console summary at the end of `sim run` — the same
 * numbers metrics.json carries, formatted as a few log lines a reviewer skims live rather
 * than opening the file. Pulled out of runCommand.ts to keep that file under the 200-line cap.
 * Main exports: printRunSummary.
 */
import type { RunMetrics } from "../judges/metrics";

export function printRunSummary(
  metrics: RunMetrics,
  requestedJourneys: number,
  completedCount: number,
  totalCostCny: number,
  artifactsDir: string,
): void {
  console.log(
    `simlab run ${metrics.runId} done: ${completedCount}/${requestedJourneys} journeys, ` +
      `total ¥${totalCostCny.toFixed(4)}`,
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
  console.log(
    `  teaching discipline: ${metrics.crossCutting.teachingDiscipline.multiQuestionReplies}/` +
      `${metrics.crossCutting.teachingDiscipline.totalReplies} multi-question replies, ` +
      `${metrics.crossCutting.teachingDiscipline.overlongReplies}/` +
      `${metrics.crossCutting.teachingDiscipline.totalReplies} overlong replies`,
  );
  console.log(`artifacts: ${artifactsDir}`);
}
