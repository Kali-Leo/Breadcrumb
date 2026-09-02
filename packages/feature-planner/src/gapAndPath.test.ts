/**
 * Purpose: unit tests for gapAndPath() — gap computation, coverage, and a constructed graph
 * where the three route strategies demonstrably disagree on ordering.
 */
import type { KnowledgeEdgeRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { coverage, gapAndPath } from "./gapAndPath";

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

describe("coverage", () => {
  it("is 1 for an empty node set", () => {
    expect(coverage([], new Map(), LIT)).toBe(1);
  });

  it("is the fraction of given nodes that are lit", () => {
    const masteryByNode = new Map([
      ["a", 0.9],
      ["b", 0.9],
      ["c", 0.1],
      ["d", 0],
    ]);
    expect(coverage(["a", "b", "c", "d"], masteryByNode, LIT)).toBe(0.5);
  });
});

describe("gapAndPath gap computation", () => {
  const nodes = [node("a", "Alpha"), node("b", "Beta"), node("g", "Gamma")];
  const edges = [requires("a", "g"), requires("b", "g")];

  it("gap is the goal's requires-closure plus the goal, minus lit nodes", () => {
    const masteryByNode = new Map<string, number>();
    const result = gapAndPath({
      nodes,
      edges,
      masteryByNode,
      interestByNode: new Map(),
      goalNodeIds: ["g"],
      litThreshold: LIT,
    });
    expect(result.gapNodeIds.sort()).toEqual(["a", "b", "g"]);
  });

  it("shrinks the gap and its routes once a prerequisite becomes lit", () => {
    const masteryByNode = new Map([["a", 0.9]]);
    const result = gapAndPath({
      nodes,
      edges,
      masteryByNode,
      interestByNode: new Map(),
      goalNodeIds: ["g"],
      litThreshold: LIT,
    });
    expect(result.gapNodeIds.sort()).toEqual(["b", "g"]);
    expect(result.routes.shortest).not.toContain("a");
  });
});

describe("gapAndPath route strategies visibly disagree", () => {
  // g requires a, b, c (three independent prerequisites, all initially ready together).
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
    // "lit" is already-mastered and helps-supports c most, then b, then not a.
    helps("lit", "c", 0.9),
    helps("lit", "b", 0.5),
  ];
  const masteryByNode = new Map([["lit", 0.9]]);
  const interestByNode = new Map([
    ["b", 0.9],
    ["a", 0.5],
    ["c", 0.1],
  ]);

  it("produces three distinct, deterministic orderings", () => {
    const result = gapAndPath({
      nodes,
      edges,
      masteryByNode,
      interestByNode,
      goalNodeIds: ["g"],
      litThreshold: LIT,
    });

    // shortest: alphabetical tie-break among the ready set at each step.
    expect(result.routes.shortest).toEqual(["a", "b", "c", "g"]);
    // steadiest: highest lit helps-support first (c=0.9, b=0.5, a=0).
    expect(result.routes.steadiest).toEqual(["c", "b", "a", "g"]);
    // interest-first: highest interest score first (b=0.9, a=0.5, c=0.1).
    expect(result.routes.interestFirst).toEqual(["b", "a", "c", "g"]);

    // All three demonstrably differ from each other.
    expect(result.routes.shortest).not.toEqual(result.routes.steadiest);
    expect(result.routes.shortest).not.toEqual(result.routes.interestFirst);
    expect(result.routes.steadiest).not.toEqual(result.routes.interestFirst);
  });

  it("is deterministic across repeated calls", () => {
    const call = () =>
      gapAndPath({
        nodes,
        edges,
        masteryByNode,
        interestByNode,
        goalNodeIds: ["g"],
        litThreshold: LIT,
      });
    expect(call()).toEqual(call());
  });
});
