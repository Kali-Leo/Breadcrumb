/**
 * Purpose: prints the human-readable console summary at the end of `sim run` — the same
 * numbers metrics.json carries, formatted as a few log lines a reviewer skims live rather
 * than opening the file — and decides, from those same numbers, whether the run failed.
 * Pulled out of runCommand.ts to keep that file under the 200-line cap.
 * Main exports: printRunSummary, hardFailureReasons.
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

/**
 * The counts that must be zero, stated as sentences a reader can act on. Spec 013 §4 already
 * called the hard gate "must always be 0"; until the 2026-08-28 audit that was a console.log
 * and `sim run` exited 0 no matter what it found (simlab与测试策略 #1). These four are the
 * mechanical ones — a violation is arithmetic or a contract breach, never a judgment call —
 * so they can be trusted to fail a run without a human in the loop. Everything else stays
 * reported-only. Empty array = the run passed.
 *
 * Pure on purpose: the exit-code decision is testable without running a single journey.
 */
export function hardFailureReasons(metrics: RunMetrics): readonly string[] {
  const { planner, crossCutting } = metrics;
  const pressureHits =
    crossCutting.pressureLexiconHits.tutor + crossCutting.pressureLexiconHits.trailSummary;
  const reasons: string[] = [];
  if (planner.hardGateViolationCount > 0) {
    reasons.push(
      `${planner.hardGateViolationCount} frontier hard-gate violation(s): a node was ` +
        "recommended whose prerequisites are not met",
    );
  }
  if (crossCutting.usageContractViolationCount > 0) {
    reasons.push(
      `${crossCutting.usageContractViolationCount} usage-contract violation(s): a stage was ` +
        "called with turns it is not allowed to see",
    );
  }
  if (crossCutting.digestReconciliationViolationCount > 0) {
    reasons.push(
      `${crossCutting.digestReconciliationViolationCount} digest-reconciliation mismatch(es): ` +
        "a day's digest does not add up against the state it summarizes",
    );
  }
  if (pressureHits > 0) {
    reasons.push(
      `${pressureHits} pressure-lexicon hit(s): generated text used wording the product ` +
        "forbids (tutor and trail-summary combined)",
    );
  }
  return reasons;
}
