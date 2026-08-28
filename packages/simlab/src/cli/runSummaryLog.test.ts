/**
 * Purpose: unit tests for the pure part of `sim run`'s exit-code decision — which counts turn
 * a run red, and which are reported without failing it. Tests the aggregation layer only: no
 * journeys, no LLM, no database, just RunMetrics in and reasons out.
 */
import { describe, expect, it } from "vitest";
import type { RunMetrics } from "../judges/metrics";
import { hardFailureReasons } from "./runSummaryLog";

function makeMetrics(overrides: Partial<RunMetrics> = {}): RunMetrics {
  return {
    runId: "run-test",
    requestedJourneys: 1,
    completedJourneys: 1,
    totalCostCny: 0.1,
    budgetCny: 5,
    edgeNetwork: { cycleRejectionCount: 0, targetConceptsEcho: 1 },
    mastery: { reencounterBoostValid: true, idleDecayValid: true, detail: [] },
    interest: { note: "scripted-recovery moved to `sim recovery`" },
    planner: {
      hardGateViolationCount: 0,
      reasonMismatchCount: 0,
      coverageArithmeticViolationCount: 0,
      totalInvariantChecks: 3,
    },
    crossCutting: {
      zodFailureRateByPurpose: {},
      pressureLexiconHits: { tutor: 0, trailSummary: 0 },
      degenerateTurnCount: 0,
      usageContractViolationCount: 0,
      parentLabelViolationCount: 0,
      digestReconciliationViolationCount: 0,
      frontierStalenessWarnJourneyCount: 0,
      duplicateGoalTitleCount: 0,
      teachingDiscipline: { totalReplies: 3, multiQuestionReplies: 0, overlongReplies: 0 },
    },
    journeys: [],
    ...overrides,
  };
}

function withCrossCutting(patch: Partial<RunMetrics["crossCutting"]>): RunMetrics {
  const base = makeMetrics();
  return { ...base, crossCutting: { ...base.crossCutting, ...patch } };
}

describe("hardFailureReasons", () => {
  it("finds nothing to fail on a clean run", () => {
    expect(hardFailureReasons(makeMetrics())).toEqual([]);
  });

  it("fails on a frontier hard-gate violation", () => {
    const metrics = makeMetrics({
      planner: { ...makeMetrics().planner, hardGateViolationCount: 2 },
    });
    const reasons = hardFailureReasons(metrics);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain("2 frontier hard-gate violation");
  });

  it("fails on a usage-contract violation", () => {
    const reasons = hardFailureReasons(withCrossCutting({ usageContractViolationCount: 1 }));
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain("usage-contract");
  });

  it("fails on a digest-reconciliation mismatch", () => {
    const reasons = hardFailureReasons(withCrossCutting({ digestReconciliationViolationCount: 3 }));
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain("digest-reconciliation");
  });

  it("fails on a pressure-lexicon hit from either source, summed", () => {
    const tutorOnly = withCrossCutting({ pressureLexiconHits: { tutor: 1, trailSummary: 0 } });
    expect(hardFailureReasons(tutorOnly)).toHaveLength(1);
    const summaryOnly = withCrossCutting({ pressureLexiconHits: { tutor: 0, trailSummary: 2 } });
    expect(hardFailureReasons(summaryOnly)[0]).toContain("2 pressure-lexicon hit");
    const both = withCrossCutting({ pressureLexiconHits: { tutor: 3, trailSummary: 4 } });
    expect(hardFailureReasons(both)[0]).toContain("7 pressure-lexicon hit");
  });

  it("reports every tripped gate at once rather than stopping at the first", () => {
    const metrics = withCrossCutting({
      usageContractViolationCount: 1,
      digestReconciliationViolationCount: 1,
      pressureLexiconHits: { tutor: 1, trailSummary: 0 },
    });
    const reasons = hardFailureReasons({
      ...metrics,
      planner: { ...metrics.planner, hardGateViolationCount: 1 },
    });
    expect(reasons).toHaveLength(4);
  });

  it("does not fail on the counts that are reported for visibility only", () => {
    // parentLabel and degenerate turns are log-derived and noisy; frontier staleness is a
    // known undecided design gap (P1); duplicate goal titles and reason mismatches predate
    // the gate. Widening the gate to these is a decision, not an oversight.
    const metrics = withCrossCutting({
      degenerateTurnCount: 5,
      parentLabelViolationCount: 5,
      frontierStalenessWarnJourneyCount: 5,
      duplicateGoalTitleCount: 5,
    });
    expect(
      hardFailureReasons({
        ...metrics,
        planner: { ...metrics.planner, reasonMismatchCount: 5 },
      }),
    ).toEqual([]);
  });
});
