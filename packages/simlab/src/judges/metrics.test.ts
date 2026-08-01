/**
 * Purpose: unit tests for buildRunMetrics' new-tripwire wiring (first sim hunt) — proves the
 * pre-aggregated log-tripwire counts pass straight through, and that digest-reconciliation /
 * frontier-staleness / duplicate-goal-title are correctly derived from a journey's own
 * dayDigests / invariant violations rather than left at zero by construction.
 */
import { describe, expect, it } from "vitest";
import type { Persona } from "../persona/schema";
import type { DayDigest } from "../runner/dayDigest";
import type { JourneyResult } from "../runner/journey";
import { type BuildRunMetricsInput, buildRunMetrics } from "./metrics";

const persona: Persona = {
  id: "p1",
  name: "test",
  description: "d",
  knowledge: { knownTopics: [], misconceptions: [], targetConcepts: ["闭包"] },
  behavior: {
    typoRate: 0,
    codeSwitching: 0,
    driftTendency: 0,
    boredomThreshold: 0.5,
    confusionTendency: 0.5,
  },
};

function digest(overrides: Partial<DayDigest> & { day: number }): DayDigest {
  return {
    dateIso: "2026-08-01T00:00:00.000Z",
    nodeCount: 0,
    newNodeLabelsToday: [],
    edgesAddedToday: 0,
    edgesRejectedToday: 0,
    topMasteryChanges: [],
    frontierTop5: [],
    goals: [],
    interestAggregate: { avgCuriosity: 0, avgConfusion: 0, avgBoredom: 0 },
    ...overrides,
  };
}

function journeyResult(overrides: Partial<JourneyResult> = {}): JourneyResult {
  return {
    journeyId: "j0-abc",
    personaId: persona.id,
    days: 1,
    totalConversations: 1,
    totalRounds: 1,
    newNodeLabels: [],
    sightedNodeLabels: [],
    rejectedCyclicEdges: [],
    pipelineFailures: [],
    totalCostCny: 0,
    dbPath: "/tmp/x.db",
    dayDigests: [],
    ...overrides,
  };
}

function baseInput(overrides: Partial<BuildRunMetricsInput> = {}): BuildRunMetricsInput {
  return {
    runId: "run-test",
    requestedJourneys: 1,
    budgetCny: 5,
    totalCostCny: 0.1,
    completed: [{ result: journeyResult(), persona }],
    callTallies: {},
    pressureHits: [],
    invariantViolations: [],
    invariantRunCount: 1,
    degenerateTurnCount: 0,
    usageContractViolationCount: 0,
    parentLabelViolationCount: 0,
    ...overrides,
  };
}

describe("buildRunMetrics crossCutting: new tripwires", () => {
  it("passes the pre-aggregated log-tripwire counts straight through", () => {
    const metrics = buildRunMetrics(
      baseInput({
        degenerateTurnCount: 3,
        usageContractViolationCount: 2,
        parentLabelViolationCount: 5,
      }),
    );
    expect(metrics.crossCutting.degenerateTurnCount).toBe(3);
    expect(metrics.crossCutting.usageContractViolationCount).toBe(2);
    expect(metrics.crossCutting.parentLabelViolationCount).toBe(5);
  });

  it("is zero across the board for a clean run (no false positives)", () => {
    const metrics = buildRunMetrics(baseInput());
    expect(metrics.crossCutting.digestReconciliationViolationCount).toBe(0);
    expect(metrics.crossCutting.frontierStalenessWarnJourneyCount).toBe(0);
    expect(metrics.crossCutting.duplicateGoalTitleCount).toBe(0);
  });

  it("derives digestReconciliationViolationCount from a journey's own dayDigests", () => {
    const badDayDigests = [digest({ day: 0, nodeCount: 2, newNodeLabelsToday: ["A"] })]; // delta 2 != 1
    const metrics = buildRunMetrics(
      baseInput({ completed: [{ result: journeyResult({ dayDigests: badDayDigests }), persona }] }),
    );
    expect(metrics.crossCutting.digestReconciliationViolationCount).toBe(1);
  });

  it("derives frontierStalenessWarnJourneyCount from a >=2 consecutive stale streak", () => {
    const frozen = [{ label: "费曼技巧", score: 1, reason: "x" }];
    const staleDayDigests = [
      digest({ day: 0, nodeCount: 1, frontierTop5: frozen }),
      digest({ day: 1, nodeCount: 2, frontierTop5: frozen, newNodeLabelsToday: ["A"] }),
      digest({ day: 2, nodeCount: 3, frontierTop5: frozen, newNodeLabelsToday: ["B"] }),
    ];
    const metrics = buildRunMetrics(
      baseInput({
        completed: [{ result: journeyResult({ dayDigests: staleDayDigests }), persona }],
      }),
    );
    expect(metrics.crossCutting.frontierStalenessWarnJourneyCount).toBe(1);
  });

  it("derives duplicateGoalTitleCount from invariantViolations", () => {
    const metrics = buildRunMetrics(
      baseInput({
        invariantViolations: [
          { kind: "duplicate-goal-title", detail: 'title "x" appears on 2 goal rows' },
        ],
      }),
    );
    expect(metrics.crossCutting.duplicateGoalTitleCount).toBe(1);
  });
});
