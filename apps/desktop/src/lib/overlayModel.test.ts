/**
 * Purpose: tests for buildOverlayModel() (spec 017 #2, ADR-0013) — lit/dim/target states across
 * three progress scenarios (empty goal / mid progress / near complete) on one constructed graph,
 * next-step flagging, and out-of-scope edge exclusion. Layout (positions) is tested separately
 * in overlayLayout.test.ts — this module only assembles "which nodes/edges, what state".
 */
import type { KnowledgeEdgeRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import type { RecommendedRouteStep } from "@breadcrumb/plugin-planner";
import { describe, expect, it } from "vitest";
import { buildOverlayModel, type OverlayModelInput } from "./overlayModel";

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
    id: `${source}-req-${target}`,
    source_id: source,
    target_id: target,
    edge_type: "requires",
    weight: 1,
    confidence: 0.9,
    origin: "llm",
    created_at: "2026-08-01T00:00:00Z",
  };
}

function helps(source: string, target: string, weight: number): KnowledgeEdgeRow {
  return {
    id: `${source}-helps-${target}`,
    source_id: source,
    target_id: target,
    edge_type: "helps",
    weight,
    confidence: 0.8,
    origin: "llm",
    created_at: "2026-08-01T00:00:00Z",
  };
}

// a -> b -> c -> g is the goal's requires chain; "ext" is an out-of-closure node that only
// reaches b via a helps edge, so it must never appear in the overlay's node/edge scope.
const nodes = [
  node("a", "Alpha"),
  node("b", "Beta"),
  node("c", "Charlie"),
  node("g", "Goal"),
  node("ext", "External"),
];
const edges = [requires("a", "b"), requires("b", "c"), requires("c", "g"), helps("ext", "b", 0.6)];

const LIT = 0.85;
const DIM = 0.3;

function baseInput(
  masteryByNode: Map<string, number>,
  route: RecommendedRouteStep[] | null,
): OverlayModelInput {
  return {
    goalNodeIds: ["g"],
    nodes,
    edges,
    goalMasteryByNode: masteryByNode,
    interestByNode: new Map(),
    evidenceWeightByNode: new Map(),
    route,
    litThreshold: LIT,
    dimThreshold: DIM,
  };
}

describe("buildOverlayModel scope", () => {
  it("keeps only the goal's requires-closure — 'ext' (helps-only reachable) is excluded", () => {
    const model = buildOverlayModel(baseInput(new Map(), null));
    expect(model.nodes.map((n) => n.id).sort()).toEqual(["a", "b", "c", "g"]);
    expect(model.edges.some((edge) => edge.source === "ext" || edge.target === "ext")).toBe(false);
    expect(model.edges).toHaveLength(3);
    expect(model.edges.every((edge) => edge.type === "requires")).toBe(true);
  });
});

describe("buildOverlayModel across three progress states", () => {
  it("empty goal: every node is 'target', nothing lit or dim", () => {
    const model = buildOverlayModel(baseInput(new Map(), null));
    const stateById = new Map(model.nodes.map((n) => [n.id, n.state]));
    expect(stateById.get("a")).toBe("target");
    expect(stateById.get("b")).toBe("target");
    expect(stateById.get("c")).toBe("target");
    expect(stateById.get("g")).toBe("target");
  });

  it("mid progress: a lit, b dim, c/g still target", () => {
    const mastery = new Map([
      ["a", 0.9],
      ["b", 0.5],
    ]);
    const model = buildOverlayModel(baseInput(mastery, null));
    const stateById = new Map(model.nodes.map((n) => [n.id, n.state]));
    expect(stateById.get("a")).toBe("lit");
    expect(stateById.get("b")).toBe("dim");
    expect(stateById.get("c")).toBe("target");
    expect(stateById.get("g")).toBe("target");
  });

  it("near complete: a/b/c lit, only the goal node itself still target", () => {
    const mastery = new Map([
      ["a", 0.9],
      ["b", 0.9],
      ["c", 0.9],
    ]);
    const model = buildOverlayModel(baseInput(mastery, null));
    const stateById = new Map(model.nodes.map((n) => [n.id, n.state]));
    expect(stateById.get("a")).toBe("lit");
    expect(stateById.get("b")).toBe("lit");
    expect(stateById.get("c")).toBe("lit");
    expect(stateById.get("g")).toBe("target");
  });

  it("the node set (scope) is identical across all three progress states", () => {
    const empty = buildOverlayModel(baseInput(new Map(), null));
    const mid = buildOverlayModel(baseInput(new Map([["a", 0.9]]), null));
    const nearComplete = buildOverlayModel(
      baseInput(
        new Map([
          ["a", 0.9],
          ["b", 0.9],
          ["c", 0.9],
        ]),
        null,
      ),
    );
    const scopeOf = (model: ReturnType<typeof buildOverlayModel>) =>
      model.nodes.map((n) => n.id).sort();
    expect(scopeOf(mid)).toEqual(scopeOf(empty));
    expect(scopeOf(nearComplete)).toEqual(scopeOf(empty));
  });
});

describe("buildOverlayModel next-step flag", () => {
  it("flags only the route's first step", () => {
    const route: RecommendedRouteStep[] = [
      {
        nodeId: "a",
        label: "Alpha",
        score: 1,
        reason: { helpsSources: [], interest: 0, isGoalNode: false },
      },
      {
        nodeId: "b",
        label: "Beta",
        score: 0.5,
        reason: { helpsSources: [], interest: 0, isGoalNode: false },
      },
    ];
    const model = buildOverlayModel(baseInput(new Map(), route));
    const nextStepById = new Map(model.nodes.map((n) => [n.id, n.isNextStep]));
    expect(nextStepById.get("a")).toBe(true);
    expect(nextStepById.get("b")).toBe(false);
    expect(nextStepById.get("c")).toBe(false);
    expect(nextStepById.get("g")).toBe(false);
  });

  it("flags nothing when there's no route", () => {
    const model = buildOverlayModel(baseInput(new Map(), null));
    expect(model.nodes.every((n) => !n.isNextStep)).toBe(true);
  });
});
