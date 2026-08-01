/**
 * Purpose: unit tests for frontier() — the hard requires-gate, score composition, the
 * explainable reason payload, and deterministic ordering.
 */
import type { KnowledgeEdgeRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { frontier } from "./frontier";

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
    const result = frontier({ nodes, edges, masteryByNode, interestByNode, litThreshold: LIT });

    expect(result).toHaveLength(1);
    const candidate = result[0];
    expect(candidate?.nodeId).toBe("b");
    // 0.7 (helps from lit a) + 0.2 (interest) - 1 (one incoming requires) = -0.1
    expect(candidate?.score).toBeCloseTo(-0.1);
    expect(candidate?.reason.litPrerequisiteLabels).toEqual(["Alpha"]);
    expect(candidate?.reason.litHelpsSources).toEqual([{ label: "Alpha", weight: 0.7 }]);
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
    });
    expect(result[0]?.reason.litHelpsSources).toEqual([]);
    expect(result[0]?.score).toBe(0);
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
    });
    expect(result.map((c) => c.nodeId)).toEqual(["f", "d", "e"]);
  });
});
