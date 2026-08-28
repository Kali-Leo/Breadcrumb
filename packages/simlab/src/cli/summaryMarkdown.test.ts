/**
 * Purpose: unit tests for the pure summary.md builder — section order, content, and the
 * flagged-samples excerpt cap.
 */
import { describe, expect, it } from "vitest";
import type { RunMetrics } from "../judges/metrics";
import { buildSummaryMarkdown } from "./summaryMarkdown";

function makeMetrics(overrides: Partial<RunMetrics> = {}): RunMetrics {
  return {
    runId: "run-test",
    requestedJourneys: 2,
    completedJourneys: 2,
    totalCostCny: 0.5,
    budgetCny: 5,
    edgeNetwork: { cycleRejectionCount: 1, targetConceptsEcho: 0.75 },
    mastery: { reencounterBoostValid: true, idleDecayValid: true, detail: [] },
    interest: { note: "scripted-recovery moved to `sim recovery`" },
    planner: {
      hardGateViolationCount: 0,
      reasonMismatchCount: 0,
      coverageArithmeticViolationCount: 0,
      totalInvariantChecks: 4,
    },
    crossCutting: {
      zodFailureRateByPurpose: { "knowledge-tree": 0.1 },
      pressureLexiconHits: { tutor: 0, trailSummary: 0 },
      degenerateTurnCount: 0,
      usageContractViolationCount: 0,
      parentLabelViolationCount: 0,
      digestReconciliationViolationCount: 0,
      frontierStalenessWarnJourneyCount: 0,
      duplicateGoalTitleCount: 0,
      teachingDiscipline: { totalReplies: 4, multiQuestionReplies: 1, overlongReplies: 0 },
    },
    journeys: [
      {
        journeyId: "j0-abc",
        personaId: "confused-novice",
        days: 2,
        totalConversations: 3,
        totalRounds: 6,
        newNodeCount: 4,
        rejectedCyclicEdgeCount: 1,
        pipelineFailureCount: 0,
        targetConceptsEcho: 0.75,
      },
    ],
    ...overrides,
  };
}

describe("buildSummaryMarkdown", () => {
  it("has one section per feature plus crossCutting, in order", () => {
    const markdown = buildSummaryMarkdown(makeMetrics(), []);
    const order = ["## edgeNetwork", "## mastery", "## interest", "## planner", "## crossCutting"];
    const positions = order.map((heading) => markdown.indexOf(heading));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("includes the run id, cost, and journeys table", () => {
    const markdown = buildSummaryMarkdown(makeMetrics(), []);
    expect(markdown).toContain("run-test");
    expect(markdown).toContain("j0-abc");
    expect(markdown).toContain("confused-novice");
  });

  it("never reports targetConceptsEcho, under that name or as a recall figure", () => {
    // It is an echo of the student prompt's own input, so it read 100% on every run ever
    // made and would be read as evidence the extraction works (design audit 2026-08-28,
    // simlab与测试策略 #3). It stays in metrics.json; putting it back here needs a reason.
    const markdown = buildSummaryMarkdown(makeMetrics(), []);
    expect(markdown).not.toContain("targetConcepts");
    expect(markdown.toLowerCase()).not.toContain("recall");
  });

  it("reports the planner hard-gate count with its must-be-0 annotation", () => {
    const markdown = buildSummaryMarkdown(makeMetrics(), []);
    expect(markdown).toContain("hardGateViolationCount (must be 0): 0");
  });

  it("reports the teaching-discipline counts", () => {
    const markdown = buildSummaryMarkdown(makeMetrics(), []);
    expect(markdown).toContain(
      "teachingDiscipline: 1 multi-question / 0 overlong of 4 tutor replies",
    );
  });

  it("caps flagged-sample excerpts and notes the remainder", () => {
    const flagged = Array.from({ length: 15 }, (_, i) => `sample-${i}.json`);
    const markdown = buildSummaryMarkdown(makeMetrics(), flagged);
    expect(markdown).toContain("sample-0.json");
    expect(markdown).toContain("sample-9.json");
    expect(markdown).not.toContain("sample-10.json");
    expect(markdown).toContain("and 5 more");
  });

  it("shows (none) when there are no flagged samples", () => {
    const markdown = buildSummaryMarkdown(makeMetrics(), []);
    expect(markdown).toContain("(none)");
  });
});
