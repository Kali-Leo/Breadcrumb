/**
 * Purpose: unit tests for computeGapForGoal / computeRouteForGoal — null-goal short circuits,
 * and the goal-view mastery boost (self-report "learned" claims) reaching both.
 */
import type {
  GoalRow,
  KnowledgeEdgeRow,
  KnowledgeNodeRow,
  MasteryClaimRow,
} from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { computeGapForGoal, computeRouteForGoal } from "./plannerGapActions";

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

describe("computeGapForGoal / computeRouteForGoal", () => {
  it("return null for a null goal", () => {
    expect(computeGapForGoal(null, nodes, edges, new Map(), new Map(), []).gap).toBeNull();
    expect(
      computeRouteForGoal(null, nodes, edges, new Map(), new Map(), [], routeParams),
    ).toBeNull();
  });

  it("agree on which nodes are still in the gap once a 'learned' claim boosts mastery", () => {
    const claims: MasteryClaimRow[] = [
      {
        id: "c1",
        node_id: "a",
        level: "learned",
        source: "self-report",
        created_at: "2026-08-01T00:00:00Z",
      },
    ];
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
