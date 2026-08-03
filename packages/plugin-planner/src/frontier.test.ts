/**
 * Purpose: unit tests for frontier() — the hard requires-gate, score composition, the
 * explainable reason payload, and deterministic ordering.
 */
import type { KnowledgeEdgeRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { frontier } from "./frontier";
import { propagateInterestToPrerequisites } from "./propagate";

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

describe("frontier", () => {
  it("never includes a node whose requires-prerequisites are not all lit", () => {
    // A(lit) --requires--> B(unlit) --requires--> C(unlit): C's prerequisite B isn't lit.
    const nodes = [node("a", "Alpha"), node("b", "Beta"), node("c", "Charlie")];
    const edges = [requires("a", "b"), requires("b", "c")];
    const masteryByNode = new Map([
      ["a", 0.9],
      ["b", 0.3],
      ["c", 0],
    ]);
    const result = frontier({
      nodes,
      edges,
      masteryByNode,
      interestByNode: new Map(),
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
    });
    expect(result.map((c) => c.nodeId)).not.toContain("c");
  });

  it("admits a node with zero requires-edges", () => {
    const nodes = [node("d", "Delta")];
    const result = frontier({
      nodes,
      edges: [],
      masteryByNode: new Map(),
      interestByNode: new Map(),
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
    });
    expect(result.map((c) => c.nodeId)).toEqual(["d"]);
  });

  it("excludes an already-lit node even if it would otherwise qualify", () => {
    const nodes = [node("a", "Alpha")];
    const masteryByNode = new Map([["a", 0.9]]);
    const result = frontier({
      nodes,
      edges: [],
      masteryByNode,
      interestByNode: new Map(),
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
    });
    expect(result).toEqual([]);
  });

  it("scores as sum(lit helps weights) + interest - incoming requires count, with a structured reason", () => {
    const nodes = [node("a", "Alpha"), node("b", "Beta")];
    const edges = [requires("a", "b"), helps("a", "b", 0.7)];
    const masteryByNode = new Map([
      ["a", 0.9],
      ["b", 0.3],
    ]);
    const interestByNode = new Map([["b", 0.2]]);
    const result = frontier({
      nodes,
      edges,
      masteryByNode,
      interestByNode,
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
    });

    expect(result).toHaveLength(1);
    const candidate = result[0];
    expect(candidate?.nodeId).toBe("b");
    // 0.7 (helps from lit a) + 0.2 (interest) - 1 (one incoming requires) = -0.1
    expect(candidate?.score).toBeCloseTo(-0.1);
    expect(candidate?.reason.litPrerequisiteLabels).toEqual(["Alpha"]);
    expect(candidate?.reason.litHelpsSources).toEqual([{ label: "Alpha", weight: 0.7 }]);
    expect(candidate?.reason.wasLitBefore).toBe(false);
  });

  it("marks wasLitBefore true for a decayed-back-under-threshold node with prior evidence", () => {
    const nodes = [node("a", "Alpha")];
    const result = frontier({
      nodes,
      edges: [],
      masteryByNode: new Map([["a", 0.2]]),
      interestByNode: new Map(),
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(["a"]),
    });
    expect(result[0]?.reason.wasLitBefore).toBe(true);
  });

  it("marks wasLitBefore false for a node with no prior sighting/claim evidence", () => {
    const nodes = [node("a", "Alpha")];
    const result = frontier({
      nodes,
      edges: [],
      masteryByNode: new Map([["a", 0.2]]),
      interestByNode: new Map(),
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
    });
    expect(result[0]?.reason.wasLitBefore).toBe(false);
  });

  it("does not count a helps source that isn't lit yet", () => {
    const nodes = [node("a", "Alpha"), node("b", "Beta")];
    const edges = [helps("a", "b", 0.9)];
    const masteryByNode = new Map([
      ["a", 0.2],
      ["b", 0.1],
    ]);
    const result = frontier({
      nodes,
      edges,
      masteryByNode,
      interestByNode: new Map(),
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
    });
    expect(result[0]?.reason.litHelpsSources).toEqual([]);
    expect(result[0]?.score).toBe(0);
  });

  it("attaches gatewayTo when interestGatewayByNode names a source for the candidate", () => {
    const nodes = [node("a", "Alpha")];
    const result = frontier({
      nodes,
      edges: [],
      masteryByNode: new Map([["a", 0.2]]),
      interestByNode: new Map([["a", 0.45]]),
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
      interestGatewayByNode: new Map([["a", "gateway-source-id"]]),
    });
    expect(result[0]?.reason.gatewayTo).toEqual({ label: "gateway-source-id" });
  });

  it("resolves gatewayTo's source id to its node label when the source is a known node", () => {
    const nodes = [node("a", "Alpha"), node("g", "Gamma")];
    const result = frontier({
      nodes,
      edges: [],
      masteryByNode: new Map([["a", 0.2]]),
      interestByNode: new Map([["a", 0.45]]),
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
      interestGatewayByNode: new Map([["a", "g"]]),
    });
    expect(result[0]?.reason.gatewayTo).toEqual({ label: "Gamma" });
  });

  it("omits gatewayTo when no interestGatewayByNode is supplied", () => {
    const nodes = [node("a", "Alpha")];
    const result = frontier({
      nodes,
      edges: [],
      masteryByNode: new Map(),
      interestByNode: new Map(),
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
    });
    expect(result[0]?.reason.gatewayTo).toBeUndefined();
  });

  it("surfaces evidenceWeight on the candidate when evidenceWeightByNode is supplied", () => {
    const nodes = [node("a", "Alpha")];
    const result = frontier({
      nodes,
      edges: [],
      masteryByNode: new Map(),
      interestByNode: new Map(),
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
      evidenceWeightByNode: new Map([["a", 0.6]]),
    });
    expect(result[0]?.evidenceWeight).toBe(0.6);
  });

  it("omits evidenceWeight when no evidenceWeightByNode is supplied", () => {
    const nodes = [node("a", "Alpha")];
    const result = frontier({
      nodes,
      edges: [],
      masteryByNode: new Map(),
      interestByNode: new Map(),
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
    });
    expect(result[0]?.evidenceWeight).toBeUndefined();
  });

  it("orders candidates by score desc, then label asc", () => {
    const nodes = [node("d", "Delta"), node("e", "Echo"), node("f", "Foxtrot")];
    const interestByNode = new Map([
      ["d", 0],
      ["e", 0],
      ["f", 0.5],
    ]);
    const result = frontier({
      nodes,
      edges: [],
      masteryByNode: new Map(),
      interestByNode,
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
    });
    expect(result.map((c) => c.nodeId)).toEqual(["f", "d", "e"]);
  });
});

describe("frontier ranked-mode goal-gap boost (spec 016)", () => {
  it("adds GOAL_GAP_SCORE_BOOST and marks inGoalGap for a candidate inside goalGapNodeIds", () => {
    const nodes = [node("a", "Alpha"), node("b", "Beta")];
    const result = frontier({
      nodes,
      edges: [],
      masteryByNode: new Map(),
      interestByNode: new Map(),
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
      goalGapNodeIds: new Set(["a"]),
    });
    const alpha = result.find((c) => c.nodeId === "a");
    const beta = result.find((c) => c.nodeId === "b");
    expect(alpha?.score).toBeCloseTo(1.0);
    expect(alpha?.reason.inGoalGap).toBe(true);
    expect(beta?.score).toBe(0);
    expect(beta?.reason.inGoalGap).toBeUndefined();
  });

  it("leaves scoring unchanged when goalGapNodeIds is omitted (casual mode)", () => {
    const nodes = [node("a", "Alpha")];
    const result = frontier({
      nodes,
      edges: [],
      masteryByNode: new Map(),
      interestByNode: new Map(),
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
    });
    expect(result[0]?.score).toBe(0);
    expect(result[0]?.reason.inGoalGap).toBeUndefined();
  });
});

describe("frontier fed by propagateInterestToPrerequisites (spec 014 acceptance scenario)", () => {
  it("surfaces a locked interested node's unlit prerequisite, with a reason naming it", () => {
    // root(lit) --requires--> P(unlit, on the frontier once root is lit) --requires-->
    // X(unlit, locked because P isn't lit yet, but highly interesting).
    const nodes = [node("root", "Root"), node("p", "Prereq"), node("x", "TargetX")];
    const edges = [requires("root", "p"), requires("p", "x")];
    const masteryByNode = new Map([
      ["root", 0.9],
      ["p", 0],
      ["x", 0],
    ]);
    const rawInterestByNode = new Map([["x", 0.8]]);

    const propagated = propagateInterestToPrerequisites(
      edges,
      rawInterestByNode,
      masteryByNode,
      LIT,
    );
    const result = frontier({
      nodes,
      edges,
      masteryByNode,
      interestByNode: propagated.interestByNode,
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
      interestGatewayByNode: propagated.gatewaySourceByNode,
    });

    expect(result.map((c) => c.nodeId)).toEqual(["p"]);
    expect(result[0]?.reason.gatewayTo).toEqual({ label: "TargetX" });
  });
});
