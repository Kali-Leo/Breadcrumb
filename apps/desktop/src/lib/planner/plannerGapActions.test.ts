/**
 * Purpose: unit tests for computeGapForGoal / computeRouteForGoal — null-goal short circuits,
 * and the goal-local self-report belief ("learned" claims) reaching both without fabricating a
 * mastery number.
 */
import type {
  GoalRow,
  KnowledgeEdgeRow,
  KnowledgeNodeRow,
  MasteryClaimRow,
} from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { computeGapForGoal, computeRouteForGoal, goalSatisfiedNodeIds } from "./plannerGapActions";

function node(id: string, label: string): KnowledgeNodeRow {
  return {
    id,
    parent_id: null,
    label,
    summary: "",
    kind: "concept",
    created_at: "2026-08-01T00:00:00Z",
  };
}

function requires(source: string, target: string): KnowledgeEdgeRow {
  return {
    id: `${source}-${target}`,
    source_id: source,
    target_id: target,
    edge_type: "requires",
    weight: 1,
    confidence: 0.9,
    origin: "llm",
    created_at: "2026-08-01T00:00:00Z",
  };
}

function goal(nodeIds: string[]): GoalRow {
  return {
    id: "goal-1",
    title: "test goal",
    node_ids_json: JSON.stringify(nodeIds),
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
  };
}

const nodes = [node("a", "Alpha"), node("g", "Gamma")];
const edges = [requires("a", "g")];
const routeParams = { pace: 0.5, interestWeight: 0.5 };
const claims: MasteryClaimRow[] = [
  {
    id: "c1",
    node_id: "a",
    level: "learned",
    source: "self-report",
    created_at: "2026-08-01T00:00:00Z",
  },
];

describe("computeGapForGoal / computeRouteForGoal", () => {
  it("return null for a null goal", () => {
    expect(computeGapForGoal(null, nodes, edges, new Map(), new Map(), []).gap).toBeNull();
    expect(
      computeRouteForGoal(null, nodes, edges, new Map(), new Map(), [], routeParams),
    ).toBeNull();
  });

  it("agree on which nodes are still in the gap once a 'learned' claim satisfies one", () => {
    const { gap } = computeGapForGoal(goal(["g"]), nodes, edges, new Map(), new Map(), claims);
    const route = computeRouteForGoal(
      goal(["g"]),
      nodes,
      edges,
      new Map(),
      new Map(),
      claims,
      routeParams,
    );
    expect(gap?.gapNodeIds).toEqual(["g"]);
    expect(route?.map((step) => step.nodeId)).toEqual(["g"]);
  });
});

describe("goalSatisfiedNodeIds (2026-08-28 audit, planning gap 5)", () => {
  it("collects exactly the nodes with a 'learned' self-report claim", () => {
    const weakerClaim: MasteryClaimRow = {
      id: "c2",
      node_id: "g",
      level: "familiar",
      source: "self-report",
      created_at: "2026-08-01T00:00:00Z",
    };
    expect([...goalSatisfiedNodeIds([...claims, weakerClaim])]).toEqual(["a"]);
  });

  it("does not fabricate a mastery value — the claim never enters the mastery map", () => {
    // The whole point of the change: the goal drops the node from its own todo list, while
    // mastery stays whatever the real footprints say, so the palace's frontier is not handed
    // a 0.85 nobody earned and one click stops meaning two different things on two screens.
    const masteryByNode = new Map([["a", 0.1]]);
    computeGapForGoal(goal(["g"]), nodes, edges, masteryByNode, new Map(), claims);
    expect(masteryByNode.get("a")).toBe(0.1);
  });

  it("counts a self-claimed node toward the goal's coverage without touching mastery", () => {
    const { coverageFraction } = computeGapForGoal(
      goal(["a", "g"]),
      nodes,
      edges,
      new Map(),
      new Map(),
      claims,
    );
    expect(coverageFraction).toBe(0.5);
  });
});
