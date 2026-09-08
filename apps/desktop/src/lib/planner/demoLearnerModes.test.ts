/**
 * Purpose: the palace's 休闲/目标 switch has to DO something on the example learner.
 *
 * The example learner used to have no goal, so ranked mode had no gap to boost, every
 * frontier candidate tied at a score of zero, and both modes returned the identical
 * alphabetical list. A newcomer flipping the switch on the tour data saw nothing move — worse
 * than not shipping the switch, because the product's own example argued the feature was
 * fake. This runs the REAL snapshot assembly (computePlannerSnapshot, the same call
 * plannerStore.recompute makes) over a REAL migrated SQLite database with the REAL demo seed
 * in it, in both modes, and holds the two answers against each other.
 *
 * Written to fail if the demo goal, its requires edges, or the demo's interest signals are
 * removed or defanged — not merely if "something differs".
 */

import { type ConceptId, insertDemoData } from "@breadcrumb/demo-seed";
import { DEFAULT_ROUTE_PARAMS } from "@breadcrumb/feature-planner";
import { createTempDatabase, type TempDatabase } from "@breadcrumb/simlab";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type ConceptIndex, conceptIndex, DEMO_NOW } from "./demoLearnerFixture";
import { computePlannerSnapshot, type PlannerSnapshot } from "./plannerRecompute";

let temp: TempDatabase | null = null;
let casual: PlannerSnapshot;
let ranked: PlannerSnapshot;
let concepts: ConceptIndex;

beforeAll(async () => {
  temp = await createTempDatabase();
  const { repos, sql } = temp;
  await insertDemoData(sql, DEMO_NOW, { language: "zh-CN" });

  const nodes = await repos.knowledgeNodes.listAll();
  const edges = await repos.knowledgeEdges.listAll();
  const sightings = await repos.nodeSightings.listAll();
  const claims = await repos.masteryClaims.listAll();
  const signals = await repos.interestSignals.listAll();
  const embeddings = await repos.nodeEmbeddings.listAll();
  const goals = await repos.goals.listAll();

  const snapshot = (isRanked: boolean): PlannerSnapshot =>
    computePlannerSnapshot(
      nodes,
      edges,
      sightings,
      claims,
      signals,
      embeddings,
      goals,
      null,
      isRanked,
      DEFAULT_ROUTE_PARAMS,
      DEMO_NOW.toISOString(),
    );

  concepts = conceptIndex(nodes);
  casual = snapshot(false);
  ranked = snapshot(true);
  // Real sqlite plus the whole 39-node seed takes 10s+ on slow CI runners.
}, 60_000);

afterAll(() => {
  temp?.close();
  temp = null;
});

/** Where a node sits in one mode's recommendation list. Throws rather than returning -1: a
 * node that is not a candidate at all would silently satisfy any "ranks lower" assertion. */
function rankOf(snapshot: PlannerSnapshot, nodeId: string, what: string, mode: string): number {
  const index = snapshot.frontierCandidates.findIndex((candidate) => candidate.nodeId === nodeId);
  if (index < 0) throw new Error(`${what} is not a frontier candidate at all in ${mode} mode`);
  return index;
}

function orderOf(snapshot: PlannerSnapshot): string[] {
  return snapshot.frontierCandidates.map((candidate) => concepts.conceptOf(candidate.nodeId));
}

/** The two ways into the goal. Everything deeper in it still has an unlit prerequisite, so
 * the frontier's hard gate correctly keeps it out of BOTH lists — these are the only goal
 * nodes a mode switch could possibly move. */
const GOAL_ENTRY_POINTS: readonly ConceptId[] = ["array-filter", "array-reduce"];

describe("the example learner's 休闲/目标 modes", () => {
  it("gives the example learner one goal, over nodes the seed also inserted", () => {
    expect(ranked.selectedGoalId).not.toBeNull();
    expect(ranked.gap).not.toBeNull();
    // A goal pointing at ids nothing seeded would make every comparison below vacuous.
    for (const nodeId of ranked.gap?.gapNodeIds ?? []) {
      expect(concepts.isDemoConcept(nodeId), `gap node ${nodeId} is not a demo concept`).toBe(true);
    }
    // Partly done: the goal card has to show real progress, not 0% and not 100%.
    expect(ranked.coverageFraction ?? 0).toBeGreaterThan(0);
    expect(ranked.coverageFraction ?? 1).toBeLessThan(1);
  });

  it("recommends a visibly different sequence in each mode", () => {
    const casualOrder = orderOf(casual);
    const rankedOrder = orderOf(ranked);
    // Same candidate set — a goal changes the ranking, never the eligibility gate.
    expect([...rankedOrder].sort()).toEqual([...casualOrder].sort());
    expect(rankedOrder).not.toEqual(casualOrder);
    // Not different by one swap buried at position 20 either: the head differs, and the head
    // is all a user ever sees (ContinueCard takes 3, MapView takes 1).
    expect(rankedOrder[0]).not.toBe(casualOrder[0]);
    expect(rankedOrder.slice(0, 3)).not.toEqual(casualOrder.slice(0, 3));
  });

  it("puts the goal's entry prerequisites at the head in 目标 mode, and far down it in 休闲", () => {
    const gapIds = new Set(ranked.gap?.gapNodeIds ?? []);
    for (const conceptId of GOAL_ENTRY_POINTS) {
      const nodeId = concepts.nodeOf(conceptId);
      expect(gapIds.has(nodeId), `${conceptId} should be inside the goal's gap`).toBe(true);
      const rankedRank = rankOf(ranked, nodeId, conceptId, "目标");
      const casualRank = rankOf(casual, nodeId, conceptId, "休闲");
      expect(rankedRank, `${conceptId} is not at the head in 目标 mode`).toBeLessThan(
        GOAL_ENTRY_POINTS.length,
      );
      expect(
        casualRank - rankedRank,
        `${conceptId} barely moved between the two modes`,
      ).toBeGreaterThanOrEqual(10);
    }

    const head = ranked.frontierCandidates.slice(0, GOAL_ENTRY_POINTS.length);
    expect(head.map((candidate) => concepts.conceptOf(candidate.nodeId)).sort()).toEqual(
      [...GOAL_ENTRY_POINTS].sort(),
    );
    // The tag the UI draws "目标内" from: present in ranked mode, absent everywhere in casual.
    for (const candidate of head) expect(candidate.reason.inGoalGap).toBe(true);
    for (const candidate of casual.frontierCandidates) {
      expect(candidate.reason.inGoalGap).toBeUndefined();
    }
  });

  it("follows curiosity instead in 休闲 mode", () => {
    const top = casual.frontierCandidates[0];
    expect(top).toBeDefined();
    // What this learner keeps coming back to on their own, three signals deep.
    expect(concepts.conceptOf(top?.nodeId ?? "")).toBe("event-horizon");
    expect(new Set(ranked.gap?.gapNodeIds ?? []).has(top?.nodeId ?? "")).toBe(false);

    // The interest ordering is real, not one lucky node.
    const curiosity = (conceptId: ConceptId) =>
      casual.interestByNode.get(concepts.nodeOf(conceptId)) ?? 0;
    expect(curiosity("event-horizon")).toBeGreaterThan(curiosity("cmb"));
    expect(curiosity("cmb")).toBeGreaterThan(curiosity("magnitude-scale"));
    // And the goal's entry points carry no conversational interest at all, so nothing except
    // the goal itself could have lifted them to the head in ranked mode.
    for (const conceptId of GOAL_ENTRY_POINTS) expect(curiosity(conceptId)).toBe(0);
  });

  it("plans one route through the goal that respects its prerequisites", () => {
    const route = ranked.route ?? [];
    expect(route.length).toBeGreaterThanOrEqual(8);
    const position = new Map(route.map((step, index) => [step.nodeId, index]));
    const mustPrecede = (prerequisite: ConceptId, dependent: ConceptId) => {
      const first = position.get(concepts.nodeOf(prerequisite));
      const second = position.get(concepts.nodeOf(dependent));
      expect(first, `${prerequisite} missing from the route`).toBeDefined();
      expect(second, `${dependent} missing from the route`).toBeDefined();
      expect(first ?? -1, `${prerequisite} must come before ${dependent}`).toBeLessThan(
        second ?? -1,
      );
    };
    mustPrecede("array-reduce", "accumulator-pattern");
    mustPrecede("reduce-initial-value", "accumulator-pattern");
    mustPrecede("accumulator-pattern", "group-by");
    mustPrecede("array-filter", "predicate-functions");
    mustPrecede("predicate-functions", "composing-predicates");
    mustPrecede("composing-predicates", "group-by");
    mustPrecede("group-by", "map-or-object");
    mustPrecede("object-accumulator", "map-or-object");

    // The goal's destination is the last thing the route reaches, and its first step is one
    // the learner could open today.
    expect(concepts.conceptOf(route[route.length - 1]?.nodeId ?? "")).toBe("map-or-object");
    expect(GOAL_ENTRY_POINTS).toContain(concepts.conceptOf(route[0]?.nodeId ?? ""));
  });
});
