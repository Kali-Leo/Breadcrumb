/**
 * Purpose: unit tests for recommendRoute() — pace=0 matches steadiest ordering, pace=1
 * prefers the shallowest remaining chain to the goal (shortest-first), and interestWeight
 * pulls a high-interest node ahead of an otherwise-tied sibling. Three constructed graphs,
 * one per behavior, so each test isolates the parameter it's about.
 */
import type { KnowledgeEdgeRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { gapAndPath } from "./gapAndPath";
import { recommendRoute } from "./recommendRoute";

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

let edgeCounter = 0;
function requires(source: string, target: string): KnowledgeEdgeRow {
  edgeCounter += 1;
  return {
    id: `e${edgeCounter}`,
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
  edgeCounter += 1;
  return {
    id: `e${edgeCounter}`,
    source_id: source,
    target_id: target,
    edge_type: "helps",
    weight,
    confidence: 0.8,
    origin: "llm",
    created_at: "2026-08-01T00:00:00Z",
  };
}

const LIT = 0.85;

describe("recommendRoute pace=0 approximates the steadiest route", () => {
  // Same graph gapAndPath.test.ts uses to show the three legacy routes diverge: g requires
  // a, b, c; a lit "lit" node helps-supports c most, then b, then not a.
  const nodes = [
    node("a", "Alpha"),
    node("b", "Beta"),
    node("c", "Charlie"),
    node("g", "Gamma"),
    node("lit", "Lit"),
  ];
  const edges = [
    requires("a", "g"),
    requires("b", "g"),
    requires("c", "g"),
    helps("lit", "c", 0.9),
    helps("lit", "b", 0.5),
  ];
  const masteryByNode = new Map([["lit", 0.9]]);
  const interestByNode = new Map<string, number>();

  it("orders steps c, b, a, g — identical to gapAndPath's steadiest route", () => {
    const input = {
      nodes,
      edges,
      masteryByNode,
      interestByNode,
      goalNodeIds: ["g"],
      litThreshold: LIT,
    };
    const steps = recommendRoute(input, { pace: 0, interestWeight: 0 });
    expect(steps.map((step) => step.nodeId)).toEqual(gapAndPath(input).routes.steadiest);
    expect(steps.map((step) => step.nodeId)).toEqual(["c", "b", "a", "g"]);
  });

  it("reports helps-source counts and the goal-node flag", () => {
    const input = {
      nodes,
      edges,
      masteryByNode,
      interestByNode,
      goalNodeIds: ["g"],
      litThreshold: LIT,
    };
    const steps = recommendRoute(input, { pace: 0, interestWeight: 0 });
    const byId = new Map(steps.map((step) => [step.nodeId, step]));
    expect(byId.get("c")?.reason.helpsSources).toEqual([{ label: "Lit", weight: 0.9 }]);
    expect(byId.get("a")?.reason.helpsSources).toEqual([]);
    expect(byId.get("g")?.reason.isGoalNode).toBe(true);
    expect(byId.get("c")?.reason.isGoalNode).toBe(false);
  });
});

describe("recommendRoute pace=1 prefers the shallowest remaining chain to the goal", () => {
  // Two independent roots ready at step 1: "s" leads straight to the goal (chain length 2
  // below it), "h1" opens a longer chain h1 -> h2 -> g (chain length 3 below it). No helps
  // edges, so only pace (via the depth penalty) can distinguish them.
  const nodes = [node("s", "Shallow"), node("h1", "Head1"), node("h2", "Head2"), node("g", "Goal")];
  const edges = [requires("s", "g"), requires("h1", "h2"), requires("h2", "g")];
  const masteryByNode = new Map<string, number>();
  const interestByNode = new Map<string, number>();
  const input = {
    nodes,
    edges,
    masteryByNode,
    interestByNode,
    goalNodeIds: ["g"],
    litThreshold: LIT,
  };

  it("pace=1 picks the shallow branch (s) before the deep branch (h1)", () => {
    const steps = recommendRoute(input, { pace: 1, interestWeight: 0 });
    expect(steps.map((step) => step.nodeId)).toEqual(["s", "h1", "h2", "g"]);
  });

  it("differs from pace=0's ordering on the same graph, proving pace actually drives it", () => {
    const fast = recommendRoute(input, { pace: 1, interestWeight: 0 }).map((step) => step.nodeId);
    const steady = recommendRoute(input, { pace: 0, interestWeight: 0 }).map((step) => step.nodeId);
    // With no helps edges at all, pace=0's helps-support term is a flat 0..0 tie for every
    // ready node at every step, so it falls through to the label tie-break: "Head1"/"Head2"
    // both sort before "Shallow" alphabetically, so the whole h1->h2 branch is drained before s.
    expect(steady).toEqual(["h1", "h2", "s", "g"]);
    expect(fast).not.toEqual(steady);
  });

  it("flags the unlocked next node — h1 reports it unlocks h2", () => {
    const steps = recommendRoute(input, { pace: 1, interestWeight: 0 });
    const h1Step = steps.find((step) => step.nodeId === "h1");
    expect(h1Step?.reason.unlocks).toEqual({ label: "Head2" });
  });
});

describe("recommendRoute interestWeight pulls a high-interest node earlier", () => {
  // Two symmetric roots x, y both requiring nothing and both feeding g directly — identical
  // depth and zero helps support, so only interest can break the tie.
  const nodes = [node("x", "Xenon"), node("y", "Yttrium"), node("g", "Goal")];
  const edges = [requires("x", "g"), requires("y", "g")];
  const masteryByNode = new Map<string, number>();
  const interestByNode = new Map([
    ["x", 0.1],
    ["y", 0.9],
  ]);
  const input = {
    nodes,
    edges,
    masteryByNode,
    interestByNode,
    goalNodeIds: ["g"],
    litThreshold: LIT,
  };

  it("interestWeight=0 falls back to the deterministic label tie-break (x before y)", () => {
    const steps = recommendRoute(input, { pace: 0.5, interestWeight: 0 });
    expect(steps.map((step) => step.nodeId)).toEqual(["x", "y", "g"]);
  });

  it("interestWeight=1 pulls the high-interest node (y) ahead of x", () => {
    const steps = recommendRoute(input, { pace: 0.5, interestWeight: 1 });
    expect(steps.map((step) => step.nodeId)).toEqual(["y", "x", "g"]);
  });
});
