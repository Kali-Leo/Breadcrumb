/**
 * Purpose: unit tests for cycle safety, prerequisite closure, topological order and
 * type-filtered adjacency over knowledge edges.
 */
import type { KnowledgeEdgeRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import {
  incomingNeighbors,
  outgoingNeighbors,
  prerequisiteClosure,
  topologicalOrder,
  wouldCreateCycle,
} from "./graph";

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
    created_at: "2026-08-01T10:00:00Z",
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
    created_at: "2026-08-01T10:00:00Z",
  };
}

describe("wouldCreateCycle", () => {
  it("allows a fresh requires edge that keeps the graph acyclic", () => {
    const edges = [requires("limits", "derivative")];
    expect(wouldCreateCycle(edges, { source_id: "derivative", target_id: "integral" })).toBe(false);
  });

  it("rejects the edge that would close a cycle (A requires B requires A)", () => {
    const edges = [requires("A", "B")];
    expect(wouldCreateCycle(edges, { source_id: "B", target_id: "A" })).toBe(true);
  });

  it("rejects a longer indirect cycle (A requires B requires C, then C requires A)", () => {
    const edges = [requires("A", "B"), requires("B", "C")];
    expect(wouldCreateCycle(edges, { source_id: "C", target_id: "A" })).toBe(true);
  });

  it("ignores helps edges when checking for cycles", () => {
    const edges = [helps("A", "B", 0.5), helps("B", "A", 0.5)];
    expect(wouldCreateCycle(edges, { source_id: "A", target_id: "B" })).toBe(false);
  });

  it("does not flag re-adding the exact same edge as a cycle", () => {
    const edges = [requires("A", "B")];
    expect(wouldCreateCycle(edges, { source_id: "A", target_id: "B" })).toBe(false);
  });

  it("rejects an edge from a node to itself", () => {
    expect(wouldCreateCycle([], { source_id: "A", target_id: "A" })).toBe(true);
  });
});

describe("prerequisiteClosure", () => {
  it("returns every transitive prerequisite, excluding the input node", () => {
    const edges = [requires("limits", "derivative"), requires("derivative", "integral")];
    expect(prerequisiteClosure(edges, ["integral"]).sort()).toEqual(["derivative", "limits"]);
  });

  it("returns an empty array for a node with no prerequisites", () => {
    const edges = [requires("limits", "derivative")];
    expect(prerequisiteClosure(edges, ["limits"])).toEqual([]);
  });

  it("unions closures across multiple input nodes without duplicates", () => {
    const edges = [requires("A", "shared"), requires("B", "shared"), requires("shared", "C")];
    expect(prerequisiteClosure(edges, ["C"]).sort()).toEqual(["A", "B", "shared"]);
  });

  it("returns an empty array for an unknown node id", () => {
    expect(prerequisiteClosure([requires("A", "B")], ["nowhere"])).toEqual([]);
  });
});

describe("topologicalOrder", () => {
  it("orders a simple chain prerequisite-first", () => {
    const edges = [requires("limits", "derivative"), requires("derivative", "integral")];
    expect(topologicalOrder(edges, ["integral", "derivative", "limits"])).toEqual([
      "limits",
      "derivative",
      "integral",
    ]);
  });

  it("ignores edges whose endpoint is outside the given node set", () => {
    const edges = [requires("limits", "derivative"), requires("derivative", "unrelated")];
    const order = topologicalOrder(edges, ["limits", "derivative"]);
    expect(order).toEqual(["limits", "derivative"]);
  });

  it("is deterministic across repeated calls with the same input", () => {
    const edges = [requires("A", "B"), requires("A", "C"), requires("B", "D"), requires("C", "D")];
    const nodeIds = ["A", "B", "C", "D"];
    expect(topologicalOrder(edges, nodeIds)).toEqual(topologicalOrder(edges, nodeIds));
  });
});

describe("type-filtered adjacency", () => {
  it("lists only requires-outgoing neighbors, ignoring helps edges", () => {
    const edges = [requires("A", "B"), helps("A", "C", 0.6)];
    expect(outgoingNeighbors(edges, "A", "requires")).toEqual(["B"]);
    expect(outgoingNeighbors(edges, "A", "helps")).toEqual(["C"]);
  });

  it("lists incoming neighbors of one type", () => {
    const edges = [requires("A", "B"), requires("C", "B"), helps("D", "B", 0.4)];
    expect(incomingNeighbors(edges, "B", "requires").sort()).toEqual(["A", "C"]);
    expect(incomingNeighbors(edges, "B", "helps")).toEqual(["D"]);
  });
});
