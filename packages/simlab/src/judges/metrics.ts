/**
 * Purpose: assembles one run's metrics.json in the four-feature-plus-crossCutting shape
 * (spec 013, "docs(specs): reframe simlab goals around the four built features") from data
 * already collected during the run — no I/O here, pure aggregation over what the CLI gathered
 * via telemetry (ledger, pressure hits) and the onConversationComplete invariants hook.
 * Main exports: buildRunMetrics, RunMetrics, JourneySummary.
 */

import type { Persona } from "../persona/schema";
import type { JourneyResult } from "../runner/journey";
import { type PurposeTally, purposeFailureRates } from "./callLedger";
import { checkDigestReconciliation, checkFrontierStaleness } from "./digestTripwires";
import type { Violation } from "./invariants";
import { checkMasteryTripwires } from "./masteryTripwire";
import { computeTargetConceptsRecall } from "./targetConceptsRecall";
import type { PressureHitSample } from "./telemetry";

/** Day boundaries where the frontier stayed byte-identical while nodes kept growing (>=2
 * consecutive) trip the WARN threshold — see digestTripwires.ts. */
const FRONTIER_STALENESS_WARN_STREAK = 2;

export interface JourneySummary {
  journeyId: string;
  personaId: string;
  days: number;
  totalConversations: number;
  totalRounds: number;
  newNodeCount: number;
  rejectedCyclicEdgeCount: number;
  pipelineFailureCount: number;
  targetConceptsRecall: number;
}

export interface RunMetrics {
  runId: string;
  requestedJourneys: number;
  completedJourneys: number;
  totalCostCny: number;
  budgetCny: number;
  edgeNetwork: { cycleRejectionCount: number; targetConceptsRecall: number };
  mastery: ReturnType<typeof checkMasteryTripwires>;
  interest: { note: string };
  planner: {
    hardGateViolationCount: number;
    reasonMismatchCount: number;
    coverageArithmeticViolationCount: number;
    totalInvariantChecks: number;
  };
  crossCutting: {
    zodFailureRateByPurpose: Record<string, number>;
    pressureLexiconHits: { tutor: number; trailSummary: number };
    /** New-tripwire batch (first sim hunt): degenerate (retried-empty) turns, the
     * student-turn/tutor-turn usage contract, extraction parentLabel violations (all three
     * scanned from each journey's own JSONL log — see logTripwires.ts), digest-reconciliation
     * mismatches and duplicate-goal-title rows (both re-derived from live run state — see
     * digestTripwires.ts / invariants.ts), and the frontier-staleness WARN count (journeys
     * where the frontier froze for >=2 consecutive day boundaries while nodes kept growing;
     * a known design gap per P1, so this is visibility, not a hard failure). */
    degenerateTurnCount: number;
    usageContractViolationCount: number;
    parentLabelViolationCount: number;
    digestReconciliationViolationCount: number;
    frontierStalenessWarnJourneyCount: number;
    duplicateGoalTitleCount: number;
  };
  journeys: JourneySummary[];
}

export interface BuildRunMetricsInput {
  runId: string;
  requestedJourneys: number;
  budgetCny: number;
  totalCostCny: number;
  completed: readonly { result: JourneyResult; persona: Persona }[];
  callTallies: Record<string, PurposeTally>;
  pressureHits: readonly PressureHitSample[];
  invariantViolations: readonly Violation[];
  /** How many times runInvariantsFromRepos actually ran (>= violation count) — one run per
   * conversation completed across every journey. */
  invariantRunCount: number;
  /** Summed across every completed journey's own JSONL log (the CLI reads each log back
   * after the journey finishes — see logTripwires.ts and runCommand.ts). */
  degenerateTurnCount: number;
  usageContractViolationCount: number;
  parentLabelViolationCount: number;
}

export function buildRunMetrics(input: BuildRunMetricsInput): RunMetrics {
  const journeys: JourneySummary[] = input.completed.map(({ result, persona }) => ({
    journeyId: result.journeyId,
    personaId: result.personaId,
    days: result.days,
    totalConversations: result.totalConversations,
    totalRounds: result.totalRounds,
    newNodeCount: result.newNodeLabels.length,
    rejectedCyclicEdgeCount: result.rejectedCyclicEdges.length,
    pipelineFailureCount: result.pipelineFailures.length,
    targetConceptsRecall: computeTargetConceptsRecall(persona.knowledge.targetConcepts, [
      ...result.newNodeLabels,
      ...result.sightedNodeLabels,
    ]),
  }));

  const cycleRejectionCount = journeys.reduce((sum, j) => sum + j.rejectedCyclicEdgeCount, 0);
  const averageRecall =
    journeys.length === 0
      ? 1
      : journeys.reduce((sum, j) => sum + j.targetConceptsRecall, 0) / journeys.length;

  const hardGateViolationCount = input.invariantViolations.filter(
    (v) => v.kind === "frontier-hard-gate",
  ).length;
  const reasonMismatchCount = input.invariantViolations.filter(
    (v) => v.kind === "frontier-reason-mismatch",
  ).length;
  const coverageArithmeticViolationCount = input.invariantViolations.filter(
    (v) => v.kind === "coverage-arithmetic",
  ).length;
  const duplicateGoalTitleCount = input.invariantViolations.filter(
    (v) => v.kind === "duplicate-goal-title",
  ).length;

  const digestReconciliationViolationCount = input.completed.reduce(
    (sum, { result }) => sum + checkDigestReconciliation(result.dayDigests).length,
    0,
  );
  const frontierStalenessWarnJourneyCount = input.completed.filter(
    ({ result }) =>
      checkFrontierStaleness(result.dayDigests).maxStaleStreak >= FRONTIER_STALENESS_WARN_STREAK,
  ).length;

  return {
    runId: input.runId,
    requestedJourneys: input.requestedJourneys,
    completedJourneys: input.completed.length,
    totalCostCny: input.totalCostCny,
    budgetCny: input.budgetCny,
    edgeNetwork: { cycleRejectionCount, targetConceptsRecall: averageRecall },
    mastery: checkMasteryTripwires(),
    interest: {
      note: "scripted-recovery moved to `sim recovery` (on-demand); see recovery-result.json in that run's artifacts if it was executed",
    },
    planner: {
      hardGateViolationCount,
      reasonMismatchCount,
      coverageArithmeticViolationCount,
      totalInvariantChecks: input.invariantRunCount,
    },
    crossCutting: {
      zodFailureRateByPurpose: purposeFailureRates(input.callTallies),
      pressureLexiconHits: {
        tutor: input.pressureHits.filter((hit) => hit.source === "tutor").length,
        trailSummary: input.pressureHits.filter((hit) => hit.source === "trail-summary").length,
      },
      degenerateTurnCount: input.degenerateTurnCount,
      usageContractViolationCount: input.usageContractViolationCount,
      parentLabelViolationCount: input.parentLabelViolationCount,
      digestReconciliationViolationCount,
      frontierStalenessWarnJourneyCount,
      duplicateGoalTitleCount,
    },
    journeys,
  };
}
